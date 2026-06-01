import { type ComponentProps, type ReactNode } from "react";
import { Streamdown } from "streamdown";
import { cn } from "./cn";
import * as Icon from "./icons";

export function AiConversation({
  className,
  ...props
}: ComponentProps<"div">) {
  return (
    <div
      className={cn("min-h-0 flex-1 overflow-y-auto", className)}
      role="log"
      {...props}
    />
  );
}

export function AiConversationContent({
  className,
  ...props
}: ComponentProps<"div">) {
  return <div className={cn("space-y-7", className)} {...props} />;
}

export function AiConversationEmptyState({
  icon,
  title,
  body,
}: {
  icon: ReactNode;
  title: string;
  body: string;
}) {
  return (
    <div className="mt-[14vh] flex flex-col items-center text-center">
      <span className="flex h-14 w-14 items-center justify-center rounded-2xl border border-white/10 bg-white/[0.03] text-white/70">
        {icon}
      </span>
      <h2 className="mt-5 text-xl font-semibold tracking-tight">{title}</h2>
      <p className="mt-2 max-w-sm text-sm leading-relaxed text-white/45">{body}</p>
    </div>
  );
}

export function AiMessage({
  from,
  className,
  ...props
}: ComponentProps<"div"> & { from: "user" | "assistant" }) {
  return (
    <div
      className={cn(
        from === "user" ? "flex flex-col items-end gap-1.5" : "flex w-full gap-3",
        className,
      )}
      {...props}
    />
  );
}

export function AiMessageButton({
  active,
  className,
  ...props
}: ComponentProps<"button"> & { active?: boolean }) {
  return (
    <button
      type="button"
      className={cn(
        "flex w-full gap-3 rounded-xl px-2 py-1 text-left transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-purple-400/50",
        active ? "bg-white/[0.04] ring-1 ring-purple-400/25" : "hover:bg-white/[0.03]",
        className,
      )}
      {...props}
    />
  );
}

export function AiMessageAvatar({ children }: { children: ReactNode }) {
  return (
    <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-white/10 bg-white/[0.04] text-white/60">
      {children}
    </span>
  );
}

export function AiMessageBubble({
  from,
  className,
  ...props
}: ComponentProps<"div"> & { from: "user" | "assistant" }) {
  return (
    <div
      className={cn(
        from === "user"
          ? "max-w-[80%] whitespace-pre-wrap break-words rounded-2xl rounded-br-md bg-white px-4 py-2.5 text-[14.5px] leading-relaxed text-black"
          : "min-w-0 flex-1 text-[14.5px] leading-relaxed text-white/90",
        className,
      )}
      {...props}
    />
  );
}

export function AiMessageResponse({ children }: { children: string }) {
  return (
    <div className="prose-chat text-[14.5px] leading-relaxed text-white/90">
      <Streamdown>{children}</Streamdown>
    </div>
  );
}

export function AiPromptInputFrame({
  className,
  ...props
}: ComponentProps<"form">) {
  return (
    <form
      className={cn(
        "rounded-[1.5rem] border border-white/12 bg-white/[0.04] transition focus-within:border-purple-400/40",
        className,
      )}
      {...props}
    />
  );
}

export function AiPromptInputTextarea({
  className,
  ...props
}: ComponentProps<"textarea">) {
  return (
    <textarea
      className={cn(
        "max-h-56 w-full resize-none bg-transparent px-4 pt-3.5 text-[15px] leading-relaxed text-white placeholder:text-white/30 focus:outline-none",
        className,
      )}
      rows={1}
      {...props}
    />
  );
}

export function AiPromptInputFooter({
  className,
  ...props
}: ComponentProps<"div">) {
  return (
    <div className={cn("flex items-center gap-1.5 px-2.5 pb-2.5 pt-1", className)} {...props} />
  );
}

export function AiRoundAction({
  label,
  children,
  className,
  ...props
}: Omit<ComponentProps<"button">, "children"> & {
  label: string;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      className={cn(
        "flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-white/50 transition hover:bg-white/10 hover:text-white disabled:cursor-not-allowed disabled:opacity-30 disabled:hover:bg-transparent",
        className,
      )}
      {...props}
    >
      {children}
    </button>
  );
}

export function AiPromptSubmit({
  sending,
  className,
  ...props
}: ComponentProps<"button"> & { sending?: boolean }) {
  return (
    <button
      type="submit"
      aria-label={sending ? "Sending" : "Send"}
      className={cn(
        "flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-white text-black transition hover:shadow-lg hover:shadow-white/10 disabled:cursor-not-allowed disabled:opacity-30",
        className,
      )}
      {...props}
    >
      {sending ? <AiShimmerDot /> : <Icon.ArrowUp size={17} />}
    </button>
  );
}

