import { v } from "convex/values";
import { api, internal } from "./_generated/api";
import {
  action,
  internalMutation,
  internalQuery,
  query,
} from "./_generated/server";
import { getConfig } from "./config_read";
import { resolveRole } from "./rbac";

type GNode = { id: string; type: string; values?: Record<string, unknown> };
type GEdge = { source: { node: string; port: string }; target: { node: string; port: string } };
type NodeState = { status: "idle" | "running" | "done" | "error"; output?: string; error?: string };

/** Subscribe to a run's live per-node status. */
export const getRun = query({
  args: { token: v.string(), runId: v.id("workflowRuns") },
  handler: async (ctx, { token, runId }) => {
    const caller = await resolveRole(ctx, token);
    if (!caller) return null;
    const run = await ctx.db.get(runId);
    if (!run || run.owner !== caller.pubkey) return null;
    return { status: run.status, nodes: JSON.parse(run.nodes) as Record<string, NodeState> };
  },
});

/** Recent runs for the user — id, status, a thumbnail, and status counts. */
export const listRuns = query({
  args: { token: v.string() },
  handler: async (ctx, { token }) => {
    const caller = await resolveRole(ctx, token);
    if (!caller) return [];
    const rows = await ctx.db
      .query("workflowRuns")
      .withIndex("by_owner", (q) => q.eq("owner", caller.pubkey))
      .order("desc")
      .take(20);
    return rows.map((r) => {
      const nodes = JSON.parse(r.nodes) as Record<string, NodeState>;
      let thumb: string | null = null;
      const counts: Record<string, number> = {};
      for (const k of Object.keys(nodes)) {
        const n = nodes[k];
        counts[n.status] = (counts[n.status] ?? 0) + 1;
        if (!thumb && n.output && /^(https?:|data:)/.test(n.output)) thumb = n.output;
      }
      return { id: r._id, status: r.status, createdAt: r.createdAt, thumb, counts };
    });
  },
});

export const ctxFor = internalQuery({
  args: { token: v.string() },
  handler: async (ctx, { token }) => {
    const caller = await resolveRole(ctx, token);
    if (!caller) return null;
    return {
      pubkey: caller.pubkey,
      baseUrl: await getConfig(ctx, "elizacloud_base_url", "https://api.elizacloud.ai"),
    };
  },
});

export const createRun = internalMutation({
  args: { owner: v.string(), graph: v.string(), nodes: v.string() },
  handler: async (ctx, { owner, graph, nodes }) => {
    const now = Date.now();
    return await ctx.db.insert("workflowRuns", {
      owner,
      graph,
      status: "running",
      nodes,
      createdAt: now,
      updatedAt: now,
    });
  },
});

export const patchRun = internalMutation({
  args: { id: v.id("workflowRuns"), nodes: v.string(), status: v.optional(v.string()) },
  handler: async (ctx, { id, nodes, status }) => {
    await ctx.db.patch(id, { nodes, updatedAt: Date.now(), ...(status ? { status } : {}) });
  },
});

function topoSort(nodes: GNode[], edges: GEdge[]): string[] {
  const ids = nodes.map((n) => n.id);
  const indeg: Record<string, number> = Object.fromEntries(ids.map((i) => [i, 0]));
  const adj: Record<string, string[]> = Object.fromEntries(ids.map((i) => [i, []]));
  for (const e of edges) {
    if (e.source.node in adj && e.target.node in indeg) {
      adj[e.source.node].push(e.target.node);
      indeg[e.target.node]++;
    }
  }
  const q = ids.filter((i) => indeg[i] === 0);
  const order: string[] = [];
  while (q.length) {
    const i = q.shift() as string;
    order.push(i);
    for (const j of adj[i]) if (--indeg[j] === 0) q.push(j);
  }
  for (const i of ids) if (!order.includes(i)) order.push(i); // tolerate cycles
  return order;
}

