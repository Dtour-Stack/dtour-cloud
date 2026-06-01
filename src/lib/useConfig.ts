import { useQuery } from "convex/react";
import { anyApi } from "convex/server";
import { isDtourPlaywrightAuthActive } from "@/lib/playwright-dtour-auth";

/** Public cloud config (no auth). Returns {} while loading. */
export function usePublicConfig(): Record<string, unknown> {
  const testAuth = isDtourPlaywrightAuthActive();
  const config = useQuery(anyApi.config.publicConfig, testAuth ? "skip" : {}) as
      | Record<string, unknown>
      | undefined;

  return testAuth ? {} : config ?? {};
}
