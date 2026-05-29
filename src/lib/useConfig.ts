import { useQuery } from "convex/react";
import { anyApi } from "convex/server";

/** Public cloud config (no auth). Returns {} while loading. */
export function usePublicConfig(): Record<string, unknown> {
  return (
    (useQuery(anyApi.config.publicConfig, {}) as
      | Record<string, unknown>
      | undefined) ?? {}
  );
}