/** Execute a workflow graph node-by-node, patching the run doc as it goes so
 *  the editor renders live status. Inference runs through ElizaCloud; without
 *  an API key the Image Generate node reports a structured error (no fakery). */
export const runWorkflow = action({
  args: { token: v.string(), graph: v.string() },
  handler: async (ctx, { token, graph }): Promise<{ runId: string }> => {
    const info = await ctx.runQuery(internal.workflow.ctxFor, { token });
    if (!info) throw new Error("Not authenticated");

    const parsed = JSON.parse(graph) as { nodes: GNode[]; edges: GEdge[] };
    const nodes = parsed.nodes ?? [];
    const edges = parsed.edges ?? [];

    const state: Record<string, NodeState> = {};
    for (const n of nodes) state[n.id] = { status: "idle" };
    const runId = await ctx.runMutation(internal.workflow.createRun, {
      owner: info.pubkey,
      graph,
      nodes: JSON.stringify(state),
    });

    const outputs: Record<string, Record<string, string>> = {};
    const inputVal = (nodeId: string, port: string): string | undefined => {
      const e = edges.find((x) => x.target.node === nodeId && x.target.port === port);
      if (!e) return undefined;
      return outputs[e.source.node]?.[e.source.port];
    };
    const apiKey = process.env.ELIZACLOUD_API_KEY || process.env.ELIZAOS_CLOUD_API_KEY;
    const flush = (status?: string) =>
      ctx.runMutation(internal.workflow.patchRun, { id: runId, nodes: JSON.stringify(state), status });

    for (const id of topoSort(nodes, edges)) {
      const node = nodes.find((n) => n.id === id);
      if (!node) continue;

      // Blocked if any wired input's upstream produced no output (errored/skipped).
      const incoming = edges.filter((e) => e.target.node === id);
      if (incoming.some((e) => !(e.source.node in outputs))) {
        state[id] = { status: "idle" };
        await flush();
        continue;
      }

      state[id] = { status: "running" };
      await flush();

      try {
        const v0 = (node.values ?? {}) as Record<string, unknown>;
        const need = () => {
          if (!apiKey) throw new Error("Set ELIZACLOUD_API_KEY on Convex to run this node");
          return apiKey;
        };
        const post = (path: string, body: unknown) =>
          fetch(`${info.baseUrl}${path}`, {
            method: "POST",
            headers: { "content-type": "application/json", authorization: `Bearer ${need()}` },
            body: JSON.stringify(body),
          });

        switch (node.type) {
          // ── Input ──
          case "input.prompt": {
            const t = String(v0.text ?? "");
            outputs[id] = { prompt: t };
            state[id] = { status: "done", output: t };
            break;
          }
          case "input.model": {
            const name = String(v0.name ?? "Auto");
            outputs[id] = { model: name };
            state[id] = { status: "done", output: name };
            break;
          }
          case "input.image": {
            const url = String(v0.url ?? "");
            outputs[id] = { image: url };
            state[id] = { status: "done", output: url || "(no source)" };
            break;
          }

          // ── Prompt enhancer + text (chat/completions) ──
          case "enhance.prompt": {
            const prompt = inputVal(id, "prompt") ?? "";
            if (!prompt.trim()) throw new Error("Connect a Prompt");
            const style = String(v0.style ?? "Detailed");
            const sys = `Rewrite the user's image/text prompt to be more ${style.toLowerCase()} and vivid. Reply with ONLY the rewritten prompt, no preamble.`;
            const text = await chat(post, inputVal(id, "model"), sys, prompt, 0.7);
            outputs[id] = { text };
            state[id] = { status: "done", output: text };
            break;
          }
          case "generate.text": {
            const prompt = inputVal(id, "prompt") ?? "";
            if (!prompt.trim()) throw new Error("Connect a Prompt");
            const temp = Number(v0.temperature ?? 0.7);
            const text = await chat(post, inputVal(id, "model"), "", prompt, temp);
            outputs[id] = { text };
            state[id] = { status: "done", output: text };
            break;
          }

          // ── Media generation ──
          case "generate.image": {
            const prompt = inputVal(id, "prompt") ?? "";
            if (!prompt.trim()) throw new Error("Connect a Prompt to generate");
            // Direct to OpenRouter image gen (metered via usage.cost), ElizaCloud
            // fallback — handled inside inference.runImage. refId per node run.
            const { url } = (await ctx.runAction(api.inference.runImage, {
              token,
              model: inputVal(id, "model"),
              prompt,
              refId: `${runId}:${id}`,
            })) as { url: string };
            outputs[id] = { image: url };
            state[id] = { status: "done", output: url };
            break;
          }
          case "generate.video": {
            const prompt = inputVal(id, "prompt") ?? "";
            if (!prompt.trim()) throw new Error("Connect a Prompt to generate");
            const flags = (await ctx.runQuery(api.flags.all, {})) as Record<string, boolean>;
            if (!flags.video_enabled)
              throw new Error("Video generation is temporarily unavailable.");
            // ElizaCloud has no usage.cost for video, so we meter at the
            // pricing/summary default (generate-video estimatedRange.min, ~$1).
            // Gate on credits first, charge AFTER the media lands so a failed gen
            // doesn't bill the user. Idempotent by refId (`${runId}:${id}`).
            const gate = (await ctx.runQuery(api.inference.canInfer, { token })) as {
              ok: boolean;
              reason?: string;
            };
            if (!gate.ok) {
              throw new Error(
                gate.reason === "out of credits"
                  ? "Out of credits — top up to generate video."
                  : "Cannot run inference.",
              );
            }
            const res = await post("/api/v1/generate-video", { prompt });
            outputs[id] = { video: await mediaUrl(res, "video/mp4") };
            state[id] = { status: "done", output: outputs[id].video };
            const costMicroUsd = (await videoCostUsd(info.baseUrl)) * 1_000_000;
            await ctx.runMutation(internal.inference._charge, {
              pubkey: info.pubkey,
              refId: `${runId}:${id}`,
              surface: "video",
              model: "elizacloud/generate-video",
              costMicroUsd,
            });
            break;
          }
          case "generate.speech": {
            const text = inputVal(id, "text") ?? "";
            if (!text.trim()) throw new Error("Connect text to speak");
            // Metered TTS through inference.runSpeech (ElizaCloud ElevenLabs,
            // stored to Convex storage → small hosted URL, charged surface
            // "speech"). refId per node run keeps the charge idempotent.
            const { url } = (await ctx.runAction(api.inference.runSpeech, {
              token,
              text,
              refId: `${runId}:${id}`,
            })) as { url: string };
            outputs[id] = { audio: url };
            state[id] = { status: "done", output: "(audio generated)" };
            break;
          }
          case "tools.search": {
            // ElizaCloud's public API doesn't expose a web-search endpoint; this
            // node lights up once an MCP web-search tool is wired (see /mcps).
            throw new Error("Web search runs via an MCP tool — connect one under MCPs.");
          }
          case "refine.upscale": {
            const img = inputVal(id, "image");
            if (!img) throw new Error("Connect an image to upscale");
            outputs[id] = { image: img };
            state[id] = { status: "done", output: img };
            break;
          }
          case "output.preview": {
            const v = inputVal(id, "in") ?? "";
            outputs[id] = {};
            state[id] = { status: "done", output: v };
            break;
          }

          // ── elizaOS agent nodes (design-only; deploy via the runtime) ──
          default: {
            if (node.type.startsWith("eliza.")) {
              const def = ELIZA_OUTPUTS[node.type] ?? [];
              const label = String(v0.name ?? v0.source ?? node.type.replace("eliza.", ""));
              outputs[id] = Object.fromEntries(def.map((p) => [p, label]));
              state[id] = { status: "done", output: label };
            } else {
              state[id] = { status: "done" };
            }
          }
        }
      } catch (e) {
        state[id] = { status: "error", error: e instanceof Error ? e.message : "failed" };
      }
      await flush();
    }

    await flush("done");
    return { runId };
  },
});

