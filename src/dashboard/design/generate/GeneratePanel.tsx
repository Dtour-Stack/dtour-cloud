import { useAction, useMutation, useQuery } from "convex/react";
import { anyApi } from "convex/server";
import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { type DashboardSource, withDashboardPreviewPolicy } from "@/dashboard/custom/dashboardPreview";
import {
  DTOUR_TEST_SESSION_TOKEN,
  readDtourPlaywrightUser,
} from "@/lib/playwright-dtour-auth";
import { getDtourSessionToken } from "@/lib/session";
import { Button, cn, Icon } from "@/ui";

type GenerateMode = "dashboard" | "mockup" | "wireframe" | "component";
type GeneratedPreview = {
  title: string;
  html: string;
  notes: string[];
};

type RunChat = (args: {
  token: string;
  model: string;
  messages: { role: string; content: string }[];
  refId: string;
}) => Promise<{ text: string }>;

type ProjectSourceRow = {
  name: string;
  hasStudio: boolean;
  hasSketch: boolean;
  hasWorkflow: boolean;
  hasInfra: boolean;
};

type DeploymentSourceRow = {
  agent: { id: string; name: string };
  deployment: {
    agentId: string;
    status: string;
    webUiUrl: string;
    apiBaseUrl: string;
    a2aEnabled: boolean;
    mcpEnabled: boolean;
  };
};

type ExternalConnectionSourceRow = {
  id: string;
  label: string;
  provider: string;
  baseUrl: string;
  apiBaseUrl: string | null;
  a2aUrl: string | null;
  mcpUrl: string | null;
  status: string;
};

type SourceOption = DashboardSource & {
  key: string;
  group: "Projects" | "Remote infra" | "External endpoints";
  detail: string;
};

const HTML_PREVIEW_SYSTEM = `You are Detour Studio's UI generator. Output ONLY raw JSON:
{"title":"short title","html":"complete HTML document or body snippet","notes":["short implementation note"]}

Rules:
- Generate self-contained HTML, CSS, and lightweight vanilla JS for a sandboxed iframe preview.
- No external URLs, no network calls, no remote fonts, no imports, no storage, no cookies.
- Scripts are allowed only for local UI behavior: tabs, toggles, preview state, fake filters, menu open/close.
- If source data is provided, read it from window.DETOUR_DASHBOARD_SOURCES and render those projects, remote infra URLs, and external endpoints as selectable live resources. Do not invent unavailable endpoints.
- Keep the HTML under 18kb.
- Use Detour styling unless the prompt requests another style: near-black canvas, glass panels, white opacity text, hairline borders, one violet-blue accent, Inter/system font.
- When mode is dashboard, create a complete Detour dashboard shell with navigation, meaningful sections, real controls, empty/loading/error states, and responsive behavior.
- Use real HTML controls and labels. Do not output placeholders like "lorem ipsum" or generic empty boxes.
- The preview must fit well at desktop width and still work when narrowed.`;

const MODE_COPY: Record<GenerateMode, { label: string; hint: string; prompt: string }> = {
  dashboard: {
    label: "Dashboard",
    hint: "Full Detour workspace",
    prompt:
      "Generate a custom Detour dashboard for a creator running AI agents. Include a compact top bar, left navigation, live agent cards, revenue/reward metrics, task queue, inbox summary, model status, and a settings drawer toggle.",
  },
  mockup: {
    label: "Mockup",
    hint: "Product screen",
    prompt:
      "Generate a Detour admin dashboard screen for reviewing tester applications. Include applicant cards, score panel, approve/deny controls, and an assistant drawer.",
  },
  wireframe: {
    label: "Wireframe",
    hint: "Structure first",
    prompt:
      "Generate a high-fidelity wireframe for an agent email inbox: sidebar, message list, reply composer, status chips, and a preview panel. Keep it grayscale with clear labels.",
  },
  component: {
    label: "Component",
    hint: "Reusable UI piece",
    prompt:
      "Generate an interactive pricing/settings component for enabling AgentMail on an AI agent. Include mailbox status, pod selection, routing rules, and a test email button.",
  },
};

