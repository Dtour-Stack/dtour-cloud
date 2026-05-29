import type { ReactNode } from "react";
import { cn } from "./cn";

type Tone = "neutral" | "success" | "warning" | "danger" | "accent";

const tones: Record<Tone, string> = {
  neutral: "border-white/15 bg-white/5 text-white/70",
  success: "border-emerald-400/20 bg-emerald-400/5 text-emerald-300",
  warning: "border-amber-400/20 bg-amber-400/5 text-amber-200/90",
  danger: "border-red-400/20 bg-red-400/5 text-red-300",
  accent: "border-purple-400/25 bg-purple-400/10 text-purple-200",
};

export function Badge({
  tone = "neutral",
  className,
  children,
}: {
  tone?: Tone;
  className?: string;
  children: ReactNode;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-[11px] font-medium",
        tones[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}
