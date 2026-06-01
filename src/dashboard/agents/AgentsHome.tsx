import { useAction, useMutation, useQuery } from "convex/react";
import { anyApi } from "convex/server";
import { type FormEvent, type ReactNode, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ELIZA_PLUGINS } from "@/dashboard/design/workflow/registry";
import { getDtourSessionToken } from "@/lib/session";
import { generateAgentConfig } from "./aiGenerate";
import {
  Badge,
  Button,
  EmptyState,
  Icon,
  IconButton,
  Panel,
  SectionHeading,
  Skeleton,
} from "@/ui";

type Agent = {
  id: string;
  name: string;
  description: string | null;
  model: string;
  type: string;
  createdAt: number;
};

const field =
  "w-full rounded-lg border border-white/15 bg-white/5 px-3 py-2.5 text-sm text-white placeholder:text-white/30 focus:border-purple-400/50 focus:outline-none";

export function AgentsHome() {
  const navigate = useNavigate();
  const token = getDtourSessionToken();
  const agents = useQuery(
    anyApi.agents.list,
    token ? { token } : "skip",
  ) as Agent[] | undefined;
  const create = useMutation(anyApi.agents.create);
  const removeAgent = useMutation(anyApi.agents.remove);
  const listModels = useAction(anyApi.agents.listModels);
  const runChat = useAction(anyApi.inference.runChat);
  const [models, setModels] = useState<{ id: string; source: string }[]>([]);

  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [systemPrompt, setSystemPrompt] = useState("");
  // "auto" lets Detour Cloud route the model — users never have to pick.
  const [model, setModel] = useState("auto");
  const [plugins, setPlugins] = useState<string[]>([]);
  const togglePlugin = (p: string) =>
    setPlugins((cur) => (cur.includes(p) ? cur.filter((x) => x !== p) : [...cur, p]));

  useEffect(() => {
    if (!token) return;
    listModels({ token })
      .then((r: { id: string; source: string }[]) => setModels(r))
      .catch(() => {});
  }, [token, listModels]);

  // Real ElizaCloud catalog, grouped by source (later: "Your agents" / "HuggingFace").
  const groups = models.reduce<Record<string, string[]>>((acc, m) => {
    (acc[m.source] ??= []).push(m.id);
    return acc;
  }, {});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // ── AI generate (prompt → draft config, pre-fills the form for review) ──
  const [genPrompt, setGenPrompt] = useState("");
  const [genBusy, setGenBusy] = useState(false);
  const [genError, setGenError] = useState<string | null>(null);

  async function generate() {
    if (!token || !genPrompt.trim() || genBusy) return;
    setGenBusy(true);
    setGenError(null);
    try {
      const refId = `gen-agent-${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
      const draft = await generateAgentConfig(
        runChat,
        token,
        genPrompt.trim(),
        refId,
        models.map((m) => m.id),
      );
      setName(draft.name);
      setDescription(draft.description);
      setSystemPrompt(draft.systemPrompt);
      setModel(draft.model);
      setPlugins(draft.plugins);
    } catch (e) {
      setGenError(e instanceof Error ? e.message : "Generation failed");
    } finally {
      setGenBusy(false);
    }
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!token || !name.trim()) return;
    setBusy(true);
    setError(null);
    try {
      await create({ token, name, description: description || undefined, systemPrompt, model, plugins });
      setName("");
      setDescription("");
      setSystemPrompt("");
      setModel("auto");
      setPlugins([]);
      setOpen(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't create agent");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto max-w-5xl space-y-6 px-6 py-8">
      <header className="fade-up flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Agents</h1>
          <p className="mt-1 text-[13px] text-white/45">
            Lightweight agents run on-demand while you're online — no container needed.
          </p>
        </div>
        <Button onClick={() => setOpen((v) => !v)}>
          <Icon.Plus size={14} /> New agent
        </Button>
      </header>

      {open && (
        <Panel className="fade-up p-6">
          <SectionHeading
            title="Create an agent"
            description="A persona + model. Chat runs through ElizaCloud while you're online."
          />
          <div className="mt-4 rounded-xl border border-violet-400/20 bg-violet-400/[0.04] p-3">
            <span className="mb-1.5 flex items-center gap-1.5 text-[12px] font-medium text-white/70">
              <Icon.Sparkles size={13} /> Generate with AI
            </span>
            <div className="flex gap-2">
              <input
                value={genPrompt}
                onChange={(e) => setGenPrompt(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    generate();
                  }
                }}
                placeholder="Describe the agent — e.g. a witty Discord mod that summarizes threads"
                className={`${field} min-w-0 flex-1`}
              />
              <Button type="button" variant="secondary" onClick={generate} disabled={genBusy || !genPrompt.trim()}>
                {genBusy ? "Designing…" : "Generate"}
              </Button>
            </div>
            {genError && <p className="mt-1.5 text-[11px] text-red-400/90">{genError}</p>}
            <p className="mt-1.5 text-[11px] text-white/35">
              Fills the fields below — review and edit before creating.
            </p>
          </div>
          <form onSubmit={submit} className="mt-4 space-y-3">
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Agent name" required className={field} />
            <input value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Short description (optional)" className={field} />
            <textarea
              value={systemPrompt}
              onChange={(e) => setSystemPrompt(e.target.value)}
              placeholder="System prompt — who is this agent and how should it behave?"
              rows={3}
              className={field}
            />
            <div>
              <label htmlFor="agent-model" className="mb-1.5 block text-[12px] font-medium text-white/55">
                Model
              </label>
              <select id="agent-model" value={model} onChange={(e) => setModel(e.target.value)} className={field}>
                <option value="auto">Auto — let Detour Cloud route the best model (recommended)</option>
                {Object.entries(groups).map(([source, list]) => (
                  <optgroup key={source} label={source}>
                    {list.map((id) => (
                      <option key={id} value={id}>{id}</option>
                    ))}
                  </optgroup>
                ))}
              </select>
              <p className="mt-1.5 text-[11px] text-white/35">
                Leave on Auto and we pick the right model per message. Override only if you need a specific one.
              </p>
            </div>
            <div>
              <label className="mb-1.5 block text-[12px] font-medium text-white/55">
                Plugins {plugins.length > 0 && <span className="text-white/35">· {plugins.length} attached</span>}
              </label>
              <div className="flex flex-wrap gap-1.5">
                {ELIZA_PLUGINS.map((p) => {
                  const on = plugins.includes(p);
                  return (
                    <button
                      key={p}
                      type="button"
                      onClick={() => togglePlugin(p)}
                      className={`rounded-full border px-2.5 py-1 text-[11px] transition ${
                        on
                          ? "border-violet-400/50 bg-violet-400/10 text-white"
                          : "border-white/10 text-white/55 hover:bg-white/5 hover:text-white"
                      }`}
                    >
                      {p.replace(/^plugin-/, "")}
                    </button>
                  );
                })}
              </div>
              <p className="mt-1.5 text-[11px] text-white/35">
                Attach capabilities — connectors (Discord, X, Telegram), tools (web search, browser),
                media, chains. Wire several together.
              </p>
            </div>
            <div className="flex items-center gap-3">
              <Button type="submit" disabled={busy}>
                {busy ? "Creating…" : "Create agent"}
              </Button>
              {error && <span className="text-xs text-red-400/90">{error}</span>}
            </div>
          </form>
        </Panel>
      )}

      {agents === undefined ? (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <Skeleton className="h-32 w-full" />
          <Skeleton className="h-32 w-full" />
        </div>
      ) : agents.length === 0 ? (
        <Panel className="fade-up">
          <EmptyState
            icon={<Icon.Bot size={20} />}
            title="No agents yet"
            description="Create your first agent — give it a name, a personality, and a model."
            action={
              <Button size="sm" variant="secondary" onClick={() => setOpen(true)}>
                <Icon.Plus size={14} /> New agent
              </Button>
            }
          />
        </Panel>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {agents.map((a) => (
            <Panel key={a.id} className="fade-up flex flex-col p-5">
              <div className="flex items-start justify-between gap-2">
                <div className="flex min-w-0 items-center gap-2">
                  <Icon.Bot size={16} />
                  <span className="truncate font-medium text-white">{a.name}</span>
                </div>
                <IconButton label={`Delete ${a.name}`} onClick={() => token && removeAgent({ token, id: a.id })}>
                  <Icon.Trash size={14} />
                </IconButton>
              </div>
              {a.description && (
                <p className="mt-1 line-clamp-2 text-[13px] text-white/45">{a.description}</p>
              )}
              <div className="mt-4 flex items-center justify-between">
                <Badge tone="neutral">{a.model === "auto" ? "Auto" : a.model}</Badge>
                <Button size="sm" variant="secondary" onClick={() => navigate(`/agents/${a.id}`)}>
                  Chat
                </Button>
              </div>
            </Panel>
          ))}
        </div>
      )}

      <Panel className="fade-up p-6">
        <SectionHeading
          title="Deploy & connect"
          description="More ways to bring agents to Detour Cloud — arriving with the builders phase."
        />
        <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
          <Soon icon={<Icon.Zap size={16} />} title="Deploy a HuggingFace model" desc="One-click deploy to ElizaCloud, via Detour." />
          <Soon icon={<Icon.Plug size={16} />} title="Connect an endpoint" desc="Add your own agent's URL or x402 endpoint." />
          <Soon icon={<Icon.Bot size={16} />} title="Link a cloud / app agent" desc="Provision or link agents from the app or your phone." />
        </div>
      </Panel>
    </div>
  );
}

function Soon({ icon, title, desc }: { icon: ReactNode; title: string; desc: string }) {
  return (
    <div className="rounded-xl border border-white/10 bg-white/[0.02] p-4">
      <div className="flex items-center gap-2 text-white/40">
        {icon}
        <span className="text-[10px] uppercase tracking-widest">Soon</span>
      </div>
      <p className="mt-2 text-sm font-medium text-white/80">{title}</p>
      <p className="mt-1 text-[12px] text-white/40">{desc}</p>
    </div>
  );
}
