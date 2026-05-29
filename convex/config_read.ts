import type { MutationCtx, QueryCtx } from "./_generated/server";

/** Typed config reader (no other imports — safe to use anywhere). */
export async function getConfig<T>(
  ctx: QueryCtx | MutationCtx,
  key: string,
  fallback: T,
): Promise<T> {
  const row = await ctx.db
    .query("config")
    .withIndex("by_key", (q) => q.eq("key", key))
    .unique();
  if (!row) return fallback;
  try {
    return JSON.parse(row.value) as T;
  } catch {
    return fallback;
  }
}

export async function getTierThresholds(ctx: QueryCtx | MutationCtx) {
  return {
    pro: await getConfig(ctx, "tier_pro_min", 1_000_000),
    super: await getConfig(ctx, "tier_super_min", 10_000_000),
  };
}
