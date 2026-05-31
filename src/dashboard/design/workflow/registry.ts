import type { NodeDef, PortType } from "./types";

/** Port colors carry data-type information. Deliberately NOT the brand
 *  violet/indigo/blue gradient — DESIGN.md reserves violet for the single
 *  emphasis moment (selection/focus). */
export const PORT_COLOR: Record<PortType, string> = {
  image: "#F87171", // rose
  text: "#60A5FA", // sky
  model: "#FDE68A", // amber
  number: "#94A3B8", // slate
  audio: "#34D399", // emerald
  video: "#FB923C", // orange
  agent: "#E879F9", // fuchsia (elizaOS)
  message: "#2DD4BF", // teal (elizaOS bus)
  context: "#A3E635", // lime (elizaOS state)
  any: "#9CA3AF", // gray
};

/** All elizaOS plugins selectable in the builders (workflow node + agent creator). */
export const ELIZA_PLUGINS: string[] = [
  "plugin-elizacloud",
  "plugin-anthropic",
  "plugin-openai",
  "plugin-google-genai",
  "plugin-openrouter",
  "plugin-discord",
  "plugin-telegram",
  "plugin-twitter",
  "plugin-bluesky",
  "plugin-farcaster",
  "plugin-elevenlabs",
  "plugin-browser",
  "plugin-documents",
  "plugin-pdf",
  "plugin-knowledge",
  "plugin-sql",
  "plugin-web-search",
  "plugin-image",
  "plugin-video",
  "plugin-solana",
  "plugin-evm",
  "plugin-goat",
  "plugin-mcp",
];

