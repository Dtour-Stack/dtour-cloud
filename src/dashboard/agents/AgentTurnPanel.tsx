import { useMemo, useState, type ReactNode } from "react";
import { cn, Icon } from "@/ui";
import {
  AiPanel,
  AiReasoningBlock,
  AiSourceGroup,
  AiStatusPill,
  AiTraceStep,
} from "@/ui/ai-elements";
import {
  parseTrace,
  stepsByKind,
  type AgentTraceStep,
  type AgentTurnTrace,
} from "./agentTrace";

type Tab = "activity" | "reasoning" | "context" | "sources";

const TABS: { id: Tab; label: string; icon: ReactNode }[] = [
  { id: "activity", label: "Activity", icon: <Icon.Activity size={14} /> },
  { id: "reasoning", label: "Reasoning", icon: <Icon.Brain size={14} /> },
  { id: "context", label: "Context", icon: <Icon.BookOpen size={14} /> },
  { id: "sources", label: "Sources", icon: <Icon.Globe size={14} /> },
];

export function AgentTurnPanel({
  traceRaw,
  sending,
  agentName,
  onClose,
  className,
}: {
  traceRaw: string | null;
  sending: boolean;
  agentName: string;
  onClose?: () => void;
  className?: string;
}) {
  const trace = useMemo(() => parseTrace(traceRaw), [traceRaw]);
  const [tab, setTab] = useState<Tab>("activity");

  const searchSteps = useMemo(
    () => (trace ? stepsByKind(trace.steps, ["search", "resource"]) : []),
    [trace],
  );
  const memorySteps = useMemo(
    () => (trace ? stepsByKind(trace.steps, ["memory"]) : []),
    [trace],
  );
  const toolSteps = useMemo(
    () => (trace ? stepsByKind(trace.steps, ["tool"]) : []),
    [trace],
  );

  return (
    <AiPanel
      className={cn(
        className,
      )}
    >
      <div className="flex h-14 shrink-0 items-center gap-2 border-b border-white/10 px-4">
        <Icon.PanelRight size={16} className="text-white/45" />
        <div className="min-w-0 flex-1">
          <div className="truncate text-[13px] font-semibold text-white/90">Turn context</div>
          <div className="truncate text-[11px] text-white/35">{agentName}</div>
        </div>
        {onClose && (
          <button
            type="button"
            aria-label="Close panel"
            onClick={onClose}
            className="flex h-8 w-8 items-center justify-center rounded-full text-white/45 transition hover:bg-white/10 hover:text-white lg:hidden"
          >
            <Icon.X size={15} />
          </button>
        )}
      </div>

      <div className="flex shrink-0 gap-1 overflow-x-auto border-b border-white/8 px-2 py-2">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setTab(t.id)}
            className={cn(
              "flex shrink-0 items-center gap-1.5 rounded-full px-3 py-1.5 text-[11px] font-medium transition",
              tab === t.id
                ? "bg-white/10 text-white"
                : "text-white/45 hover:bg-white/[0.05] hover:text-white/75",
            )}
          >
            {t.icon}
            {t.label}
          </button>
        ))}
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4">
        {!trace && !sending ? (
          <EmptyState
            title="Select a reply"
            body="Click an assistant message to inspect routing, reasoning, and resources for that turn."
          />
        ) : tab === "activity" ? (
          <ActivityTab trace={trace} sending={sending} />
        ) : tab === "reasoning" ? (
          <ReasoningTab trace={trace} sending={sending} />
        ) : tab === "context" ? (
          <ContextTab trace={trace} />
        ) : (
          <SourcesTab
            trace={trace}
            searchSteps={searchSteps}
            memorySteps={memorySteps}
            toolSteps={toolSteps}
          />
        )}
      </div>
    </AiPanel>
  );
}

function ActivityTab({ trace, sending }: { trace: AgentTurnTrace | null; sending: boolean }) {
  if (!trace && sending) {
    return (
      <div className="space-y-3">
        <AiStatusPill label="Working" pulse />
        <StepRow
          step={{
            id: "live",
            kind: "inference",
            title: "Generating response…",
            detail: "Routing model and waiting for completion",
            at: Date.now(),
          }}
          live
        />
      </div>
    );
  }
  if (!trace) return null;

  return (
    <div className="space-y-4">
      <AiStatusPill
        label={
          trace.status === "running"
            ? "Working"
            : trace.status === "error"
              ? "Failed"
              : "Complete"
        }
        pulse={trace.status === "running" || sending}
        error={trace.status === "error"}
      />
      <MetaGrid trace={trace} />
      <div className="space-y-2">
        {trace.steps.map((step) => (
          <StepRow key={step.id} step={step} live={trace.status === "running" && step.id === "inference"} />
        ))}
      </div>
    </div>
  );
}

function ReasoningTab({ trace, sending }: { trace: AgentTurnTrace | null; sending: boolean }) {
  if (sending && !trace?.reasoning) {
    return (
      <EmptyState
        title="Reasoning in progress"
        body="Extended thinking from reasoning models will appear here as soon as the model returns it."
      />
    );
  }
  if (!trace?.reasoning) {
    return (
      <EmptyState
        title="No reasoning captured"
        body="This turn did not emit extended thinking. Reasoning models (o-series, DeepSeek-R1, etc.) populate this tab automatically."
      />
    );
  }
  return (
    <AiReasoningBlock value={trace.reasoning} />
  );
}

