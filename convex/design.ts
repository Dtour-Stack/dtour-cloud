import { v } from "convex/values";
import { type MutationCtx, type QueryCtx, mutation, query } from "./_generated/server";
import { designScope, designTimeline } from "./designTimeline";
import { resolveRole } from "./rbac";

export const DEFAULT_PROJECT_NAME = "Untitled";

const SURFACE_KINDS = ["studio", "sketch", "workflow"] as const;

function normalizeProjectName(name: string): string {
  const trimmed = name.trim();
  if (!trimmed) throw new Error("Project name is required");
  if (trimmed.length > 80) throw new Error("Project name is too long (max 80 characters)");
  return trimmed;
}

async function docRow(ctx: QueryCtx | MutationCtx, owner: string, kind: string, name: string) {
  return await ctx.db
    .query("designDocs")
    .withIndex("by_owner_kind", (q) =>
      q.eq("owner", owner).eq("kind", kind).eq("name", name),
    )
    .unique();
}

/** Legacy Studio saves used kind "canvas" before sketch split. */
async function legacyCanvasRow(ctx: QueryCtx | MutationCtx, owner: string, name: string) {
  return await ctx.db
    .query("designDocs")
    .withIndex("by_owner_kind", (q) =>
      q.eq("owner", owner).eq("kind", "canvas").eq("name", name),
    )
    .unique();
}

/** Load a surface doc for a named project. */
export const getDoc = query({
  args: {
    token: v.string(),
    kind: v.string(),
    project: v.optional(v.string()),
  },
  handler: async (ctx, { token, kind, project }) => {
    const caller = await resolveRole(ctx, token);
    if (!caller) return null;
    const name = (project?.trim() || DEFAULT_PROJECT_NAME).slice(0, 80);

    let row = await docRow(ctx, caller.pubkey, kind, name);
    if (!row && kind === "studio" && name === DEFAULT_PROJECT_NAME) {
      row = await legacyCanvasRow(ctx, caller.pubkey, name);
    }
    return row ? { data: row.data, updatedAt: row.updatedAt, project: row.name } : null;
  },
});

/** Upsert a surface doc for a named project. */
export const saveDoc = mutation({
  args: {
    token: v.string(),
    kind: v.string(),
    data: v.string(),
    project: v.optional(v.string()),
  },
  handler: async (ctx, { token, kind, data, project }) => {
    const caller = await resolveRole(ctx, token);
    if (!caller) throw new Error("Not authenticated");
    const name = normalizeProjectName(project ?? DEFAULT_PROJECT_NAME);

    const existing = await docRow(ctx, caller.pubkey, kind, name);
    const now = Date.now();
    if (existing) {
      await ctx.db.patch(existing._id, { data, updatedAt: now });
    } else {
      await ctx.db.insert("designDocs", {
        owner: caller.pubkey,
        kind,
        name,
        data,
        updatedAt: now,
      });
    }
    await designTimeline.push(ctx, designScope(caller.pubkey, `${kind}:${name}`), { data });
    return { ok: true as const, updatedAt: now, project: name };
  },
});

export type DesignProjectSummary = {
  name: string;
  updatedAt: number;
  hasStudio: boolean;
  hasSketch: boolean;
  hasWorkflow: boolean;
};

/** List named projects for the signed-in user (grouped across surfaces). */
export const listProjects = query({
  args: { token: v.string() },
  handler: async (ctx, { token }): Promise<DesignProjectSummary[] | null> => {
    const caller = await resolveRole(ctx, token);
    if (!caller) return null;

    const rows = await ctx.db
      .query("designDocs")
      .withIndex("by_owner", (q) => q.eq("owner", caller.pubkey))
      .collect();

    const byName = new Map<string, DesignProjectSummary>();

    for (const row of rows) {
      if (!SURFACE_KINDS.includes(row.kind as (typeof SURFACE_KINDS)[number]) && row.kind !== "canvas") {
        continue;
      }
      const cur = byName.get(row.name) ?? {
        name: row.name,
        updatedAt: row.updatedAt,
        hasStudio: false,
        hasSketch: false,
        hasWorkflow: false,
      };
      cur.updatedAt = Math.max(cur.updatedAt, row.updatedAt);
      if (row.kind === "studio" || row.kind === "canvas") cur.hasStudio = true;
      if (row.kind === "sketch") cur.hasSketch = true;
      if (row.kind === "workflow") cur.hasWorkflow = true;
      byName.set(row.name, cur);
    }

    return [...byName.values()].sort((a, b) => b.updatedAt - a.updatedAt);
  },
});

const EMPTY_STUDIO = JSON.stringify({
  version: 3,
  nodes: [],
  view: { panX: 120, panY: 80, zoom: 0.55 },
});

const EMPTY_WORKFLOW = JSON.stringify({
  nodes: [],
  edges: [],
  vp: { panX: 80, panY: 80, scale: 1 },
  counters: { n: 0, e: 0 },
});

const EMPTY_SKETCH = JSON.stringify({
  version: 2,
  elements: [],
  appState: { theme: "dark" },
  files: {},
});

/** Create a new empty project (studio + sketch + workflow slots). */
export const createProject = mutation({
  args: { token: v.string(), name: v.string() },
  handler: async (ctx, { token, name }) => {
    const caller = await resolveRole(ctx, token);
    if (!caller) throw new Error("Not authenticated");
    const project = normalizeProjectName(name);

    const existing = await ctx.db
      .query("designDocs")
      .withIndex("by_owner", (q) => q.eq("owner", caller.pubkey))
      .collect();
    if (existing.some((r) => r.name === project)) {
      throw new Error("A project with that name already exists");
    }

    const now = Date.now();
    for (const [kind, data] of [
      ["studio", EMPTY_STUDIO],
      ["sketch", EMPTY_SKETCH],
      ["workflow", EMPTY_WORKFLOW],
    ] as const) {
      await ctx.db.insert("designDocs", {
        owner: caller.pubkey,
        kind,
        name: project,
        data,
        updatedAt: now,
      });
    }
    return { ok: true as const, project };
  },
});

/** Copy the current surface payload into a new project name. */
export const saveProjectAs = mutation({
  args: {
    token: v.string(),
    kind: v.string(),
    fromProject: v.optional(v.string()),
    toName: v.string(),
    data: v.string(),
  },
  handler: async (ctx, { token, kind, fromProject, toName, data }) => {
    const caller = await resolveRole(ctx, token);
    if (!caller) throw new Error("Not authenticated");
    const project = normalizeProjectName(toName);

    const taken = await ctx.db
      .query("designDocs")
      .withIndex("by_owner", (q) => q.eq("owner", caller.pubkey))
      .collect();
    if (taken.some((r) => r.name === project)) {
      throw new Error("A project with that name already exists");
    }

    void fromProject;
    const now = Date.now();
    await ctx.db.insert("designDocs", {
      owner: caller.pubkey,
      kind,
      name: project,
      data,
      updatedAt: now,
    });
    return { ok: true as const, project };
  },
});