const STARTER_HTML = `<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <style>
      * { box-sizing: border-box; }
      body { margin: 0; min-height: 100vh; background: #0a0a0a; color: white; font-family: Inter, ui-sans-serif, system-ui, sans-serif; }
      button { font: inherit; }
      .shell { min-height: 100vh; display: grid; grid-template-columns: 220px minmax(0, 1fr); background: radial-gradient(circle at 70% 0%, rgba(168,85,247,.10), transparent 32%), #0a0a0a; }
      aside { border-right: 1px solid rgb(255 255 255 / .10); background: rgb(0 0 0 / .30); padding: 18px; }
      main { min-width: 0; padding: 18px; }
      .brand { display: flex; align-items: center; gap: 10px; font-weight: 800; letter-spacing: -.02em; }
      .mark { width: 28px; height: 28px; border-radius: 999px; background: linear-gradient(90deg,#c084fc,#818cf8,#60a5fa); box-shadow: 0 0 24px rgba(168,85,247,.28); }
      .nav { margin-top: 24px; display: grid; gap: 6px; }
      .nav button { border: 0; border-radius: 10px; background: transparent; color: rgb(255 255 255 / .55); padding: 10px 12px; text-align: left; cursor: pointer; }
      .nav button.active { background: rgb(255 255 255 / .09); color: white; }
      .top { display: flex; align-items: center; justify-content: space-between; gap: 12px; border-bottom: 1px solid rgb(255 255 255 / .10); padding-bottom: 16px; }
      .top h1 { margin: 0; font-size: clamp(22px, 3vw, 34px); letter-spacing: -.035em; }
      .top p { margin: 4px 0 0; color: rgb(255 255 255 / .48); font-size: 13px; }
      .pill { border: 1px solid rgb(255 255 255 / .12); border-radius: 999px; background: rgb(255 255 255 / .05); color: rgb(255 255 255 / .72); padding: 8px 12px; }
      .grid { display: grid; grid-template-columns: 1.2fr .8fr; gap: 14px; margin-top: 14px; }
      .panel { border: 1px solid rgb(255 255 255 / .10); border-radius: 18px; background: rgb(255 255 255 / .035); overflow: hidden; }
      .panel header { display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid rgb(255 255 255 / .10); padding: 14px 16px; }
      .panel h2 { margin: 0; font-size: 14px; }
      .cards { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 10px; padding: 14px; }
      .card { min-height: 118px; border: 1px solid rgb(255 255 255 / .10); border-radius: 14px; background: rgb(0 0 0 / .28); padding: 14px; }
      .label { color: rgb(255 255 255 / .36); font-size: 10px; letter-spacing: .14em; text-transform: uppercase; }
      .value { margin-top: 14px; font-size: 26px; font-weight: 800; letter-spacing: -.03em; }
      .list { display: grid; gap: 8px; padding: 14px; }
      .row { display: flex; align-items: center; justify-content: space-between; gap: 12px; border: 1px solid rgb(255 255 255 / .08); border-radius: 12px; padding: 12px; background: rgb(0 0 0 / .22); }
      .row strong { display: block; font-size: 13px; }
      .row span { color: rgb(255 255 255 / .45); font-size: 12px; }
      .action { border: 0; border-radius: 999px; background: white; color: black; padding: 9px 12px; font-weight: 800; cursor: pointer; }
      .accent { color: #c4b5fd; }
      @media (max-width: 820px) { .shell { grid-template-columns: 1fr; } aside { display: none; } .top { align-items: flex-start; flex-direction: column; } .grid, .cards { grid-template-columns: 1fr; } }
    </style>
  </head>
  <body>
    <div class="shell">
      <aside>
        <div class="brand"><span class="mark"></span>Detour</div>
        <div class="nav">
          <button class="active">Overview</button>
          <button>Agents</button>
          <button>Rewards</button>
          <button>Settings</button>
        </div>
      </aside>
      <main>
        <div class="top">
          <div>
            <h1>Creator command dashboard</h1>
            <p>Track agents, tasks, usage, and model health from one focused workspace.</p>
          </div>
          <button class="pill" id="mode">Live mode</button>
        </div>
        <section class="panel">
          <header><h2>Workspace health</h2><span class="accent">Ready</span></header>
          <div class="cards">
            <div class="card"><div class="label">Agents</div><div class="value">12</div></div>
            <div class="card"><div class="label">Credit usage</div><div class="value">$24</div></div>
            <div class="card"><div class="label">Tasks queued</div><div class="value">31</div></div>
          </div>
        </section>
        <div class="grid">
          <section class="panel"><header><h2>Priority queue</h2><button class="action">Run next</button></header><div class="list">
            <div class="row"><div><strong>Review tester replies</strong><span>Admin Detour</span></div><span>4m</span></div>
            <div class="row"><div><strong>Publish dashboard draft</strong><span>Design Studio</span></div><span>12m</span></div>
            <div class="row"><div><strong>Sync AgentMail pods</strong><span>Agents</span></div><span>28m</span></div>
          </div></section>
          <section class="panel"><header><h2>Model status</h2><span class="accent">Optimal</span></header><div class="list">
            <div class="row"><div><strong>Claude Sonnet</strong><span>UI generation</span></div><span>fast</span></div>
            <div class="row"><div><strong>OpenRouter fallback</strong><span>Chat routing</span></div><span>ready</span></div>
          </div></section>
        </div>
      </main>
    </div>
    <script>
      document.getElementById('mode').addEventListener('click', (event) => {
        event.currentTarget.textContent = event.currentTarget.textContent === 'Live mode' ? 'Draft mode' : 'Live mode';
      });
    </script>
  </body>
</html>`;

