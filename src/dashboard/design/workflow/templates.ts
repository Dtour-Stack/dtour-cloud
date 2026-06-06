import { defaultSubgraph, defaultValues, getDef } from "./registry";
import type { Edge, NodeInstance, PortType } from "./types";

export type Graph = { nodes: NodeInstance[]; edges: Edge[] };
export type Template = {
  id: string;
  name: string;
  description: string;
  category: string;
  build: () => Graph;
};

function mk(
  id: string,
  type: string,
  x: number,
  y: number,
  values?: Record<string, string | number>,
): NodeInstance {
  const subgraph = defaultSubgraph(type);
  return {
    id,
    type,
    x,
    y,
    values: { ...defaultValues(getDef(type)), ...(values ?? {}) },
    ...(subgraph ? { subgraph, subgraphCollapsed: true } : {}),
  };
}

function ed(i: number, sn: string, sp: string, tn: string, tp: string, type: PortType): Edge {
  return { id: `e_${i}`, source: { node: sn, port: sp }, target: { node: tn, port: tp }, type };
}

const COL = [40, 320, 600, 880, 1160];

/** Built-in starter workflows. ElizaCloud media pipelines + elizaOS agent graphs. */
export const TEMPLATES: Template[] = [
  {
    id: "image-from-prompt",
    name: "Image from prompt",
    description: "Prompt → Image Generate → Output.",
    category: "Media",
    build: () => ({
      nodes: [
        mk("p", "input.prompt", COL[0], 120),
        mk("g", "generate.image", COL[1], 80),
        mk("o", "output.preview", COL[2], 140),
      ],
      edges: [ed(0, "p", "prompt", "g", "prompt", "text"), ed(1, "g", "image", "o", "in", "image")],
    }),
  },
  {
    id: "enhanced-image",
    name: "Enhanced image",
    description: "Prompt → Prompt Enhancer → Image Generate → Output.",
    category: "Media",
    build: () => ({
      nodes: [
        mk("p", "input.prompt", COL[0], 120),
        mk("e", "enhance.prompt", COL[1], 110),
        mk("g", "generate.image", COL[2], 80),
        mk("o", "output.preview", COL[3], 140),
      ],
      edges: [
        ed(0, "p", "prompt", "e", "prompt", "text"),
        ed(1, "e", "text", "g", "prompt", "text"),
        ed(2, "g", "image", "o", "in", "image"),
      ],
    }),
  },
  {
    id: "text-to-video",
    name: "Text → Video",
    description: "Prompt → Video Generate → Output.",
    category: "Media",
    build: () => ({
      nodes: [
        mk("p", "input.prompt", COL[0], 120, { text: "a timelapse of clouds over a mountain" }),
        mk("v", "generate.video", COL[1], 120),
        mk("o", "output.preview", COL[2], 140),
      ],
      edges: [ed(0, "p", "prompt", "v", "prompt", "text"), ed(1, "v", "video", "o", "in", "video")],
    }),
  },
  {
    id: "narrated-script",
    name: "Narrated script",
    description: "Prompt → Text Generate → Speak (TTS) → Output.",
    category: "Media",
    build: () => ({
      nodes: [
        mk("p", "input.prompt", COL[0], 120, { text: "Write a 2-sentence intro for a design tool." }),
        mk("t", "generate.text", COL[1], 110),
        mk("s", "generate.speech", COL[2], 130),
        mk("o", "output.preview", COL[3], 140),
      ],
      edges: [
        ed(0, "p", "prompt", "t", "prompt", "text"),
        ed(1, "t", "text", "s", "text", "text"),
        ed(2, "s", "audio", "o", "in", "audio"),
      ],
    }),
  },
  {
    id: "research-brief",
    name: "Research brief",
    description: "Query → Web Search → Text Generate → Output.",
    category: "Media",
    build: () => ({
      nodes: [
        mk("p", "input.prompt", COL[0], 120, { text: "latest Solana ecosystem news" }),
        mk("w", "tools.search", COL[1], 120),
        mk("t", "generate.text", COL[2], 110),
        mk("o", "output.preview", COL[3], 140),
      ],
      edges: [
        ed(0, "p", "prompt", "w", "query", "text"),
        ed(1, "w", "results", "t", "prompt", "text"),
        ed(2, "t", "text", "o", "in", "text"),
      ],
    }),
  },
  {
    id: "eliza-basic-agent",
    name: "Basic agent",
    description: "Character + Plugin → Message → Provider → Action → Respond.",
    category: "elizaOS",
    build: () => ({
      nodes: [
        mk("pl", "eliza.plugin", COL[0], 60),
        mk("ch", "eliza.character", COL[1], 60),
        mk("m", "eliza.message", COL[0], 320),
        mk("pr", "eliza.provider", COL[1], 320),
        mk("a", "eliza.action", COL[2], 230),
        mk("r", "eliza.respond", COL[3], 250),
      ],
      edges: [
        ed(0, "pl", "plugin", "ch", "plugins", "any"),
        ed(1, "m", "message", "pr", "message", "message"),
        ed(2, "ch", "agent", "a", "agent", "agent"),
        ed(3, "m", "message", "a", "message", "message"),
        ed(4, "pr", "context", "a", "context", "context"),
        ed(5, "a", "message", "r", "message", "message"),
      ],
    }),
  },
  {
    id: "eliza-reactive-agent",
    name: "Reactive agent",
    description: "Message → Provider → Action → Evaluator → Respond (with Character).",
    category: "elizaOS",
    build: () => ({
      nodes: [
        mk("ch", "eliza.character", COL[0], 60),
        mk("m", "eliza.message", COL[0], 300),
        mk("pr", "eliza.provider", COL[1], 300),
        mk("a", "eliza.action", COL[2], 210),
        mk("ev", "eliza.evaluator", COL[3], 250),
        mk("r", "eliza.respond", COL[4], 270),
      ],
      edges: [
        ed(0, "m", "message", "pr", "message", "message"),
        ed(1, "ch", "agent", "a", "agent", "agent"),
        ed(2, "m", "message", "a", "message", "message"),
        ed(3, "pr", "context", "a", "context", "context"),
        ed(4, "a", "message", "ev", "message", "message"),
        ed(5, "ev", "message", "r", "message", "message"),
      ],
    }),
  },
];