export function AiAttachmentPreview({
  src,
  alt,
  onRemove,
  className,
}: {
  src: string;
  alt: string;
  onRemove?: () => void;
  className?: string;
}) {
  return (
    <div className={cn("relative inline-block", className)}>
      <img
        src={src}
        alt={alt}
        className="h-16 w-16 rounded-lg border border-white/15 object-cover"
      />
      {onRemove && (
        <button
          type="button"
          aria-label="Remove attachment"
          onClick={onRemove}
          className="absolute -right-1.5 -top-1.5 flex h-5 w-5 items-center justify-center rounded-full border border-white/20 bg-black text-white/80 transition hover:text-white"
        >
          <Icon.X size={11} />
        </button>
      )}
    </div>
  );
}

export function AiInlineImage({
  src,
  alt,
  className,
}: {
  src: string;
  alt: string;
  className?: string;
}) {
  return (
    <img
      src={src}
      alt={alt}
      className={cn(
        "max-h-56 max-w-[60%] rounded-2xl rounded-br-md border border-white/10 object-cover",
        className,
      )}
    />
  );
}

export function AiModelSelectorButton({
  label,
  open,
  className,
  ...props
}: ComponentProps<"button"> & { label: string; open: boolean }) {
  return (
    <button
      type="button"
      aria-haspopup="menu"
      aria-expanded={open}
      className={cn(
        "flex h-9 max-w-[180px] items-center gap-1.5 rounded-full border border-white/12 bg-white/5 px-3 text-[12px] text-white/75 transition hover:bg-white/10",
        className,
      )}
      {...props}
    >
      <Icon.Sparkles size={13} />
      <span className="truncate">{label}</span>
      <Icon.ChevronDown size={13} />
    </button>
  );
}

export function AiPanel({
  className,
  ...props
}: ComponentProps<"aside">) {
  return (
    <aside
      className={cn("flex min-h-0 flex-col border-l border-white/10 bg-[#080808]", className)}
      {...props}
    />
  );
}

export function AiReasoningBlock({ value }: { value: string }) {
  return (
    <div className="rounded-xl border border-white/10 bg-white/[0.03] p-3">
      <div className="mb-2 flex items-center gap-2 text-[11px] uppercase tracking-widest text-white/35">
        <Icon.Brain size={13} />
        Model reasoning
      </div>
      <pre className="whitespace-pre-wrap font-sans text-[12.5px] leading-relaxed text-white/80">
        {value}
      </pre>
    </div>
  );
}

export function AiTraceStep({
  icon,
  title,
  detail,
  href,
  live,
}: {
  icon: ReactNode;
  title: string;
  detail?: string;
  href?: string;
  live?: boolean;
}) {
  return (
    <div className="rounded-xl border border-white/8 bg-white/[0.03] px-3 py-2.5">
      <div className="flex items-start gap-2">
        <span
          className={cn(
            "mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border border-white/10 text-white/55",
            live && "motion-safe:animate-pulse border-purple-400/30 text-purple-200/80",
          )}
        >
          {icon}
        </span>
        <div className="min-w-0 flex-1">
          <div className="text-[12.5px] font-medium text-white/85">{title}</div>
          {detail ? (
            href ? (
              <a
                href={href}
                target="_blank"
                rel="noreferrer"
                className="mt-1 block truncate text-[11px] text-purple-300/90 hover:underline"
              >
                {detail}
              </a>
            ) : (
              <p className="mt-1 text-[11px] leading-relaxed text-white/40">{detail}</p>
            )
          ) : null}
        </div>
      </div>
    </div>
  );
}

export function AiSourceGroup({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <div>
      <div className="mb-2 text-[10px] uppercase tracking-widest text-white/30">{title}</div>
      <div className="space-y-2">{children}</div>
    </div>
  );
}

export function AiStatusPill({
  label,
  pulse,
  error,
}: {
  label: string;
  pulse?: boolean;
  error?: boolean;
}) {
  return (
    <div
      className={cn(
        "inline-flex items-center gap-2 rounded-full border px-3 py-1 text-[11px] font-medium",
        error
          ? "border-red-400/25 bg-red-400/10 text-red-200/90"
          : "border-white/10 bg-white/[0.04] text-white/70",
      )}
    >
      <span
        className={cn(
          "h-1.5 w-1.5 rounded-full bg-emerald-400",
          pulse && "motion-safe:animate-pulse",
          error && "bg-red-400",
        )}
      />
      {label}
    </div>
  );
}

function AiShimmerDot() {
  return (
    <span className="relative h-3.5 w-3.5">
      <span className="absolute inset-0 rounded-full bg-black/30 motion-safe:animate-ping" />
      <span className="absolute inset-1 rounded-full bg-black" />
    </span>
  );
}
