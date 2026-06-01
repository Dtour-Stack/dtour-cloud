import { useMutation, useQuery } from "convex/react";
import { anyApi } from "convex/server";
import { useEffect, useState } from "react";
import { cn } from "@/ui";

type AgentRow = {
  id: string;
  name: string;
  model: string;
  plugins: string[];
};

type Msg = {
  id: string;
  role: string;
  content: string;
  pending?: boolean;
};

export function DraftLabSection({ token }: { token: string | null }) {
  const agents = useQuery(
    anyApi.agents.list,
    token ? { token } : "skip",
  ) as AgentRow[] | undefined;
  const hint = useQuery(anyApi.draftLab.labHint, {});
  const quickTurn = useMutation(anyApi.draftLab.quickTurn);

  const [agentId, setAgentId] = useState<string>("");
  const [chatId, setChatId] = useState<string | null>(null);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const messages = useQuery(
    anyApi.agents.messages,
    token && chatId ? { token, chatId } : "skip",
  ) as Msg[] | undefined;

  useEffect(() => {
    if (!agentId && agents?.length) setAgentId(agents[0]!.id);
  }, [agents, agentId]);

  const selected = agents?.find((a) => a.id === agentId);

  async function send() {
    if (!token || !agentId || !input.trim()) return;
    setBusy(true);
    setErr(null);
    try {
      const res = (await quickTurn({
        token,
        agentId: agentId as never,
        message: input.trim(),
        ...(chatId ? { chatId: chatId as never } : {}),
      })) as { chatId: string };
      setChatId(res.chatId);
      setInput("");
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Turn failed");
    } finally {
      setBusy(false);
    }
  }

  if (!token) return null;

  return (
    <section data-tour="coding-draft-lab">
      <h3 className="mb-2 text-[10px] font-semibold uppercase tracking-widest text-white/35">
        Draft agent lab
      </h3>
      <p className="mb-2 text-[10px] leading-relaxed text-white/40">
        {hint?.summary ??
          "Smoke-test persona, plugins, and prompts on your lightweight agent (inference credits)."}
      </p>
      {!agents?.length ? (
        <p className="text-[11px] text-amber-200/80">
          Create an agent under <span className="text-white/70">Agents</span> first.
        </p>
      ) : (
        <>
          <select
            value={agentId}
            onChange={(e) => {
              setAgentId(e.target.value);
              setChatId(null);
            }}
            className="mb-2 w-full rounded-lg border border-white/12 bg-black/40 px-2 py-1.5 text-[12px] text-white focus:border-violet-400/40 focus:outline-none"
          >
            {agents.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name} · {a.model}
              </option>
            ))}
          </select>
          {selected && selected.plugins.length > 0 && (
            <p className="mb-2 font-mono text-[9px] text-white/35">
              plugins: {selected.plugins.join(", ")}
            </p>
          )}
          {chatId && messages && messages.length > 0 && (
            <div className="mb-2 max-h-28 overflow-y-auto rounded-lg border border-white/8 bg-black/30 p-2 text-[10px] leading-relaxed text-white/60">
              {messages.slice(-6).map((m) => (
                <div key={m.id} className={cn("mb-1", m.role === "user" && "text-violet-200/90")}>
                  <span className="text-white/30">{m.role === "user" ? "you" : "agent"}: </span>
                  {m.pending ? "…" : m.content.slice(0, 280)}
                  {!m.pending && m.content.length > 280 ? "…" : ""}
                </div>
              ))}
            </div>
          )}
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            rows={2}
            placeholder="Test prompt or workflow instruction…"
            className="mb-2 w-full resize-none rounded-lg border border-white/12 bg-black/40 px-2.5 py-2 text-[12px] text-white placeholder:text-white/30 focus:border-violet-400/40 focus:outline-none"
          />
          <button
            type="button"
            disabled={busy || !input.trim()}
            onClick={() => void send()}
            className="mb-1 w-full rounded-lg bg-violet-500/20 py-2 text-[12px] font-medium text-violet-100 ring-1 ring-violet-400/30 transition hover:bg-violet-500/30 disabled:opacity-40"
          >
            {busy ? "Running…" : "Run draft turn"}
          </button>
          {err && <p className="text-[10px] text-red-300/90">{err}</p>}
          <p className="mt-1 text-[9px] text-white/35">
            Billed as agent chat inference · open full chat in Agents for history.
          </p>
        </>
      )}
    </section>
  );
}