// Output port names for elizaOS nodes (so downstream isn't marked blocked).
const ELIZA_OUTPUTS: Record<string, string[]> = {
  "eliza.character": ["agent"],
  "eliza.plugin": ["plugin"],
  "eliza.message": ["message"],
  "eliza.provider": ["context"],
  "eliza.action": ["message"],
  "eliza.evaluator": ["message"],
  "eliza.respond": [],
};

type Poster = (path: string, body: unknown) => Promise<Response>;

/**
 * ElizaCloud video price (USD/request). Video has NO inline usage.cost and the
 * per-request price is variable ($0.336–3.84), so we meter at the pricing/summary
 * floor — GET /api/v1/pricing/summary, generate-video estimatedRange.min. Any
 * failure (network, shape drift, missing field) falls back to a flat $1.00 so a
 * video gen is never billed at $0 nor blocked on a pricing fetch.
 */
async function videoCostUsd(baseUrl: string): Promise<number> {
  const FALLBACK = 1.0;
  try {
    const key = process.env.ELIZACLOUD_API_KEY || process.env.ELIZAOS_CLOUD_API_KEY;
    const res = await fetch(`${baseUrl.replace(/\/$/, "")}/api/v1/pricing/summary`, {
      headers: key ? { authorization: `Bearer ${key}` } : {},
    });
    if (!res.ok) return FALLBACK;
    const j = (await res.json()) as any;
    // Tolerate a few plausible shapes: a keyed map or an array of entries.
    const entry =
      j?.["generate-video"] ??
      j?.pricing?.["generate-video"] ??
      (Array.isArray(j?.pricing)
        ? j.pricing.find((p: any) => p?.id === "generate-video" || p?.name === "generate-video")
        : undefined) ??
      (Array.isArray(j)
        ? j.find((p: any) => p?.id === "generate-video" || p?.name === "generate-video")
        : undefined);
    const min =
      entry?.estimatedRange?.min ??
      entry?.priceRange?.min ??
      entry?.min ??
      entry?.price;
    return typeof min === "number" && Number.isFinite(min) && min > 0 ? min : FALLBACK;
  } catch {
    return FALLBACK;
  }
}

