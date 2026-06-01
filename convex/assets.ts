import { v } from "convex/values";
import { internal } from "./_generated/api";
import {
  action,
  internalMutation,
  internalQuery,
  mutation,
  query,
} from "./_generated/server";
import { resolveRole } from "./rbac";

/** List the user's saved image assets (resolved to served URLs). */
export const listAssets = query({
  args: { token: v.string() },
  handler: async (ctx, { token }) => {
    const caller = await resolveRole(ctx, token);
    if (!caller) return [];
    const rows = await ctx.db
      .query("assets")
      .withIndex("by_owner", (q) => q.eq("owner", caller.pubkey))
      .order("desc")
      .collect();
    return Promise.all(
      rows.map(async (r) => ({
        id: r._id,
        name: r.name,
        contentType: r.contentType,
        url: await ctx.storage.getUrl(r.storageId),
        createdAt: r.createdAt,
      })),
    );
  },
});

/**
 * The signed-in user's gallery — their saved + uploaded images, newest-first,
 * each resolved to a small served URL (via ctx.storage.getUrl). Powers the
 * Gallery surface and any "pick from your images" UI in workflows/chat.
 */
export const myGallery = query({
  args: { token: v.string() },
  handler: async (ctx, { token }) => {
    const caller = await resolveRole(ctx, token);
    if (!caller) return [];
    const rows = await ctx.db
      .query("assets")
      .withIndex("by_owner", (q) => q.eq("owner", caller.pubkey))
      .order("desc")
      .collect();
    return Promise.all(
      rows.map(async (r) => ({
        id: r._id,
        name: r.name,
        contentType: r.contentType,
        url: await ctx.storage.getUrl(r.storageId),
        createdAt: r.createdAt,
      })),
    );
  },
});

/**
 * Hand the client a short-lived signed URL to POST file bytes to Convex storage.
 * Gated to a signed-in user; the resulting storageId is persisted via
 * `saveUploaded` once the upload completes.
 */
export const generateUploadUrl = mutation({
  args: { token: v.string() },
  handler: async (ctx, { token }) => {
    const caller = await resolveRole(ctx, token);
    if (!caller) throw new Error("Not authenticated");
    return await ctx.storage.generateUploadUrl();
  },
});

/**
 * Record an uploaded file (from `generateUploadUrl`) as an asset owned by the
 * signed-in user, so it shows up in their gallery.
 */
export const saveUploaded = mutation({
  args: {
    token: v.string(),
    storageId: v.id("_storage"),
    name: v.string(),
    contentType: v.string(),
  },
  handler: async (ctx, { token, storageId, name, contentType }) => {
    const caller = await resolveRole(ctx, token);
    if (!caller) throw new Error("Not authenticated");
    await ctx.db.insert("assets", {
      owner: caller.pubkey,
      storageId,
      name: name.trim() || "Untitled image",
      contentType: contentType || "image/png",
      createdAt: Date.now(),
    });
    return { ok: true };
  },
});

export const removeAsset = mutation({
  args: { token: v.string(), id: v.id("assets") },
  handler: async (ctx, { token, id }) => {
    const caller = await resolveRole(ctx, token);
    if (!caller) throw new Error("Not authenticated");
    const row = await ctx.db.get(id);
    if (!row || row.owner !== caller.pubkey) throw new Error("Not found");
    await ctx.storage.delete(row.storageId);
    await ctx.db.delete(id);
    return { ok: true };
  },
});

export const ownerOf = internalQuery({
  args: { token: v.string() },
  handler: async (ctx, { token }) => {
    const caller = await resolveRole(ctx, token);
    return caller ? caller.pubkey : null;
  },
});

export const insertAsset = internalMutation({
  args: {
    owner: v.string(),
    storageId: v.id("_storage"),
    name: v.string(),
    contentType: v.string(),
  },
  handler: async (ctx, args) => {
    await ctx.db.insert("assets", { ...args, createdAt: Date.now() });
  },
});

function dataUrlToBlob(dataUrl: string): { blob: Blob; type: string } {
  const comma = dataUrl.indexOf(",");
  const meta = dataUrl.slice(5, comma); // after "data:"
  const type = meta.split(";")[0] || "image/png";
  const b64 = dataUrl.slice(comma + 1);
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return { blob: new Blob([bytes], { type }), type };
}

/** Save an image (data URL or remote URL) into Convex storage as an asset. */
export const saveAsset = action({
  args: { token: v.string(), url: v.string(), name: v.optional(v.string()) },
  handler: async (ctx, { token, url, name }): Promise<{ ok: boolean }> => {
    const owner = await ctx.runQuery(internal.assets.ownerOf, { token });
    if (!owner) throw new Error("Not authenticated");

    let blob: Blob;
    let type: string;
    if (url.startsWith("data:")) {
      ({ blob, type } = dataUrlToBlob(url));
    } else {
      const res = await fetch(url);
      if (!res.ok) throw new Error(`Couldn't fetch image (${res.status})`);
      blob = await res.blob();
      type = res.headers.get("content-type") || "image/png";
    }

    const storageId = await ctx.storage.store(blob);
    await ctx.runMutation(internal.assets.insertAsset, {
      owner,
      storageId,
      name: name?.trim() || "Untitled image",
      contentType: type,
    });
    return { ok: true };
  },
});
