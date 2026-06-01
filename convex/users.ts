import { v } from "convex/values";
import { api, internal } from "./_generated/api";
import { action, internalMutation, query } from "./_generated/server";
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
      creatorRewardsEligible: user?.creatorRewardsEligible === true || role === "dev_tester",
      lastLoginAt: user?.lastLoginAt ?? null,
      username: profile?.username ?? null,
      email: profile?.email ?? null,
      avatarUrl: profile?.avatarUrl ?? null,
    };
  },
});

/** Patch a user's recorded $DTOUR balance (display value). Internal — only the
 *  refreshBalance action (after a live on-chain read) and the gate call this. */
export const setBalance = internalMutation({
  args: { pubkey: v.string(), balance: v.number() },
  handler: async (ctx, { pubkey, balance }) => {
    const user = await ctx.db
      .query("users")
      .withIndex("by_pubkey", (q) => q.eq("pubkey", pubkey))
      .unique();
    if (user) await ctx.db.patch(user._id, { balance });
  },
});

/** Re-read the live on-chain $DTOUR balance for the session's wallet and store it
 *  on the user, so the dashboard shows the REAL balance without re-login. Called
 *  on dashboard mount. Early-access login pins the stored balance to 0; this
 *  un-pins it. No-op (preserves the prior value) on any RPC hiccup. */
export const refreshBalance = action({
  args: { token: v.string() },
  handler: async (ctx, { token }): Promise<{ balance: number | null }> => {
    const me = (await ctx.runQuery(api.users.me, { token })) as {
      pubkey: string;
      balance: number;
    } | null;
    if (!me) return { balance: null };
    let balance: number;
    try {
      balance = (await ctx.runAction(api.tokens.balanceOf, {
        pubkey: me.pubkey,
      })) as number;
    } catch {
      return { balance: me.balance }; // RPC hiccup → keep the stored value
    }
    await ctx.runMutation(internal.users.setBalance, {
      pubkey: me.pubkey,
      balance,
    });
    return { balance };
  },
});
