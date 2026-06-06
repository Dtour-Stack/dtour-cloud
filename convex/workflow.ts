import { start } from "@convex-dev/workflow";
import { v } from "convex/values";
import { api, internal } from "./_generated/api";
import {
  action,
  internalAction,
  internalMutation,
  internalQuery,
  mutation,
  query,
} from "./_generated/server";
import { getConfig } from "./config_read";
import { resolveRole } from "./rbac";

type GNode = { id: string; type: string; values?: Record<string, unknown> };
type GEdge = { source: { node: string; port: string }; target: { node: string; port: string } };
type NodeState = { status: "idle" | "running" | "done" | "error"; output?: string; error?: string };
type JsonValue = null | boolean | number | string | JsonValue[] | { [key: string]: JsonValue };
type JsonRecord = { [key: string]: JsonValue };

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

export const topoOrder = internalQuery({
  args: { graph: v.string() },
  handler: async (_ctx, { graph }) => {
    const parsed = JSON.parse(graph) as { nodes: GNode[]; edges: GEdge[] };
    return topoSort(parsed.nodes ?? [], parsed.edges ?? []);
  },
});

export const finalizeRun = internalMutation({
  args: { id: v.id("workflowRuns"), status: v.string() },
  handler: async (ctx, { id, status }) => {
    const run = await ctx.db.get(id);
    if (!run) return;
    const nodes = JSON.parse(run.nodes) as Record<string, NodeState>;
    const hasError = Object.values(nodes).some((n) => n.status === "error");
    await ctx.db.patch(id, {
      status: hasError ? "error" : status,
      updatedAt: Date.now(),
    });
  },
});

/** Kick off a durable Design Studio graph run (@convex-dev/workflow). */
export const runWorkflow = mutation({
  args: { token: v.string(), graph: v.string() },
  handler: async (ctx, { token, graph }): Promise<{ runId: string }> => {
    const info = await ctx.runQuery(internal.workflow.ctxFor, { token });
    if (!info) throw new Error("Not authenticated");

    const parsed = JSON.parse(graph) as { nodes: GNode[]; edges: GEdge[] };
    const nodes = parsed.nodes ?? [];
    const state: Record<string, NodeState> = {};
    for (const n of nodes) state[n.id] = { status: "idle" };
    const runId = await ctx.runMutation(internal.workflow.createRun, {
      owner: info.pubkey,
      graph,
      nodes: JSON.stringify(state),
    });
    await start(ctx, internal.designStudioWorkflow.designStudioRun, {
      token,
      runId,
      graph,
    });
    return { runId };
  },
});

