import { useMutation, useQuery } from "convex/react";
import { anyApi } from "convex/server";
import type { ReactNode } from "react";
import { useEffect, useMemo, useState } from "react";
import { AppShell } from "@/dashboard/AppShell";
import { MCP_CATALOG } from "@/lib/mcpCatalog";
import {
	DTOUR_TEST_SESSION_TOKEN,
	readDtourPlaywrightUser,
} from "@/lib/playwright-dtour-auth";
import { getDtourSessionToken } from "@/lib/session";
import {
	Badge,
	Button,
	buttonClasses,
	cn,
	EmptyState,
	Icon,
	Panel,
} from "@/ui";

type Agent = {
	id: string;
	name: string;
	model: string;
	type: string;
	plugins?: string[];
	published: boolean;
	priceUsd: number | null;
};

type AppBuild = {
	id: string;
	name: string;
	prompt: string;
	agentId: string | null;
	designProject: string | null;
	infraMode: "detour_cloud" | "external" | "hybrid";
	databaseProvider:
		| "detour_convex"
		| "digitalocean_postgres"
		| "google_alloydb_turbovec"
		| "external_postgres";
	databaseConnection: string | null;
	knowledgeMode: "agent_rag" | "web_crawl" | "external_kb";
	mcpIds: string[];
	apiAccess: "private" | "public" | "keyed";
	status: "draft" | "needs_config" | "ready";
	sourceUrls: string[];
	updatedAt: number;
};

type DesignProject = {
	name: string;
	hasStudio: boolean;
	hasSketch: boolean;
	hasWorkflow: boolean;
	hasInfra: boolean;
};

type InstanceSummary = {
	agent: { id: string; name: string };
	deployment: {
		status: string;
		apiBaseUrl: string;
		webUiUrl: string;
		mcpEnabled: boolean;
		a2aEnabled: boolean;
	};
};

type AppForm = {
	id: string | null;
	name: string;
	prompt: string;
	agentId: string;
	designProject: string;
	infraMode: AppBuild["infraMode"];
	databaseProvider: AppBuild["databaseProvider"];
	databaseConnection: string;
	knowledgeMode: AppBuild["knowledgeMode"];
	mcpIds: string[];
	apiAccess: AppBuild["apiAccess"];
	sourceUrls: string;
};

const EMPTY_FORM: AppForm = {
	id: null,
	name: "Customer portal",
	prompt:
		"Build a production dashboard with auth, agent chat, billing, project records, file upload, and admin review states.",
	agentId: "",
	designProject: "",
	infraMode: "hybrid",
	databaseProvider: "detour_convex",
	databaseConnection: "",
	knowledgeMode: "agent_rag",
	mcpIds: [],
	apiAccess: "keyed",
	sourceUrls: "",
};

const FIELD =
	"min-h-10 w-full rounded-lg border border-[var(--border)] bg-[var(--btn-glass-bg)] px-3 py-2 text-sm text-[var(--text)] outline-none transition placeholder:text-[var(--text-faint)] focus:border-purple-400/50 focus-visible:ring-2 focus-visible:ring-purple-400/60 focus-visible:ring-offset-2 focus-visible:ring-offset-black";

const DATABASES: Array<{
	id: AppBuild["databaseProvider"];
	label: string;
	desc: string;
}> = [
	{
		id: "detour_convex",
		label: "Detour Convex",
		desc: "Auth, profiles, app state, and reactive dashboards.",
	},
	{
		id: "digitalocean_postgres",
		label: "DigitalOcean Postgres",
		desc: "Managed relational data for customer apps.",
	},
	{
		id: "google_alloydb_turbovec",
		label: "AlloyDB + TurboVec lane",
		desc: "Postgres-compatible vector storage with a TurboQuant/TurboVec compression path.",
	},
	{
		id: "external_postgres",
		label: "External Postgres",
		desc: "Bring an existing database and bind it through API keys.",
	},
];