function stripCodeFence(raw: string): string {
  return raw.trim().replace(/^```(?:json|html)?/i, "").replace(/```$/i, "").trim();
}

function extractJsonObject(raw: string): Partial<GeneratedPreview> {
  const text = stripCodeFence(raw);
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start === -1 || end === -1) throw new Error("The model did not return a JSON object.");
  return JSON.parse(text.slice(start, end + 1)) as Partial<GeneratedPreview>;
}

function parsePreview(raw: string): GeneratedPreview {
  const obj = extractJsonObject(raw);
  if (typeof obj.html !== "string" || !obj.html.trim()) throw new Error("The model did not return preview code.");
  const notes = Array.isArray(obj.notes)
    ? obj.notes.filter((note): note is string => typeof note === "string").slice(0, 4)
    : [];
  return {
    title: typeof obj.title === "string" && obj.title.trim() ? obj.title.trim() : "Generated dashboard",
    html: obj.html.trim(),
    notes,
  };
}

async function generateHtmlPreview(
  runChat: RunChat,
  token: string,
  mode: GenerateMode,
  prompt: string,
  sourceContext: string,
): Promise<GeneratedPreview> {
  const refId = `design-artifact-${mode}-${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
  const { text } = await runChat({
    token,
    model: "anthropic/claude-sonnet-4.5",
    refId,
    messages: [
      { role: "system", content: HTML_PREVIEW_SYSTEM },
      { role: "user", content: `Mode: ${mode}\n\nAvailable Detour data sources:\n${sourceContext || "No sources selected."}\n\nPrompt:\n${prompt}` },
    ],
  });
  return parsePreview(text);
}

function dashboardName(title: string): string {
  return title
    .replace(/[^\w\s-]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 48) || "Custom dashboard";
}

function buildSourceOptions(
  projects: ProjectSourceRow[],
  deployments: DeploymentSourceRow[],
  externalConnections: ExternalConnectionSourceRow[],
): SourceOption[] {
  return [
    ...projects.map((project) => ({
      key: `project:${project.name}`,
      kind: "project",
      label: project.name,
      ref: project.name,
      endpoint: `/design/projects?project=${encodeURIComponent(project.name)}`,
      group: "Projects" as const,
      detail:
        [
          project.hasStudio && "studio",
          project.hasSketch && "sketch",
          project.hasWorkflow && "workflow",
          project.hasInfra && "infra",
        ]
          .filter(Boolean)
          .join(" · ") || "empty",
    })),
    ...deployments.map(({ agent, deployment }) => ({
      key: `remote:${deployment.agentId}`,
      kind: "remote_infra",
      label: agent.name,
      ref: deployment.agentId,
      endpoint: deployment.apiBaseUrl || deployment.webUiUrl,
      group: "Remote infra" as const,
      detail: [
        deployment.status,
        deployment.a2aEnabled && "A2A",
        deployment.mcpEnabled && "MCP",
        deployment.webUiUrl && "web UI",
      ]
        .filter(Boolean)
        .join(" · "),
    })),
    ...externalConnections.map((connection) => ({
      key: `external:${connection.id}`,
      kind: "external_endpoint",
      label: connection.label,
      ref: connection.id,
      endpoint: connection.apiBaseUrl ?? connection.a2aUrl ?? connection.mcpUrl ?? connection.baseUrl,
      group: "External endpoints" as const,
      detail: [
        connection.provider,
        connection.status,
        connection.apiBaseUrl && "API",
        connection.a2aUrl && "A2A",
        connection.mcpUrl && "MCP",
      ]
        .filter(Boolean)
        .join(" · "),
    })),
  ];
}

function sourceContext(sources: DashboardSource[]): string {
  return sources
    .map((source) =>
      `- ${source.kind}: ${source.label}; ref=${source.ref}; endpoint=${source.endpoint ?? "none"}`,
    )
    .join("\n");
}

export function GeneratePanel() {
  const navigate = useNavigate();
  const testUser = readDtourPlaywrightUser();
  const token = testUser ? DTOUR_TEST_SESSION_TOKEN : getDtourSessionToken();
  const runChat = useAction(anyApi.inference.runChat);
  const saveDashboard = useMutation(anyApi.design.saveDashboard);
  const projectRows = useQuery(
    anyApi.design.listProjects,
    token && !testUser ? { token } : "skip",
  ) as ProjectSourceRow[] | null | undefined;
  const deploymentRows = useQuery(
    anyApi.remoteAgentDeployments.list,
    token && !testUser ? { token } : "skip",
  ) as DeploymentSourceRow[] | undefined;
  const externalRows = useQuery(
    anyApi.agentExternalConnections.listAll,
    token && !testUser ? { token } : "skip",
  ) as ExternalConnectionSourceRow[] | undefined;
  const [mode, setMode] = useState<GenerateMode>("dashboard");
  const [prompt, setPrompt] = useState(MODE_COPY.dashboard.prompt);
  const [preview, setPreview] = useState<GeneratedPreview>({
    title: "Creator command dashboard",
    html: STARTER_HTML,
    notes: ["Full dashboard shell", "Sandboxed local interactions", "Ready to save into the dashboard switcher"],
  });
  const [customName, setCustomName] = useState("Creator command dashboard");
  const [busy, setBusy] = useState(false);
  const [saving, setSaving] = useState(false);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const sourceOptions = useMemo(
    () => buildSourceOptions(projectRows ?? [], deploymentRows ?? [], externalRows ?? []),
    [deploymentRows, externalRows, projectRows],
  );
  const [selectedSourceKeys, setSelectedSourceKeys] = useState<string[]>([]);
  const selectedSources = useMemo(
    () => sourceOptions.filter((source) => selectedSourceKeys.includes(source.key)),
    [selectedSourceKeys, sourceOptions],
  );
  const srcDoc = useMemo(
    () => withDashboardPreviewPolicy(preview.html, selectedSources),
    [preview.html, selectedSources],
  );

  function applyMode(nextMode: GenerateMode) {
    setMode(nextMode);
    setPrompt(MODE_COPY[nextMode].prompt);
  }

  function toggleSource(key: string) {
    setSaved(false);
    setSelectedSourceKeys((current) =>
      current.includes(key) ? current.filter((item) => item !== key) : [...current, key],
    );
  }

  async function generate() {
    if (!token || busy || !prompt.trim()) return;
    setBusy(true);
    setCopied(false);
    setError(null);
    setSaved(false);
    try {
      const next = await generateHtmlPreview(runChat, token, mode, prompt.trim(), sourceContext(selectedSources));
      setPreview(next);
      setCustomName(dashboardName(next.title));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Generation failed.");
    } finally {
      setBusy(false);
    }
  }

  async function copyHtml() {
    setCopied(false);
    setError(null);
    try {
      await navigator.clipboard.writeText(preview.html);
      setCopied(true);
    } catch {
      setError("Clipboard access is blocked in this browser.");
    }
  }

  async function saveAsDashboard() {
    if (!token || saving || !customName.trim()) return;
    setSaving(true);
    setSaved(false);
    setError(null);
    try {
      const res = await saveDashboard({
        token,
        name: customName.trim(),
        title: preview.title,
        html: preview.html,
        notes: preview.notes,
        sources: selectedSources,
      });
      setSaved(true);
      navigate(`/dashboard/custom/${encodeURIComponent(res.name)}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save dashboard.");
    } finally {
      setSaving(false);
    }
  }

  const modeIds = Object.keys(MODE_COPY) as GenerateMode[];
  const sourcesLoading = Boolean(token && !testUser && (projectRows === undefined || deploymentRows === undefined || externalRows === undefined));

  return (
    <div className="flex h-full min-h-0 bg-[#0a0a0a]">
      <aside className="flex w-[380px] shrink-0 flex-col border-r border-white/10 bg-[#0d0d0d]/95 p-4 max-lg:w-80 max-md:hidden">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-[10px] uppercase tracking-widest text-white/35">Prototype</p>
            <h1 className="mt-1 text-lg font-semibold tracking-tight text-white">Generate dashboard UI</h1>
          </div>
          <span className="rounded-full border border-white/10 bg-white/[0.03] px-2.5 py-1 text-[11px] text-white/45">
            Artifact
          </span>
        </div>

        <div className="mt-5 grid grid-cols-2 gap-1 rounded-xl border border-white/10 bg-black/25 p-1">
          {modeIds.map((id) => (
            <button
              key={id}
              type="button"
              onClick={() => applyMode(id)}
              aria-pressed={mode === id}
              className={cn(
                "h-9 rounded-lg text-[12px] font-medium transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-purple-400/60",
                mode === id ? "bg-white text-black" : "text-white/58 hover:bg-white/10 hover:text-white",
              )}
            >
              {MODE_COPY[id].label}
            </button>
          ))}
        </div>

        <div className="mt-4 rounded-xl border border-white/10 bg-black/25 p-3">
          <div className="text-[10px] uppercase tracking-widest text-white/35">Mode</div>
          <div className="mt-1 text-sm font-medium text-white">{MODE_COPY[mode].hint}</div>
        </div>

        <SourcePicker
          className="mt-4"
          options={sourceOptions}
          selectedKeys={selectedSourceKeys}
          loading={sourcesLoading}
          onToggle={toggleSource}
        />

        <label htmlFor="design-generate-prompt" className="mt-4 block text-[11px] uppercase tracking-widest text-white/45">
          Prompt
        </label>
        <textarea
          id="design-generate-prompt"
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          placeholder="Describe the dashboard you want..."
          className="mt-2 min-h-0 flex-1 resize-none rounded-2xl border border-white/12 bg-white/[0.04] px-4 py-3 text-[13px] leading-relaxed text-white placeholder:text-white/30 focus:border-purple-400/50 focus:outline-none focus-visible:ring-2 focus-visible:ring-purple-400/60"
        />

        <label className="mt-4 block">
          <span className="mb-1.5 block text-[11px] uppercase tracking-widest text-white/45">Name in switcher</span>
          <input
            value={customName}
            onChange={(e) => {
              setCustomName(e.target.value);
              setSaved(false);
            }}
            className="w-full rounded-xl border border-white/12 bg-white/[0.04] px-3 py-2 text-[13px] text-white focus:border-purple-400/50 focus:outline-none"
          />
        </label>

        {error && (
          <div className="mt-3 rounded-xl border border-red-400/20 bg-red-400/10 px-3 py-2 text-[12px] leading-relaxed text-red-100/90">
            {error}
          </div>
        )}

        <div className="mt-4 grid grid-cols-[1fr_auto] gap-2">
          <Button onClick={() => void generate()} disabled={!token || busy || !prompt.trim()}>
            <Icon.Wand size={14} /> {busy ? "Generating" : "Generate"}
          </Button>
          <Button variant="secondary" onClick={() => void copyHtml()} disabled={!preview.html}>
            <Icon.Copy size={14} /> {copied ? "Copied" : "Code"}
          </Button>
        </div>

        <div className="mt-3 rounded-xl border border-white/10 bg-black/25 px-3 py-2 text-[12px] leading-relaxed text-white/45">
          {saved ? "Saved into the dashboard switcher." : preview.notes[0] ?? "Generated dashboards save into the switcher."}
        </div>
      </aside>

      <section className="flex min-w-0 flex-1 flex-col">
        <div className="hidden shrink-0 border-b border-white/10 bg-[#0d0d0d]/95 p-3 max-md:block">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-[10px] uppercase tracking-widest text-white/35">Prototype</p>
              <h1 className="mt-1 text-base font-semibold tracking-tight text-white">Generate dashboard UI</h1>
            </div>
            <span className="rounded-full border border-white/10 bg-white/[0.03] px-2.5 py-1 text-[11px] text-white/45">
              Artifact
            </span>
          </div>

          <div className="mt-3 flex gap-1 overflow-x-auto rounded-xl border border-white/10 bg-black/25 p-1">
            {modeIds.map((id) => (
              <button
                key={id}
                type="button"
                onClick={() => applyMode(id)}
                aria-pressed={mode === id}
                className={cn(
                  "h-9 shrink-0 rounded-lg px-3 text-[12px] font-medium transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-purple-400/60",
                  mode === id ? "bg-white text-black" : "text-white/58 hover:bg-white/10 hover:text-white",
                )}
              >
                {MODE_COPY[id].label}
              </button>
            ))}
          </div>

          <label htmlFor="design-generate-prompt-mobile" className="mt-3 block text-[11px] uppercase tracking-widest text-white/45">
            Prompt
          </label>
          <textarea
            id="design-generate-prompt-mobile"
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            placeholder="Describe the dashboard you want..."
            className="mt-2 h-24 w-full resize-none rounded-2xl border border-white/12 bg-white/[0.04] px-4 py-3 text-[13px] leading-relaxed text-white placeholder:text-white/30 focus:border-purple-400/50 focus:outline-none focus-visible:ring-2 focus-visible:ring-purple-400/60"
          />

          <label className="mt-3 block">
            <span className="mb-1.5 block text-[11px] uppercase tracking-widest text-white/45">Name in switcher</span>
            <input
              value={customName}
              onChange={(e) => {
                setCustomName(e.target.value);
                setSaved(false);
              }}
              className="w-full rounded-xl border border-white/12 bg-white/[0.04] px-3 py-2 text-[13px] text-white focus:border-purple-400/50 focus:outline-none"
            />
          </label>

          <SourcePicker
            className="mt-3"
            options={sourceOptions}
            selectedKeys={selectedSourceKeys}
            loading={sourcesLoading}
            onToggle={toggleSource}
          />

          {error && (
            <div className="mt-3 rounded-xl border border-red-400/20 bg-red-400/10 px-3 py-2 text-[12px] leading-relaxed text-red-100/90">
              {error}
            </div>
          )}

          <div className="mt-3 grid grid-cols-[1fr_auto] gap-2">
            <Button
              size="sm"
              onClick={() => void generate()}
              disabled={!token || busy || !prompt.trim()}
              className="min-h-9"
            >
              <Icon.Wand size={14} /> {busy ? "Generating" : "Generate"}
            </Button>
            <Button size="sm" variant="secondary" onClick={() => void copyHtml()} disabled={!preview.html}>
              <Icon.Copy size={14} /> {copied ? "Copied" : "Code"}
            </Button>
          </div>
        </div>

        <div className="flex h-14 shrink-0 items-center justify-between border-b border-white/10 px-4">
          <div className="min-w-0">
            <div className="truncate text-sm font-semibold text-white">{preview.title}</div>
            <div className="text-[11px] text-white/35">Live sandbox preview</div>
          </div>
          <div className="flex items-center gap-2">
            <div className="hidden items-center gap-1.5 rounded-full border border-white/10 bg-white/[0.03] px-3 py-1.5 text-[11px] text-white/45 sm:flex">
              <span className={cn("h-1.5 w-1.5 rounded-full", busy ? "bg-amber-300 motion-safe:animate-pulse" : "bg-emerald-300")} />
              {busy ? "Generating" : "Ready"}
            </div>
            <Button
              size="sm"
              onClick={() => void saveAsDashboard()}
              disabled={!token || saving || !customName.trim()}
              className="max-sm:px-3"
            >
              <Icon.LayoutGrid size={14} /> {saving ? "Saving" : "Use as dashboard"}
            </Button>
          </div>
        </div>

        <div className="min-h-0 flex-1 bg-black p-3">
          <iframe
            key={srcDoc}
            title="Generated design preview"
            sandbox="allow-scripts"
            referrerPolicy="no-referrer"
            srcDoc={srcDoc}
            className="h-full w-full rounded-2xl border border-white/12 bg-white"
          />
        </div>
      </section>
    </div>
  );
}