/** Execute a single workflow node — called once per step from designStudioRun. */
export const executeNode = internalAction({
  args: {
    token: v.string(),
    runId: v.id("workflowRuns"),
    graph: v.string(),
    nodeId: v.string(),
    outputsJson: v.string(),
  },
  handler: async (ctx, args): Promise<{ outputsJson: string }> => {
    const info = await ctx.runQuery(internal.workflow.ctxFor, { token: args.token });
    if (!info) throw new Error("Not authenticated");

    const parsed = JSON.parse(args.graph) as { nodes: GNode[]; edges: GEdge[] };
    const nodes = parsed.nodes ?? [];
    const edges = parsed.edges ?? [];
    const outputs = JSON.parse(args.outputsJson) as Record<string, Record<string, string>>;

    const run = await ctx.runQuery(internal.workflow.runDoc, { runId: args.runId });
    if (!run) throw new Error("Run not found");
    const state = JSON.parse(run.nodes) as Record<string, NodeState>;

    const id = args.nodeId;
    const node = nodes.find((n) => n.id === id);
    if (!node) return { outputsJson: args.outputsJson };

    const inputVal = (nodeId: string, port: string): string | undefined => {
      const e = edges.find((x) => x.target.node === nodeId && x.target.port === port);
      if (!e) return undefined;
      return outputs[e.source.node]?.[e.source.port];
    };

    const incoming = edges.filter((e) => e.target.node === id);
    if (incoming.some((e) => !(e.source.node in outputs))) {
      state[id] = { status: "idle" };
      await ctx.runMutation(internal.workflow.patchRun, {
        id: args.runId,
        nodes: JSON.stringify(state),
      });
      return { outputsJson: JSON.stringify(outputs) };
    }

    state[id] = { status: "running" };
    await ctx.runMutation(internal.workflow.patchRun, {
      id: args.runId,
      nodes: JSON.stringify(state),
    });

    const apiKey = process.env.ELIZACLOUD_API_KEY || process.env.ELIZAOS_CLOUD_API_KEY;
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

    try {
      const v0 = (node.values ?? {}) as Record<string, unknown>;
      switch (node.type) {
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
        case "generate.image": {
          const prompt = inputVal(id, "prompt") ?? "";
          if (!prompt.trim()) throw new Error("Connect a Prompt to generate");
          const { url } = (await ctx.runAction(api.inference.runImage, {
            token: args.token,
            model: inputVal(id, "model"),
            prompt,
            refId: `${args.runId}:${id}`,
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
          const gate = (await ctx.runQuery(api.inference.canInfer, { token: args.token })) as {
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
            refId: `${args.runId}:${id}`,
            surface: "video",
            model: "elizacloud/generate-video",
            costMicroUsd,
          });
          break;
        }
        case "generate.speech": {
          const text = inputVal(id, "text") ?? "";
          if (!text.trim()) throw new Error("Connect text to speak");
          const { url } = (await ctx.runAction(api.inference.runSpeech, {
            token: args.token,
            text,
            refId: `${args.runId}:${id}`,
          })) as { url: string };
          outputs[id] = { audio: url };
          state[id] = { status: "done", output: "(audio generated)" };
          break;
        }
        case "tools.search": {
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
          const val = inputVal(id, "in") ?? "";
          outputs[id] = {};
          state[id] = { status: "done", output: val };
          break;
        }
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

    await ctx.runMutation(internal.workflow.patchRun, {
      id: args.runId,
      nodes: JSON.stringify(state),
      status: state[id]?.status === "error" ? "error" : undefined,
    });

    return { outputsJson: JSON.stringify(outputs) };
  },
});

export const runDoc = internalQuery({
  args: { runId: v.id("workflowRuns") },
  handler: async (ctx, { runId }) => {
    const run = await ctx.db.get(runId);
    if (!run) return null;
    return { nodes: run.nodes };
  },
});

/** @deprecated Use runWorkflow mutation — kept as alias during UI migration. */
export const runWorkflowAction = action({
  args: { token: v.string(), graph: v.string() },
  handler: async (ctx, { token, graph }): Promise<{ runId: string }> => {
    return await ctx.runMutation(api.workflow.runWorkflow, { token, graph });
  },
});

// Output port names for elizaOS nodes (so downstream isn't marked blocked).
const ELIZA_OUTPUTS: Record<string, string[]> = {
  "eliza.agent": ["agent", "message"],
  "eliza.agent.endpoint": ["endpoint"],
  "eliza.agent.runtime": ["agent"],
  "eliza.character": ["agent"],
  "eliza.character.identity": ["identity"],
  "eliza.character.knowledge": ["knowledge"],
  "eliza.character.lore": ["lore"],
  "eliza.character.memory": ["context"],
  "eliza.character.style": ["style"],
  "eliza.character.system": ["system"],
  "eliza.plugin": ["plugin"],
  "eliza.plugin.actions": ["actions"],
  "eliza.plugin.bundle": ["plugin"],
  "eliza.plugin.evaluators": ["evaluators"],
  "eliza.plugin.manifest": ["manifest"],
  "eliza.plugin.mcp": ["tools"],
  "eliza.plugin.providers": ["providers"],
  "eliza.plugin.secrets": ["secrets"],
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
    const entry = pricingEntry((await res.json()) as JsonValue);
    const min = entry ? priceMin(entry) : null;
    return typeof min === "number" && Number.isFinite(min) && min > 0 ? min : FALLBACK;
  } catch {
    return FALLBACK;
  }
}

function isJsonRecord(value: JsonValue): value is JsonRecord {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function pricingEntry(value: JsonValue): JsonRecord | null {
  if (Array.isArray(value)) {
    return value.find(isGenerateVideoEntry) ?? null;
  }
  if (!isJsonRecord(value)) return null;
  const direct = value["generate-video"];
  if (isJsonRecord(direct)) return direct;
  const pricing = value.pricing;
  if (Array.isArray(pricing)) return pricing.find(isGenerateVideoEntry) ?? null;
  if (isJsonRecord(pricing)) {
    const keyed = pricing["generate-video"];
    if (isJsonRecord(keyed)) return keyed;
  }
  return null;
}

function isGenerateVideoEntry(value: JsonValue): value is JsonRecord {
  return isJsonRecord(value) && (value.id === "generate-video" || value.name === "generate-video");
}

function priceMin(entry: JsonRecord): number | null {
  const estimated = entry.estimatedRange;
  const range = entry.priceRange;
  return (
    numberValue(isJsonRecord(estimated) ? estimated.min : null) ??
    numberValue(isJsonRecord(range) ? range.min : null) ??
    numberValue(entry.min) ??
    numberValue(entry.price)
  );
}

function numberValue(value: JsonValue | undefined): number | null {
  return typeof value === "number" ? value : null;
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
