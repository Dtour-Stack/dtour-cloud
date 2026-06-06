import { useAction, useQuery } from "convex/react";
import { anyApi } from "convex/server";
import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { AppShell } from "@/dashboard/AppShell";
import {
  DTOUR_TEST_SESSION_TOKEN,
  readDtourPlaywrightUser,
} from "@/lib/playwright-dtour-auth";
import { getDtourSessionToken } from "@/lib/session";
import { Badge, Button, buttonClasses, Icon, Panel } from "@/ui";

type Agent = {
  id: string;
  name: string;
  description: string | null;
  model: string;
  plugins: string[];
};

type KnowledgeStatus = {
  configured: boolean;
};

type SaveState = "idle" | "saving" | "saved";

const field =
  "w-full rounded-lg border border-white/15 bg-white/5 px-3 py-2 text-sm text-white outline-none transition placeholder:text-white/30 focus:border-purple-400/50";

export default function DocumentsPage() {
  const testUser = readDtourPlaywrightUser();
  const token = testUser ? DTOUR_TEST_SESSION_TOKEN : getDtourSessionToken();
  const agentsQuery = useQuery(
    anyApi.agents.list,
    token && !testUser ? { token } : "skip",
  ) as
    | Agent[]
    | undefined;
  const agents = testUser ? [] : agentsQuery;
  const status = useAction(anyApi.knowledge.status);
  const addDocument = useAction(anyApi.knowledge.addDocument);
  const reindexAgent = useAction(anyApi.knowledge.reindexAgent);
  const [selectedAgentId, setSelectedAgentId] = useState("");
  const [knowledgeStatus, setKnowledgeStatus] = useState<KnowledgeStatus | null>(null);
  const [statusError, setStatusError] = useState<string | null>(null);
  const [title, setTitle] = useState("");
  const [text, setText] = useState("");
  const [saveState, setSaveState] = useState<SaveState>("idle");
  const [formError, setFormError] = useState<string | null>(null);
  const [reindexing, setReindexing] = useState<string | null>(null);

  const selectedAgent = useMemo(
    () => agents?.find((agent) => agent.id === selectedAgentId) ?? null,
    [agents, selectedAgentId],
  );

  useEffect(() => {
    if (!agents?.length || selectedAgentId) return;
    setSelectedAgentId(agents[0].id);
  }, [agents, selectedAgentId]);

  useEffect(() => {
    if (testUser) {
      setKnowledgeStatus({ configured: true });
      return;
    }
    if (!token) return;
    setStatusError(null);
    void status({ token })
      .then((result) => setKnowledgeStatus(result as KnowledgeStatus))
      .catch((error) => {
        setKnowledgeStatus(null);
        setStatusError(error instanceof Error ? error.message : String(error));
      });
  }, [token, testUser, status]);

  async function save() {
    if (!token || !selectedAgent) return;
    const body = text.trim();
    if (!body) {
      setFormError("Document text is required.");
      return;
    }
    setSaveState("saving");
    setFormError(null);
    try {
      await addDocument({
        token,
        agentId: selectedAgent.id,
        title: title.trim() || "Knowledge",
        text: body,
      });
      setTitle("");
      setText("");
      setSaveState("saved");
    } catch (error) {
      setFormError(error instanceof Error ? error.message : String(error));
      setSaveState("idle");
    }
  }

  async function reindex(agentId: string) {
    if (!token) return;
    setReindexing(agentId);
    setFormError(null);
    try {
      await reindexAgent({ token, agentId });
    } catch (error) {
      setFormError(error instanceof Error ? error.message : String(error));
    } finally {
      setReindexing(null);
    }
  }

  return (
    <AppShell title="Documents">
      <div className="mx-auto max-w-5xl space-y-6 px-6 py-8">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-xl font-semibold text-white">Documents & memories</h1>
              <Badge tone="accent">Open beta</Badge>
            </div>
            <p className="mt-1 max-w-2xl text-sm text-white/50">
              Add knowledge to an agent's RAG namespace and re-index its instructions when the
              character changes.
            </p>
          </div>
          <Link to="/agents" className={buttonClasses("secondary", "sm")}>
            <Icon.Bot size={14} />
            Agents
          </Link>
        </div>

        {statusError && (
          <Panel className="border-amber-400/25 bg-amber-400/[0.06] px-4 py-3 text-sm text-amber-100/90">
            {statusError}
          </Panel>
        )}

        {knowledgeStatus?.configured === false && (
          <Panel className="border-amber-400/25 bg-amber-400/[0.06] px-4 py-3 text-sm text-amber-100/90">
            Knowledge search is waiting on an embedding provider key in Convex.
          </Panel>
        )}

        {agents === undefined ? (
          <Panel className="p-5 text-sm text-white/45">Loading agents...</Panel>
        ) : agents.length === 0 ? (
          <Panel className="p-8 text-center">
            <div className="mx-auto flex h-10 w-10 items-center justify-center rounded-xl border border-white/10 bg-white/[0.04] text-white/50">
              <Icon.BookOpen size={18} />
            </div>
            <h2 className="mt-4 text-sm font-semibold text-white">No agents yet</h2>
            <p className="mx-auto mt-1 max-w-sm text-sm text-white/45">
              Create an agent first, then attach documents and memories to its knowledge base.
            </p>
            <Link to="/agents" className={buttonClasses("primary", "sm", "mt-4")}>
              Build an agent
            </Link>
          </Panel>
        ) : (
          <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(320px,420px)]">
            <Panel className="overflow-hidden">
              <div className="border-b border-white/10 px-4 py-3">
                <h2 className="text-sm font-semibold text-white">Agent knowledge stores</h2>
              </div>
              <div className="divide-y divide-white/5">
                {agents.map((agent) => (
                  <div
                    key={agent.id}
                    className="flex items-start justify-between gap-3 px-4 py-3 transition hover:bg-white/[0.04]"
                  >
                    <button
                      type="button"
                      onClick={() => setSelectedAgentId(agent.id)}
                      className="min-w-0 flex-1 rounded-lg text-left transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-purple-400/60"
                    >
                      <span className="block truncate text-sm font-medium text-white">
                        {agent.name}
                      </span>
                      <span className="mt-1 block truncate text-xs text-white/40">
                        {agent.model}
                        {agent.plugins.length ? ` · ${agent.plugins.length} plugin(s)` : ""}
                      </span>
                      {agent.description && (
                        <span className="mt-1 block max-h-9 overflow-hidden text-xs text-white/45">
                          {agent.description}
                        </span>
                      )}
                    </button>
                    <div className="flex shrink-0 items-center gap-2">
                      {selectedAgentId === agent.id && <Badge>Selected</Badge>}
                      <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        disabled={reindexing === agent.id}
                        onClick={(event) => {
                          event.stopPropagation();
                          void reindex(agent.id);
                        }}
                      >
                        {reindexing === agent.id ? "Indexing" : "Re-index"}
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            </Panel>

            <Panel className="p-4">
              <div className="flex items-center gap-2">
                <Icon.BookOpen size={16} />
                <h2 className="text-sm font-semibold text-white">Add document</h2>
              </div>
              <div className="mt-4 space-y-3">
                <label className="block">
                  <span className="mb-1.5 block text-xs uppercase tracking-widest text-white/45">
                    Agent
                  </span>
                  <select
                    value={selectedAgentId}
                    onChange={(event) => setSelectedAgentId(event.target.value)}
                    className={field}
                  >
                    {agents.map((agent) => (
                      <option key={agent.id} value={agent.id}>
                        {agent.name}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="block">
                  <span className="mb-1.5 block text-xs uppercase tracking-widest text-white/45">
                    Title
                  </span>
                  <input
                    value={title}
                    onChange={(event) => setTitle(event.target.value)}
                    placeholder="Support playbook"
                    className={field}
                    autoComplete="off"
                  />
                </label>
                <label className="block">
                  <span className="mb-1.5 block text-xs uppercase tracking-widest text-white/45">
                    Text
                  </span>
                  <textarea
                    value={text}
                    onChange={(event) => setText(event.target.value)}
                    placeholder="Paste the knowledge this agent should retrieve."
                    className={`${field} min-h-40 resize-y`}
                  />
                </label>
                {formError && (
                  <div className="rounded-lg border border-red-400/20 bg-red-400/[0.06] px-3 py-2 text-xs text-red-200">
                    {formError}
                  </div>
                )}
                {saveState === "saved" && (
                  <div className="rounded-lg border border-emerald-400/20 bg-emerald-400/[0.06] px-3 py-2 text-xs text-emerald-200">
                    Document indexed for {selectedAgent?.name ?? "the selected agent"}.
                  </div>
                )}
                <Button
                  type="button"
                  className="w-full"
                  disabled={!selectedAgent || saveState === "saving"}
                  onClick={() => void save()}
                >
                  <Icon.Plus size={14} />
                  {saveState === "saving" ? "Adding..." : "Add to knowledge"}
                </Button>
              </div>
            </Panel>
          </div>
        )}
      </div>
    </AppShell>
  );
}
