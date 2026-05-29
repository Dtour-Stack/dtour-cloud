import { useAction, useMutation, useQuery } from "convex/react";
import { anyApi } from "convex/server";
import {
  type FormEvent,
  type KeyboardEvent,
  type ReactNode,
  type RefObject,
  useEffect,
  useRef,
  useState,
} from "react";
import { useNavigate } from "react-router-dom";
import { Streamdown } from "streamdown";
import { getDtourSessionToken } from "@/lib/session";
import { cn, Icon } from "@/ui";

type Msg = { id: string; role: string; content: string; at: number };
type Agent =
  | { id: string; name: string; description: string | null; systemPrompt: string; model: string }
  | null
  | undefined;

/** Dismiss a popover on outside-click or Escape. */
function useDismiss(open: boolean, ref: RefObject<HTMLElement | null>, close: () => void) {
  useEffect(() => {
    if (!open) return;
    function onDoc(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) close();
    }
    function onKey(e: globalThis.KeyboardEvent) {
      if (e.key === "Escape") close();
    }
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [open, ref, close]);
}

export function AgentChat({ agentId }: { agentId: string }) {
  const navigate = useNavigate();
  const token = getDtourSessionToken();
  const agent = useQuery(
    anyApi.agents.get,
    token ? { token, id: agentId } : "skip",
  ) as Agent;
  const messages = useQuery(
    anyApi.agents.messages,
    token ? { token, agentId } : "skip",
  ) as Msg[] | undefined;
  const chat = useAction(anyApi.agents.chat);
  const clearChat = useMutation(anyApi.agents.clearChat);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [showInstructions, setShowInstructions] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);
  const taRef = useRef<HTMLTextAreaElement>(null);

  // biome-ignore lint/correctness/useExhaustiveDependencies: scroll on new content
  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  function autoGrow() {
    const ta = taRef.current;
    if (!ta) return;
    ta.style.height = "auto";
    ta.style.height = `${Math.min(ta.scrollHeight, 220)}px`;
  }

  async function send(e?: FormEvent) {
    e?.preventDefault();
    const text = input.trim();
    if (!token || !text || sending) return;
    setInput("");
    if (taRef.current) taRef.current.style.height = "auto";
    setSending(true);
    try {
      await chat({ token, agentId, message: text });
    } finally {
      setSending(false);
    }
  }

  function onKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      void send();
    }
  }

  const name = agent === undefined ? "…" : (agent?.name ?? "Agent");
  const hasMessages = !!messages && messages.length > 0;

  return (
    <div className="flex h-full min-h-0 flex-col bg-[#0a0a0a]">
      {/* Header */}
      <header className="flex h-14 shrink-0 items-center gap-3 border-b border-white/10 px-4 md:px-6">
        <button
          type="button"
          aria-label="Back to agents"
          onClick={() => navigate("/agents")}
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-white/50 transition hover:bg-white/10 hover:text-white"
        >
          <Icon.ArrowLeft size={16} />
        </button>
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-white/10 bg-white/[0.04] text-white/70">
          <Icon.Bot size={16} />
        </span>
        <span className="truncate text-sm font-semibold">{name}</span>
        <div className="ml-auto flex items-center gap-1">
          {token && hasMessages && (
            <button
              type="button"
              onClick={() => clearChat({ token, agentId })}
              className="rounded-full px-3 py-1.5 text-[12px] text-white/45 transition hover:bg-white/10 hover:text-white"
            >
              Clear chat
            </button>
          )}
        </div>
      </header>

      {/* Messages */}
      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto w-full max-w-3xl px-4 py-8 md:px-6">
          {messages === undefined ? (
            <p className="mt-12 text-center text-sm text-white/40">Loading…</p>
          ) : !hasMessages ? (
            <div className="mt-[14vh] flex flex-col items-center text-center">
              <span className="flex h-14 w-14 items-center justify-center rounded-2xl border border-white/10 bg-white/[0.03] text-white/70">
                <Icon.Bot size={26} />
              </span>
              <h2 className="mt-5 text-xl font-semibold tracking-tight">{name}</h2>
              <p className="mt-2 max-w-sm text-sm leading-relaxed text-white/45">
                Ask anything. Detour Cloud routes the right model for each message —
                you never have to pick.
              </p>
            </div>
          ) : (
            <div className="space-y-7">
              {messages.map((m) =>
                m.role === "user" ? (
                  <div key={m.id} className="flex justify-end">
                    <div className="max-w-[80%] whitespace-pre-wrap break-words rounded-2xl rounded-br-md bg-white px-4 py-2.5 text-[14.5px] leading-relaxed text-black">
                      {m.content}
                    </div>
                  </div>
                ) : (
                  <div key={m.id} className="flex gap-3">
                    <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-white/10 bg-white/[0.04] text-white/60">
                      <Icon.Bot size={14} />
                    </span>
                    <div className="min-w-0 flex-1">
                      {m.content === "" ? (
                        <TypingDots />
                      ) : (
                        <div className="prose-chat text-[14.5px] leading-relaxed text-white/90">
                          <Streamdown>{m.content}</Streamdown>
                        </div>
                      )}
                    </div>
                  </div>
                ),
              )}
            </div>
          )}
          <div ref={endRef} className="h-px" />
        </div>
      </div>

      {/* Composer */}
      <div className="shrink-0 px-4 pb-4 md:px-6">
        <div className="mx-auto w-full max-w-3xl">
          <Composer
            agentId={agentId}
            model={agent?.model ?? "auto"}
            input={input}
            sending={sending}
            taRef={taRef}
            onChange={(v) => {
              setInput(v);
              autoGrow();
            }}
            onKeyDown={onKeyDown}
            onSubmit={send}
            placeholder={`Message ${agent?.name ?? "agent"}…`}
            onOpenInstructions={() => setShowInstructions(true)}
          />
          <p className="mt-2 text-center text-[11px] text-white/25">
            Detour Cloud routes the model · Enter to send · Shift+Enter for a new line
          </p>
        </div>
      </div>

      {showInstructions && agent && (
        <InstructionsModal
          name={agent.name}
          systemPrompt={agent.systemPrompt}
          onClose={() => setShowInstructions(false)}
        />
      )}
    </div>
  );
}

