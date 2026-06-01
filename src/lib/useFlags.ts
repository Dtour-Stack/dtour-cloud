import { useQuery } from "convex/react";
import { anyApi } from "convex/server";

/** App-wide feature flags (public). Values are *effective* on/off (registry defaults + kill-switch semantics). */
export function useFlags(): Record<string, boolean> {
  return (
    (useQuery(anyApi.flags.all, {}) as Record<string, boolean> | undefined) ??
    {}
  );
}

/** True when the flag is effectively enabled for gating UI/features. */
export function useFlag(key: string): boolean {
  return useFlags()[key] === true;
}
