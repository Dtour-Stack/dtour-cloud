import { v } from "convex/values";
import type { Id } from "./_generated/dataModel";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import { mutation, query } from "./_generated/server";
import { resolveRole } from "./rbac";

function normalizeProjectName(name: string): string {
  const trimmed = name.trim();
  if (!trimmed) throw new Error("Workflow project is required");
  if (trimmed.length > 80) throw new Error("Workflow project is too long");
  return trimmed;
}

async function requireOwnedAgent(
  ctx: QueryCtx | MutationCtx,
  token: string,
  agentId: Id<"agents">,
) {
  const caller = await resolveRole(ctx, token);
  if (!caller) throw new Error("Not authenticated");
  const agent = await ctx.db.get(agentId);
  if (!agent || agent.owner !== caller.pubkey) throw new Error("Agent not found");
  return { caller, agent };
}

async function requireWorkflowProject(
  ctx: QueryCtx | MutationCtx,
  owner: string,
  project: string,
) {
  const doc = await ctx.db
    .query("designDocs")
    .withIndex("by_owner_kind", (q) =>
      q.eq("owner", owner).eq("kind", "workflow").eq("name", project),
    )
    .unique();
  if (!doc) throw new Error("Workflow project not found");
  return doc;
}

export const list = query({
  args: { token: v.string(), agentId: v.id("agents") },
  handler: async (ctx, { token, agentId }) => {
    const { caller } = await requireOwnedAgent(ctx, token, agentId);
    const rows = await ctx.db
      .query("agentWorkflowLinks")
      .withIndex("by_owner_agent", (q) =>
        q.eq("owner", caller.pubkey).eq("agentId", agentId),
      )
      .collect();
    return rows
      .sort((a, b) => b.createdAt - a.createdAt)
      .map((row) => ({
        id: row._id,
        project: row.project,
        createdAt: row.createdAt,
      }));
  },
});

export const link = mutation({
  args: { token: v.string(), agentId: v.id("agents"), project: v.string() },
  handler: async (ctx, args) => {
    const project = normalizeProjectName(args.project);
    const { caller } = await requireOwnedAgent(ctx, args.token, args.agentId);
    await requireWorkflowProject(ctx, caller.pubkey, project);
    const existing = await ctx.db
      .query("agentWorkflowLinks")
      .withIndex("by_owner_agent", (q) =>
        q.eq("owner", caller.pubkey).eq("agentId", args.agentId),
      )
      .filter((q) => q.eq(q.field("project"), project))
      .first();
    if (existing) {
      return {
        id: existing._id,
        project: existing.project,
        createdAt: existing.createdAt,
      };
    }
    const createdAt = Date.now();
    const id = await ctx.db.insert("agentWorkflowLinks", {
      owner: caller.pubkey,
      agentId: args.agentId,
      project,
      createdAt,
    });
    return { id, project, createdAt };
  },
});

export const unlink = mutation({
  args: { token: v.string(), linkId: v.id("agentWorkflowLinks") },
  handler: async (ctx, { token, linkId }) => {
    const caller = await resolveRole(ctx, token);
    if (!caller) throw new Error("Not authenticated");
    const link = await ctx.db.get(linkId);
    if (!link || link.owner !== caller.pubkey) throw new Error("Workflow link not found");
    await ctx.db.delete(linkId);
    return { ok: true as const };
  },
});