// ── Composer ──────────────────────────────────────────────────────────────

function Composer({
  agentId,
  model,
  input,
  sending,
  taRef,
  onChange,
  onKeyDown,
  onSubmit,
  placeholder,
  onOpenInstructions,
}: {
  agentId: string;
  model: string;
  input: string;
  sending: boolean;
  taRef: RefObject<HTMLTextAreaElement | null>;
  onChange: (v: string) => void;
  onKeyDown: (e: KeyboardEvent<HTMLTextAreaElement>) => void;
  onSubmit: (e?: FormEvent) => void;
  placeholder: string;
  onOpenInstructions: () => void;
}) {
  return (
    <form
      onSubmit={onSubmit}
      className="rounded-[1.5rem] border border-white/12 bg-white/[0.04] transition focus-within:border-purple-400/40"
    >
      <textarea
        ref={taRef}
        value={input}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={onKeyDown}
        rows={1}
        placeholder={placeholder}
        className="max-h-56 w-full resize-none bg-transparent px-4 pt-3.5 text-[15px] leading-relaxed text-white placeholder:text-white/30 focus:outline-none"
      />
      <div className="flex items-center gap-1.5 px-2.5 pb-2.5 pt-1">
        <ToolsMenu onOpenInstructions={onOpenInstructions} />
        <ModelMenu agentId={agentId} model={model} />
        <div className="flex-1" />
        <RoundButton label="Voice input (coming soon)" disabled>
          <Icon.Mic size={17} />
        </RoundButton>
        <button
          type="submit"
          disabled={sending || !input.trim()}
          aria-label="Send"
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-white text-black transition hover:shadow-lg hover:shadow-white/10 disabled:cursor-not-allowed disabled:opacity-30"
        >
          <Icon.ArrowUp size={17} />
        </button>
      </div>
    </form>
  );
}

function RoundButton({
  label,
  disabled,
  onClick,
  children,
}: {
  label: string;
  disabled?: boolean;
  onClick?: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      disabled={disabled}
      onClick={onClick}
      className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-white/50 transition hover:bg-white/10 hover:text-white disabled:cursor-not-allowed disabled:opacity-30 disabled:hover:bg-transparent"
    >
      {children}
    </button>
  );
}

// ── Tools menu (the "+" popover) ────────────────────────────────────────────

function ToolsMenu({ onOpenInstructions }: { onOpenInstructions: () => void }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useDismiss(open, ref, () => setOpen(false));

  return (
    <div ref={ref} className="relative">
      <RoundButton label="Tools & attachments" onClick={() => setOpen((v) => !v)}>
        <Icon.Plus size={18} />
      </RoundButton>
      {open && (
        <div className="absolute bottom-full left-0 z-40 mb-2 w-64 overflow-hidden rounded-2xl border border-white/10 bg-[#0d0d0d] p-1.5 shadow-2xl backdrop-blur-xl">
          <MenuItem icon={<Icon.Paperclip size={16} />} label="Attach a file" soon />
          <MenuItem icon={<Icon.Image size={16} />} label="Generate images" soon />
          <MenuItem
            icon={<Icon.BookOpen size={16} />}
            label="Instructions"
            onClick={() => {
              setOpen(false);
              onOpenInstructions();
            }}
          />
          <MenuItem icon={<Icon.Plug size={16} />} label="MCP tools" soon />
          <MenuItem icon={<Icon.Zap size={16} />} label="Auto-run tools" soon />
        </div>
      )}
    </div>
  );
}