const KNOWLEDGE: Array<{
	id: AppBuild["knowledgeMode"];
	label: string;
	desc: string;
}> = [
	{
		id: "agent_rag",
		label: "Agent RAG",
		desc: "Use the selected agent's indexed instructions and documents.",
	},
	{
		id: "web_crawl",
		label: "Web crawl",
		desc: "Seed the app from public docs pages and product URLs.",
	},
	{
		id: "external_kb",
		label: "External KB",
		desc: "Connect a hosted knowledge base or retrieval endpoint.",
	},
];

function formFromBuild(build: AppBuild): AppForm {
	return {
		id: build.id,
		name: build.name,
		prompt: build.prompt,
		agentId: build.agentId ?? "",
		designProject: build.designProject ?? "",
		infraMode: build.infraMode,
		databaseProvider: build.databaseProvider,
		databaseConnection: build.databaseConnection ?? "",
		knowledgeMode: build.knowledgeMode,
		mcpIds: build.mcpIds,
		apiAccess: build.apiAccess,
		sourceUrls: build.sourceUrls.join("\n"),
	};
}

function sourceUrls(value: string): string[] {
	return value
		.split(/\n|,/)
		.map((item) => item.trim())
		.filter(Boolean);
}

function labelFor<T extends string>(
	items: Array<{ id: T; label: string }>,
	id: T,
): string {
	return items.find((item) => item.id === id)?.label ?? id;
}

function statusTone(
	status: AppBuild["status"],
): "success" | "warning" | "neutral" {
	if (status === "ready") return "success";
	if (status === "needs_config") return "warning";
	return "neutral";
}

