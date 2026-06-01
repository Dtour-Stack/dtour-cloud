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
import { useNavigate, useSearchParams } from "react-router-dom";
import { Streamdown } from "streamdown";
import { GalleryPicker } from "@/dashboard/gallery/GalleryPicker";
import {
  buildChatMenuItems,
  chatGalleryAttachEnabled,
  chatVoiceInputEnabled,
  readAutoRunTools,
  writeAutoRunTools,
  type ChatMenuActionId,
} from "@/lib/chatComposerMenu";
import { getDtourSessionToken } from "@/lib/session";
import { useFlags } from "@/lib/useFlags";
import { cn, Icon } from "@/ui";

import { AgentTurnPanel } from "./AgentTurnPanel";
import { ElizaPluginsModal } from "./ElizaPluginsModal";
import { GenerateImageModal } from "./GenerateImageModal";
import { McpToolsModal } from "./McpToolsModal";

type Msg = {
  id: string;
  role: string;
  content: string;
  imageUrl?: string | null;
  trace?: string | null;
  at: number;
};
type Agent =
  | {
      id: string;
      name: string;
      description: string | null;
      systemPrompt: string;
      model: string;
      plugins: string[];
    }
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
  const [searchParams, setSearchParams] = useSearchParams();
  const chatId = searchParams.get("chat");
  const token = getDtourSessionToken();
  const agent = useQuery(
    anyApi.agents.get,
    token ? { token, id: agentId } : "skip",
  ) as Agent;
  const messages = useQuery(
    anyApi.agents.messages,
    token && chatId ? { token, chatId } : "skip",
  ) as Msg[] | undefined;
  const getOrCreateDefaultChat = useMutation(anyApi.agents.getOrCreateDefaultChat);
  const createChat = useMutation(anyApi.agents.createChat);
  const chat = useMutation(anyApi.agents.chat);
  const clearChat = useMutation(anyApi.agents.clearChat);
  const flags = useFlags();
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [showInstructions, setShowInstructions] = useState(false);
  const [showGenerateImage, setShowGenerateImage] = useState(false);
  const [showMcpTools, setShowMcpTools] = useState(false);
  const [showElizaPlugins, setShowElizaPlugins] = useState(false);
  const [attachUrl, setAttachUrl] = useState<string | null>(null); // gallery image
  const [pickerOpen, setPickerOpen] = useState(false);
  const [autoRunTools, setAutoRunTools] = useState(() => readAutoRunTools(agentId));
  const [panelOpen, setPanelOpen] = useState(true);
  const [selectedTurnId, setSelectedTurnId] = useState<string | null>(null);
  const endRef = useRef<HTMLDivElement>(null);
  const taRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    setAutoRunTools(readAutoRunTools(agentId));
  }, [agentId]);

  useEffect(() => {
    if (!token || chatId) return;
    void getOrCreateDefaultChat({ token, agentId }).then(({ chatId: id }) => {
      setSearchParams({ chat: id }, { replace: true });
    });
  }, [token, agentId, chatId, getOrCreateDefaultChat, setSearchParams]);

  async function startNewChat() {
    if (!token) return;
    const { chatId: id } = (await createChat({ token, agentId })) as { chatId: string };
    setSearchParams({ chat: id });
    setSelectedTurnId(null);
  }

  // biome-ignore lint/correctness/useExhaustiveDependencies: scroll on new content
  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const assistantMessages = messages?.filter((m) => m.role === "assistant") ?? [];
  const latestAssistantId = assistantMessages.at(-1)?.id ?? null;

  useEffect(() => {
    if (sending && latestAssistantId) {
      setSelectedTurnId(latestAssistantId);
      setPanelOpen(true);
      return;
    }
    if (!selectedTurnId && latestAssistantId) {
      setSelectedTurnId(latestAssistantId);
    }
  }, [sending, latestAssistantId, selectedTurnId]);

  const selectedTrace =
    assistantMessages.find((m) => m.id === selectedTurnId)?.trace ??
    (sending ? assistantMessages.at(-1)?.trace ?? null : null);

  function autoGrow() {
    const ta = taRef.current;
    if (!ta) return;
    ta.style.height = "auto";
    ta.style.height = `${Math.min(ta.scrollHeight, 220)}px`;
  }

  async function send(e?: FormEvent) {
    e?.preventDefault();
    const text = input.trim();
    if (!token || !chatId || (!text && !attachUrl) || sending) return;
    const img = attachUrl;
    setInput("");
    setAttachUrl(null);
    if (taRef.current) taRef.current.style.height = "auto";
    setSending(true);
    try {
      await chat({ token, agentId, chatId, message: text, imageUrl: img ?? undefined });
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
    <div className="flex h-full min-h-0 bg-[#0a0a0a]">
      <div className="flex min-w-0 flex-1 flex-col">
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
          <button
            type="button"
            onClick={() => void startNewChat()}
            className="flex h-8 items-center gap-1.5 rounded-full px-3 text-[12px] text-white/45 transition hover:bg-white/10 hover:text-white"
          >
            <Icon.SquarePen size={14} />
            New chat
          </button>
          <button
            type="button"
            onClick={() => setPanelOpen((v) => !v)}
            className={cn(
              "flex h-8 items-center gap-1.5 rounded-full px-3 text-[12px] transition",
              panelOpen
                ? "bg-white/10 text-white"
                : "text-white/45 hover:bg-white/10 hover:text-white",
            )}
          >
            <Icon.PanelRight size={14} />
            Context
          </button>
          {token && chatId && hasMessages && (
            <button
              type="button"
              onClick={() => clearChat({ token, chatId })}
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
                  <div key={m.id} className="flex flex-col items-end gap-1.5">
                    {m.imageUrl && (
                      <img
                        src={m.imageUrl}
                        alt="attachment"
                        className="max-h-56 max-w-[60%] rounded-2xl rounded-br-md border border-white/10 object-cover"
                      />
                    )}
                    {m.content && (
                      <div className="max-w-[80%] whitespace-pre-wrap break-words rounded-2xl rounded-br-md bg-white px-4 py-2.5 text-[14.5px] leading-relaxed text-black">
                        {m.content}
                      </div>
                    )}
                  </div>
                ) : (
                  <button
                    type="button"
                    key={m.id}
                    onClick={() => {
                      setSelectedTurnId(m.id);
                      setPanelOpen(true);
                    }}
                    className={cn(
                      "flex w-full gap-3 rounded-xl px-2 py-1 text-left transition",
                      selectedTurnId === m.id && panelOpen
                        ? "bg-white/[0.04] ring-1 ring-purple-400/25"
                        : "hover:bg-white/[0.03]",
                    )}
                  >
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
                  </button>
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
            attachUrl={attachUrl}
            showGalleryButton={chatGalleryAttachEnabled(flags)}
            showVoiceButton={chatVoiceInputEnabled(flags)}
            autoRunTools={autoRunTools}
            onAttachClick={() => setPickerOpen(true)}
            onClearAttach={() => setAttachUrl(null)}
            onChange={(v) => {
              setInput(v);
              autoGrow();
            }}
            onKeyDown={onKeyDown}
            onSubmit={send}
            placeholder={`Message ${agent?.name ?? "agent"}…`}
            onOpenInstructions={() => setShowInstructions(true)}
            onOpenGenerateImage={() => setShowGenerateImage(true)}
            onOpenMcpTools={() => setShowMcpTools(true)}
            onOpenElizaPlugins={() => setShowElizaPlugins(true)}
            onOpenDesignStudio={() => navigate(`/design?agent=${agentId}`)}
            onToggleAutoRun={() => {
              const next = !autoRunTools;
              writeAutoRunTools(agentId, next);
              setAutoRunTools(next);
            }}
          />
          <p className="mt-2 text-center text-[11px] text-white/25">
            Detour Cloud routes the model · Enter to send · Shift+Enter for a new line
          </p>
        </div>
      </div>
      </div>

      {panelOpen && (
        <>
          <AgentTurnPanel
            traceRaw={selectedTrace ?? null}
            sending={sending}
            agentName={name}
            onClose={() => setPanelOpen(false)}
            className="hidden w-[min(380px,38vw)] shrink-0 lg:flex"
          />
          <div className="fixed inset-0 z-50 lg:hidden">
            <button
              type="button"
              aria-label="Close context panel"
              className="absolute inset-0 bg-black/60 backdrop-blur-sm"
              onClick={() => setPanelOpen(false)}
            />
            <AgentTurnPanel
              traceRaw={selectedTrace ?? null}
              sending={sending}
              agentName={name}
              onClose={() => setPanelOpen(false)}
              className="absolute bottom-0 right-0 top-0 w-full max-w-md shadow-2xl"
            />
          </div>
        </>
      )}

      {showInstructions && agent && token && (
        <InstructionsModal
          agentId={agentId}
          token={token}
          name={agent.name}
          systemPrompt={agent.systemPrompt}
          onClose={() => setShowInstructions(false)}
        />
      )}

      {pickerOpen && token && (
        <GalleryPicker
          token={token}
          onPick={(url) => {
            setAttachUrl(url);
            setPickerOpen(false);
          }}
          onClose={() => setPickerOpen(false)}
        />
      )}

      {showGenerateImage && token && (
        <GenerateImageModal
          token={token}
          agentId={agentId}
          onAttach={(url) => setAttachUrl(url)}
          onClose={() => setShowGenerateImage(false)}
        />
      )}

      {showMcpTools && token && (
        <McpToolsModal token={token} onClose={() => setShowMcpTools(false)} />
      )}

      {showElizaPlugins && token && agent && (
        <ElizaPluginsModal
          token={token}
          agentId={agentId}
          initialPlugins={agent.plugins}
          onClose={() => setShowElizaPlugins(false)}
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
  attachUrl,
  showGalleryButton,
  showVoiceButton,
  autoRunTools,
  onAttachClick,
  onClearAttach,
  onChange,
  onKeyDown,
  onSubmit,
  placeholder,
  onOpenInstructions,
  onOpenGenerateImage,
  onOpenMcpTools,
  onOpenElizaPlugins,
  onOpenDesignStudio,
  onToggleAutoRun,
}: {
  agentId: string;
  model: string;
  input: string;
  sending: boolean;
  taRef: RefObject<HTMLTextAreaElement | null>;
  attachUrl: string | null;
  showGalleryButton: boolean;
  showVoiceButton: boolean;
  autoRunTools: boolean;
  onAttachClick: () => void;
  onClearAttach: () => void;
  onChange: (v: string) => void;
  onKeyDown: (e: KeyboardEvent<HTMLTextAreaElement>) => void;
  onSubmit: (e?: FormEvent) => void;
  placeholder: string;
  onOpenInstructions: () => void;
  onOpenGenerateImage: () => void;
  onOpenMcpTools: () => void;
  onOpenElizaPlugins: () => void;
  onOpenDesignStudio: () => void;
  onToggleAutoRun: () => void;
}) {
  return (
    <form
      onSubmit={onSubmit}
      className="rounded-[1.5rem] border border-white/12 bg-white/[0.04] transition focus-within:border-purple-400/40"
    >
      {attachUrl && (
        <div className="px-3 pt-3">
          <div className="relative inline-block">
            <img
              src={attachUrl}
              alt="attachment"
              className="h-16 w-16 rounded-lg border border-white/15 object-cover"
            />
            <button
              type="button"
              aria-label="Remove image"
              onClick={onClearAttach}
              className="absolute -right-1.5 -top-1.5 flex h-5 w-5 items-center justify-center rounded-full border border-white/20 bg-black text-white/80 transition hover:text-white"
            >
              <Icon.X size={11} />
            </button>
          </div>
        </div>
      )}
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
        <ToolsMenu
          autoRunTools={autoRunTools}
          onOpenInstructions={onOpenInstructions}
          onOpenGallery={onAttachClick}
          onOpenGenerateImage={onOpenGenerateImage}
          onOpenMcpTools={onOpenMcpTools}
          onOpenElizaPlugins={onOpenElizaPlugins}
          onOpenDesignStudio={onOpenDesignStudio}
          onToggleAutoRun={onToggleAutoRun}
        />
        {showGalleryButton && (
          <RoundButton label="Attach image from gallery" onClick={onAttachClick}>
            <Icon.Image size={17} />
          </RoundButton>
        )}
        <ModelMenu agentId={agentId} model={model} />
        <div className="flex-1" />
        {showVoiceButton ? (
          <RoundButton label="Voice input (coming soon)" disabled>
            <Icon.Mic size={17} />
          </RoundButton>
        ) : null}
        <button
          type="submit"
          disabled={sending || (!input.trim() && !attachUrl)}
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

function menuIcon(id: ChatMenuActionId): ReactNode {
  switch (id) {
    case "gallery_attach":
      return <Icon.Paperclip size={16} />;
    case "generate_image":
      return <Icon.Image size={16} />;
    case "instructions":
      return <Icon.BookOpen size={16} />;
    case "mcp_tools":
      return <Icon.Plug size={16} />;
    case "manage_mcps":
      return <Icon.Settings size={16} />;
    case "auto_run_tools":
      return <Icon.Zap size={16} />;
    case "eliza_plugins":
      return <Icon.Brain size={16} />;
    case "design_studio":
      return <Icon.Palette size={16} />;
    default:
      return <Icon.Plus size={16} />;
  }
}

function ToolsMenu({
  autoRunTools,
  onOpenInstructions,
  onOpenGallery,
  onOpenGenerateImage,
  onOpenMcpTools,
  onOpenElizaPlugins,
  onOpenDesignStudio,
  onToggleAutoRun,
}: {
  autoRunTools: boolean;
  onOpenInstructions: () => void;
  onOpenGallery: () => void;
  onOpenGenerateImage: () => void;
  onOpenMcpTools: () => void;
  onOpenElizaPlugins: () => void;
  onOpenDesignStudio: () => void;
  onToggleAutoRun: () => void;
}) {
  const flags = useFlags();
  const items = buildChatMenuItems(flags);
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useDismiss(open, ref, () => setOpen(false));

  if (items.length === 0) return null;

  function runAction(id: ChatMenuActionId, available: boolean) {
    if (!available) return;
    setOpen(false);
    switch (id) {
      case "gallery_attach":
        onOpenGallery();
        break;
      case "generate_image":
        onOpenGenerateImage();
        break;
      case "instructions":
        onOpenInstructions();
        break;
      case "mcp_tools":
        onOpenMcpTools();
        break;
      case "manage_mcps":
        navigate("/mcps");
        break;
      case "auto_run_tools":
        onToggleAutoRun();
        break;
      case "eliza_plugins":
        onOpenElizaPlugins();
        break;
      case "design_studio":
        onOpenDesignStudio();
        break;
      default:
        break;
    }
  }

  return (
    <div ref={ref} className="relative">
      <RoundButton label="Tools & attachments" onClick={() => setOpen((v) => !v)}>
        <Icon.Plus size={18} />
      </RoundButton>
      {open && (
        <div className="absolute bottom-full left-0 z-40 mb-2 w-72 overflow-hidden rounded-2xl border border-white/10 bg-[#0d0d0d] p-1.5 shadow-2xl backdrop-blur-xl">
          {items.map((item) => (
            <MenuItem
              key={item.id}
              icon={menuIcon(item.id)}
              label={item.label}
              hint={item.hint}
              badge={item.badge}
              active={item.id === "auto_run_tools" ? autoRunTools : undefined}
              disabled={!item.available}
              onClick={() => {
                if (item.id === "auto_run_tools") {
                  onToggleAutoRun();
                  return;
                }
                runAction(item.id, item.available);
              }}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function MenuItem({
  icon,
  label,
  hint,
  badge,
  active,
  disabled,
  onClick,
}: {
  icon: ReactNode;
  label: string;
  hint?: string;
  badge?: "soon" | "beta";
  active?: boolean;
  disabled?: boolean;
  onClick?: () => void;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      title={hint}
      className={cn(
        "flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left transition",
        disabled
          ? "cursor-not-allowed text-white/35"
          : "text-white/85 hover:bg-white/[0.06]",
      )}
    >
      <span className="text-white/55">{icon}</span>
      <span className="min-w-0 flex-1">
        <span className="block text-[13.5px]">{label}</span>
        {hint && !disabled && (
          <span className="mt-0.5 block truncate text-[11px] text-white/35">{hint}</span>
        )}
      </span>
      {active && (
        <span className="text-emerald-400/90">
          <Icon.Check size={14} />
        </span>
      )}
      {badge === "soon" && (
        <span className="rounded-full border border-white/10 px-2 py-0.5 text-[9px] uppercase tracking-widest text-white/35">
          Soon
        </span>
      )}
      {badge === "beta" && (
        <span className="rounded-full border border-purple-400/30 bg-purple-500/10 px-2 py-0.5 text-[9px] uppercase tracking-widest text-purple-200/80">
          Beta
        </span>
      )}
    </button>
  );
}

// ── Model menu (in-chat routing) ────────────────────────────────────────────

function modelPickerLabel(id: string): string {
  if (id === "auto" || !id) return "Auto";
  if (id === "freetour") return "Free";
  return id;
}

function ModelMenu({ agentId, model }: { agentId: string; model: string }) {
  const token = getDtourSessionToken();
  const flags = useFlags();
  const showFree = flags.freetour_user_visible && flags.freetour_enabled;
  const listModels = useAction(anyApi.agents.listModels);
  const setModel = useMutation(anyApi.agents.setModel);
  const [models, setModels] = useState<{ id: string; free?: boolean }[]>([]);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const ref = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  useDismiss(open, ref, () => {
    setOpen(false);
    setQuery("");
  });

  useEffect(() => {
    if (!token || !open || models.length) return;
    listModels({ token })
      .then((r: { id: string; free?: boolean }[]) => setModels(r))
      .catch(() => {});
  }, [token, open, models.length, listModels]);

  useEffect(() => {
    if (open) searchRef.current?.focus();
  }, [open]);

  const label = modelPickerLabel(model);
  const q = query.trim().toLowerCase();

  const freeModels = showFree ? models.filter((m) => m.free) : [];
  const paidModels = models.filter((m) => !m.free && m.id !== "freetour");

  function matchesSearch(text: string) {
    if (!q) return true;
    return text.toLowerCase().includes(q);
  }

  const showAuto = matchesSearch("auto") || matchesSearch("detour cloud picks");
  const filteredFree = freeModels.filter(
    (m) =>
      matchesSearch(m.id) ||
      matchesSearch(modelPickerLabel(m.id)) ||
      matchesSearch("free"),
  );
  const filteredPaid = paidModels.filter((m) => matchesSearch(m.id) || matchesSearch(modelPickerLabel(m.id)));
  const hasResults = showAuto || filteredFree.length > 0 || filteredPaid.length > 0;

  async function pick(id: string) {
    setOpen(false);
    setQuery("");
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
          className="absolute bottom-full left-0 z-40 mb-2 flex max-h-80 w-72 flex-col rounded-2xl border border-white/10 bg-[#0d0d0d] shadow-2xl backdrop-blur-xl"
        >
          <div className="border-b border-white/8 p-2">
            <div className="flex items-center gap-2 rounded-xl border border-white/10 bg-white/[0.04] px-2.5 py-1.5">
              <span className="shrink-0 text-white/35">
                <Icon.Search size={14} />
              </span>
              <input
                ref={searchRef}
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search models…"
                className="min-w-0 flex-1 bg-transparent text-[12px] text-white/85 placeholder:text-white/30 focus:outline-none"
                onKeyDown={(e) => e.stopPropagation()}
              />
            </div>
          </div>
          <div className="overflow-y-auto p-1.5">
            {showAuto && (
              <ModelOption
                label="Auto"
                hint="Best model for this message"
                active={model === "auto" || !model}
                onClick={() => pick("auto")}
              />
            )}
            {filteredFree.length > 0 && (
              <>
                <div className="my-1 px-3 text-[9px] uppercase tracking-widest text-white/30">Free</div>
                {filteredFree.map((m) => (
                  <ModelOption
                    key={m.id}
                    label={modelPickerLabel(m.id)}
                    hint={
                      m.id === "freetour"
                        ? "Rate-limited — no credits used"
                        : m.id
                    }
                    active={m.id === model}
                    onClick={() => pick(m.id)}
                  />
                ))}
              </>
            )}
            {filteredPaid.length > 0 && (
              <>
                {filteredFree.length > 0 && (
                  <div className="my-1 px-3 text-[9px] uppercase tracking-widest text-white/30">Models</div>
                )}
                {filteredPaid.map((m) => (
                  <ModelOption
                    key={m.id}
                    label={modelPickerLabel(m.id)}
                    active={m.id === model}
                    onClick={() => pick(m.id)}
                  />
                ))}
              </>
            )}
            {!hasResults && (
              <p className="px-3 py-4 text-center text-[11px] text-white/35">No models match “{query.trim()}”</p>
            )}
            {!models.length && !q && (
              <p className="px-3 py-2 text-[11px] leading-relaxed text-white/30">
                Model list loads when inference keys are configured on the server.
              </p>
            )}
          </div>
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
  agentId,
  token,
  name,
  systemPrompt,
  onClose,
}: {
  agentId: string;
  token: string;
  name: string;
  systemPrompt: string;
  onClose: () => void;
}) {
  const listDocuments = useAction(anyApi.knowledge.listDocuments);
  const addDocument = useAction(anyApi.knowledge.addDocument);
  const reindexAgent = useAction(anyApi.knowledge.reindexAgent);
  const [entries, setEntries] = useState<Array<{ key: string; title: string | null }>>([]);
  const [ragReady, setRagReady] = useState<boolean | null>(null);
  const [docTitle, setDocTitle] = useState("");
  const [docText, setDocText] = useState("");
  const [saving, setSaving] = useState(false);
  const [reindexing, setReindexing] = useState(false);

  useEffect(() => {
    function onKey(e: globalThis.KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  useEffect(() => {
    void listDocuments({ token, agentId }).then((r) => {
      setRagReady(r.configured);
      setEntries(r.entries);
    });
  }, [token, agentId, listDocuments]);

  async function saveDocument() {
    if (!docText.trim() || saving) return;
    setSaving(true);
    try {
      await addDocument({
        token,
        agentId,
        title: docTitle.trim() || "Knowledge",
        text: docText.trim(),
      });
      setDocTitle("");
      setDocText("");
      const r = await listDocuments({ token, agentId });
      setRagReady(r.configured);
      setEntries(r.entries);
    } finally {
      setSaving(false);
    }
  }

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
        <div className="max-h-[60vh] overflow-y-auto px-5 py-4 space-y-6">
          <section>
            <h3 className="mb-2 text-[11px] uppercase tracking-widest text-white/35">System prompt</h3>
            <p className="whitespace-pre-wrap text-[13.5px] leading-relaxed text-white/80">
              {systemPrompt?.trim() || "No instructions set for this agent."}
            </p>
            {ragReady && (
              <button
                type="button"
                disabled={reindexing}
                onClick={() => {
                  setReindexing(true);
                  void reindexAgent({ token, agentId })
                    .then(() => listDocuments({ token, agentId }))
                    .then((r) => {
                      setRagReady(r.configured);
                      setEntries(r.entries);
                    })
                    .finally(() => setReindexing(false));
                }}
                className="mt-3 text-[12px] text-white/45 underline-offset-2 hover:text-white/70 hover:underline disabled:opacity-40"
              >
                {reindexing ? "Indexing instructions…" : "Re-index instructions in knowledge base"}
              </button>
            )}
          </section>

          <section>
            <h3 className="mb-2 text-[11px] uppercase tracking-widest text-white/35">Knowledge (RAG)</h3>
            {ragReady === false ? (
              <p className="text-[13px] leading-relaxed text-amber-200/80">
                Semantic search is off until <code className="text-white/70">OPENROUTER_API_KEY</code> or{" "}
                <code className="text-white/70">OPENAI_API_KEY</code> is set on the Convex deployment.
              </p>
            ) : (
              <>
                {entries.length > 0 && (
                  <ul className="mb-3 space-y-1.5">
                    {entries.map((e) => (
                      <li
                        key={e.key}
                        className="rounded-lg border border-white/8 bg-white/[0.03] px-3 py-2 text-[13px] text-white/75"
                      >
                        {e.title || e.key}
                      </li>
                    ))}
                  </ul>
                )}
                <div className="space-y-2">
                  <input
                    value={docTitle}
                    onChange={(e) => setDocTitle(e.target.value)}
                    placeholder="Title (optional)"
                    className="w-full rounded-lg border border-white/12 bg-white/5 px-3 py-2 text-[13px] text-white placeholder:text-white/30 focus:border-purple-400/50 focus:outline-none"
                  />
                  <textarea
                    value={docText}
                    onChange={(e) => setDocText(e.target.value)}
                    placeholder="Paste notes, docs, or facts to retrieve during chat…"
                    rows={4}
                    className="w-full resize-none rounded-lg border border-white/12 bg-white/5 px-3 py-2 text-[13px] text-white placeholder:text-white/30 focus:border-purple-400/50 focus:outline-none"
                  />
                  <button
                    type="button"
                    disabled={!docText.trim() || saving || ragReady === null}
                    onClick={() => void saveDocument()}
                    className="rounded-full bg-white px-4 py-2 text-[13px] font-medium text-black transition hover:bg-white/90 disabled:opacity-40"
                  >
                    {saving ? "Indexing…" : "Add to knowledge"}
                  </button>
                </div>
              </>
            )}
          </section>
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
