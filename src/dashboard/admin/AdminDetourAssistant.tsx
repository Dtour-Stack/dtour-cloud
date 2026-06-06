import { useAction, useMutation, useQuery } from "convex/react";
import { anyApi } from "convex/server";
import {
  type FormEvent,
  type KeyboardEvent,
  type RefObject,
  useEffect,
  useRef,
  useState,
} from "react";
import { SlashCommandMenu } from "@/dashboard/chat/SlashCommandMenu";
import { readDtourPlaywrightUser } from "@/lib/playwright-dtour-auth";
import { getDtourSessionToken } from "@/lib/session";
import {
  type SlashCommand,
  slashCommandForInput,
  slashCommandHelp,
} from "@/lib/slashCommands";
import { Button, cn, Icon, IconButton } from "@/ui";
import {
  AiConversation,
  AiConversationContent,
  AiConversationEmptyState,
  AiMessageAvatar,
  AiMessageBubble,
  AiMessageButton,
  AiMessageResponse,
  AiPromptInputFooter,
  AiPromptInputFrame,
  AiPromptInputTextarea,
  AiPromptSubmit,
  AiStatusPill,
  AiTraceStep,
} from "@/ui/ai-elements";

type Workflow = {
  id: string;
  label: string;
  prompt: string;
};

type Applicant = {
  email: string;
  pubkey: string | null;
  name: string | null;
  reason: string | null;
  at: number;
  latestOutreach: string | null;
};

type Outreach = {
  id: string;
  email: string;
  status: string;
  subject: string;
  score: number | null;
  recommendation: string | null;
  replyText: string | null;
  updatedAt: number;
};

type Overview =
  | {
      workflows: Workflow[];
      backendKnowledge: Array<{ area: string; detail: string }>;
      counts: Record<string, number>;
      testerApplications: Applicant[];
      latestOutreach: Outreach[];
      recentEvents: Array<{
        type: string;
        pubkey: string | null;
        data: string | null;
        at: number;
      }>;
    }
  | undefined;

type ThreadRow = {
  id: string;
  title: string;
  createdAt: number;
  updatedAt: number;
};

type Thread = ThreadRow | null | undefined;

type Message = {
  id: string;
  role: "user" | "assistant";
  content: string;
  workflow: string | null;
  status: "pending" | "complete" | "failed";
  at: number;
};

type Draft = {
  outreachId: string;
  subject: string;
  body: string;
};

type Score = {
  score: number;
  recommendation: string;
  rationale: string;
};

type IntegrationStatus = {
  agentMail: boolean;
  agentMailWebhook: boolean;
  inference: boolean;
  openRouterConfigured?: boolean;
  openRouterCreditsOk?: boolean;
  openRouterFreeCreditsOk?: boolean;
  openRouterRemainingUsd?: number | null;
};

const tabs = ["workflows", "chat", "applicants"] as const;
type Tab = (typeof tabs)[number];

const ADMIN_SLASH_COMMANDS: SlashCommand[] = [
  { id: "new", command: "/new", label: "New chat", description: "Start a new Admin Detour chat" },
  { id: "delete", command: "/delete", label: "Delete chat", description: "Delete the current admin chat" },
  { id: "workflows", command: "/workflows", label: "Workflows", description: "Open admin workflows" },
  { id: "applicants", command: "/applicants", label: "Applicants", description: "Open tester applicants" },
  { id: "status", command: "/status", label: "Status check", description: "Ask for integration status" },
  { id: "help", command: "/help", label: "Command list", description: "Show available slash commands" },
];

const TEST_THREADS: ThreadRow[] = [
  {
    id: "test-admin-thread",
    title: "Admin Detour",
    createdAt: 1,
    updatedAt: 2,
  },
];

const TEST_MESSAGES: Record<string, Message[]> = {
  "test-admin-thread": [],
};

function fmtDate(ms: number) {
  return new Date(ms).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  });
}