function ContextTab({ trace }: { trace: AgentTurnTrace | null }) {
  if (!trace?.context) {
    return <EmptyState title="No context" body="Context metadata is recorded per assistant turn." />;
  }
  const c = trace.context;
  return (
    <div className="space-y-4">
      <Section title="Instructions">
        <p className="text-[12.5px] leading-relaxed text-white/75">
          {c.systemPromptPreview || "No instructions on this agent."}
        </p>
      </Section>
      <Section title="Session">
        <KV label="Agent model setting" value={c.agentModel === "freetour" ? "Free" : c.agentModel || "Auto"} />
        <KV label="Routed model" value={trace.modelUsed || trace.modelRequested} />
        <KV label="History in prompt" value={`${c.historyTurns ?? 0} messages`} />
        {c.imageAttached ? <KV label="Vision" value="Image attached to user message" /> : null}
      </Section>
      {c.plugins && c.plugins.length > 0 ? (
        <Section title="Plugins attached">
          <ul className="space-y-1.5">
            {c.plugins.map((p) => (
              <li
                key={p}
                className="rounded-lg border border-white/8 bg-white/[0.03] px-2.5 py-2 text-[12px] text-white/70"
              >
                {p}
              </li>
            ))}
          </ul>
        </Section>
      ) : null}
    </div>
  );
}

function SourcesTab({
  trace,
  searchSteps,
  memorySteps,
  toolSteps,
}: {
  trace: AgentTurnTrace | null;
  searchSteps: AgentTraceStep[];
  memorySteps: AgentTraceStep[];
  toolSteps: AgentTraceStep[];
}) {
  const hasAny = searchSteps.length + memorySteps.length + toolSteps.length > 0;

  if (!hasAny) {
    return (
      <EmptyState
        title="No external sources yet"
        body="Retrieved knowledge chunks appear here when semantic search finds matches. Add documents under Instructions → Knowledge, or rely on indexed agent instructions."
      />
    );
  }

  return (
    <div className="space-y-5">
      {searchSteps.length > 0 && (
        <SourceGroup title="Web & resources" steps={searchSteps} />
      )}
      {memorySteps.length > 0 && (
        <SourceGroup title="Memories" steps={memorySteps} />
      )}
      {toolSteps.length > 0 && (
        <SourceGroup title="Tools & plugins" steps={toolSteps} />
      )}
      {trace?.usage?.free ? (
        <p className="text-[11px] text-emerald-300/80">Free-tier inference — no credits charged.</p>
      ) : null}
    </div>
  );
}

function SourceGroup({ title, steps }: { title: string; steps: AgentTraceStep[] }) {
  return (
    <AiSourceGroup title={title}>
      {steps.map((s) => (
        <StepRow key={s.id} step={s} />
      ))}
    </AiSourceGroup>
  );
}

function StepRow({ step, live }: { step: AgentTraceStep; live?: boolean }) {
  return (
    <AiTraceStep
      icon={<StepIcon kind={step.kind} />}
      title={step.title}
      detail={step.detail}
      href={step.href}
      live={live}
    />
  );
}

function StepIcon({ kind }: { kind: AgentTraceStep["kind"] }) {
  return (
    kind === "search" ? (
      <Icon.Globe size={14} />
    ) : kind === "memory" ? (
      <Icon.BookOpen size={14} />
    ) : kind === "tool" ? (
      <Icon.Plug size={14} />
    ) : kind === "reasoning" ? (
      <Icon.Brain size={14} />
    ) : (
      <Icon.Sparkles size={14} />
    )
  );
}

function MetaGrid({ trace }: { trace: AgentTurnTrace }) {
  return (
    <div className="grid grid-cols-2 gap-2">
      <Stat label="Model" value={trace.modelUsed || trace.modelRequested} />
      <Stat
        label="Latency"
        value={trace.durationMs != null ? `${Math.round(trace.durationMs)}ms` : "—"}
      />
      {trace.usage ? (
        <>
          <Stat label="Prompt tok" value={String(trace.usage.promptTokens ?? "—")} />
          <Stat
            label="Cost"
            value={
              trace.usage.free
                ? "Free"
                : trace.usage.costUsd != null
                  ? `$${trace.usage.costUsd.toFixed(4)}`
                  : "—"
            }
          />
        </>
      ) : null}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-white/8 bg-white/[0.02] px-2.5 py-2">
      <div className="text-[9px] uppercase tracking-widest text-white/30">{label}</div>
      <div className="mt-0.5 truncate text-[12px] text-white/80">{value}</div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div>
      <div className="mb-2 text-[10px] uppercase tracking-widest text-white/30">{title}</div>
      {children}
    </div>
  );
}

function KV({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-start justify-between gap-3 border-b border-white/6 py-2 text-[12px] last:border-0">
      <span className="text-white/40">{label}</span>
      <span className="text-right text-white/75">{value}</span>
    </div>
  );
}


function EmptyState({ title, body }: { title: string; body: string }) {
  return (
    <div className="rounded-xl border border-dashed border-white/10 bg-white/[0.02] px-4 py-8 text-center">
      <p className="text-[13px] font-medium text-white/70">{title}</p>
      <p className="mt-2 text-[12px] leading-relaxed text-white/35">{body}</p>
    </div>
  );
}
