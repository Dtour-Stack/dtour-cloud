/** Canonical feature-flag registry — single source for seed, admin UI, and gating. */

export type FlagCategory = "ops" | "inference" | "surfaces" | "builders" | "admin";

export type FlagKind = "kill_switch" | "opt_in" | "product";

export type FlagStatus = "live" | "beta" | "planned";

export interface FlagDef {
  key: string;
  category: FlagCategory;
  kind: FlagKind;
  defaultEnabled: boolean;
  label: string;
  description: string;
  /** Dashboard routes gated by this flag (surface flags). */
  routes?: readonly string[];
  status?: FlagStatus;
}

export const FLAG_CATEGORIES: Record<
  FlagCategory,
  { label: string; description: string }
> = {
  ops: {
    label: "Operations & kill switches",
    description: "Emergency rails — flip without redeploying.",
  },
  inference: {
    label: "Inference & media",
    description: "Chat, free tier, image, speech, and video generation.",
  },
  surfaces: {
    label: "Product surfaces",
    description: "Dashboard areas from the ElizaCloud surface map.",
  },
  builders: {
    label: "Builders phase",
    description: "Profile linking and deploy flows still landing.",
  },
  admin: {
    label: "Admin & debugging",
    description: "Operator-only tooling.",
  },
};

export const FLAG_REGISTRY: readonly FlagDef[] = [
  // ── Ops / kill switches ─────────────────────────────────────────────────────
  {
    key: "paid_inference_enabled",
    category: "ops",
    kind: "kill_switch",
    defaultEnabled: true,
    label: "Paid inference",
    description: "Metered chat & image via OpenRouter. Off = pause all paid inference.",
  },
  {
    key: "freetour_enabled",
    category: "ops",
    kind: "kill_switch",
    defaultEnabled: true,
    label: "Free tier (freetour)",
    description: "Rate-limited free OpenRouter models. Off = block the free path entirely.",
  },
  {
    key: "tts_enabled",
    category: "ops",
    kind: "opt_in",
    defaultEnabled: false,
    label: "Text-to-speech",
    description: "ElizaCloud ElevenLabs TTS. Off until the endpoint is verified live.",
  },
  {
    key: "video_enabled",
    category: "ops",
    kind: "opt_in",
    defaultEnabled: false,
    label: "Video generation",
    description: "Workflow video nodes + ElizaCloud generate-video. Off by default.",
  },

  // ── Inference product ───────────────────────────────────────────────────────
  {
    key: "freetour_user_visible",
    category: "inference",
    kind: "product",
    defaultEnabled: true,
    label: "Free model in picker",
    description: "Show “Free — rate-limited” in the agent model dropdown.",
  },
  {
    key: "image_generation_enabled",
    category: "inference",
    kind: "product",
    defaultEnabled: true,
    label: "Image generation",
    description: "Agent chat vision, workflow image nodes, and gallery AI picks.",
  },

  // ── Surfaces (ElizaCloud map → Detour routes) ─────────────────────────────
  {
    key: "surface_agents",
    category: "surfaces",
    kind: "product",
    defaultEnabled: true,
    label: "Agents",
    description: "Lightweight agents + chat inference.",
    routes: ["/agents"],
    status: "live",
  },
  {
    key: "surface_gallery",
    category: "surfaces",
    kind: "product",
    defaultEnabled: true,
    label: "Gallery",
    description: "User media library + vision chat picks.",
    routes: ["/gallery"],
    status: "live",
  },
  {
    key: "surface_billing",
    category: "surfaces",
    kind: "product",
    defaultEnabled: true,
    label: "Billing & credits",
    description: "Credit balance, top-up, and usage.",
    routes: ["/billing"],
    status: "live",
  },
  {
    key: "surface_affiliates",
    category: "surfaces",
    kind: "product",
    defaultEnabled: true,
    label: "Affiliates",
    description: "$ELIZA referral program + invite links.",
    routes: ["/affiliates"],
    status: "live",
  },
  {
    key: "surface_analytics",
    category: "surfaces",
    kind: "product",
    defaultEnabled: true,
    label: "Analytics",
    description: "Usage & spend dashboard.",
    routes: ["/analytics"],
    status: "beta",
  },
  {
    key: "surface_design_studio",
    category: "surfaces",
    kind: "product",
    defaultEnabled: true,
    label: "Design Studio",
    description: "Workflow canvas, node editor, and guided tour.",
    routes: ["/design"],
    status: "beta",
  },
  {
    key: "surface_coding",
    category: "surfaces",
    kind: "product",
    defaultEnabled: true,
    label: "Coding",
    description: "Sandboxed coding agents (Pro tier).",
    routes: ["/coding"],
    status: "beta",
  },
  {
    key: "surface_developers",
    category: "surfaces",
    kind: "product",
    defaultEnabled: true,
    label: "Developers",
    description: "API overview, keys entry point, and docs links.",
    routes: ["/developers", "/docs"],
    status: "beta",
  },
  {
    key: "surface_api_explorer",
    category: "surfaces",
    kind: "product",
    defaultEnabled: true,
    label: "API explorer",
    description: "Try ElizaCloud API routes from the dashboard.",
    routes: ["/api-explorer"],
    status: "beta",
  },
  {
    key: "surface_account_hub",
    category: "surfaces",
    kind: "product",
    defaultEnabled: true,
    label: "Account hub",
    description: "Profile, security, and settings launcher.",
    routes: ["/account-hub", "/account", "/security", "/settings", "/profile"],
    status: "live",
  },
  {
    key: "surface_api_keys",
    category: "surfaces",
    kind: "product",
    defaultEnabled: false,
    label: "API keys",
    description: "Programmatic access keys (Identity §1).",
    routes: ["/api-keys"],
    status: "planned",
  },
  {
    key: "surface_mcps",
    category: "surfaces",
    kind: "product",
    defaultEnabled: false,
    label: "MCP servers",
    description: "Hosted Model Context Protocol tool servers (§6).",
    routes: ["/mcps"],
    status: "planned",
  },
  {
    key: "surface_apps",
    category: "surfaces",
    kind: "product",
    defaultEnabled: false,
    label: "My apps",
    description: "Containerized app deploys + custom domains (§9).",
    routes: ["/apps"],
    status: "planned",
  },
  {
    key: "surface_instances",
    category: "surfaces",
    kind: "product",
    defaultEnabled: false,
    label: "Instances",
    description: "Running agent containers (§17 compute).",
    routes: ["/instances"],
    status: "planned",
  },
  {
    key: "surface_documents",
    category: "surfaces",
    kind: "product",
    defaultEnabled: false,
    label: "Documents & memories",
    description: "Agent knowledge base uploads (§11).",
    status: "planned",
  },
  {
    key: "surface_earnings",
    category: "surfaces",
    kind: "product",
    defaultEnabled: false,
    label: "Earnings",
    description: "Creator earnings + affiliate payouts (§5).",
    routes: ["/earnings"],
    status: "planned",
  },
  {
    key: "surface_social_gateways",
    category: "surfaces",
    kind: "product",
    defaultEnabled: false,
    label: "Social gateways",
    description: "Discord, X, Telegram, WhatsApp connectors (§10).",
    status: "planned",
  },
  {
    key: "surface_voice",
    category: "surfaces",
    kind: "product",
    defaultEnabled: false,
    label: "Voice & audio",
    description: "Voice catalog and cloning UI (§7). Separate from TTS kill-switch.",
    status: "planned",
  },
  {
    key: "surface_organizations",
    category: "surfaces",
    kind: "product",
    defaultEnabled: false,
    label: "Organizations & teams",
    description: "Org membership, invites, permissions (§13).",
    status: "planned",
  },
  {
    key: "surface_governance",
    category: "surfaces",
    kind: "product",
    defaultEnabled: false,
    label: "Governance & approvals",
    description: "Ballots and sensitive-request flows (§14).",
    status: "planned",
  },

  // ── Builders phase ──────────────────────────────────────────────────────────
  {
    key: "profile_avatar_upload",
    category: "builders",
    kind: "product",
    defaultEnabled: false,
    label: "Avatar upload",
    description: "Upload avatars to storage (vs URL-only).",
  },
  {
    key: "agent_linking",
    category: "builders",
    kind: "product",
    defaultEnabled: false,
    label: "Agent linking",
    description: "Link external / cloud agents from profile.",
  },
  {
    key: "github_linking",
    category: "builders",
    kind: "product",
    defaultEnabled: false,
    label: "GitHub linking",
    description: "OAuth GitHub connect for builders.",
  },

  // ── Admin ───────────────────────────────────────────────────────────────────
  {
    key: "admin_debug_panel",
    category: "admin",
    kind: "product",
    defaultEnabled: true,
    label: "Admin activity log",
    description: "Record and view debug events under Admin → Activity Log.",
  },
] as const;

const REGISTRY_BY_KEY = new Map(FLAG_REGISTRY.map((d) => [d.key, d]));

export function getFlagDef(key: string): FlagDef | undefined {
  return REGISTRY_BY_KEY.get(key);
}

/** Resolve effective on/off from DB row + registry semantics. */
export function resolveFlag(
  stored: boolean | undefined,
  def: FlagDef,
): boolean {
  if (stored === undefined) return def.defaultEnabled;
  if (def.kind === "kill_switch") return stored !== false;
  if (def.kind === "opt_in") return stored === true;
  return stored === true;
}

export function resolveFlagMap(
  rows: Record<string, boolean>,
): Record<string, boolean> {
  const out: Record<string, boolean> = {};
  for (const def of FLAG_REGISTRY) {
    out[def.key] = resolveFlag(rows[def.key], def);
  }
  return out;
}

/** Stored toggle value for admin UI (what gets written to DB). */
export function storedToggleValue(def: FlagDef, enabled: boolean): boolean {
  return enabled;
}
