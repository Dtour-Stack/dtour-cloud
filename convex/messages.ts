import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { logEvent } from "./events";
import { requireRole, resolveRole } from "./rbac";

/** The caller's inbox (newest first). */
export const inbox = query({
  args: { token: v.string() },
  handler: async (ctx, { token }) => {
    const caller = await resolveRole(ctx, token);
    if (!caller) return [];
    const rows = await ctx.db
      .query("messages")
      .withIndex("by_to", (q) => q.eq("to", caller.pubkey))
      .order("desc")
      .take(50);
    return rows.map((m) => ({
      id: m._id,
      fromRole: m.fromRole,
      subject: m.subject ?? null,
      body: m.body,
      push: m.push,
      read: m.read,
      at: m.at,
    }));
  },
});

/** Unread message count (reactive — drives the inbox badge). */
export const unreadCount = query({
  args: { token: v.string() },
  handler: async (ctx, { token }) => {
    const caller = await resolveRole(ctx, token);
    if (!caller) return 0;
    const rows = await ctx.db
      .query("messages")
      .withIndex("by_to_read", (q) =>
        q.eq("to", caller.pubkey).eq("read", false),
      )
      .collect();
    return rows.length;
  },
});

export const markRead = mutation({
  args: { token: v.string(), id: v.id("messages") },
  handler: async (ctx, { token, id }) => {
    const caller = await resolveRole(ctx, token);
    if (!caller) throw new Error("Not authenticated");
    const m = await ctx.db.get(id);
    if (!m || m.to !== caller.pubkey) throw new Error("Not found");
    if (!m.read) await ctx.db.patch(id, { read: true });
    return { ok: true };
  },
});

export const markAllRead = mutation({
  args: { token: v.string() },
  handler: async (ctx, { token }) => {
    const caller = await resolveRole(ctx, token);
    if (!caller) throw new Error("Not authenticated");
    const unread = await ctx.db
      .query("messages")
      .withIndex("by_to_read", (q) =>
        q.eq("to", caller.pubkey).eq("read", false),
      )
      .collect();
    for (const m of unread) await ctx.db.patch(m._id, { read: true });
    return { ok: true, count: unread.length };
  },
});

/** Admin → user message (optionally flagged as a push). Admin+ only. */
export const send = mutation({
  args: {
    token: v.string(),
    to: v.string(),
    subject: v.optional(v.string()),
    body: v.string(),
    push: v.optional(v.boolean()),
  },
  handler: async (ctx, { token, to, subject, body, push }) => {
    const caller = await requireRole(ctx, token, "admin");
    if (!body.trim()) throw new Error("Message body is required");
    await ctx.db.insert("messages", {
      to,
      fromRole: "admin",
      fromPubkey: caller.pubkey,
      subject: subject?.trim() || undefined,
      body: body.trim(),
      push: push ?? false,
      read: false,
      at: Date.now(),
    });
    await logEvent(ctx, "message.send", {
      pubkey: caller.pubkey,
      data: { to, push: push ?? false },
    });
    return { ok: true };
  },
});

/** Broadcast a message to every user. Admin+ only. */
export const broadcast = mutation({
  args: {
    token: v.string(),
    subject: v.optional(v.string()),
    body: v.string(),
    push: v.optional(v.boolean()),
  },
  handler: async (ctx, { token, subject, body, push }) => {
    const caller = await requireRole(ctx, token, "admin");
    if (!body.trim()) throw new Error("Message body is required");
    const users = await ctx.db.query("users").collect();
    const at = Date.now();
    for (const u of users) {
      await ctx.db.insert("messages", {
        to: u.pubkey,
        fromRole: "admin",
        fromPubkey: caller.pubkey,
        subject: subject?.trim() || undefined,
        body: body.trim(),
        push: push ?? false,
        read: false,
        at,
      });
    }
    await logEvent(ctx, "message.broadcast", {
      pubkey: caller.pubkey,
      data: { count: users.length, push: push ?? false },
    });
    return { ok: true, count: users.length };
  },
});
