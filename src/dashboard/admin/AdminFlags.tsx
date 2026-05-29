import { useMutation, useQuery } from "convex/react";
import { anyApi } from "convex/server";
import { useState } from "react";
import { getDtourSessionToken } from "@/lib/session";
import { cn, Panel, Skeleton } from "@/ui";

type Flag = { key: string; enabled: boolean; description: string | null };

export function AdminFlags() {
  const token = getDtourSessionToken();
  const flags = useQuery(
    anyApi.flags.list,
    token ? { token } : "skip",
  ) as Flag[] | undefined;
  const setFlag = useMutation(anyApi.flags.set);
  const [busy, setBusy] = useState<string | null>(null);

  async function toggle(f: Flag) {
    if (!token) return;
    setBusy(f.key);
    try {
      await setFlag({ token, key: f.key, enabled: !f.enabled });
    } finally {
      setBusy(null);
    }
  }

  return (
    <Panel className="p-6">
      {flags === undefined ? (
        <Skeleton className="h-10 w-full" />
      ) : (
        <ul className="divide-y divide-white/5">
          {flags.map((f) => (
            <li key={f.key} className="flex items-center justify-between gap-4 py-3">
              <div className="min-w-0">
                <div className="font-mono text-sm text-white/90">{f.key}</div>
                {f.description && <div className="text-xs text-white/40">{f.description}</div>}
              </div>
              <button
                type="button"
                role="switch"
                aria-checked={f.enabled}
                aria-label={`Toggle ${f.key}`}
                disabled={busy === f.key}
                onClick={() => toggle(f)}
                className={cn(
                  "relative h-6 w-11 shrink-0 rounded-full transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-purple-400/60 disabled:opacity-50",
                  f.enabled ? "bg-purple-500/70" : "bg-white/10",
                )}
              >
                <span
                  className={cn(
                    "absolute top-0.5 h-5 w-5 rounded-full bg-white transition-all",
                    f.enabled ? "left-[22px]" : "left-0.5",
                  )}
                />
              </button>
            </li>
          ))}
        </ul>
      )}
    </Panel>
  );
}