function shortPubkey(value: string | null) {
  return value ? `${value.slice(0, 4)}...${value.slice(-4)}` : null;
}

export function AdminDetourAssistant() {
  const testUser = readDtourPlaywrightUser();
  const token = testUser ? null : getDtourSessionToken();
  const [testThreads, setTestThreads] = useState<ThreadRow[]>(TEST_THREADS);
  const [testMessages, setTestMessages] = useState<Record<string, Message[]>>(TEST_MESSAGES);
  const overview = useQuery(
    anyApi.adminAssistant.overview,
    token ? { token } : "skip",
  ) as Overview;
  const threadsQuery = useQuery(
    anyApi.adminAssistant.threads,
    token ? { token } : "skip",
  ) as ThreadRow[] | undefined;
  const currentThreadQuery = useQuery(
    anyApi.adminAssistant.currentThread,
    token ? { token } : "skip",
  ) as Thread;
  const threads = testUser ? testThreads : threadsQuery;
  const currentThread = testUser ? (testThreads[0] ?? null) : currentThreadQuery;
  const [activeThreadId, setActiveThreadId] = useState<string | null>(null);
  const threadId = activeThreadId ?? currentThread?.id ?? null;
  const messagesQuery = useQuery(
    anyApi.adminAssistant.messages,
    token && threadId ? { token, threadId } : "skip",
  ) as Message[] | undefined;
  const messages = testUser && threadId ? (testMessages[threadId] ?? []) : messagesQuery;
  const createThread = useMutation(anyApi.adminAssistant.createThread);
  const deleteThread = useMutation(anyApi.adminAssistant.deleteThread);
  const sendMessage = useAction(anyApi.adminAssistant.sendMessage);
  const draftTesterFollowUp = useAction(anyApi.adminAssistant.draftTesterFollowUp);
  const sendTesterFollowUp = useAction(anyApi.adminAssistant.sendTesterFollowUp);
  const scoreTesterApplication = useAction(anyApi.adminAssistant.scoreTesterApplication);
  const integrationStatus = useAction(anyApi.adminAssistant.integrationStatus);
  const approveTester = useMutation(anyApi.waitlist.approveTester);
  const denyTester = useMutation(anyApi.waitlist.denyTester);
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<Tab>("workflows");
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [drafts, setDrafts] = useState<Record<string, Draft>>({});
  const [scores, setScores] = useState<Record<string, Score>>({});
  const [status, setStatus] = useState<IntegrationStatus | null>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (!activeThreadId && currentThread?.id) setActiveThreadId(currentThread.id);
  }, [activeThreadId, currentThread?.id]);

  useEffect(() => {
    if (!activeThreadId || !threads) return;
    if (threads.some((thread) => thread.id === activeThreadId)) return;
    setActiveThreadId(threads[0]?.id ?? null);
  }, [activeThreadId, threads]);

  useEffect(() => {
    if (!open || !token || threadId || currentThread !== null) return;
    void createThread({ token, title: "Admin Detour" }).then(({ threadId: id }) => {
      setActiveThreadId(id);
    });
  }, [open, token, threadId, currentThread, createThread]);

  useEffect(() => {
    if (!open || !token) return;
    void integrationStatus({ token }).then((value) => {
      setStatus(value as IntegrationStatus);
    });
  }, [open, token, integrationStatus]);

  useEffect(() => {
    if (!open) return;
    function onKey(e: globalThis.KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  async function ensureThread() {
    if (!token) throw new Error("Not signed in");
    if (threadId) return threadId;
    const { threadId: id } = (await createThread({
      token,
      title: "Admin Detour",
    })) as { threadId: string };
    setActiveThreadId(id);
    return id;
  }

  async function startNewThread() {
    setError(null);
    setNotice(null);
    setInput("");
    if (inputRef.current) inputRef.current.style.height = "auto";
    if (testUser) {
      const now = Date.now();
      const id = `test-admin-thread-${now}`;
      setTestThreads((prev) => [
        { id, title: "Admin Detour", createdAt: now, updatedAt: now },
        ...prev,
      ]);
      setTestMessages((prev) => ({ ...prev, [id]: [] }));
      setActiveThreadId(id);
      setTab("chat");
      setNotice("Started a new admin chat.");
      return;
    }
    if (!token) return;
    const { threadId: id } = (await createThread({
      token,
      title: "Admin Detour",
    })) as { threadId: string };
    setActiveThreadId(id);
    setTab("chat");
    setNotice("Started a new admin chat.");
  }

  async function deleteActiveThread() {
    const id = threadId;
    if (!id || sending) return;
    setError(null);
    setNotice(null);
    const nextThreadId = (threads ?? []).find((thread) => thread.id !== id)?.id ?? null;
    if (testUser) {
      setTestThreads((prev) => prev.filter((thread) => thread.id !== id));
      setTestMessages((prev) => {
        const next = { ...prev };
        delete next[id];
        return next;
      });
      setActiveThreadId(nextThreadId);
      setNotice("Deleted admin chat.");
      return;
    }
    if (!token) return;
    await deleteThread({ token, threadId: id });
    setActiveThreadId(nextThreadId);
    setNotice("Deleted admin chat.");
  }

  async function runSlashCommand(id: string) {
    switch (id) {
      case "new":
        await startNewThread();
        break;
      case "delete":
        await deleteActiveThread();
        break;
      case "workflows":
        setTab("workflows");
        setNotice("Opened workflows.");
        break;
      case "applicants":
        setTab("applicants");
        setNotice("Opened applicants.");
        break;
      case "status":
        await submit("Check the current admin integration and credit status.", "integration_status");
        break;
      case "help":
        setNotice(`Commands: ${slashCommandHelp(ADMIN_SLASH_COMMANDS)}`);
        break;
      default:
        setNotice("Unknown command. Type /help.");
    }
  }

  async function submit(text: string, workflow?: string) {
    const clean = text.trim();
    if (!clean || sending) return;
    if (!workflow) {
      const slashCommand = slashCommandForInput(ADMIN_SLASH_COMMANDS, clean);
      if (slashCommand) {
        setInput("");
        if (inputRef.current) inputRef.current.style.height = "auto";
        await runSlashCommand(slashCommand.id);
        return;
      }
      if (clean.startsWith("/")) {
        setNotice("Unknown command. Type /help.");
        return;
      }
    }
    if (!token) return;
    setSending(true);
    setError(null);
    setNotice(null);
    if (!workflow) setInput("");
    if (inputRef.current) inputRef.current.style.height = "auto";
    try {
      const id = await ensureThread();
      await sendMessage({ token, threadId: id, message: clean, workflow });
      setTab("chat");
    } catch (e) {
      if (!workflow) setInput(clean);
      setError(e instanceof Error ? e.message : "Admin Detour failed");
    } finally {
      setSending(false);
    }
  }

  function submitForm(e?: FormEvent) {
    e?.preventDefault();
    void submit(input);
  }

  function onKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      submitForm();
    }
  }

  function autoGrow() {
    const textarea = inputRef.current;
    if (!textarea) return;
    textarea.style.height = "auto";
    textarea.style.height = `${Math.min(textarea.scrollHeight, 180)}px`;
  }

  async function draftFor(applicant: Applicant) {
    if (!token) return;
    setBusy(`draft:${applicant.email}`);
    setError(null);
    try {
      const draft = (await draftTesterFollowUp({
        token,
        email: applicant.email,
      })) as Draft;
      setDrafts((prev) => ({ ...prev, [applicant.email]: draft }));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not draft follow-up");
    } finally {
      setBusy(null);
    }
  }

  async function sendDraft(applicant: Applicant) {
    const draft = drafts[applicant.email];
    if (!token || !draft) return;
    setBusy(`send:${applicant.email}`);
    setError(null);
    try {
      await sendTesterFollowUp({
        token,
        email: applicant.email,
        subject: draft.subject,
        body: draft.body,
        outreachId: draft.outreachId,
      });
      setDrafts((prev) => {
        const next = { ...prev };
        delete next[applicant.email];
        return next;
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not send follow-up");
    } finally {
      setBusy(null);
    }
  }

  async function score(applicant: Applicant) {
    if (!token) return;
    setBusy(`score:${applicant.email}`);
    setError(null);
    try {
      const result = (await scoreTesterApplication({
        token,
        email: applicant.email,
      })) as Score;
      setScores((prev) => ({ ...prev, [applicant.email]: result }));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not score applicant");
    } finally {
      setBusy(null);
    }
  }

  async function approve(applicant: Applicant) {
    if (!token) return;
    setBusy(`approve:${applicant.email}`);
    setError(null);
    try {
      await approveTester({ token, email: applicant.email });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not approve applicant");
    } finally {
      setBusy(null);
    }
  }

  async function deny(applicant: Applicant) {
    if (!token) return;
    setBusy(`deny:${applicant.email}`);
    setError(null);
    try {
      await denyTester({ token, email: applicant.email, reason: "Denied by admin" });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not deny applicant");
    } finally {
      setBusy(null);
    }
  }

  return (
    <>
      <button
        type="button"
        aria-label="Open Admin Detour"
        aria-expanded={open}
        onClick={() => {
          setOpen((value) => !value);
          setTab("workflows");
        }}
        className={cn(
          "fixed bottom-5 right-5 z-50 flex h-16 w-16 items-center justify-center rounded-full border border-white/15 bg-black/70 shadow-2xl shadow-purple-950/30 backdrop-blur-xl transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-purple-400/70",
          open ? "scale-95 ring-2 ring-purple-400/40" : "hover:scale-[1.03]",
        )}
      >
        <img
          src="/brand/dtour/ninja-squirrel.png"
          alt=""
          className="h-14 w-14 rounded-full object-cover drop-shadow-[0_0_14px_rgba(168,85,247,0.35)]"
        />
      </button>

      {open && (
        <div className="fixed bottom-24 right-4 top-16 z-50 flex w-[min(560px,calc(100vw-2rem))] flex-col overflow-hidden rounded-2xl border border-white/10 bg-[#0d0d0d] shadow-2xl backdrop-blur-xl max-sm:bottom-4 max-sm:top-4">
          <header className="flex h-16 shrink-0 items-center gap-3 border-b border-white/10 px-4">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-white/10 bg-black/60">
              <img
                src="/brand/dtour/ninja-squirrel.png"
                alt=""
                className="h-9 w-9 rounded-full object-cover"
              />
            </span>
            <div className="min-w-0 flex-1">
              <h2 className="truncate text-sm font-semibold text-white">Admin Detour</h2>
              <div className="mt-1 flex flex-wrap gap-1.5">
                <AiStatusPill
                  label={status?.inference ? "inference ready" : "inference check"}
                  error={status ? !status.inference : false}
                />
                {status?.openRouterConfigured && (
                  <AiStatusPill
                    label={
                      typeof status.openRouterRemainingUsd === "number"
                        ? `OpenRouter $${status.openRouterRemainingUsd.toFixed(2)}`
                        : "OpenRouter unlimited"
                    }
                    error={!status.openRouterCreditsOk}
                  />
                )}
                <AiStatusPill
                  label={status?.agentMail ? "AgentMail ready" : "AgentMail"}
                  error={status ? !status.agentMail : false}
                />
              </div>
            </div>
            <IconButton label="Close Admin Detour" onClick={() => setOpen(false)}>
              <Icon.X />
            </IconButton>
          </header>

          <div className="flex shrink-0 gap-1 border-b border-white/10 px-3 py-2">
            {tabs.map((item) => (
              <button
                key={item}
                type="button"
                onClick={() => setTab(item)}
                className={cn(
                  "rounded-full px-3 py-1.5 text-[12px] font-medium capitalize transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-purple-400/60",
                  tab === item
                    ? "bg-white text-black"
                    : "text-white/55 hover:bg-white/10 hover:text-white",
                )}
              >
                {item}
              </button>
            ))}
          </div>

          {tab === "workflows" && (
            <WorkflowPane
              overview={overview}
              status={status}
              sending={sending}
              onRun={(workflow) => void submit(workflow.prompt, workflow.id)}
            />
          )}

          {tab === "chat" && (
            <ChatPane
              threads={threads}
              activeThreadId={threadId}
              messages={messages}
              sending={sending}
              input={input}
              notice={notice}
              inputRef={inputRef}
              onSelectThread={(id) => {
                setActiveThreadId(id);
                setNotice(null);
              }}
              onNewThread={() => void startNewThread()}
              onDeleteThread={() => void deleteActiveThread()}
              onSlashCommand={(command) => {
                setInput("");
                if (inputRef.current) inputRef.current.style.height = "auto";
                void runSlashCommand(command.id);
              }}
              onChange={(value) => {
                setInput(value);
                autoGrow();
              }}
              onKeyDown={onKeyDown}
              onSubmit={submitForm}
            />
          )}

          {tab === "applicants" && (
            <ApplicantsPane
              applicants={overview?.testerApplications ?? []}
              outreach={overview?.latestOutreach ?? []}
              drafts={drafts}
              scores={scores}
              busy={busy}
              onDraft={draftFor}
              onDraftChange={(email, patch) => {
                setDrafts((prev) => ({
                  ...prev,
                  [email]: { ...prev[email], ...patch },
                }));
              }}
              onSend={sendDraft}
              onScore={score}
              onApprove={approve}
              onDeny={deny}
            />
          )}

          {error && (
            <div className="shrink-0 border-t border-red-400/20 bg-red-500/10 px-4 py-2 text-[12px] text-red-100/90">
              {error}
            </div>
          )}
        </div>
      )}
    </>
  );
}

function WorkflowPane({
  overview,
  status,
  sending,
  onRun,
}: {
  overview: Overview;
  status: IntegrationStatus | null;
  sending: boolean;
  onRun: (workflow: Workflow) => void;
}) {
  const counts = overview?.counts;
  return (
    <div className="min-h-0 flex-1 overflow-auto p-4">
      <div className="grid gap-3 sm:grid-cols-3">
        <Metric label="users" value={counts?.users ?? 0} />
        <Metric label="tester apps" value={counts?.pendingTesterApplications ?? 0} />
        <Metric label="events" value={counts?.recentEvents ?? 0} />
      </div>

      <div className="mt-4 grid gap-2">
        {(overview?.workflows ?? []).map((workflow) => (
          <button
            key={workflow.id}
            type="button"
            disabled={sending}
            onClick={() => onRun(workflow)}
            className="group rounded-2xl border border-white/10 bg-white/[0.03] p-4 text-left transition hover:bg-white/[0.06] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-purple-400/50 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <div className="flex items-center gap-2">
              <span className="flex h-8 w-8 items-center justify-center rounded-full border border-white/10 bg-black/40 text-white/55 group-hover:text-white">
                <Icon.Sparkles size={15} />
              </span>
              <span className="text-sm font-semibold text-white/90">{workflow.label}</span>
              <span className="ml-auto text-white/30">
                <Icon.ArrowUpRight size={14} />
              </span>
            </div>
            <p className="mt-2 text-[12px] leading-relaxed text-white/45">{workflow.prompt}</p>
          </button>
        ))}
      </div>

      <div className="mt-4 grid gap-2">
        {(overview?.backendKnowledge ?? []).slice(0, 5).map((item) => (
          <AiTraceStep
            key={item.area}
            icon={<Icon.BookOpen size={14} />}
            title={item.area}
            detail={item.detail}
          />
        ))}
      </div>

      {status && !status.agentMailWebhook && (
        <p className="mt-3 rounded-xl border border-amber-400/20 bg-amber-400/10 px-3 py-2 text-[12px] text-amber-100/90">
          AgentMail sending can work, but inbound reply verification needs
          AGENTMAIL_WEBHOOK_SECRET.
        </p>
      )}
    </div>
  );
}

function ChatPane({
  threads,
  activeThreadId,
  messages,
  sending,
  input,
  notice,
  inputRef,
  onSelectThread,
  onNewThread,
  onDeleteThread,
  onSlashCommand,
  onChange,
  onKeyDown,
  onSubmit,
}: {
  threads: ThreadRow[] | undefined;
  activeThreadId: string | null;
  messages: Message[] | undefined;
  sending: boolean;
  input: string;
  notice: string | null;
  inputRef: RefObject<HTMLTextAreaElement | null>;
  onSelectThread: (threadId: string) => void;
  onNewThread: () => void;
  onDeleteThread: () => void;
  onSlashCommand: (command: SlashCommand) => void;
  onChange: (value: string) => void;
  onKeyDown: (e: KeyboardEvent<HTMLTextAreaElement>) => void;
  onSubmit: (e?: FormEvent) => void;
}) {
  const endRef = useRef<HTMLDivElement>(null);
  // biome-ignore lint/correctness/useExhaustiveDependencies: scroll on new chat content
  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, sending]);
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="shrink-0 border-b border-white/10 px-3 py-2">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={onNewThread}
            className="flex h-8 shrink-0 items-center gap-1.5 rounded-full border border-white/15 bg-white px-3 text-[12px] font-medium text-black transition hover:bg-white/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-purple-400/60"
          >
            <Icon.SquarePen size={13} />
            New chat
          </button>
          <div className="flex min-w-0 flex-1 gap-1 overflow-x-auto">
            {threads === undefined ? (
              <span className="rounded-full border border-white/10 px-3 py-1.5 text-[12px] text-white/35">
                Loading chats...
              </span>
            ) : threads.length === 0 ? (
              <span className="rounded-full border border-white/10 px-3 py-1.5 text-[12px] text-white/35">
                No saved chats
              </span>
            ) : (
              threads.map((thread) => (
                <button
                  key={thread.id}
                  type="button"
                  onClick={() => onSelectThread(thread.id)}
                  className={cn(
                    "max-w-40 shrink-0 truncate rounded-full border px-3 py-1.5 text-[12px] transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-purple-400/60",
                    thread.id === activeThreadId
                      ? "border-white/20 bg-white/10 text-white"
                      : "border-white/10 text-white/45 hover:bg-white/[0.06] hover:text-white",
                  )}
                >
                  {thread.title}
                </button>
              ))
            )}
          </div>
          <IconButton
            label="Delete chat"
            disabled={!activeThreadId || sending}
            onClick={onDeleteThread}
          >
            <Icon.Trash />
          </IconButton>
        </div>
      </div>
      <AiConversation>
        <div className="px-4 py-5">
          {messages === undefined ? (
            <p className="py-10 text-center text-sm text-white/35">Loading...</p>
          ) : messages.length === 0 ? (
            <AiConversationEmptyState
              icon={<Icon.Bot size={24} />}
              title="Admin Detour"
              body="Ask about requests, users, flags, config, Convex functions, and admin operations."
            />
          ) : (
            <AiConversationContent>
              {messages.map((message) =>
                message.role === "user" ? (
                  <div key={message.id} className="flex flex-col items-end gap-1.5">
                    <AiMessageBubble from="user">{message.content}</AiMessageBubble>
                  </div>
                ) : (
                  <AiMessageButton
                    key={message.id}
                    active={message.status === "pending"}
                    className={message.status === "failed" ? "ring-1 ring-red-400/30" : undefined}
                  >
                    <AiMessageAvatar>
                      <Icon.Bot size={14} />
                    </AiMessageAvatar>
                    <AiMessageBubble from="assistant">
                      {message.status === "pending" && !message.content ? (
                        <TypingDots />
                      ) : (
                        <AiMessageResponse>{message.content}</AiMessageResponse>
                      )}
                    </AiMessageBubble>
                  </AiMessageButton>
                ),
              )}
            </AiConversationContent>
          )}
          <div ref={endRef} className="h-px" />
        </div>
      </AiConversation>

      <div className="shrink-0 border-t border-white/10 p-3">
        {notice && (
          <div className="mb-2 rounded-xl border border-white/10 bg-white/[0.04] px-3 py-2 text-[12px] text-white/60">
            {notice}
          </div>
        )}
        <AiPromptInputFrame onSubmit={onSubmit} className="relative">
          <SlashCommandMenu
            commands={ADMIN_SLASH_COMMANDS}
            input={input}
            onPick={onSlashCommand}
          />
          <AiPromptInputTextarea
            ref={inputRef}
            value={input}
            onChange={(e) => onChange(e.target.value)}
            onKeyDown={onKeyDown}
            placeholder="Message Admin Detour..."
          />
          <AiPromptInputFooter>
            <AiStatusPill label={sending ? "thinking" : "admin context"} pulse={sending} />
            <div className="flex-1" />
            <AiPromptSubmit disabled={sending || !input.trim()} sending={sending} />
          </AiPromptInputFooter>
        </AiPromptInputFrame>
      </div>
    </div>
  );
}

