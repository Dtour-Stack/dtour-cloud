import { v } from "convex/values";
import { type MutationCtx, mutation, type QueryCtx, query } from "./_generated/server";
import { logEvent } from "./events";

const USERNAME_RE = /^[a-z0-9_]{3,20}$/i;
const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

const socialsValidator = v.object({
  x: v.optional(v.string()),
  discord: v.optional(v.string()),
  telegram: v.optional(v.string()),
  website: v.optional(v.string()),
  github: v.optional(v.string()),
});

async function pubkeyForToken(
  ctx: QueryCtx | MutationCtx,
  token: string,
): Promise<string | null> {
  const session = await ctx.db
    .query("sessions")
    .withIndex("by_token", (q) => q.eq("token", token))
    .unique();
  if (!session || session.expiresAt < Date.now()) return null;
  return session.pubkey;
}

async function usernameTaken(
  ctx: MutationCtx,
  handle: string,
  selfPubkey: string,
): Promise<boolean> {
  const taken = await ctx.db
    .query("profiles")
    .withIndex("by_username", (q) => q.eq("username", handle))
    .unique();
  return taken !== null && taken.pubkey !== selfPubkey;
}

/** Onboarding: create the profile (username + email). */
export const save = mutation({
  args: { token: v.string(), username: v.string(), email: v.string() },
  handler: async (ctx, { token, username, email }) => {
    const pubkey = await pubkeyForToken(ctx, token);
    if (!pubkey) throw new Error("Not authenticated");

    const handle = username.trim();
    if (!USERNAME_RE.test(handle)) {
      throw new Error("Username must be 3–20 letters, numbers, or underscores");
    }
    if (!EMAIL_RE.test(email.trim())) throw new Error("Enter a valid email address");
    if (await usernameTaken(ctx, handle, pubkey)) {
      throw new Error("That username is taken");
    }

    const existing = await ctx.db
      .query("profiles")
      .withIndex("by_pubkey", (q) => q.eq("pubkey", pubkey))
      .unique();
    if (existing) {
      await ctx.db.patch(existing._id, { username: handle, email: email.trim() });
    } else {
      await ctx.db.insert("profiles", {
        pubkey,
        username: handle,
        email: email.trim(),
      });
      await logEvent(ctx, "profile.create", { pubkey });
    }
    return { ok: true };
  },
});

/** Edit profile: avatar, socials, and (optionally) username/email. */
export const update = mutation({
  args: {
    token: v.string(),
    username: v.optional(v.string()),
    email: v.optional(v.string()),
    avatarUrl: v.optional(v.string()),
    socials: v.optional(socialsValidator),
  },
  handler: async (ctx, { token, username, email, avatarUrl, socials }) => {
    const pubkey = await pubkeyForToken(ctx, token);
    if (!pubkey) throw new Error("Not authenticated");
    const profile = await ctx.db
      .query("profiles")
      .withIndex("by_pubkey", (q) => q.eq("pubkey", pubkey))
      .unique();
    if (!profile) throw new Error("No profile yet");

    const patch: Record<string, unknown> = {};
    if (username !== undefined) {
      const handle = username.trim();
      if (!USERNAME_RE.test(handle)) throw new Error("Invalid username");
      if (await usernameTaken(ctx, handle, pubkey)) throw new Error("That username is taken");
      patch.username = handle;
    }
    if (email !== undefined) {
      if (!EMAIL_RE.test(email.trim())) throw new Error("Enter a valid email");
      patch.email = email.trim();
    }
    if (avatarUrl !== undefined) patch.avatarUrl = avatarUrl.trim() || undefined;
    if (socials !== undefined) patch.socials = socials;

    await ctx.db.patch(profile._id, patch);
    await logEvent(ctx, "profile.update", { pubkey });
    return { ok: true };
  },
});

/** Full profile for the current session (null if none). */
export const getByToken = query({
  args: { token: v.string() },
  handler: async (ctx, { token }) => {
    const pubkey = await pubkeyForToken(ctx, token);
    if (!pubkey) return null;
    const p = await ctx.db
      .query("profiles")
      .withIndex("by_pubkey", (q) => q.eq("pubkey", pubkey))
      .unique();
    if (!p) return null;
    return {
      pubkey: p.pubkey,
      username: p.username,
      email: p.email,
      avatarUrl: p.avatarUrl ?? null,
      swerveTags: p.swerveTags ?? [],
      socials: p.socials ?? {},
      agents: p.agents ?? [],
    };
  },
});