/** Chat/completions text generation through ElizaCloud. */
async function chat(
  post: Poster,
  model: string | undefined,
  system: string,
  prompt: string,
  temperature: number,
): Promise<string> {
  // ElizaCloud OpenAI-compatible endpoint: POST /api/v1/chat/completions
  // (verified live with an eliza_ API key). Standard OpenAI message format.
  const messages = [
    ...(system ? [{ role: "system", content: system }] : []),
    { role: "user", content: prompt },
  ];
  const res = await post("/api/v1/chat/completions", {
    model: model && model !== "Auto" ? model : "google/gemini-2.5-flash",
    messages,
    temperature,
  });
  if (!res.ok) throw new Error(`Text generation failed (${res.status})`);
  const json = await res.json();
  const text = json.choices?.[0]?.message?.content;
  if (typeof text !== "string") throw new Error("No text returned");
  return text;
}

/** Resolve a media response to a usable URL (remote url or data URL). */
async function mediaUrl(res: Response, fallbackType: string): Promise<string> {
  if (!res.ok) {
    let detail = "";
    try {
      const j = await res.json();
      detail = j?.error ? ` — ${j.error}` : "";
    } catch { /* ignore */ }
    throw new Error(`Generation failed (${res.status})${detail}`);
  }
  const json = await res.json();
  const d = json.data?.[0] ?? json;
  if (typeof d?.url === "string") return d.url;
  if (typeof json.url === "string") return json.url;
  if (typeof json.image === "string") return json.image;
  if (typeof json.video === "string") return json.video;
  if (Array.isArray(json.images) && typeof json.images[0] === "string") return json.images[0];
  if (d?.b64_json) return `data:${fallbackType};base64,${d.b64_json}`;
  throw new Error("No media returned");
}
