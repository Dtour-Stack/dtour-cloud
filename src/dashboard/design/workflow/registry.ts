import type { Edge, NodeDef, NodeInstance, PortType } from "./types";

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
    type: "eliza.agent",
    title: "Agent",
    category: "Agent",
    inputs: [
      { name: "plugins", type: "any", multi: true },
      { name: "message", type: "message" },
      { name: "context", type: "context", multi: true },
    ],
    outputs: [
      { name: "agent", type: "agent" },
      { name: "message", type: "message" },
    ],
    widgets: [
      { key: "name", kind: "text", label: "Name", default: "Detour Agent" },
      {
        key: "runtime",
        kind: "select",
        label: "Runtime",
        default: "ElizaCloud first",
        options: ["ElizaCloud first", "Detour fallback", "External A2A", "Local desktop"],
      },
      {
        key: "access",
        kind: "select",
        label: "Access",
        default: "Private mesh",
        options: ["Private mesh", "Public web UI", "Public API", "Internal only"],
      },
    ],
  },
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
  {
    type: "eliza.agent.runtime",
    title: "Runtime Gateway",
    category: "Agent Internals",
    inputs: [{ name: "agent", type: "agent" }],
    outputs: [{ name: "agent", type: "agent" }],
    widgets: [
      {
        key: "strategy",
        kind: "select",
        label: "Strategy",
        default: "ElizaCloud first",
        options: ["ElizaCloud first", "Detour fallback", "External A2A", "Local desktop"],
      },
      {
        key: "domain",
        kind: "select",
        label: "Domain",
        default: "detour.ninja",
        options: ["detour.ninja", "custom domain", "mesh only"],
      },
    ],
  },
  {
    type: "eliza.agent.endpoint",
    title: "Endpoint Access",
    category: "Agent Internals",
    inputs: [{ name: "agent", type: "agent" }],
    outputs: [{ name: "endpoint", type: "any" }],
    widgets: [
      {
        key: "webUi",
        kind: "select",
        label: "Web UI",
        default: "private",
        options: ["private", "public", "disabled"],
      },
      {
        key: "api",
        kind: "select",
        label: "API",
        default: "private",
        options: ["private", "public", "disabled"],
      },
      {
        key: "protocols",
        kind: "select",
        label: "Protocols",
        default: "A2A + MCP",
        options: ["A2A + MCP", "A2A only", "MCP only", "HTTP only"],
      },
    ],
  },
  {
    type: "eliza.character.identity",
    title: "Identity",
    category: "Character Internals",
    inputs: [],
    outputs: [{ name: "identity", type: "text" }],
    widgets: [
      { key: "name", kind: "text", label: "Name", default: "Detour" },
      { key: "bio", kind: "textarea", label: "Bio", default: "A helpful cloud agent." },
    ],
  },
  {
    type: "eliza.character.system",
    title: "System Prompt",
    category: "Character Internals",
    inputs: [],
    outputs: [{ name: "system", type: "text" }],
    widgets: [{ key: "system", kind: "textarea", label: "System", default: "You are a helpful agent." }],
  },
  {
    type: "eliza.character.lore",
    title: "Lore",
    category: "Character Internals",
    inputs: [],
    outputs: [{ name: "lore", type: "text" }],
    widgets: [{ key: "lore", kind: "textarea", label: "Lore", default: "Knows the user's Detour Cloud workspace." }],
  },
  {
    type: "eliza.character.style",
    title: "Style",
    category: "Character Internals",
    inputs: [],
    outputs: [{ name: "style", type: "text" }],
    widgets: [
      {
        key: "style",
        kind: "select",
        label: "Style",
        default: "direct",
        options: ["direct", "technical", "playful", "formal"],
      },
    ],
  },
  {
    type: "eliza.character.knowledge",
    title: "Knowledge",
    category: "Character Internals",
    inputs: [],
    outputs: [{ name: "knowledge", type: "context" }],
    widgets: [{ key: "source", kind: "text", label: "Source", default: "workspace memory" }],
  },
  {
    type: "eliza.character.memory",
    title: "Memory",
    category: "Character Internals",
    inputs: [{ name: "pieces", type: "any", multi: true }],
    outputs: [{ name: "context", type: "context" }],
    widgets: [
      {
        key: "mode",
        kind: "select",
        label: "Mode",
        default: "workspace scoped",
        options: ["workspace scoped", "agent scoped", "session only"],
      },
    ],
  },
  {
    type: "eliza.plugin.manifest",
    title: "Manifest",
    category: "Plugin Internals",
    inputs: [],
    outputs: [{ name: "manifest", type: "any" }],
    widgets: [
      { key: "name", kind: "select", label: "Plugin", default: "plugin-elizacloud", options: [...ELIZA_PLUGINS] },
      { key: "version", kind: "text", label: "Version", default: "latest" },
    ],
  },
  {
    type: "eliza.plugin.actions",
    title: "Actions",
    category: "Plugin Internals",
    inputs: [],
    outputs: [{ name: "actions", type: "message" }],
    widgets: [{ key: "actions", kind: "textarea", label: "Actions", default: "REPLY\nCALL_TOOL" }],
  },
  {
    type: "eliza.plugin.providers",
    title: "Providers",
    category: "Plugin Internals",
    inputs: [],
    outputs: [{ name: "providers", type: "context" }],
    widgets: [{ key: "providers", kind: "textarea", label: "Providers", default: "RECENT_MESSAGES\nKNOWLEDGE" }],
  },
  {
    type: "eliza.plugin.evaluators",
    title: "Evaluators",
    category: "Plugin Internals",
    inputs: [{ name: "message", type: "message" }],
    outputs: [{ name: "evaluators", type: "message" }],
    widgets: [{ key: "evaluators", kind: "textarea", label: "Evaluators", default: "REFLECTION" }],
  },
  {
    type: "eliza.plugin.secrets",
    title: "Secrets",
    category: "Plugin Internals",
    inputs: [],
    outputs: [{ name: "secrets", type: "any" }],
    widgets: [{ key: "refs", kind: "textarea", label: "Secret refs", default: "OPENROUTER_API_KEY" }],
  },
  {
    type: "eliza.plugin.mcp",
    title: "MCP Tools",
    category: "Plugin Internals",
    inputs: [],
    outputs: [{ name: "tools", type: "any" }],
    widgets: [{ key: "server", kind: "text", label: "Server", default: "detour-mcp" }],
  },
  {
    type: "eliza.plugin.bundle",
    title: "Plugin Bundle",
    category: "Plugin Internals",
    inputs: [{ name: "parts", type: "any", multi: true }],
    outputs: [{ name: "plugin", type: "any" }],
    widgets: [
      {
        key: "load",
        kind: "select",
        label: "Load",
        default: "required",
        options: ["required", "optional", "lazy"],
      },
    ],
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

export function defaultSubgraph(type: string): NodeInstance["subgraph"] | undefined {
  if (type === "eliza.agent") {
    const nodes = [
      subNode("agent_plugin", "eliza.plugin", 32, 52),
      subNode("agent_character", "eliza.character", 316, 52),
      subNode("agent_runtime", "eliza.agent.runtime", 600, 52),
      subNode("agent_endpoint", "eliza.agent.endpoint", 884, 52),
      subNode("agent_message", "eliza.message", 32, 310),
      subNode("agent_provider", "eliza.provider", 316, 310),
      subNode("agent_action", "eliza.action", 600, 310),
      subNode("agent_evaluator", "eliza.evaluator", 884, 310),
      subNode("agent_response", "eliza.respond", 1168, 310),
    ];
    return {
      nodes,
      edges: [
        subEdge(0, "agent_plugin", "plugin", "agent_character", "plugins", "any"),
        subEdge(1, "agent_character", "agent", "agent_runtime", "agent", "agent"),
        subEdge(2, "agent_runtime", "agent", "agent_endpoint", "agent", "agent"),
        subEdge(3, "agent_message", "message", "agent_provider", "message", "message"),
        subEdge(4, "agent_runtime", "agent", "agent_action", "agent", "agent"),
        subEdge(5, "agent_message", "message", "agent_action", "message", "message"),
        subEdge(6, "agent_provider", "context", "agent_action", "context", "context"),
        subEdge(7, "agent_action", "message", "agent_evaluator", "message", "message"),
        subEdge(8, "agent_evaluator", "message", "agent_response", "message", "message"),
      ],
    };
  }
  if (type === "eliza.character") {
    return {
      nodes: [
        subNode("character_identity", "eliza.character.identity", 32, 48, undefined, false),
        subNode("character_system", "eliza.character.system", 316, 48, undefined, false),
        subNode("character_lore", "eliza.character.lore", 600, 48, undefined, false),
        subNode("character_style", "eliza.character.style", 32, 270, undefined, false),
        subNode("character_knowledge", "eliza.character.knowledge", 316, 270, undefined, false),
        subNode("character_memory", "eliza.character.memory", 600, 270, undefined, false),
      ],
      edges: [
        subEdge(0, "character_identity", "identity", "character_memory", "pieces", "text"),
        subEdge(1, "character_system", "system", "character_memory", "pieces", "text"),
        subEdge(2, "character_lore", "lore", "character_memory", "pieces", "text"),
        subEdge(3, "character_style", "style", "character_memory", "pieces", "text"),
        subEdge(4, "character_knowledge", "knowledge", "character_memory", "pieces", "context"),
      ],
    };
  }
  if (type === "eliza.plugin") {
    return {
      nodes: [
        subNode("plugin_manifest", "eliza.plugin.manifest", 32, 48, undefined, false),
        subNode("plugin_actions", "eliza.plugin.actions", 316, 48, undefined, false),
        subNode("plugin_providers", "eliza.plugin.providers", 600, 48, undefined, false),
        subNode("plugin_evaluators", "eliza.plugin.evaluators", 32, 270, undefined, false),
        subNode("plugin_secrets", "eliza.plugin.secrets", 316, 270, undefined, false),
        subNode("plugin_mcp", "eliza.plugin.mcp", 600, 270, undefined, false),
        subNode("plugin_bundle", "eliza.plugin.bundle", 884, 160, undefined, false),
      ],
      edges: [
        subEdge(0, "plugin_manifest", "manifest", "plugin_bundle", "parts", "any"),
        subEdge(1, "plugin_actions", "actions", "plugin_bundle", "parts", "message"),
        subEdge(2, "plugin_providers", "providers", "plugin_bundle", "parts", "context"),
        subEdge(3, "plugin_evaluators", "evaluators", "plugin_bundle", "parts", "message"),
        subEdge(4, "plugin_secrets", "secrets", "plugin_bundle", "parts", "any"),
        subEdge(5, "plugin_mcp", "tools", "plugin_bundle", "parts", "any"),
      ],
    };
  }
  return undefined;
}

function subNode(
  id: string,
  type: string,
  x: number,
  y: number,
  values?: Record<string, string | number>,
  nested = true,
): NodeInstance {
  const def = getDef(type);
  const subgraph = nested ? defaultSubgraph(type) : undefined;
  return {
    id,
    type,
    x,
    y,
    values: { ...defaultValues(def), ...(values ?? {}) },
    ...(subgraph ? { subgraph, subgraphCollapsed: true } : {}),
  };
}

function subEdge(i: number, sn: string, sp: string, tn: string, tp: string, type: PortType): Edge {
  return { id: `sg_${i}`, source: { node: sn, port: sp }, target: { node: tn, port: tp }, type };
}