function SourcePicker({
  options,
  selectedKeys,
  loading,
  onToggle,
  className,
}: {
  options: SourceOption[];
  selectedKeys: string[];
  loading: boolean;
  onToggle: (key: string) => void;
  className?: string;
}) {
  const groups = ["Projects", "Remote infra", "External endpoints"] as const;
  return (
    <div className={cn("rounded-xl border border-white/10 bg-black/25 p-3", className)}>
      <div className="flex items-center justify-between gap-2">
        <span className="text-[10px] uppercase tracking-widest text-white/35">Data sources</span>
        <span className="rounded-full border border-white/10 px-2 py-0.5 text-[10px] text-white/40">
          {selectedKeys.length} selected
        </span>
      </div>
      <p className="mt-1 text-[11px] leading-relaxed text-white/35">
        Bind dashboards to current projects, Detour remote infra, or external agent endpoints.
      </p>
      {loading ? (
        <div className="mt-3 text-[12px] text-white/40">Loading sources...</div>
      ) : options.length === 0 ? (
        <div className="mt-3 rounded-lg border border-white/10 bg-white/[0.02] px-3 py-2 text-[11px] leading-relaxed text-white/35">
          No sources yet. Create a project, deploy an agent, or connect an external endpoint in Agent Cloud.
        </div>
      ) : (
        <div className="mt-3 max-h-48 space-y-3 overflow-y-auto pr-1">
          {groups.map((group) => {
            const rows = options.filter((option) => option.group === group);
            if (rows.length === 0) return null;
            return (
              <div key={group} className="space-y-1.5">
                <div className="text-[9px] uppercase tracking-widest text-white/30">{group}</div>
                {rows.map((option) => (
                  <label
                    key={option.key}
                    className="flex min-h-10 cursor-pointer items-start gap-2 rounded-lg border border-white/10 bg-white/[0.02] px-2.5 py-2 transition hover:bg-white/[0.06]"
                  >
                    <input
                      type="checkbox"
                      checked={selectedKeys.includes(option.key)}
                      onChange={() => onToggle(option.key)}
                      className="mt-0.5 accent-purple-400"
                    />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[12px] font-medium text-white/75">
                        {option.label}
                      </span>
                      <span className="block truncate text-[10px] text-white/35">{option.detail}</span>
                    </span>
                  </label>
                ))}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
