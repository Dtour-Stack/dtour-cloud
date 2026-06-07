import { useAction, useMutation, useQuery } from "convex/react";
import { anyApi } from "convex/server";
import { type FormEvent, type ReactNode, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ELIZA_PLUGINS } from "@/dashboard/design/workflow/registry";
import { getDtourSessionToken } from "@/lib/session";
import { useFlags } from "@/lib/useFlags";
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
import { generateAgentConfig } from "./aiGenerate";

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
  const freetour = useQuery(anyApi.inference.freetourStatus, token ? { token } : "skip") as
    | { used: number; cap: number; remaining: number }
    | undefined;
  const flags = useFlags();
  const showFreetourOption = flags.freetour_user_visible && flags.freetour_enabled;
  const freetourPaused = !flags.freetour_enabled;
  const [models, setModels] = useState<{ id: string; free?: boolean }[]>([]);

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
      .then((r: { id: string; free?: boolean }[]) => setModels(r))
      .catch(() => {});
  }, [token, listModels]);

  const freeModelIds = models.filter((m) => m.free && m.id !== "freetour").map((m) => m.id);
  const paidModelIds = models.filter((m) => !m.free && m.id !== "freetour").map((m) => m.id);
  const firstAgentId = agents?.[0]?.id ?? null;
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

      {freetourPaused && (
        <div className="fade-up rounded-xl border border-amber-400/20 bg-amber-400/10 px-4 py-3 text-[13px] text-amber-100/90">
          Free-tier inference is paused platform-wide. Use Auto or a paid model, or try again later.
        </div>
      )}

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
                <option value="auto">Auto (recommended)</option>
                {showFreetourOption && (
                  <option value="freetour">Free — rate-limited (no credits used)</option>
                )}
                {freeModelIds.length > 0 && (
                  <optgroup label="Free">
                    {freeModelIds.map((id) => (
                      <option key={id} value={id}>{id}</option>
                    ))}
                  </optgroup>
                )}
                {paidModelIds.length > 0 && (
                  <optgroup label="Models">
                    {paidModelIds.map((id) => (
                      <option key={id} value={id}>{id}</option>
                    ))}
                  </optgroup>
                )}
              </select>
              <p className="mt-1.5 text-[11px] text-white/35">
                {model === "freetour" ? (
                  <>
                    Routes to free models — no credits used, but rate-limited, so replies may be slower or
                    ask you to retry.
                    {freetour && ` ${freetour.remaining}/${freetour.cap} free messages left today.`}
                  </>
                ) : (
                  "Leave on Auto and we pick the right model per message. Override only if you need a specific one."
                )}
              </p>
            </div>
            <div>
              <div className="mb-1.5 text-[12px] font-medium text-white/55">
                Plugins {plugins.length > 0 && <span className="text-white/35">· {plugins.length} attached</span>}
              </div>
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
            squirrel
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
                <Badge tone="neutral">{a.model === "auto" ? "Auto" : a.model === "freetour" ? "Free" : a.model}</Badge>
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
          description="Deploy Detour runtimes, connect outside endpoints, and migrate existing cloud/app agents into the same mesh."
        />
        <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
          <ConnectCard
            icon={<Icon.Zap size={16} />}
            label="Deploy"
            title="Deploy a HuggingFace model"
            desc="Use Agent Cloud to deploy 24/7 or connect a Hugging Face endpoint through Detour."
            actionLabel={firstAgentId ? "Open deploy controls" : "Create agent first"}
            onClick={() =>
              firstAgentId
                ? navigate(`/agents/${firstAgentId}?panel=cloud&connect=huggingface`)
                : setOpen(true)
            }
          />
          <ConnectCard
            icon={<Icon.Plug size={16} />}
            label="Connect"
            title="Connect an endpoint"
            desc="Add API, A2A, MCP, x402, auth, and mesh details for an agent hosted somewhere else."
            actionLabel={firstAgentId ? "Connect endpoint" : "Create agent first"}
            onClick={() =>
              firstAgentId
                ? navigate(`/agents/${firstAgentId}?panel=cloud&connect=endpoint`)
                : setOpen(true)
            }
          />
          <ConnectCard
            icon={<Icon.Bot size={16} />}
            label="Migrate"
            title="Link a cloud / app agent"
            desc="Start the migration helper and reuse the linked agent across workflows and cloud builder."
            actionLabel={firstAgentId ? "Start migration" : "Create agent first"}
            onClick={() =>
              firstAgentId
                ? navigate(`/agents/${firstAgentId}?panel=cloud&connect=migration`)
                : setOpen(true)
            }
          />
        </div>
      </Panel>
    </div>
  );
}

function ConnectCard({
  icon,
  label,
  title,
  desc,
  actionLabel,
  onClick,
}: {
  icon: ReactNode;
  label: string;
  title: string;
  desc: string;
  actionLabel: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="rounded-xl border border-white/10 bg-white/[0.02] p-4 text-left transition hover:border-white/20 hover:bg-white/[0.04] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-purple-400/60"
    >
      <div className="flex items-center gap-2 text-white/45">
        {icon}
        <span className="text-[10px] uppercase tracking-widest">{label}</span>
      </div>
      <p className="mt-2 text-sm font-medium text-white/80">{title}</p>
      <p className="mt-1 text-[12px] text-white/40">{desc}</p>
      <span className="mt-3 inline-flex items-center gap-1.5 text-[12px] font-medium text-purple-200">
        {actionLabel} <Icon.ArrowUpRight size={13} />
      </span>
    </button>
  );
}
