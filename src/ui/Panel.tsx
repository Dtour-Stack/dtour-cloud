import type { HTMLAttributes } from "react";
import { cn } from "./cn";

/** Glass panel — the base surface for dashboard content (DESIGN.md). */
export function Panel({
  className,
  children,
  ...props
}: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        "rounded-2xl border border-white/10 bg-white/[0.02] backdrop-blur-md",
        className,
      )}
      {...props}
    >
      {children}
    </div>
  );
}
