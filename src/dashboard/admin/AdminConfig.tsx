import { useMutation, useQuery } from "convex/react";
import { anyApi } from "convex/server";
import { useState } from "react";
import { getDtourSessionToken } from "@/lib/session";
import { cn, Panel, Skeleton } from "@/ui";

type Cfg = {
  key: string;
  value: string;
  type: string;
  category: string;
  description: string | null;
  public: boolean;
};

const field =
  "w-48 rounded-lg border border-white/15 bg-white/5 px-3 py-1.5 text-sm text-white focus:border-purple-400/50 focus:outline-none";

function decode(c: Cfg): string {
  try {
    const v = JSON.parse(c.value);
    if (c.type === "list") return (v as string[]).join(", ");
    if (c.type === "boolean") return v ? "true" : "false";
    return String(v);
  } catch {
    return c.value;
  }
}

export function AdminConfig() {
  const token = getDtourSessionToken();
  const items = useQuery(
    anyApi.config.list,
    token ? { token } : "skip",
  ) as Cfg[] | undefined;
  const setCfg = useMutation(anyApi.config.set);

  return (
    <Panel className="fade-up p-6" style={{ animationDelay: "200ms" }}>
      {items === undefined ? (
        <Skeleton className="h-40 w-full" />
      ) : (
        <div className="mt-4 space-y-6">
          {Object.entries(groupByCategory(items)).map(([cat, list]) => (
            <div key={cat}>
              <h3 className="text-[11px] uppercase tracking-widest text-white/40">{cat}</h3>
              <div className="mt-2 divide-y divide-white/5">
                {list.map((c) => (
                  <Row
                    key={`${c.key}:${c.value}`}
                    cfg={c}
                    onSave={(value) =>
                      token ? setCfg({ token, key: c.key, value }) : Promise.resolve()
                    }
                  />
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </Panel>
  );
}

function groupByCategory(items: Cfg[]): Record<string, Cfg[]> {
  const out: Record<string, Cfg[]> = {};
  for (const c of items) (out[c.category] ??= []).push(c);
  return out;
}

function Row({
  cfg,
  onSave,
}: {
  cfg: Cfg;
  onSave: (value: string) => Promise<unknown>;
}) {
  const initial = decode(cfg);
  const [val, setVal] = useState(initial);
  const [saving, setSaving] = useState(false);
  const changed = val !== initial;

  async function save(next?: string) {
    setSaving(true);
    try {
      await onSave(next ?? val);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="flex items-center justify-between gap-3 py-3">
      <div className="min-w-0">
        <div className="font-mono text-sm text-white/85">{cfg.key}</div>
        {cfg.description && <div className="text-xs text-white/40">{cfg.description}</div>}
      </div>
      <div className="flex shrink-0 items-center gap-2">
        {cfg.type === "boolean" ? (
          <button
            type="button"
            role="switch"
            aria-checked={val === "true"}
            aria-label={`Toggle ${cfg.key}`}
            disabled={saving}
            onClick={() => {
              const nv = val === "true" ? "false" : "true";
              setVal(nv);
              save(nv);
            }}
            className={cn(
              "relative h-6 w-11 rounded-full transition disabled:opacity-50",
              val === "true" ? "bg-purple-500/70" : "bg-white/10",
            )}
          >
            <span className={cn("absolute top-0.5 h-5 w-5 rounded-full bg-white transition-all", val === "true" ? "left-[22px]" : "left-0.5")} />
          </button>
        ) : (
          <>
            <input
              value={val}
              onChange={(e) => setVal(e.target.value)}
              type={cfg.type === "number" ? "number" : "text"}
              className={field}
            />
            {changed && (
              <button
                type="button"
                onClick={() => save()}
                disabled={saving}
                className="rounded-md bg-white px-3 py-1.5 text-xs font-semibold text-black transition hover:shadow disabled:opacity-50"
              >
                {saving ? "…" : "Save"}
              </button>
            )}
          </>
        )}
      </div>
    </div>
  );
}