export default function AppsPage() {
	const testUser = readDtourPlaywrightUser();
	const token = testUser ? DTOUR_TEST_SESSION_TOKEN : getDtourSessionToken();
	const agents = useQuery(
		anyApi.agents.list,
		token && !testUser ? { token } : "skip",
	) as Agent[] | undefined;
	const builds = useQuery(
		anyApi.apps.list,
		token && !testUser ? { token } : "skip",
	) as AppBuild[] | undefined;
	const connectedMcps = useQuery(
		anyApi.mcps.connected,
		token && !testUser ? { token } : "skip",
	) as string[] | undefined;
	const designProjects = useQuery(
		anyApi.design.listProjects,
		token && !testUser ? { token } : "skip",
	) as DesignProject[] | null | undefined;
	const instances = useQuery(
		anyApi.remoteAgentDeployments.list,
		token && !testUser ? { token } : "skip",
	) as InstanceSummary[] | undefined;
	const saveBuild = useMutation(anyApi.apps.save);
	const removeBuild = useMutation(anyApi.apps.remove);
	const [form, setForm] = useState<AppForm>(EMPTY_FORM);
	const [saving, setSaving] = useState(false);
	const [saveError, setSaveError] = useState<string | null>(null);
	const [saveNotice, setSaveNotice] = useState<string | null>(null);
	const [hydratedFromBuild, setHydratedFromBuild] = useState(false);

	const loadedBuilds = testUser ? [] : (builds ?? []);
	const loadedAgents = testUser ? [] : (agents ?? []);
	const loadedMcps = testUser ? [] : (connectedMcps ?? []);
	const loadedProjects = testUser ? [] : (designProjects ?? []);
	const loadedInstances = testUser ? [] : (instances ?? []);
	const selectedAgent =
		loadedAgents.find((agent) => agent.id === form.agentId) ?? null;
	const selectedDeployment =
		loadedInstances.find((row) => row.agent.id === form.agentId)?.deployment ??
		null;
	const selectedProject =
		loadedProjects.find((project) => project.name === form.designProject) ??
		null;

	useEffect(() => {
		if (hydratedFromBuild || form.id || !loadedBuilds.length) return;
		setForm(formFromBuild(loadedBuilds[0]));
		setHydratedFromBuild(true);
	}, [form.id, hydratedFromBuild, loadedBuilds]);

	const blueprint = useMemo(
		() => [
			{
				label: "Frontend",
				value: "React dashboard, generated routes, forms, empty/error states",
			},
			{
				label: "Agent",
				value: selectedAgent
					? `${selectedAgent.name} · ${selectedAgent.model}`
					: "Choose an agent",
			},
			{
				label: "API",
				value:
					form.apiAccess === "keyed"
						? "API keys required"
						: form.apiAccess === "public"
							? "Public endpoint"
							: "Private dashboard only",
			},
			{
				label: "Infra",
				value:
					form.infraMode === "hybrid"
						? "Detour + external runtime"
						: form.infraMode === "detour_cloud"
							? "Detour Cloud"
							: "External provider",
			},
			{
				label: "Database",
				value: labelFor(DATABASES, form.databaseProvider),
			},
			{
				label: "Knowledge",
				value: labelFor(KNOWLEDGE, form.knowledgeMode),
			},
		],
		[
			form.apiAccess,
			form.databaseProvider,
			form.infraMode,
			form.knowledgeMode,
			selectedAgent,
		],
	);

	const configChecks = useMemo(
		() => [
			{
				label: "Agent API",
				ok: Boolean(selectedAgent),
				detail: selectedAgent
					? "agent chat/API binding selected"
					: "select an agent to bind chat and endpoints",
			},
			{
				label: "Runtime",
				ok: Boolean(selectedDeployment),
				detail: selectedDeployment
					? `${selectedDeployment.status} runtime selected`
					: "open Cloud Builder or Instances to attach a runtime",
			},
			{
				label: "Database",
				ok:
					form.databaseProvider === "detour_convex" ||
					Boolean(form.databaseConnection.trim()),
				detail:
					form.databaseProvider === "detour_convex"
						? "Detour Convex managed data plane"
						: "add a DO, AlloyDB, or external connection alias",
			},
			{
				label: "Knowledge",
				ok:
					form.knowledgeMode === "agent_rag" ||
					sourceUrls(form.sourceUrls).length > 0,
				detail:
					form.knowledgeMode === "agent_rag"
						? "agent RAG namespace"
						: "add URLs for crawler or external KB retrieval",
			},
			{
				label: "MCP",
				ok: form.mcpIds.every((id) => loadedMcps.includes(id)),
				detail: form.mcpIds.length
					? `${form.mcpIds.length} saved MCPs attached`
					: "optional tool servers",
			},
		],
		[
			form.databaseConnection,
			form.databaseProvider,
			form.knowledgeMode,
			form.mcpIds,
			form.sourceUrls,
			loadedMcps,
			selectedAgent,
			selectedDeployment,
		],
	);
	const currentBuild =
		form.id ? loadedBuilds.find((build) => build.id === form.id) : null;
	const currentStatus: AppBuild["status"] = currentBuild?.status ?? "draft";
	const readyChecks = configChecks.filter((check) => check.ok).length;
	const attachedMcpCount = form.mcpIds.filter((id) =>
		loadedMcps.includes(id),
	).length;

	function update<T extends keyof AppForm>(key: T, value: AppForm[T]) {
		setForm((current) => ({ ...current, [key]: value }));
		setSaveNotice(null);
		setSaveError(null);
	}

	function toggleMcp(id: string) {
		setForm((current) => ({
			...current,
			mcpIds: current.mcpIds.includes(id)
				? current.mcpIds.filter((item) => item !== id)
				: [...current.mcpIds, id],
		}));
		setSaveNotice(null);
		setSaveError(null);
	}

	function startNew() {
		setForm(EMPTY_FORM);
		setHydratedFromBuild(true);
		setSaveNotice(null);
		setSaveError(null);
	}

	async function save() {
		if (!token) return;
		setSaving(true);
		setSaveError(null);
		try {
			const result = (await saveBuild({
				token,
				id: form.id || undefined,
				name: form.name,
				prompt: form.prompt,
				agentId: form.agentId || undefined,
				designProject: form.designProject || undefined,
				infraMode: form.infraMode,
				databaseProvider: form.databaseProvider,
				databaseConnection: form.databaseConnection || undefined,
				knowledgeMode: form.knowledgeMode,
				mcpIds: form.mcpIds,
				apiAccess: form.apiAccess,
				sourceUrls: sourceUrls(form.sourceUrls),
			})) as { id: string; status: AppBuild["status"] };
			setForm((current) => ({ ...current, id: result.id }));
			setSaveNotice(
				result.status === "ready"
					? "Blueprint ready."
					: "Saved. Finish config to mark ready.",
			);
		} catch (error) {
			setSaveError(error instanceof Error ? error.message : String(error));
		} finally {
			setSaving(false);
		}
	}

	async function remove(id: string) {
		if (!token) return;
		await removeBuild({ token, id });
		if (form.id === id) setForm(EMPTY_FORM);
	}

	return (
		<AppShell title="App Builder">
			<div className="min-h-full bg-[var(--bg)]">
				<div className="mx-auto max-w-[1480px] px-6 py-6 md:px-8">
					<header className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
						<div className="min-w-0">
							<div className="flex flex-wrap items-center gap-3">
								<span className="flex h-9 w-9 items-center justify-center rounded-full border border-[var(--border)] bg-[var(--bg-elevated)] text-[var(--text-dim)]">
									<Icon.LayoutGrid size={16} />
								</span>
								<h1 className="text-2xl font-semibold tracking-tight text-[var(--text)]">
									App Builder
								</h1>
								<Badge tone={statusTone(currentStatus)}>
									{currentStatus.replace("_", " ")}
								</Badge>
							</div>
							<p className="mt-2 max-w-2xl text-[13px] leading-relaxed text-[var(--text-dim)]">
								Build apps that reuse your agents, infra, MCPs, databases,
								designs, and knowledge sources.
							</p>
						</div>
						<div className="grid grid-cols-3 gap-2 sm:flex sm:items-center">
							<HeaderSignal label="agents" value={loadedAgents.length} />
							<HeaderSignal label="mcps" value={loadedMcps.length} />
							<HeaderSignal
								label="checks"
								value={`${readyChecks}/${configChecks.length}`}
							/>
							<button
								type="button"
								className={buttonClasses("secondary", "sm", "sm:ml-2")}
								onClick={startNew}
							>
								<Icon.Plus size={14} />
								New app
							</button>
						</div>
					</header>

					<div className="mt-5 grid gap-4 xl:grid-cols-[260px_minmax(0,1fr)_300px] 2xl:grid-cols-[300px_minmax(0,1fr)_360px]">
						<aside className="space-y-4">
							<Panel className="overflow-hidden p-0 xl:sticky xl:top-6">
								<div className="border-b border-[var(--border)] px-4 py-3">
									<div className="flex items-center justify-between gap-3">
										<div>
											<h2 className="text-sm font-semibold text-[var(--text)]">
												Blueprints
											</h2>
											<p className="mt-0.5 text-xs text-[var(--text-muted)]">
												Saved app builds
											</p>
										</div>
										<Badge tone="neutral">{loadedBuilds.length}</Badge>
									</div>
								</div>
								<div className="max-h-[calc(100vh-230px)] overflow-y-auto p-2">
									{builds === undefined && !testUser ? (
										<div className="space-y-2">
											{[0, 1, 2].map((item) => (
												<div
													key={item}
													className="h-24 animate-pulse rounded-xl border border-[var(--border)] bg-[var(--bg-elevated)]"
												/>
											))}
										</div>
									) : loadedBuilds.length === 0 ? (
										<EmptyState
											icon={<Icon.LayoutGrid size={18} />}
											title="No app builds"
											description="Save this blueprint to create the first app project."
										/>
									) : (
										<div className="space-y-2">
											{loadedBuilds.map((build) => (
												<button
													key={build.id}
													type="button"
													onClick={() => setForm(formFromBuild(build))}
													className={cn(
														"w-full rounded-xl border p-3 text-left transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-purple-400/60",
														form.id === build.id
															? "border-purple-400/45 bg-purple-400/[0.08]"
															: "border-[var(--border)] bg-[var(--bg-elevated)] hover:bg-[var(--bg-elevated)]",
													)}
												>
													<span className="flex items-center justify-between gap-2">
														<span className="truncate text-sm font-medium text-[var(--text)]">
															{build.name}
														</span>
														<Badge tone={statusTone(build.status)}>
															{build.status.replace("_", " ")}
														</Badge>
													</span>
													<span className="mt-2 block line-clamp-2 text-[12px] leading-relaxed text-[var(--text-muted)]">
														{build.prompt}
													</span>
												</button>
											))}
										</div>
									)}
								</div>
							</Panel>
						</aside>

						<main className="space-y-4">
							<Panel className="overflow-hidden p-0">
								<div className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--border)] px-5 py-4">
									<div>
										<h2 className="text-sm font-semibold text-[var(--text)]">
											Prompt-to-app workspace
										</h2>
										<p className="mt-0.5 text-xs text-[var(--text-muted)]">
											Describe the product, then bind the runtime pieces it can
											use.
										</p>
									</div>
									<Badge tone={selectedAgent ? "success" : "warning"}>
										{selectedAgent ? "agent attached" : "needs agent"}
									</Badge>
								</div>
								<div className="grid gap-px bg-[var(--btn-glass-bg)] 2xl:grid-cols-[minmax(0,1fr)_340px]">
									<form
										onSubmit={(event) => {
											event.preventDefault();
											void save();
										}}
										className="bg-[var(--bg-elevated)] p-5"
									>
										<div className="grid gap-4 md:grid-cols-[0.7fr_1.3fr]">
											<label className="block">
												<span className="mb-1.5 block text-xs uppercase tracking-widest text-[var(--text-muted)]">
													App name
												</span>
												<input
													value={form.name}
													onChange={(event) =>
														update("name", event.target.value)
													}
													className={FIELD}
													autoComplete="off"
													spellCheck={false}
												/>
											</label>
											<label className="block">
												<span className="mb-1.5 block text-xs uppercase tracking-widest text-[var(--text-muted)]">
													Agent
												</span>
												<select
													value={form.agentId}
													onChange={(event) =>
														update("agentId", event.target.value)
													}
													className={FIELD}
												>
													<option value="">Choose agent</option>
													{loadedAgents.map((agent) => (
														<option key={agent.id} value={agent.id}>
															{agent.name}
														</option>
													))}
												</select>
											</label>
										</div>
										<label className="mt-4 block">
											<span className="mb-1.5 block text-xs uppercase tracking-widest text-[var(--text-muted)]">
												Prompt
											</span>
											<textarea
												value={form.prompt}
												onChange={(event) =>
													update("prompt", event.target.value)
												}
												className={`${FIELD} min-h-48 resize-y leading-relaxed`}
												placeholder="Build a SaaS dashboard with an agent chat panel, project table, billing, and admin review state..."
											/>
										</label>
										<div className="mt-4 grid gap-4 md:grid-cols-2">
											<label className="block">
												<span className="mb-1.5 block text-xs uppercase tracking-widest text-[var(--text-muted)]">
													Design project
												</span>
												<select
													value={form.designProject}
													onChange={(event) =>
														update("designProject", event.target.value)
													}
													className={FIELD}
												>
													<option value="">No design project</option>
													{loadedProjects.map((project) => (
														<option key={project.name} value={project.name}>
															{project.name}
														</option>
													))}
												</select>
											</label>
											<fieldset>
												<legend className="mb-1.5 block text-xs uppercase tracking-widest text-[var(--text-muted)]">
													API access
												</legend>
												<div className="grid gap-2 sm:grid-cols-3">
													{(["private", "keyed", "public"] as const).map(
														(mode) => (
															<button
																key={mode}
																type="button"
																aria-pressed={form.apiAccess === mode}
																onClick={() => update("apiAccess", mode)}
																className={cn(
																	"min-h-10 rounded-lg border px-3 py-2 text-left text-sm transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-purple-400/60",
																	form.apiAccess === mode
																		? "border-purple-400/45 bg-purple-400/[0.08] text-[var(--text)]"
																		: "border-[var(--border)] bg-[var(--bg-elevated)] text-[var(--text-dim)] hover:bg-[var(--bg-elevated)]",
																)}
															>
																{mode}
															</button>
														),
													)}
												</div>
											</fieldset>
										</div>
										<div className="mt-5 flex flex-wrap items-center gap-3 border-t border-[var(--border)] pt-4">
											<Button
												type="submit"
												size="sm"
												disabled={saving || !token}
											>
												<Icon.Zap size={14} />
												{saving ? "Saving..." : "Save blueprint"}
											</Button>
											<span className="text-[12px] text-[var(--text-muted)]">
												Saves the prompt, resource bindings, and launch checks.
											</span>
										</div>
									</form>
									<div className="bg-black p-5">
										<div className="overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--bg)]">
											<div className="flex h-10 items-center justify-between border-b border-[var(--border)] px-3">
												<div className="flex items-center gap-1.5">
													<span className="h-2 w-2 rounded-full bg-[var(--btn-glass-bg)]" />
													<span className="h-2 w-2 rounded-full bg-[var(--btn-glass-bg)]" />
													<span className="h-2 w-2 rounded-full bg-[var(--btn-glass-bg)]" />
												</div>
												<span className="rounded-full border border-[var(--border)] bg-[var(--bg-elevated)] px-2 py-0.5 text-[10px] text-[var(--text-muted)]">
													blueprint.preview
												</span>
											</div>
											<div className="p-4">
												<h3 className="text-xs uppercase tracking-widest text-[var(--text-muted)]">
													Generated blueprint
												</h3>
												<div className="mt-3 space-y-2">
													{blueprint.map((item) => (
														<BlueprintRow
															key={item.label}
															label={item.label}
															value={item.value}
														/>
													))}
												</div>
											</div>
										</div>
									</div>
								</div>
							</Panel>

							<Panel className="overflow-hidden p-0">
								<div className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--border)] px-5 py-4">
									<div>
										<h2 className="text-sm font-semibold text-[var(--text)]">
											Database and knowledge
										</h2>
										<p className="mt-0.5 text-xs text-[var(--text-muted)]">
											Choose where app state and retrieval live.
										</p>
									</div>
									<Badge tone="accent">RAG-ready</Badge>
								</div>
								<div className="grid gap-px bg-[var(--btn-glass-bg)] 2xl:grid-cols-[1.1fr_0.9fr]">
									<div className="bg-[var(--bg-elevated)] p-5">
										<div className="grid gap-2 md:grid-cols-2">
											{DATABASES.map((database) => (
												<button
													key={database.id}
													type="button"
													aria-pressed={form.databaseProvider === database.id}
													onClick={() =>
														update("databaseProvider", database.id)
													}
													className={cn(
														"rounded-xl border p-4 text-left transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-purple-400/60",
														form.databaseProvider === database.id
															? "border-purple-400/45 bg-purple-400/[0.08]"
															: "border-[var(--border)] bg-[var(--bg-elevated)] hover:bg-[var(--bg-elevated)]",
													)}
												>
													<span className="text-sm font-medium text-[var(--text)]">
														{database.label}
													</span>
													<span className="mt-1 block text-[12px] leading-relaxed text-[var(--text-muted)]">
														{database.desc}
													</span>
												</button>
											))}
										</div>
										<label className="mt-4 block">
											<span className="mb-1.5 block text-xs uppercase tracking-widest text-[var(--text-muted)]">
												Database connection
											</span>
											<input
												value={form.databaseConnection}
												onChange={(event) =>
													update("databaseConnection", event.target.value)
												}
												className={FIELD}
												placeholder="do-postgres-prod, alloydb-vector-prod, or external-dsn-secret"
												autoComplete="off"
												spellCheck={false}
											/>
											<span className="mt-1 block text-xs text-[var(--text-faint)]">
												Use a resource name or secret alias, not raw
												credentials.
											</span>
										</label>
									</div>
									<div className="bg-black p-5">
										<div className="grid gap-2">
											{KNOWLEDGE.map((mode) => (
												<button
													key={mode.id}
													type="button"
													aria-pressed={form.knowledgeMode === mode.id}
													onClick={() => update("knowledgeMode", mode.id)}
													className={cn(
														"rounded-xl border p-3 text-left transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-purple-400/60",
														form.knowledgeMode === mode.id
															? "border-purple-400/45 bg-purple-400/[0.08]"
															: "border-[var(--border)] bg-[var(--bg-elevated)] hover:bg-[var(--bg-elevated)]",
													)}
												>
													<span className="text-sm font-medium text-[var(--text)]">
														{mode.label}
													</span>
													<span className="mt-1 block text-xs text-[var(--text-muted)]">
														{mode.desc}
													</span>
												</button>
											))}
										</div>
										<label className="mt-4 block">
											<span className="mb-1.5 block text-xs uppercase tracking-widest text-[var(--text-muted)]">
												Source URLs
											</span>
											<textarea
												value={form.sourceUrls}
												onChange={(event) =>
													update("sourceUrls", event.target.value)
												}
												className={`${FIELD} min-h-24 resize-y leading-relaxed`}
												placeholder="https://docs.example.com&#10;https://example.com/pricing"
												spellCheck={false}
											/>
										</label>
									</div>
								</div>
							</Panel>

							<Panel className="overflow-hidden p-0">
								<div className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--border)] px-5 py-4">
									<div>
										<h2 className="text-sm font-semibold text-[var(--text)]">
											MCP tools
										</h2>
										<p className="mt-0.5 text-xs text-[var(--text-muted)]">
											Attach saved servers to this app blueprint.
										</p>
									</div>
									<Badge tone={attachedMcpCount ? "success" : "neutral"}>
										{attachedMcpCount} attached
									</Badge>
								</div>
								<div className="grid gap-px bg-[var(--btn-glass-bg)] md:grid-cols-2">
									{MCP_CATALOG.slice(0, 8).map((mcp) => {
										const saved = loadedMcps.includes(mcp.id);
										const active = form.mcpIds.includes(mcp.id);
										return (
											<button
												key={mcp.id}
												type="button"
												disabled={!saved}
												aria-pressed={active}
												onClick={() => toggleMcp(mcp.id)}
												className={cn(
													"flex min-h-16 items-center justify-between gap-3 bg-[var(--bg-elevated)] px-4 py-3 text-left transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-purple-400/60 disabled:cursor-not-allowed disabled:opacity-45",
													active ? "bg-purple-400/[0.08]" : "hover:bg-[var(--bg-elevated)]",
												)}
											>
												<span className="min-w-0">
													<span className="block truncate text-sm text-[var(--text)]">
														{mcp.name}
													</span>
													<span className="block truncate text-xs text-[var(--text-muted)]">
														{mcp.category}
													</span>
												</span>
												<Badge
													tone={
														saved ? (active ? "accent" : "neutral") : "warning"
													}
												>
													{saved ? (active ? "attached" : "saved") : "connect"}
												</Badge>
											</button>
										);
									})}
								</div>
							</Panel>
						</main>

						<aside className="space-y-4">
							<Panel className="p-5 xl:sticky xl:top-6">
								<div className="flex items-baseline justify-between gap-3">
									<div>
										<h2 className="text-sm font-semibold text-[var(--text)]">
											Readiness
										</h2>
										<p className="mt-0.5 text-xs text-[var(--text-muted)]">
											Live launch requirements
										</p>
									</div>
									<div className="text-2xl font-semibold tabular-nums text-[var(--text)]">
										{readyChecks}/{configChecks.length}
									</div>
								</div>
								<div className="mt-4 space-y-2">
									{configChecks.map((check) => (
										<CheckRow
											key={check.label}
											label={check.label}
											detail={check.detail}
											ok={check.ok}
										/>
									))}
								</div>
							</Panel>

							<Panel className="p-5">
								<h2 className="text-sm font-semibold text-[var(--text)]">
									Connected resources
								</h2>
								<div className="mt-4 space-y-2">
									<ResourceRow
										icon={<Icon.Bot size={15} />}
										label="Agents"
										value={`${loadedAgents.length} owned`}
									/>
									<ResourceRow
										icon={<Icon.Activity size={15} />}
										label="Runtime"
										value={
											selectedDeployment
												? selectedDeployment.status
												: "not selected"
										}
									/>
									<ResourceRow
										icon={<Icon.Plug size={15} />}
										label="MCP servers"
										value={`${loadedMcps.length} saved`}
									/>
									<ResourceRow
										icon={<Icon.Palette size={15} />}
										label="Design"
										value={
											selectedProject
												? projectParts(selectedProject)
												: "not selected"
										}
									/>
								</div>
							</Panel>

							<Panel className="p-5">
								<h2 className="text-sm font-semibold text-[var(--text)]">Infra mode</h2>
								<div className="mt-3 grid gap-2">
									{(["hybrid", "detour_cloud", "external"] as const).map(
										(mode) => (
											<button
												key={mode}
												type="button"
												aria-pressed={form.infraMode === mode}
												onClick={() => update("infraMode", mode)}
												className={cn(
													"min-h-10 rounded-lg border px-3 py-2 text-left text-sm transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-purple-400/60",
													form.infraMode === mode
														? "border-purple-400/45 bg-purple-400/[0.08] text-[var(--text)]"
														: "border-[var(--border)] bg-[var(--bg-elevated)] text-[var(--text-dim)] hover:bg-[var(--bg-elevated)]",
												)}
											>
												{mode.replace("_", " ")}
											</button>
										),
									)}
								</div>
							</Panel>

							{(saveError || saveNotice) && (
								<Panel
									className={cn(
										"p-4 text-sm",
										saveError
											? "border-red-400/20 bg-red-400/[0.06] text-red-100/90"
											: "border-emerald-400/20 bg-emerald-400/[0.06] text-emerald-100/90",
									)}
								>
									{saveError ?? saveNotice}
								</Panel>
							)}
							{form.id && (
								<button
									type="button"
									className="w-full rounded-full border border-red-400/20 bg-red-400/[0.04] px-4 py-2 text-sm font-medium text-red-100/80 transition hover:bg-red-400/[0.08] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-400/60"
									onClick={() => void remove(form.id as string)}
								>
									Delete app blueprint
								</button>
							)}
						</aside>
					</div>
				</div>
			</div>
		</AppShell>
	);
}

