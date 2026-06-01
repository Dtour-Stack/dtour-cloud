import { useQuery } from "convex/react";
import { anyApi } from "convex/server";
import { isDtourPlaywrightAuthActive } from "@/lib/playwright-dtour-auth";

/** App-wide feature flags (public). Values are *effective* on/off (registry defaults + kill-switch semantics). */
export function useFlags(): Record<string, boolean> {
  const testAuth = isDtourPlaywrightAuthActive();
  const flags = useQuery(
    anyApi.flags.all,
    testAuth ? "skip" : {},
  ) as Record<string, boolean> | undefined;

  return testAuth ? testFlags : flags ?? {};
}

/** True when the flag is effectively enabled for gating UI/features. */
export function useFlag(key: string): boolean {
  return useFlags()[key] === true;
}

const testFlags: Record<string, boolean> = {
  surface_agents: true,
  surface_gallery: true,
  surface_billing: true,
  surface_affiliates: true,
  surface_analytics: true,
  surface_design_studio: true,
  surface_coding: true,
  surface_developers: true,
  surface_api_explorer: true,
  surface_account_hub: true,
  surface_api_keys: true,
  surface_mcps: true,
  surface_apps: true,
  surface_instances: true,
  surface_earnings: true,
};
