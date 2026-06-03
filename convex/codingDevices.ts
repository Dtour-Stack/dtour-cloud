import { v } from "convex/values";
import {
  type MutationCtx,
  type QueryCtx,
  mutation,
  query,
} from "./_generated/server";
import { logEvent } from "./events";
import {
  PAIRING_TTL_MS,
  assertApprovable,
  assertConsumable,
  effectiveStatus,
  normalizeCode,
} from "./codingDeviceState";

// Token → pubkey (mirrors coding.ts; auth "sessions" table).
async function sessionPubkey(
  ctx: QueryCtx | MutationCtx,
  token: string,
): Promise<string | null> {
  const s = await ctx.db
    .query("sessions")
    .withIndex("by_token", (q) => q.eq("token", token))
    .unique();
  if (!s || s.expiresAt < Date.now()) return null;
  return s.pubkey;
}

// Unambiguous alphabet (no 0/O/1/I) for a human-readable 8-char code.
const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

function randomFrom(alphabet: string, len: number): string {
  const bytes = new Uint8Array(len);
  crypto.getRandomValues(bytes);
  let out = "";
  for (let i = 0; i < len; i++) out += alphabet[bytes[i] % alphabet.length];
  return out;
}

function randomHex(): string {
  return crypto.randomUUID().replace(/-/g, "");
}

// ── app: request a pairing code (UNauthenticated — the app isn't paired yet) ──
export const startDevicePairing = mutation({
  args: { deviceName: v.string() },
  handler: async (ctx, { deviceName }) => {
    // Generate a code not currently colliding with a live pairing.
    let code = "";
    for (let i = 0; i < 5; i++) {
      const candidate = randomFrom(CODE_ALPHABET, 8);
      const clash = await ctx.db
        .query("codingDevicePairings")
        .withIndex("by_code", (q) => q.eq("code", candidate))
        .unique();
      if (!clash) {
        code = candidate;
        break;
      }
    }
    if (!code) throw new Error("Could not allocate a pairing code — retry");

    const pollSecret = `${randomHex()}${randomHex()}`;
    const now = Date.now();
    await ctx.db.insert("codingDevicePairings", {
      code,
      pollSecret,
      status: "pending",
      deviceName: deviceName.trim().slice(0, 80) || "Detour desktop",
      expiresAt: now + PAIRING_TTL_MS,
      createdAt: now,
    });
    return { code, pollSecret, expiresInMs: PAIRING_TTL_MS };
  },
});

// ── web (wallet-gated): approve a pairing code → mint a device + token ────────
export const approveDevicePairing = mutation({
  args: { token: v.string(), code: v.string() },
  handler: async (ctx, { token, code }) => {
    const pubkey = await sessionPubkey(ctx, token);
    if (!pubkey) throw new Error("Not authenticated");
    const row = await ctx.db
      .query("codingDevicePairings")
      .withIndex("by_code", (q) => q.eq("code", normalizeCode(code)))
      .unique();
    if (!row) throw new Error("Pairing code not found");
    assertApprovable(row, Date.now()); // throws PairingError if expired/used

    const deviceToken = `dtdev_${randomHex()}${randomHex()}`;
    const now = Date.now();
    const deviceId = await ctx.db.insert("codingDevices", {
      pubkey,
      name: row.deviceName,
      token: deviceToken,
      createdAt: now,
    });
    await ctx.db.patch(row._id, {
      status: "approved",
      pubkey,
      deviceId,
      deviceToken,
    });
    await logEvent(ctx, "coding.device_paired", {
      pubkey,
      data: { deviceId, name: row.deviceName },
    });
    return { ok: true, deviceName: row.deviceName };
  },
});

// ── app: poll for the device token (secret-gated; handed over once) ───────────
export const pollDevicePairing = mutation({
  args: { code: v.string(), pollSecret: v.string() },
  handler: async (ctx, { code, pollSecret }) => {
    const row = await ctx.db
      .query("codingDevicePairings")
      .withIndex("by_code", (q) => q.eq("code", normalizeCode(code)))
      .unique();
    if (!row || row.pollSecret !== pollSecret) {
      return { status: "not_found" as const };
    }
    const status = effectiveStatus(row, Date.now());
    if (status !== "approved") return { status }; // pending | expired | consumed
    assertConsumable(row, Date.now());
    await ctx.db.patch(row._id, { status: "consumed" });
    return {
      status: "approved" as const,
      deviceToken: row.deviceToken,
      pubkey: row.pubkey,
    };
  },
});

// ── relay: validate a device bearer token ─────────────────────────────────────
export const deviceByToken = query({
  args: { token: v.string() },
  handler: async (ctx, { token }) => {
    const d = await ctx.db
      .query("codingDevices")
      .withIndex("by_token", (q) => q.eq("token", token))
      .unique();
    if (!d || d.revoked) return null;
    return { deviceId: d._id, pubkey: d.pubkey, name: d.name };
  },
});

// ── relay: mark a device connected (best-effort liveness) ─────────────────────
export const markDeviceSeen = mutation({
  args: { token: v.string() },
  handler: async (ctx, { token }) => {
    const d = await ctx.db
      .query("codingDevices")
      .withIndex("by_token", (q) => q.eq("token", token))
      .unique();
    if (!d || d.revoked) return { ok: false as const };
    await ctx.db.patch(d._id, { lastSeenAt: Date.now() });
    return { ok: true as const };
  },
});

// ── web: list / revoke my paired devices ──────────────────────────────────────
export const listDevices = query({
  args: { token: v.string() },
  handler: async (ctx, { token }) => {
    const pubkey = await sessionPubkey(ctx, token);
    if (!pubkey) return [];
    const rows = await ctx.db
      .query("codingDevices")
      .withIndex("by_pubkey", (q) => q.eq("pubkey", pubkey))
      .order("desc")
      .take(40);
    return rows
      .filter((d) => !d.revoked)
      .map((d) => ({
        id: d._id,
        name: d.name,
        createdAt: d.createdAt,
        lastSeenAt: d.lastSeenAt ?? null,
      }));
  },
});

export const revokeDevice = mutation({
  args: { token: v.string(), id: v.id("codingDevices") },
  handler: async (ctx, { token, id }) => {
    const pubkey = await sessionPubkey(ctx, token);
    if (!pubkey) throw new Error("Not authenticated");
    const d = await ctx.db.get(id);
    if (!d || d.pubkey !== pubkey) throw new Error("Device not found");
    await ctx.db.patch(id, { revoked: true });
    await logEvent(ctx, "coding.device_revoked", { pubkey, data: { id } });
    return { ok: true };
  },
});