function MenuItem({
  icon,
  label,
  soon,
  onClick,
}: {
  icon: ReactNode;
  label: string;
  soon?: boolean;
  onClick?: () => void;
}) {
  return (
    <button
      type="button"
      disabled={soon}
      onClick={onClick}
      className={cn(
        "flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-[13.5px] transition",
        soon
          ? "cursor-not-allowed text-white/35"
          : "text-white/85 hover:bg-white/[0.06]",
      )}
    >
      <span className="text-white/55">{icon}</span>
      <span className="flex-1">{label}</span>
      {soon && (
        <span className="rounded-full border border-white/10 px-2 py-0.5 text-[9px] uppercase tracking-widest text-white/35">
          Soon
        </span>
      )}
    </button>
  );
}

// ── Model menu (in-chat routing) ────────────────────────────────────────────

function ModelMenu({ agentId, model }: { agentId: string; model: string }) {
  const token = getDtourSessionToken();
  const listModels = useAction(anyApi.agents.listModels);
  const setModel = useMutation(anyApi.agents.setModel);
  const [models, setModels] = useState<{ id: string; source: string }[]>([]);
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useDismiss(open, ref, () => setOpen(false));

  useEffect(() => {
    if (!token || !open || models.length) return;
    listModels({ token })
      .then((r: { id: string; source: string }[]) => setModels(r))
      .catch(() => {});
  }, [token, open, models.length, listModels]);

  const label = model === "auto" || !model ? "Auto" : model;

  async function pick(id: string) {
    setOpen(false);
    if (!token || id === model) return;
    await setModel({ token, id: agentId, model: id });
  }

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className="flex h-9 max-w-[180px] items-center gap-1.5 rounded-full border border-white/12 bg-white/5 px-3 text-[12px] text-white/75 transition hover:bg-white/10"
      >
        <Icon.Sparkles size={13} />
        <span className="truncate">{label}</span>
        <Icon.ChevronDown size={13} />
      </button>
      {open && (
        <div
          role="menu"
          className="absolute bottom-full left-0 z-40 mb-2 max-h-72 w-64 overflow-y-auto rounded-2xl border border-white/10 bg-[#0d0d0d] p-1.5 shadow-2xl backdrop-blur-xl"
        >
          <ModelOption
            label="Auto"
            hint="Detour Cloud picks the best model"
            active={model === "auto" || !model}
            onClick={() => pick("auto")}
          />
          {models.length > 0 && (
            <div className="my-1 px-3 text-[9px] uppercase tracking-widest text-white/30">
              Detour Cloud
            </div>
          )}
          {models.map((m) => (
            <ModelOption
              key={m.id}
              label={m.id}
              active={m.id === model}
              onClick={() => pick(m.id)}
            />
          ))}
          {!models.length && (
            <p className="px-3 py-2 text-[11px] leading-relaxed text-white/30">
              Live model list loads once an admin sets the ElizaCloud API key.
            </p>
          )}
        </div>
      )}
    </div>
  );
}

function ModelOption({
  label,
  hint,
  active,
  onClick,
}: {
  label: string;
  hint?: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      role="menuitem"
      onClick={onClick}
      className={cn(
        "flex w-full items-start gap-2 rounded-xl px-3 py-2 text-left transition",
        active ? "bg-white/[0.07]" : "hover:bg-white/[0.05]",
      )}
    >
      <div className="min-w-0 flex-1">
        <div className="truncate text-[13px] text-white/90">{label}</div>
        {hint && <div className="text-[11px] text-white/35">{hint}</div>}
      </div>
      {active && <Icon.Check size={14} />}
    </button>
  );
}

// ── Instructions modal (agent system prompt) ────────────────────────────────

function InstructionsModal({
  name,
  systemPrompt,
  onClose,
}: {
  name: string;
  systemPrompt: string;
  onClose: () => void;
}) {
  useEffect(() => {
    function onKey(e: globalThis.KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <button
        type="button"
        aria-label="Close"
        onClick={onClose}
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
      />
      <div className="relative z-10 w-full max-w-lg overflow-hidden rounded-2xl border border-white/10 bg-[#0d0d0d] shadow-2xl">
        <div className="flex items-center justify-between border-b border-white/10 px-5 py-3.5">
          <div className="flex items-center gap-2">
            <Icon.BookOpen size={16} />
            <span className="text-sm font-semibold">Instructions · {name}</span>
          </div>
          <button
            type="button"
            aria-label="Close"
            onClick={onClose}
            className="flex h-7 w-7 items-center justify-center rounded-full text-white/50 transition hover:bg-white/10 hover:text-white"
          >
            <Icon.X size={15} />
          </button>
        </div>
        <div className="max-h-[60vh] overflow-y-auto px-5 py-4">
          <p className="whitespace-pre-wrap text-[13.5px] leading-relaxed text-white/80">
            {systemPrompt?.trim() || "No instructions set for this agent."}
          </p>
        </div>
      </div>
    </div>
  );
}

function TypingDots() {
  return (
    <span className="inline-flex items-center gap-1 py-1.5" aria-label="thinking">
      {[0, 150, 300].map((d) => (
        <span
          key={d}
          className="h-1.5 w-1.5 rounded-full bg-white/40 motion-safe:animate-bounce"
          style={{ animationDelay: `${d}ms` }}
        />
      ))}
    </span>
  );
}
