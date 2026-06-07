import { useMemo } from "react";
import type { ReactNode } from "react";
import { scenicMsgAt } from "@/lib/scenic-msgs";

export function EmptyState({
  icon,
  title,
  description,
  action,
  squirrel,
  scenic,
}: {
  icon?: ReactNode;
  title: string;
  description?: string;
  action?: ReactNode;
  /** Show the ninja squirrel mascot instead of the generic icon circle. */
  squirrel?: boolean;
  /** Use a rotating scenic-route description instead of a static one. */
  scenic?: boolean;
}) {
  const scenicDesc = useMemo(
    () => (scenic ? scenicMsgAt(Date.now() + Math.random() * 9999) : undefined),
    [scenic],
  );

  return (
    <div className="flex flex-col items-center justify-center px-6 py-14 text-center">
      {squirrel ? (
        <img
          src="/brand/dtour/ninja-squirrel.png"
          alt=""
          className="mb-4 h-14 w-14 object-contain opacity-60 drop-shadow-[0_0_12px_rgba(168,85,247,0.2)]"
        />
      ) : icon ? (
        <div className="mb-4 flex h-11 w-11 items-center justify-center rounded-full border border-white/10 bg-white/[0.03] text-white/40">
          {icon}
        </div>
      ) : null}
      <p className="text-sm font-medium text-white/80">{title}</p>
      {(description || scenicDesc) && (
        <p className="mt-1 max-w-xs text-[13px] leading-relaxed text-white/40">
          {description ?? scenicDesc}
        </p>
      )}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}
