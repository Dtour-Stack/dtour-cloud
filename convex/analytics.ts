import { v } from "convex/values";
import { type QueryCtx, query } from "./_generated/server";

const USD = 1_000_000;

async function sessionPubkey(ctx: QueryCtx, token: string): Promise<string | null> {
  const s = await ctx.db
    .query("sessions")
    .withIndex("by_token", (q) => q.eq("token", token))
    .unique();
  if (!s || s.expiresAt < Date.now()) return null;
  return s.pubkey;
}

// Surfaces we always show a bar for (seeded at 0 so a quiet user still sees the
// shape). The stored value for text-to-speech is "tts"; we relabel it "speech"
// in the breakdown so the UI reads cleanly. Any other surface that shows up in
// the ledger is still counted into its own bucket (never silently dropped).
const SEED_SURFACES = ["chat", "image", "speech", "video"] as const;
const surfaceLabel = (s: string) => (s === "tts" ? "speech" : s);

/**
 * Per-user usage overview, bounded to indexed-per-user reads. Combines:
 *   • inference spend (inferenceUsage by_pubkey) — total + per-surface breakdown,
 *   • coding spend (codingUsage by_pubkey),
 *   • the live USD-credit balance (creditBalances by_pubkey),
 * and a merged, time-sorted recent-activity feed across both ledgers. All money
 * is "spend" = what the user was charged (priceMicroUsd), never our raw cost.
 */
export const overview = query({
  args: { token: v.string() },
  handler: async (ctx, { token }) => {
    const pubkey = await sessionPubkey(ctx, token);
    if (!pubkey) return null;

    const [inference, coding, agents, credit] = await Promise.all([
      ctx.db
        .query("inferenceUsage")
        .withIndex("by_pubkey", (q) => q.eq("pubkey", pubkey))
        .collect(),
      ctx.db
        .query("codingUsage")
        .withIndex("by_pubkey", (q) => q.eq("pubkey", pubkey))
        .collect(),
      ctx.db
        .query("agents")
        .withIndex("by_owner", (q) => q.eq("owner", pubkey))
        .collect(),
      ctx.db
        .query("creditBalances")
        .withIndex("by_pubkey", (q) => q.eq("pubkey", pubkey))
        .unique(),
    ]);

    // Per-surface inference breakdown. Seed the canonical surfaces at 0 so the
    // UI always renders them; any other surface gets its own bucket on demand.
    const bySurface: Record<string, { usd: number; calls: number }> = {};
    for (const s of SEED_SURFACES) bySurface[s] = { usd: 0, calls: 0 };
    let inferenceMicro = 0;
    for (const r of inference) {
      const key = surfaceLabel(r.surface);
      const b = (bySurface[key] ??= { usd: 0, calls: 0 });
      b.usd += r.priceMicroUsd / USD;
      b.calls += 1;
      inferenceMicro += r.priceMicroUsd;
    }

    const codingMicro = coding.reduce((s, u) => s + (u.priceMicroUsd ?? 0), 0);

    // Merged recent feed across both ledgers, newest first, then sliced.
    const recentActivity = [
      ...inference.map((r) => ({
        type: surfaceLabel(r.surface),
        at: r.at,
        detail: `${r.model} · $${(r.priceMicroUsd / USD).toFixed(4)}`,
      })),
      ...coding.map((u) => ({
        type: "coding session",
        at: u.at,
        detail: `${Math.round(u.durationSec)}s · $${(u.priceMicroUsd / USD).toFixed(3)}`,
      })),
    ]
      .sort((a, b) => b.at - a.at)
      .slice(0, 15);

    return {
      // live credit balance (can dip negative — one session may overrun the gate)
      balanceUsd: (credit?.balanceMicroUsd ?? 0) / USD,
      // spend = charged price; inference + coding combined and broken out
      totalSpendUsd: (inferenceMicro + codingMicro) / USD,
      inferenceSpendUsd: inferenceMicro / USD,
      codingSpendUsd: codingMicro / USD,
      bySurface, // Record<surface, { usd, calls }> — chat/image/speech/video (+ any others)
      inferenceCalls: inference.length,
      codingSessions: coding.length,
      agents: agents.length,
      recentActivity,
    };
  },
});
