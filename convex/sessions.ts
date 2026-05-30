import { query } from "./_generated/server";
import { v } from "convex/values";

/** Validate a dtour-session token for a backend service (the agent server).
 *  Returns the identity needed to build an elizaOS UserContext, or { valid: false }.
 *  Mirrors the session lookup + expiry check in rbac.resolveRole. */
export const verify = query({
  args: { token: v.string() },
  handler: async (ctx, { token }) => {
    const session = await ctx.db
      .query("sessions")
      .withIndex("by_token", (q) => q.eq("token", token))
      .unique();
    if (!session || session.expiresAt < Date.now()) {
      return { valid: false as const };
    }
    const user = await ctx.db
      .query("users")
      .withIndex("by_pubkey", (q) => q.eq("pubkey", session.pubkey))
      .unique();
    return {
      valid: true as const,
      pubkey: session.pubkey,
      balance: user?.balance ?? 0,
      // One org per wallet for now; revisit when org/team support lands.
      organizationId: session.pubkey,
    };
  },
});
