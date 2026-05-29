import type { MutationCtx, QueryCtx } from "./_generated/server";
import { getTierThresholds } from "./config_read";
import { atLeast, type Role, tierFromBalance } from "./roles";

/** session token → wallet + effective role (whitelist role, else balance tier). */
export async function resolveRole(
  ctx: QueryCtx | MutationCtx,
  token: string,
): Promise<{ pubkey: string; role: Role } | null> {
  const session = await ctx.db
    .query("sessions")
    .withIndex("by_token", (q) => q.eq("token", token))
    .unique();
  if (!session || session.expiresAt < Date.now()) return null;

  const wl = await ctx.db
    .query("whitelist")
    .withIndex("by_pubkey", (q) => q.eq("pubkey", session.pubkey))
    .unique();
  if (wl?.role) return { pubkey: session.pubkey, role: wl.role };

  const user = await ctx.db
    .query("users")
    .withIndex("by_pubkey", (q) => q.eq("pubkey", session.pubkey))
    .unique();
  const thresholds = await getTierThresholds(ctx);
  return {
    pubkey: session.pubkey,
    role: tierFromBalance(user?.balance ?? 0, thresholds),
  };
}

export async function requireRole(
  ctx: QueryCtx | MutationCtx,
  token: string,
  min: Role,
): Promise<{ pubkey: string; role: Role }> {
  const caller = await resolveRole(ctx, token);
  if (!caller) throw new Error("Not authenticated");
  if (!atLeast(caller.role, min)) throw new Error("Forbidden");
  return caller;
}
