import { v } from "convex/values";
import { query } from "./_generated/server";
import { getTierThresholds } from "./config_read";
import { baseSwerveTag, tierFromBalance } from "./roles";

/** Current gated user: wallet, recorded $DTOUR balance, profile. Null if the
 *  session is missing or expired. */
export const me = query({
  args: { token: v.string() },
  handler: async (ctx, { token }) => {
    const session = await ctx.db
      .query("sessions")
      .withIndex("by_token", (q) => q.eq("token", token))
      .unique();
    if (!session || session.expiresAt < Date.now()) return null;

    const [user, profile, wl] = await Promise.all([
      ctx.db
        .query("users")
        .withIndex("by_pubkey", (q) => q.eq("pubkey", session.pubkey))
        .unique(),
      ctx.db
        .query("profiles")
        .withIndex("by_pubkey", (q) => q.eq("pubkey", session.pubkey))
        .unique(),
      ctx.db
        .query("whitelist")
        .withIndex("by_pubkey", (q) => q.eq("pubkey", session.pubkey))
        .unique(),
    ]);

    const balance = user?.balance ?? 0;
    const role =
      wl?.role ?? tierFromBalance(balance, await getTierThresholds(ctx));
    const swerveTags = Array.from(
      new Set([baseSwerveTag(role), ...(profile?.swerveTags ?? [])]),
    );
    return {
      pubkey: session.pubkey,
      balance,
      role,
      swerveTags,
      plan: user?.plan ?? null,
      lastLoginAt: user?.lastLoginAt ?? null,
      username: profile?.username ?? null,
      email: profile?.email ?? null,
      avatarUrl: profile?.avatarUrl ?? null,
    };
  },
});
