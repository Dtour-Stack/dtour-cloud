export type SurfaceStatus = "live" | "beta" | "planned";

export type RouteSurfaceMeta = {
  flag: string;
  status: SurfaceStatus;
  defaultEnabled: boolean;
  title: string;
  description: string;
};

export const ROUTE_SURFACE_META: Record<string, RouteSurfaceMeta> = {
  "/agents": {
    flag: "surface_agents",
    status: "live",
    defaultEnabled: true,
    title: "Agents",
    description: "Lightweight agents and chat inference.",
  },
  "/gallery": {
    flag: "surface_gallery",
    status: "live",
    defaultEnabled: true,
    title: "Gallery",
    description: "Uploads, generated images, and reusable design assets.",
  },
  "/design/projects/gallery": {
    flag: "surface_gallery",
    status: "live",
    defaultEnabled: true,
    title: "Gallery",
    description: "Saved media outputs for design projects.",
  },
  "/profile/billing": {
    flag: "surface_billing",
    status: "live",
    defaultEnabled: true,
    title: "Billing",
    description: "Credit balance, top-ups, and usage billing.",
  },
  "/profile/affiliates": {
    flag: "surface_affiliates",
    status: "live",
    defaultEnabled: true,
    title: "Affiliates",
    description: "$ELIZA referral links and payout wallet settings.",
  },
  "/billing": {
    flag: "surface_billing",
    status: "live",
    defaultEnabled: true,
    title: "Billing",
    description: "Credit balance, top-ups, and usage billing.",
  },
  "/affiliates": {
    flag: "surface_affiliates",
    status: "live",
    defaultEnabled: true,
    title: "Affiliates",
    description: "$ELIZA referral links and payout wallet settings.",
  },
  "/analytics": {
    flag: "surface_analytics",
    status: "beta",
    defaultEnabled: true,
    title: "Analytics",
    description: "Usage, spend, and activity analytics.",
  },
  "/design": {
    flag: "surface_design_studio",
    status: "beta",
    defaultEnabled: true,
    title: "Design Studio",
    description: "Canvas, sketch, workflow, and generated dashboard design tools.",
  },
  "/coding": {
    flag: "surface_coding",
    status: "beta",
    defaultEnabled: true,
    title: "Coding",
    description: "Sandboxed coding agents and workspace saves.",
  },
  "/developers": {
    flag: "surface_developers",
    status: "beta",
    defaultEnabled: true,
    title: "Developers",
    description: "API explorer, docs, and developer entry points.",
  },
  "/docs": {
    flag: "surface_developers",
    status: "beta",
    defaultEnabled: true,
    title: "Docs",
    description: "Detour Cloud product and API documentation.",
  },
  "/api-explorer": {
    flag: "surface_api_explorer",
    status: "beta",
    defaultEnabled: true,
    title: "API explorer",
    description: "Try proxied ElizaCloud API routes from the dashboard.",
  },
  "/account-hub": {
    flag: "surface_account_hub",
    status: "live",
    defaultEnabled: true,
    title: "Account",
    description: "Profile, security, and settings.",
  },
  "/account": {
    flag: "surface_account_hub",
    status: "live",
    defaultEnabled: true,
    title: "Account",
    description: "Profile, security, and settings.",
  },
  "/security": {
    flag: "surface_account_hub",
    status: "live",
    defaultEnabled: true,
    title: "Security",
    description: "Wallet session and API access controls.",
  },
  "/settings": {
    flag: "surface_account_hub",
    status: "live",
    defaultEnabled: true,
    title: "Settings",
    description: "Local preferences and profile links.",
  },
  "/profile": {
    flag: "surface_account_hub",
    status: "live",
    defaultEnabled: true,
    title: "Profile",
    description: "Username, email, socials, and builder profile.",
  },
  "/api-keys": {
    flag: "surface_api_keys",
    status: "planned",
    defaultEnabled: false,
    title: "API keys",
    description: "Programmatic access keys are being hardened before public launch.",
  },
  "/mcps": {
    flag: "surface_mcps",
    status: "planned",
    defaultEnabled: false,
    title: "MCP servers",
    description: "Hosted tool servers will open after live tool execution is ready.",
  },
  "/apps": {
    flag: "surface_apps",
    status: "planned",
    defaultEnabled: false,
    title: "My Apps",
    description: "Public app publishing and monetization are not open yet.",
  },
  "/instances": {
    flag: "surface_instances",
    status: "planned",
    defaultEnabled: false,
    title: "Instances",
    description: "Cloud runtime instances will open after container provisioning is verified.",
  },
  "/earnings": {
    flag: "surface_earnings",
    status: "planned",
    defaultEnabled: false,
    title: "Earnings",
    description: "Creator earnings rollups are being kept private until payouts are verified.",
  },
};

export const ROUTE_SURFACE_FLAG: Record<string, string> = {};
export const DEFAULT_SURFACE_FLAGS: Record<string, boolean> = {};

for (const [route, meta] of Object.entries(ROUTE_SURFACE_META)) {
  ROUTE_SURFACE_FLAG[route] = meta.flag;
  DEFAULT_SURFACE_FLAGS[meta.flag] = meta.defaultEnabled;
}

function normalizedPath(path: string): string {
  return path.split(/[?#]/)[0] || "/";
}

export function surfaceMetaForRoute(path: string): RouteSurfaceMeta | undefined {
  const clean = normalizedPath(path);
  if (ROUTE_SURFACE_META[clean]) return ROUTE_SURFACE_META[clean];
  let match: RouteSurfaceMeta | undefined;
  let matchLength = -1;
  for (const [prefix, meta] of Object.entries(ROUTE_SURFACE_META)) {
    if (clean.startsWith(`${prefix}/`) && prefix.length > matchLength) {
      match = meta;
      matchLength = prefix.length;
    }
  }
  return match;
}

export function surfaceFlagForRoute(path: string): string | undefined {
  return surfaceMetaForRoute(path)?.flag;
}

export function isRouteEnabled(
  path: string,
  flags: Record<string, boolean>,
): boolean {
  const key = surfaceFlagForRoute(path);
  if (!key) return true;
  return flags[key] === true;
}

export function surfaceLabelForRoute(
  path: string,
  flags: Record<string, boolean>,
): "Coming soon" | "Open beta" | null {
  const meta = surfaceMetaForRoute(path);
  if (!meta) return null;
  if (flags[meta.flag] !== true) return "Coming soon";
  if (meta.status !== "live") return "Open beta";
  return null;
}
