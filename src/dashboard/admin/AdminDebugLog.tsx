import { useQuery } from "convex/react";
import { anyApi } from "convex/server";
import { getDtourSessionToken } from "@/lib/session";
import { useFlag } from "@/lib/useFlags";
import { EmptyState, Icon, Panel, Skeleton } from "@/ui";

type Ev = { type: string; pubkey: string | null; data: string | null; at: number };

export function AdminDebugLog() {
  const enabled = useFlag("admin_debug_panel");
  const token = getDtourSessionToken();
  const events = useQuery(
    anyApi.events.recent,
    enabled && token ? { token, limit: 40 } : "skip",
  ) as Ev[] | undefined;

  if (!enabled) {
    return (
      <Panel className="p-6">
        <EmptyState
          icon={<Icon.List size={20} />}
          title="Activity log is off"
          description="Enable the “admin_debug_panel” feature flag (Admin → Feature Flags) to record and view events here."
        />
      </Panel>
    );
  }

  return (
    <Panel className="p-6">
      {events === undefined ? (
        <Skeleton className="h-24 w-full" />
      ) : events.length === 0 ? (
        <EmptyState icon={<Icon.Activity size={20} />} title="No events yet" />
      ) : (
        <ul className="space-y-1.5 font-mono text-xs">
          {events.map((e, i) => (
            <li
              key={`${e.at}-${i}`}
              className="flex items-center gap-3 overflow-hidden text-white/60"
            >
              <span className="shrink-0 text-white/30">
                {new Date(e.at).toLocaleTimeString()}
              </span>
              <span className="shrink-0 text-purple-300/80">{e.type}</span>
              {e.pubkey && (
                <span className="shrink-0 text-white/40">{e.pubkey.slice(0, 4)}…</span>
              )}
              {e.data && <span className="truncate text-white/30">{e.data}</span>}
            </li>
          ))}
        </ul>
      )}
    </Panel>
  );
}
