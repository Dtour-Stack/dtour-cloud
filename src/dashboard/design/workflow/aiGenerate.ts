/**
 * AI workflow generation: prompt → a valid node graph, via the metered inference
 * gateway (runChat). The node registry is embedded as the schema the model must
 * target; the returned JSON is validated + re-id'd so a model can never produce a
 * graph that breaks the editor.
 */
import { defaultValues, ELIZA_PLUGINS, getDef, NODE_DEFS } from "./registry";
import type { Graph } from "./templates";
import type { Edge, NodeDef, NodeInstance } from "./types";

type RunChat = (args: {
  token: string;
  model: string;
  messages: { role: string; content: string }[];
  refId: string;
}) => Promise<{ text: string }>;

/** Compact catalog of every node type for the system prompt. */
function nodeCatalog(): string {
  return NODE_DEFS.map((d) => {
    const ins = d.inputs.map((p) => `${p.name}:${p.type}`).join(", ") || "—";
    const outs = d.outputs.map((p) => `${p.name}:${p.type}`).join(", ") || "—";
    const widgets = d.widgets.map((w) => w.key).join(", ") || "—";
    return `- ${d.type} (${d.title}) in[${ins}] out[${outs}] widgets[${widgets}]`;
  }).join("\n");
}

const SYSTEM = `You are a workflow architect for Detour Cloud's node-graph editor. Given a user goal, design a graph from ONLY these node types:
${nodeCatalog()}

Rules:
- Output ONLY raw JSON (no prose, no markdown fences): {"nodes":[...],"edges":[...]}.
- node: {"id":"n0","type":"<one of the types above>","values":{<widgetKey: value>}}. Use widget keys from the catalog; omit unknown ones.
- edge: {"source":{"node":"n0","port":"<output port name>"},"target":{"node":"n1","port":"<input port name>"}}. Connect an OUTPUT port to an INPUT port whose types match (or "any").
- Always start from input nodes (input.prompt / input.model / input.image / eliza.message) and end at an output (output.preview / eliza.respond).
- Keep it minimal but complete — only nodes needed for the goal. 3–8 nodes typical.
- For agent designs use the eliza.* nodes; plugins available: ${ELIZA_PLUGINS.join(", ")}.`;

/** Pull the first {...} JSON object out of a model response (tolerates fences/prose). */
function extractJson(raw: string): unknown {
  const t = raw.trim().replace(/^```(?:json)?/i, "").replace(/```$/i, "").trim();
  const start = t.indexOf("{");
  const end = t.lastIndexOf("}");
  if (start === -1 || end === -1) throw new Error("No JSON in the response.");
  return JSON.parse(t.slice(start, end + 1));
}

/** Validate + re-id a raw graph so it always loads cleanly. */
function normalize(raw: unknown): Graph {
  const obj = raw as { nodes?: unknown; edges?: unknown };
  const rawNodes = Array.isArray(obj.nodes) ? obj.nodes : [];
  const rawEdges = Array.isArray(obj.edges) ? obj.edges : [];

  // Keep only valid node types; remap their ids to n_0.., lay out left→right.
  const idMap = new Map<string, string>();
  const nodes: NodeInstance[] = [];
  rawNodes.forEach((n) => {
    const node = n as { id?: string; type?: string; values?: Record<string, unknown> };
    if (!node.type) return;
    let def: NodeDef;
    try {
      def = getDef(node.type); // throws if unknown
    } catch {
      return;
    }
    const newId = `n_${nodes.length}`;
    if (node.id) idMap.set(node.id, newId);
    const col = nodes.length;
    nodes.push({
      id: newId,
      type: node.type,
      x: 80 + (col % 4) * 280,
      y: 80 + Math.floor(col / 4) * 220,
      // Fill widget defaults first — models routinely omit keys; without this
      // they'd render as "undefined"/NaN (the happy path, not an edge case).
      values: { ...defaultValues(def), ...((node.values as Record<string, string | number>) ?? {}) },
    });
  });
  if (nodes.length === 0) throw new Error("The model returned no valid nodes.");

  const defByNewId = new Map(nodes.map((n) => [n.id, getDef(n.type)]));
  const edges: Edge[] = [];
  rawEdges.forEach((e) => {
    const edge = e as { source?: { node?: string; port?: string }; target?: { node?: string; port?: string } };
    const sn = edge.source?.node && idMap.get(edge.source.node);
    const tn = edge.target?.node && idMap.get(edge.target.node);
    if (!sn || !tn) return;
    const sPort = getDef(nodes.find((x) => x.id === sn)!.type).outputs.find((p) => p.name === edge.source?.port);
    const tDef = defByNewId.get(tn)!;
    const tPort = tDef.inputs.find((p) => p.name === edge.target?.port);
    if (!sPort || !tPort) return;
    // Same invariant the interactive editor enforces: matching types, or either
    // side is the "any" wildcard. Stops generated image→text-style miswires.
    if (!(sPort.type === tPort.type || sPort.type === "any" || tPort.type === "any")) return;
    edges.push({
      id: `e_${edges.length}`,
      source: { node: sn, port: sPort.name },
      target: { node: tn, port: tPort.name },
      type: sPort.type,
    });
  });

  return { nodes, edges };
}

/** Generate a workflow graph from a natural-language prompt (metered). */
export async function generateWorkflowGraph(
  runChat: RunChat,
  token: string,
  prompt: string,
  refId: string,
): Promise<Graph> {
  const { text } = await runChat({
    token,
    model: "openrouter/auto",
    messages: [
      { role: "system", content: SYSTEM },
      { role: "user", content: prompt },
    ],
    refId,
  });
  return normalize(extractJson(text));
}
