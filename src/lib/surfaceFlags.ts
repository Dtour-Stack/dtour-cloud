/** Client-side route → flag key map (mirrors convex/flagRegistry surface routes). */
export const ROUTE_SURFACE_FLAG: Record<string, string> = {
  "/agents": "surface_agents",
  "/gallery": "surface_gallery",
  "/billing": "surface_billing",
  "/affiliates": "surface_affiliates",
  "/analytics": "surface_analytics",
  "/design": "surface_design_studio",
  "/coding": "surface_coding",
  "/developers": "surface_developers",
  "/docs": "surface_developers",
  "/api-explorer": "surface_api_explorer",
  "/account-hub": "surface_account_hub",
  "/account": "surface_account_hub",
  "/security": "surface_account_hub",
  "/settings": "surface_account_hub",
  "/profile": "surface_account_hub",
  "/api-keys": "surface_api_keys",
  "/mcps": "surface_mcps",
  "/apps": "surface_apps",
  "/instances": "surface_instances",
  "/earnings": "surface_earnings",
};

export function surfaceFlagForRoute(path: string): string | undefined {
  if (ROUTE_SURFACE_FLAG[path]) return ROUTE_SURFACE_FLAG[path];
  for (const [prefix, flag] of Object.entries(ROUTE_SURFACE_FLAG)) {
    if (path.startsWith(`${prefix}/`)) return flag;
  }
  return undefined;
}

export function isRouteEnabled(
  path: string,
  flags: Record<string, boolean>,
): boolean {
  const key = surfaceFlagForRoute(path);
  if (!key) return true;
  return flags[key] === true;
}
