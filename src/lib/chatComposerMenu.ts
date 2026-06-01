/** Feature-flag gating for the agent chat composer “+” tools menu. */

export type ChatMenuActionId =
  | "gallery_attach"
  | "generate_image"
  | "instructions"
  | "mcp_tools"
  | "auto_run_tools"
  | "eliza_plugins"
  | "design_studio"
  | "manage_mcps";

export type ChatMenuBadge = "soon" | "beta";

export type ChatMenuItem = {
  id: ChatMenuActionId;
  label: string;
  /** Shown in menu and clickable. */
  available: boolean;
  badge?: ChatMenuBadge;
  hint?: string;
};

function flagOn(flags: Record<string, boolean>, key: string, defaultWhenMissing = true): boolean {
  const v = flags[key];
  if (v === undefined) return defaultWhenMissing;
  return v === true;
}

export function buildChatMenuItems(flags: Record<string, boolean>): ChatMenuItem[] {
  const gallery = flagOn(flags, "surface_gallery");
  const imageGen = flagOn(flags, "image_generation_enabled");
  const paid = flagOn(flags, "paid_inference_enabled");
  const agentsSurface = flagOn(flags, "surface_agents");
  const mcpsSurface = flagOn(flags, "surface_mcps", false);
  const autoRunFlag = flagOn(flags, "chat_auto_run_tools", false);
  const elizaPlugins = flagOn(flags, "chat_eliza_plugins");
  const designStudio = flagOn(flags, "surface_design_studio");

  const items: ChatMenuItem[] = [];

  if (gallery) {
    items.push({
      id: "gallery_attach",
      label: "Attach from gallery",
      available: true,
      hint: "Vision — pick an image from your library",
    });
  }

  if (imageGen) {
    const canGenerate = paid;
    items.push({
      id: "generate_image",
      label: "Generate image",
      available: canGenerate,
      badge: canGenerate ? undefined : "soon",
      hint: canGenerate
        ? "AI image attached to your next message"
        : "Requires paid inference to be enabled",
    });
  }

  if (agentsSurface) {
    items.push({
      id: "instructions",
      label: "Instructions & knowledge",
      available: true,
      hint: "System prompt + RAG documents",
    });
  }

  if (mcpsSurface) {
    items.push({
      id: "mcp_tools",
      label: "MCP tools",
      available: true,
      hint: "Connect hosted tool servers for this account",
    });
    items.push({
      id: "manage_mcps",
      label: "Manage MCP servers",
      available: true,
      hint: "Open the full MCP catalog",
    });
  }

  if (autoRunFlag) {
    items.push({
      id: "auto_run_tools",
      label: "Auto-run tools",
      available: true,
      badge: "beta",
      hint: "Skip confirmation when tool execution is live",
    });
  }

  if (elizaPlugins) {
    items.push({
      id: "eliza_plugins",
      label: "elizaOS plugins",
      available: true,
      hint: "Discord, Telegram, knowledge, chains, …",
    });
  }

  if (designStudio) {
    items.push({
      id: "design_studio",
      label: "Design Studio",
      available: true,
      badge: "beta",
      hint: "Workflow canvas for this agent",
    });
  }

  return items;
}

export function chatGalleryAttachEnabled(flags: Record<string, boolean>): boolean {
  return flagOn(flags, "surface_gallery");
}

export function chatVoiceInputEnabled(flags: Record<string, boolean>): boolean {
  return flagOn(flags, "surface_voice", false) && flagOn(flags, "tts_enabled", false);
}

const AUTO_RUN_PREFIX = "detour.chat.autoRunTools.";

export function readAutoRunTools(agentId: string): boolean {
  try {
    return globalThis.localStorage?.getItem(`${AUTO_RUN_PREFIX}${agentId}`) === "1";
  } catch {
    return false;
  }
}

export function writeAutoRunTools(agentId: string, enabled: boolean): void {
  try {
    globalThis.localStorage?.setItem(`${AUTO_RUN_PREFIX}${agentId}`, enabled ? "1" : "0");
  } catch {
    /* private mode / SSR */
  }
}