export const NODE_DEFS: NodeDef[] = [
  // ── Input ──
  {
    type: "input.prompt",
    title: "Prompt",
    category: "Input",
    inputs: [],
    outputs: [{ name: "prompt", type: "text" }],
    widgets: [{ key: "text", kind: "textarea", label: "Prompt", default: "a serene mountain at dawn" }],
  },
  {
    type: "input.model",
    title: "Model",
    category: "Input",
    inputs: [],
    outputs: [{ name: "model", type: "model" }],
    widgets: [
      { key: "name", kind: "select", label: "Model", default: "Auto", options: ["Auto", "SDXL", "Flux", "Gemini Image", "Detour-Cloud"] },
    ],
  },
  {
    type: "input.image",
    title: "Image Input",
    category: "Input",
    inputs: [],
    outputs: [{ name: "image", type: "image" }],
    widgets: [{ key: "url", kind: "text", label: "Source URL", default: "" }],
  },

  // ── Enhance ──
  {
    type: "enhance.prompt",
    title: "Prompt Enhancer",
    category: "Enhance",
    inputs: [
      { name: "prompt", type: "text" },
      { name: "model", type: "model" },
    ],
    outputs: [{ name: "text", type: "text" }],
    widgets: [
      { key: "style", kind: "select", label: "Style", default: "Cinematic", options: ["Cinematic", "Detailed", "Concise", "Artistic", "Photoreal"] },
    ],
  },

  // ── Generate (ElizaCloud inference) ──
  {
    type: "generate.text",
    title: "Text Generate",
    category: "Generate",
    inputs: [
      { name: "prompt", type: "text" },
      { name: "model", type: "model" },
    ],
    outputs: [{ name: "text", type: "text" }],
    widgets: [{ key: "temperature", kind: "slider", label: "Temperature", default: 0.7, min: 0, max: 2, step: 0.1 }],
  },
  {
    type: "generate.image",
    title: "Image Generate",
    category: "Generate",
    inputs: [
      { name: "prompt", type: "text" },
      { name: "model", type: "model" },
    ],
    outputs: [{ name: "image", type: "image" }],
    widgets: [
      { key: "width", kind: "number", label: "Width", default: 1024, min: 64, max: 4096, step: 64 },
      { key: "height", kind: "number", label: "Height", default: 1024, min: 64, max: 4096, step: 64 },
      { key: "steps", kind: "slider", label: "Steps", default: 25, min: 1, max: 50, step: 1 },
    ],
  },
  {
    type: "generate.video",
    title: "Video Generate",
    category: "Generate",
    inputs: [{ name: "prompt", type: "text" }],
    outputs: [{ name: "video", type: "video" }],
    widgets: [{ key: "seconds", kind: "number", label: "Seconds", default: 4, min: 1, max: 30, step: 1 }],
  },
  {
    type: "generate.speech",
    title: "Speak (TTS)",
    category: "Generate",
    inputs: [{ name: "text", type: "text" }],
    outputs: [{ name: "audio", type: "audio" }],
    widgets: [{ key: "voice", kind: "select", label: "Voice", default: "Default", options: ["Default", "Rachel", "Adam", "Bella"] }],
  },

  // ── Tools ── (Web Search removed — no live web-search endpoint; returns once
  //   MCP tool execution ships. See /mcps "coming soon".)

  // ── Refine ──
  {
    type: "refine.upscale",
    title: "Upscale",
    category: "Refine",
    inputs: [{ name: "image", type: "image" }],
    outputs: [{ name: "image", type: "image" }],
    widgets: [{ key: "scale", kind: "select", label: "Scale", default: "2x", options: ["2x", "4x"] }],
  },

  // ── Output ──
  {
    type: "output.preview",
    title: "Output / Preview",
    category: "Output",
    // Collect several upstream results into one preview.
    inputs: [{ name: "in", type: "any", multi: true }],
    outputs: [],
    widgets: [],
  },

  // ── elizaOS agent composition (design-only; deploy via the runtime) ──
  {
    type: "eliza.character",
    title: "Character",
    category: "Agent",
    // plugins is a fan-in connector: link as many Plugin nodes as you want.
    inputs: [{ name: "plugins", type: "any", multi: true }],
    outputs: [{ name: "agent", type: "agent" }],
    widgets: [
      { key: "name", kind: "text", label: "Name", default: "Detour" },
      { key: "system", kind: "textarea", label: "System", default: "You are a helpful agent." },
    ],
  },
  {
    type: "eliza.plugin",
    title: "Plugin",
    category: "Agent",
    inputs: [],
    outputs: [{ name: "plugin", type: "any" }],
    widgets: [
      {
        key: "name",
        kind: "select",
        label: "Plugin",
        default: "plugin-elizacloud",
        options: [...ELIZA_PLUGINS],
      },
    ],
  },
  {
    type: "eliza.message",
    title: "Message Trigger",
    category: "Agent",
    inputs: [],
    outputs: [{ name: "message", type: "message" }],
    widgets: [{ key: "source", kind: "select", label: "Source", default: "discord", options: ["discord", "x", "telegram", "cli", "api"] }],
  },
  {
    type: "eliza.provider",
    title: "Provider",
    category: "Agent",
    inputs: [{ name: "message", type: "message" }],
    outputs: [{ name: "context", type: "context" }],
    widgets: [
      { key: "name", kind: "select", label: "Provider", default: "RECENT_MESSAGES", options: ["RECENT_MESSAGES", "FACTS", "CHARACTER", "TIME", "ENTITIES", "KNOWLEDGE"] },
    ],
  },
  {
    type: "eliza.action",
    title: "Action",
    category: "Agent",
    inputs: [
      { name: "agent", type: "agent" },
      { name: "message", type: "message" },
      { name: "context", type: "context" },
    ],
    outputs: [{ name: "message", type: "message" }],
    widgets: [
      { key: "name", kind: "text", label: "Action", default: "REPLY" },
      { key: "description", kind: "text", label: "Description", default: "Respond to the user" },
    ],
  },
  {
    type: "eliza.evaluator",
    title: "Evaluator",
    category: "Agent",
    inputs: [{ name: "message", type: "message" }],
    outputs: [{ name: "message", type: "message" }],
    widgets: [{ key: "name", kind: "text", label: "Evaluator", default: "REFLECTION" }],
  },
  {
    type: "eliza.respond",
    title: "Respond",
    category: "Agent",
    inputs: [{ name: "message", type: "message" }],
    outputs: [],
    widgets: [],
  },
];

const BY_TYPE = new Map(NODE_DEFS.map((d) => [d.type, d]));
export function getDef(type: string): NodeDef {
  const d = BY_TYPE.get(type);
  if (!d) throw new Error(`Unknown node type: ${type}`);
  return d;
}

export function defaultValues(def: NodeDef): Record<string, string | number> {
  const v: Record<string, string | number> = {};
  for (const w of def.widgets) v[w.key] = w.default;
  return v;
}
