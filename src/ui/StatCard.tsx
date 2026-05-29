import type { ReactNode } from "react";
import { Panel } from "./Panel";
import { Skeleton } from "./Skeleton";

export function StatCard({
  label,
  value,
  sub,
  icon,
  loading = false,
}: {
  label: string;
  value: ReactNode;
  sub?: ReactNode;
  icon?: ReactNode;
  loading?: boolean;
}) {
  return (
    <Panel className="p-5 transition-colors hover:border-white/15">
      <div className="flex items-center justify-between">
        <span className="text-[11px] font-medium uppercase tracking-widest text-white/50">
          {label}
        </span>
        {icon && <span className="text-white/30">{icon}</span>}
      </div>
      {loading ? (
        <Skeleton className="mt-3 h-7 w-24" />
      ) : (
        <div className="mt-2 text-2xl font-semibold tabular-nums text-white">
          {value}
        </div>
      )}
      {sub && !loading && (
        <div className="mt-1 text-[12px] text-white/40">{sub}</div>
      )}
    </Panel>
  );
}
