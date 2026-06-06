import { v } from "convex/values";
import { type MutationCtx, mutation, type QueryCtx, query } from "./_generated/server";
import { designScope, designTimeline } from "./designTimeline";
import { resolveRole } from "./rbac";

export const DEFAULT_PROJECT_NAME = "Untitled";

const SURFACE_KINDS = ["studio", "sketch", "workflow", "infra"] as const;
const DASHBOARD_KIND = "dashboard";
const MAX_DASHBOARD_HTML = 60_000;

type DashboardPayload = {
  title?: string;
  html?: string;
  notes?: string[];
  sources?: DashboardSource[];
};

type DashboardSource = {
  kind: string;
  label: string;
  ref: string;
  endpoint?: string;
};

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

function normalizeDashboardHtml(html: string): string {
  const trimmed = html.trim();
  if (!trimmed) throw new Error("Dashboard HTML is required");
  if (trimmed.length > MAX_DASHBOARD_HTML) {
    throw new Error("Dashboard HTML is too large");
  }
  return trimmed;
}

function normalizeNotes(notes: string[]): string[] {
  return notes
    .map((note) => note.trim())
    .filter(Boolean)
    .slice(0, 6);
}

const dashboardSourceValidator = v.object({
  kind: v.string(),
  label: v.string(),
  ref: v.string(),
  endpoint: v.optional(v.string()),
});

function dashboardPayload(title: string, html: string, notes: string[], sources: DashboardSource[]) {
  return JSON.stringify({
    title: normalizeProjectName(title),
    html: normalizeDashboardHtml(html),
    notes: normalizeNotes(notes),
    sources: normalizeSources(sources),
  });
}

function parseDashboardPayload(data: string, fallbackName: string) {
  let parsed: DashboardPayload;
  try {
    parsed = JSON.parse(data) as DashboardPayload;
  } catch {
    throw new Error("Dashboard payload is invalid");
  }
  if (typeof parsed.html !== "string" || !parsed.html.trim()) {
    throw new Error("Dashboard payload is missing HTML");
  }
  return {
    title: typeof parsed.title === "string" && parsed.title.trim() ? parsed.title.trim() : fallbackName,
    html: parsed.html,
    notes: Array.isArray(parsed.notes)
      ? parsed.notes.filter((note): note is string => typeof note === "string").slice(0, 6)
      : [],
    sources: Array.isArray(parsed.sources) ? normalizeSources(parsed.sources) : [],
  };
}

function normalizeSources(sources: DashboardSource[]): DashboardSource[] {
  return sources
    .map((source) => ({
      kind: source.kind.trim().slice(0, 32),
      label: source.label.trim().slice(0, 96),
      ref: source.ref.trim().slice(0, 160),
      endpoint: source.endpoint?.trim().slice(0, 300) || undefined,
    }))
    .filter((source) => source.kind && source.label && source.ref)
    .slice(0, 16);
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
  hasInfra: boolean;
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
        hasInfra: false,
      };
      cur.updatedAt = Math.max(cur.updatedAt, row.updatedAt);
      if (row.kind === "studio" || row.kind === "canvas") cur.hasStudio = true;
      if (row.kind === "sketch") cur.hasSketch = true;
      if (row.kind === "workflow") cur.hasWorkflow = true;
      if (row.kind === "infra") cur.hasInfra = true;
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

const EMPTY_INFRA = JSON.stringify({
  nodes: [],
  edges: [],
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
      ["infra", EMPTY_INFRA],
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

export const deleteProject = mutation({
  args: { token: v.string(), name: v.string() },
  handler: async (ctx, { token, name }) => {
    const caller = await resolveRole(ctx, token);
    if (!caller) throw new Error("Not authenticated");
    const project = normalizeProjectName(name);
    const rows = await ctx.db
      .query("designDocs")
      .withIndex("by_owner", (q) => q.eq("owner", caller.pubkey))
      .collect();
    const projectKinds = new Set<string>([...SURFACE_KINDS, "canvas"]);
    const docs = rows.filter((row) => row.name === project && projectKinds.has(row.kind));
    for (const doc of docs) {
      await ctx.db.delete(doc._id);
    }
    return { ok: true as const, deleted: docs.length };
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

export type CustomDashboardSummary = {
  name: string;
  title: string;
  updatedAt: number;
  sourceCount: number;
};

export const listDashboards = query({
  args: { token: v.string() },
  handler: async (ctx, { token }): Promise<CustomDashboardSummary[] | null> => {
    const caller = await resolveRole(ctx, token);
    if (!caller) return null;

    const rows = await ctx.db
      .query("designDocs")
      .withIndex("by_owner_kind", (q) =>
        q.eq("owner", caller.pubkey).eq("kind", DASHBOARD_KIND),
      )
      .collect();

    return rows
      .map((row) => {
        const parsed = parseDashboardPayload(row.data, row.name);
        return { name: row.name, title: parsed.title, updatedAt: row.updatedAt, sourceCount: parsed.sources.length };
      })
      .sort((a, b) => b.updatedAt - a.updatedAt);
  },
});

export const getDashboard = query({
  args: { token: v.string(), name: v.string() },
  handler: async (ctx, { token, name }) => {
    const caller = await resolveRole(ctx, token);
    if (!caller) return null;
    const dashboardName = normalizeProjectName(name);
    const row = await docRow(ctx, caller.pubkey, DASHBOARD_KIND, dashboardName);
    if (!row) return null;
    const parsed = parseDashboardPayload(row.data, row.name);
    return {
      name: row.name,
      title: parsed.title,
      html: parsed.html,
      notes: parsed.notes,
      sources: parsed.sources,
      updatedAt: row.updatedAt,
    };
  },
});

export const saveDashboard = mutation({
  args: {
    token: v.string(),
    name: v.string(),
    title: v.string(),
    html: v.string(),
    notes: v.array(v.string()),
    sources: v.optional(v.array(dashboardSourceValidator)),
  },
  handler: async (ctx, { token, name, title, html, notes, sources }) => {
    const caller = await resolveRole(ctx, token);
    if (!caller) throw new Error("Not authenticated");
    const dashboardName = normalizeProjectName(name);
    const data = dashboardPayload(title || dashboardName, html, notes, sources ?? []);
    const now = Date.now();
    const existing = await docRow(ctx, caller.pubkey, DASHBOARD_KIND, dashboardName);

    if (existing) {
      await ctx.db.patch(existing._id, { data, updatedAt: now });
    } else {
      await ctx.db.insert("designDocs", {
        owner: caller.pubkey,
        kind: DASHBOARD_KIND,
        name: dashboardName,
        data,
        updatedAt: now,
      });
    }

    return { ok: true as const, name: dashboardName, updatedAt: now };
  },
});

export const deleteDashboard = mutation({
  args: { token: v.string(), name: v.string() },
  handler: async (ctx, { token, name }) => {
    const caller = await resolveRole(ctx, token);
    if (!caller) throw new Error("Not authenticated");
    const dashboardName = normalizeProjectName(name);
    const row = await docRow(ctx, caller.pubkey, DASHBOARD_KIND, dashboardName);
    if (!row) return { ok: true as const, deleted: 0 };
    await ctx.db.delete(row._id);
    return { ok: true as const, deleted: 1 };
  },
});