function HeaderSignal({ label, value }: { label: string; value: ReactNode }) {
	return (
		<div className="min-w-20 rounded-xl border border-[var(--border)] bg-[var(--bg-elevated)] px-3 py-2">
			<div className="text-[10px] uppercase tracking-widest text-[var(--text-faint)]">
				{label}
			</div>
			<div className="mt-0.5 text-sm font-semibold tabular-nums text-[var(--text)]">
				{value}
			</div>
		</div>
	);
}

function BlueprintRow({ label, value }: { label: string; value: string }) {
	return (
		<div className="rounded-lg border border-[var(--border)] bg-[var(--bg-elevated)] px-3 py-2">
			<div className="text-[10px] uppercase tracking-widest text-[var(--text-faint)]">
				{label}
			</div>
			<div className="mt-1 text-[12px] leading-relaxed text-[var(--text-dim)]">
				{value}
			</div>
		</div>
	);
}

function CheckRow({
	label,
	detail,
	ok,
}: {
	label: string;
	detail: string;
	ok: boolean;
}) {
	return (
		<div
			className="flex items-start justify-between gap-3 rounded-xl border border-[var(--border)] bg-[var(--bg-elevated)] px-3 py-2"
			title={detail}
		>
			<span className="min-w-0">
				<span className="block text-sm text-[var(--text)]">{label}</span>
				<span className="block truncate text-xs text-[var(--text-muted)]">{detail}</span>
			</span>
			<Badge tone={ok ? "success" : "warning"}>{ok ? "ready" : "needs"}</Badge>
		</div>
	);
}

function ResourceRow({
	icon,
	label,
	value,
}: {
	icon: ReactNode;
	label: string;
	value: string;
}) {
	return (
		<div className="flex items-center justify-between gap-3 rounded-xl border border-[var(--border)] bg-[var(--bg-elevated)] px-3 py-2">
			<span className="flex min-w-0 items-center gap-2 text-sm text-[var(--text)]">
				<span className="text-[var(--text-muted)]">{icon}</span>
				<span>{label}</span>
			</span>
			<span className="truncate text-xs text-[var(--text-muted)]">{value}</span>
		</div>
	);
}

function projectParts(project: DesignProject): string {
	return (
		[
			project.hasStudio ? "canvas" : null,
			project.hasSketch ? "sketch" : null,
			project.hasWorkflow ? "workflow" : null,
			project.hasInfra ? "infra" : null,
		]
			.filter(Boolean)
			.join(" + ") || "design"
	);
}