function ApplicantsPane({
  applicants,
  outreach,
  drafts,
  scores,
  busy,
  onDraft,
  onDraftChange,
  onSend,
  onScore,
  onApprove,
  onDeny,
}: {
  applicants: Applicant[];
  outreach: Outreach[];
  drafts: Record<string, Draft>;
  scores: Record<string, Score>;
  busy: string | null;
  onDraft: (applicant: Applicant) => void;
  onDraftChange: (email: string, patch: Partial<Draft>) => void;
  onSend: (applicant: Applicant) => void;
  onScore: (applicant: Applicant) => void;
  onApprove: (applicant: Applicant) => void;
  onDeny: (applicant: Applicant) => void;
}) {
  const outreachByEmail = new Map(outreach.map((item) => [item.email, item]));
  return (
    <div className="min-h-0 flex-1 overflow-auto p-4">
      {applicants.length === 0 ? (
        <AiConversationEmptyState
          icon={<Icon.Shield size={24} />}
          title="No pending applicants"
          body="Tester and early-dev applications from the login gate appear here."
        />
      ) : (
        <div className="space-y-3">
          {applicants.map((applicant) => {
            const draft = drafts[applicant.email];
            const score = scores[applicant.email];
            const latest = outreachByEmail.get(applicant.email);
            return (
              <section
                key={applicant.email}
                className="rounded-2xl border border-white/10 bg-white/[0.03] p-4"
              >
                <div className="flex items-start gap-3">
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-white/10 bg-black/40 text-white/55">
                    <Icon.User size={15} />
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="truncate text-sm font-semibold text-white/90">
                        {applicant.email}
                      </h3>
                      <span className="rounded-full border border-purple-400/25 bg-purple-400/10 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider text-purple-100">
                        dev/tester
                      </span>
                    </div>
                    <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-white/35">
                      {applicant.name && <span>{applicant.name}</span>}
                      {shortPubkey(applicant.pubkey) && (
                        <span className="font-mono">{shortPubkey(applicant.pubkey)}</span>
                      )}
                      <span>{fmtDate(applicant.at)}</span>
                      {latest && <span>{latest.status}</span>}
                    </div>
                    {applicant.reason && (
                      <p className="mt-2 text-[12.5px] leading-relaxed text-white/55">
                        {applicant.reason}
                      </p>
                    )}
                    {latest?.replyText && (
                      <p className="mt-2 rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-[12px] leading-relaxed text-white/60">
                        {latest.replyText}
                      </p>
                    )}
                    {(score || latest?.score) && (
                      <div className="mt-3 rounded-xl border border-emerald-400/20 bg-emerald-400/10 px-3 py-2 text-[12px] text-emerald-100/90">
                        Score {score?.score ?? latest?.score}/100 ·{" "}
                        {score?.recommendation ?? latest?.recommendation}
                      </div>
                    )}
                  </div>
                </div>

                {draft && (
                  <div className="mt-3 space-y-2 rounded-xl border border-white/10 bg-black/30 p-3">
                    <input
                      value={draft.subject}
                      onChange={(e) =>
                        onDraftChange(applicant.email, { subject: e.target.value })
                      }
                      className="w-full rounded-lg border border-white/15 bg-white/5 px-3 py-2 text-[12px] text-white placeholder:text-white/30 focus:border-purple-400/50 focus:outline-none"
                    />
                    <textarea
                      value={draft.body}
                      onChange={(e) =>
                        onDraftChange(applicant.email, { body: e.target.value })
                      }
                      rows={5}
                      className="w-full resize-none rounded-lg border border-white/15 bg-white/5 px-3 py-2 text-[12px] leading-relaxed text-white placeholder:text-white/30 focus:border-purple-400/50 focus:outline-none"
                    />
                  </div>
                )}

                <div className="mt-3 flex flex-wrap gap-2">
                  <Button
                    size="sm"
                    variant="secondary"
                    disabled={busy === `draft:${applicant.email}`}
                    onClick={() => onDraft(applicant)}
                  >
                    <Icon.SquarePen size={14} />
                    {busy === `draft:${applicant.email}` ? "Drafting" : "Draft email"}
                  </Button>
                  {draft && (
                    <Button
                      size="sm"
                      disabled={busy === `send:${applicant.email}`}
                      onClick={() => onSend(applicant)}
                    >
                      <Icon.Megaphone size={14} />
                      {busy === `send:${applicant.email}` ? "Sending" : "Send"}
                    </Button>
                  )}
                  <Button
                    size="sm"
                    variant="secondary"
                    disabled={busy === `score:${applicant.email}`}
                    onClick={() => onScore(applicant)}
                  >
                    <Icon.Brain size={14} />
                    {busy === `score:${applicant.email}` ? "Scoring" : "Score"}
                  </Button>
                  <Button
                    size="sm"
                    disabled={busy === `approve:${applicant.email}` || !applicant.pubkey}
                    onClick={() => onApprove(applicant)}
                  >
                    <Icon.Check size={14} />
                    Approve
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    disabled={busy === `deny:${applicant.email}`}
                    onClick={() => onDeny(applicant)}
                  >
                    <Icon.X size={14} />
                    Deny
                  </Button>
                </div>
              </section>
            );
          })}
        </div>
      )}
    </div>
  );
}

function Metric({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2">
      <div className="text-[10px] uppercase tracking-widest text-white/30">{label}</div>
      <div className="mt-1 text-lg font-semibold text-white/90">{value}</div>
    </div>
  );
}

function TypingDots() {
  return (
    <span className="flex h-6 items-center gap-1">
      <span className="h-1.5 w-1.5 rounded-full bg-white/35 motion-safe:animate-pulse" />
      <span className="h-1.5 w-1.5 rounded-full bg-white/35 motion-safe:animate-pulse [animation-delay:120ms]" />
      <span className="h-1.5 w-1.5 rounded-full bg-white/35 motion-safe:animate-pulse [animation-delay:240ms]" />
    </span>
  );
}
