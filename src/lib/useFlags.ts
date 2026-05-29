import { useQuery } from "convex/react";
import { anyApi } from "convex/server";

/** App-wide feature flags (public). Returns {} while loading. */
export function useFlags(): Record<string, boolean> {
  return (
    (useQuery(anyApi.flags.all, {}) as Record<string, boolean> | undefined) ??
    {}
  );
}

export function useFlag(key: string): boolean {
  return useFlags()[key] === true;
}
