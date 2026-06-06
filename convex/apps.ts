import { v } from "convex/values";
import type { Id } from "./_generated/dataModel";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import { mutation, query } from "./_generated/server";
import { resolveRole } from "./rbac";

const infraModeValidator = v.union(
	v.literal("detour_cloud"),
	v.literal("external"),
	v.literal("hybrid"),
);
const databaseProviderValidator = v.union(
	v.literal("detour_convex"),
	v.literal("digitalocean_postgres"),
	v.literal("google_alloydb_turbovec"),
	v.literal("external_postgres"),
);
const knowledgeModeValidator = v.union(
	v.literal("agent_rag"),
	v.literal("web_crawl"),
	v.literal("external_kb"),
);
const apiAccessValidator = v.union(
	v.literal("private"),
	v.literal("public"),
	v.literal("keyed"),
);

type AppBuildStatus = "draft" | "needs_config" | "ready";

function cleanText(value: string, label: string, max: number): string {
	const trimmed = value.trim();
	if (!trimmed) throw new Error(`${label} is required`);
	if (trimmed.length > max) throw new Error(`${label} is too long`);
	return trimmed;
}

function cleanOptionalText(
	value: string | undefined,
	max: number,
): string | undefined {
	const trimmed = value?.trim();
	if (!trimmed) return undefined;
	if (trimmed.length > max) throw new Error("Field is too long");
	return trimmed;
}

function cleanIds(ids: string[]): string[] {
	const out = [...new Set(ids.map((id) => id.trim()).filter(Boolean))];
	if (out.length > 12) throw new Error("Too many MCP servers selected");
	return out;
}

function cleanSourceUrls(urls: string[] | undefined): string[] | undefined {
	const out = [
		...new Set((urls ?? []).map((url) => url.trim()).filter(Boolean)),
	];
	if (out.length > 8) throw new Error("Too many source URLs selected");
	for (const value of out) {
		let parsed: URL;
		try {
			parsed = new URL(value);
		} catch {
			throw new Error("Source URL is invalid");
		}
		if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
			throw new Error("Source URL must use http or https");
		}
	}
	return out.length ? out : undefined;
}

async function requireOwner(ctx: QueryCtx | MutationCtx, token: string) {
	const caller = await resolveRole(ctx, token);
	if (!caller) throw new Error("Not authenticated");
	return caller.pubkey;
}

async function requireOwnedAgent(
	ctx: QueryCtx | MutationCtx,
	owner: string,
	agentId: Id<"agents"> | undefined,
) {
	if (!agentId) return undefined;
	const agent = await ctx.db.get(agentId);
	if (!agent || agent.owner !== owner) throw new Error("Agent not found");
	return agentId;
}

async function requireOwnedBuild(
	ctx: QueryCtx | MutationCtx,
	owner: string,
	id: Id<"appBuilds">,
) {
	const row = await ctx.db.get(id);
	if (!row || row.owner !== owner) throw new Error("App build not found");
	return row;
}

function buildStatus({
	agentId,
	databaseProvider,
	databaseConnection,
	knowledgeMode,
	prompt,
	sourceUrls,
}: {
	agentId: Id<"agents"> | undefined;
	databaseProvider:
		| "detour_convex"
		| "digitalocean_postgres"
		| "google_alloydb_turbovec"
		| "external_postgres";
	databaseConnection: string | undefined;
	knowledgeMode: "agent_rag" | "web_crawl" | "external_kb";
	prompt: string;
	sourceUrls: string[] | undefined;
}): AppBuildStatus {
	if (!agentId) return "needs_config";
	if (prompt.length < 20) return "needs_config";
	if (databaseProvider !== "detour_convex" && !databaseConnection)
		return "needs_config";
	if (knowledgeMode !== "agent_rag" && !sourceUrls?.length)
		return "needs_config";
	return "ready";
}

export const list = query({
	args: { token: v.string() },
	handler: async (ctx, { token }) => {
		const owner = await requireOwner(ctx, token);
		const rows = await ctx.db
			.query("appBuilds")
			.withIndex("by_owner", (q) => q.eq("owner", owner))
			.collect();
		return rows
			.sort((a, b) => b.updatedAt - a.updatedAt)
			.map((row) => ({
				id: row._id,
				name: row.name,
				prompt: row.prompt,
				agentId: row.agentId ?? null,
				designProject: row.designProject ?? null,
				infraMode: row.infraMode,
				databaseProvider: row.databaseProvider,
				databaseConnection: row.databaseConnection ?? null,
				knowledgeMode: row.knowledgeMode,
				mcpIds: row.mcpIds,
				apiAccess: row.apiAccess,
				status: row.status,
				sourceUrls: row.sourceUrls ?? [],
				createdAt: row.createdAt,
				updatedAt: row.updatedAt,
			}));
	},
});

export const save = mutation({
	args: {
		token: v.string(),
		id: v.optional(v.id("appBuilds")),
		name: v.string(),
		prompt: v.string(),
		agentId: v.optional(v.id("agents")),
		designProject: v.optional(v.string()),
		infraMode: infraModeValidator,
		databaseProvider: databaseProviderValidator,
		databaseConnection: v.optional(v.string()),
		knowledgeMode: knowledgeModeValidator,
		mcpIds: v.array(v.string()),
		apiAccess: apiAccessValidator,
		sourceUrls: v.optional(v.array(v.string())),
	},
	handler: async (ctx, args) => {
		const owner = await requireOwner(ctx, args.token);
		const agentId = await requireOwnedAgent(ctx, owner, args.agentId);
		const name = cleanText(args.name, "App name", 80);
		const prompt = cleanText(args.prompt, "Prompt", 4_000);
		const designProject = cleanOptionalText(args.designProject, 80);
		const databaseConnection = cleanOptionalText(args.databaseConnection, 120);
		const mcpIds = cleanIds(args.mcpIds);
		const sourceUrls = cleanSourceUrls(args.sourceUrls);
		const now = Date.now();
		const status = buildStatus({
			agentId,
			databaseProvider: args.databaseProvider,
			databaseConnection,
			knowledgeMode: args.knowledgeMode,
			prompt,
			sourceUrls,
		});
		const patch = {
			owner,
			name,
			prompt,
			agentId,
			designProject,
			infraMode: args.infraMode,
			databaseProvider: args.databaseProvider,
			databaseConnection,
			knowledgeMode: args.knowledgeMode,
			mcpIds,
			apiAccess: args.apiAccess,
			status,
			sourceUrls,
			updatedAt: now,
		};
		if (args.id) {
			await requireOwnedBuild(ctx, owner, args.id);
			await ctx.db.patch(args.id, patch);
			return { ok: true, id: args.id, status };
		}
		const id = await ctx.db.insert("appBuilds", { ...patch, createdAt: now });
		return { ok: true, id, status };
	},
});

export const remove = mutation({
	args: { token: v.string(), id: v.id("appBuilds") },
	handler: async (ctx, { token, id }) => {
		const owner = await requireOwner(ctx, token);
		await requireOwnedBuild(ctx, owner, id);
		await ctx.db.delete(id);
		return { ok: true };
	},
});
