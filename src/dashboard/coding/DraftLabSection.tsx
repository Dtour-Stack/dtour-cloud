import { useMutation, useQuery } from "convex/react";
import { anyApi } from "convex/server";
import { useEffect, useState } from "react";
import {
  AiConversationContent,
  AiMessageBubble,
  AiMessageResponse,
  AiPromptInputFooter,
  AiPromptInputFrame,
  AiPromptInputTextarea,
  AiPromptSubmit,
} from "@/ui/ai-elements";

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

export function DraftLabSection({
  token,
  showHeading = true,
}: {
  token: string | null;
  showHeading?: boolean;
}) {
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
    if (busy || !token || !agentId || !input.trim()) return;
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
      {showHeading && (
        <>
          <h3 className="mb-2 text-[10px] font-semibold uppercase tracking-widest text-white/35">
            Draft agent lab
          </h3>
          <p className="mb-2 text-[10px] leading-relaxed text-white/40">
            {hint?.summary ??
              "Smoke-test persona, plugins, and prompts on your lightweight agent (inference credits)."}
          </p>
        </>
      )}
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
            <div className="mb-2 max-h-44 overflow-y-auto rounded-xl border border-white/8 bg-black/30 p-2">
              <AiConversationContent className="space-y-2">
                {messages.slice(-6).map((m) => {
                  const body = m.pending ? "..." : m.content.slice(0, 280);
                  const displayBody = !m.pending && m.content.length > 280 ? `${body}...` : body;

                  return (
                    <div
                      key={m.id}
                      className={m.role === "user" ? "flex justify-end" : "flex justify-start"}
                    >
                      <AiMessageBubble
                        from={m.role === "user" ? "user" : "assistant"}
                        className={
                          m.role === "user"
                            ? "max-w-[92%] px-3 py-2 text-[12px]"
                            : "max-w-[92%] rounded-xl border border-white/8 bg-white/[0.03] px-3 py-2 text-[12px] leading-relaxed text-white/70"
                        }
                      >
                        {m.role === "user" ? (
                          displayBody
                        ) : (
                          <AiMessageResponse>{displayBody}</AiMessageResponse>
                        )}
                      </AiMessageBubble>
                    </div>
                  );
                })}
              </AiConversationContent>
            </div>
          )}
          <AiPromptInputFrame
            className="mb-2 rounded-xl bg-black/40"
            onSubmit={(e) => {
              e.preventDefault();
              void send();
            }}
          >
            <AiPromptInputTextarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              rows={2}
              placeholder="Test prompt or workflow instruction..."
              className="min-h-16 px-3 py-2 text-[12px]"
            />
            <AiPromptInputFooter className="px-2 pb-2">
              <span className="truncate text-[10px] text-white/35">
                {selected?.model ?? "Auto"}
              </span>
              <div className="flex-1" />
              <AiPromptSubmit
                disabled={busy || !input.trim()}
                sending={busy}
                className="h-8 w-8"
              />
            </AiPromptInputFooter>
          </AiPromptInputFrame>
          {err && <p className="text-[10px] text-red-300/90">{err}</p>}
          <p className="mt-1 text-[9px] text-white/35">
            Billed as agent chat inference · open full chat in Agents for history.
          </p>
        </>
      )}
    </section>
  );
}
