import { useMutation, useQuery } from "convex/react";
import { anyApi } from "convex/server";
import { useMemo, useState } from "react";
import { getDtourSessionToken } from "@/lib/session";
import { Badge, cn, Panel, Skeleton } from "@/ui";

type FlagRow = {
  key: string;
  enabled: boolean;
  label: string;
  description: string;
  category: string;
  kind: string;
  status: string | null;
  routes: string[] | null;
  defaultEnabled: boolean;
  seeded: boolean;
};

type CategoryMeta = Record<string, { label: string; description: string }>;

const KIND_LABEL: Record<string, { text: string; tone: "warning" | "accent" | "neutral" }> = {
  kill_switch: { text: "Kill switch", tone: "warning" },
  opt_in: { text: "Opt-in", tone: "accent" },
  product: { text: "Product", tone: "neutral" },
};

const STATUS_LABEL: Record<string, string> = {
  live: "Live",
  beta: "Beta",
  planned: "Planned",
};

const CATEGORY_ORDER = ["ops", "inference", "surfaces", "builders", "admin"];

export function AdminFlags() {
  const token = getDtourSessionToken();
  const flags = useQuery(
    anyApi.flags.list,
    token ? { token } : "skip",
  ) as FlagRow[] | undefined;
  const categories = useQuery(anyApi.flags.categories, {}) as CategoryMeta | undefined;
  const setFlag = useMutation(anyApi.flags.set);
  const [busy, setBusy] = useState<string | null>(null);
  const [filter, setFilter] = useState("");

  const grouped = useMemo(() => {
    if (!flags) return [];
    const q = filter.trim().toLowerCase();
    const filtered = q
      ? flags.filter(
          (f) =>
            f.key.includes(q) ||
            f.label.toLowerCase().includes(q) ||
            f.description.toLowerCase().includes(q),
        )
      : flags;
    return CATEGORY_ORDER.map((cat) => ({
      id: cat,
      meta: categories?.[cat],
      items: filtered.filter((f) => f.category === cat),
    })).filter((g) => g.items.length > 0);
  }, [flags, filter, categories]);

  async function toggle(f: FlagRow) {
    if (!token) return;
    setBusy(f.key);
    try {
      await setFlag({ token, key: f.key, enabled: !f.enabled });
    } finally {
      setBusy(null);
    }
  }

  const enabledCount = flags?.filter((f) => f.enabled).length ?? 0;

  return (
    <div className="space-y-4">
      <Panel className="border-violet-400/15 bg-violet-400/[0.04] p-4">
        <p className="text-sm font-medium text-white/90">Dev: force all inference free</p>
        <p className="mt-1 text-[13px] leading-relaxed text-white/50">
          Set Convex deployment env{" "}
          <code className="rounded bg-white/10 px-1.5 py-0.5 font-mono text-[12px] text-violet-200">
            FREETOUR=1
          </code>{" "}
          to route every inference call through free OpenRouter models with no per-user daily cap.
          User-facing freetour is controlled by{" "}
          <span className="font-mono text-white/70">freetour_user_visible</span> +{" "}
          <span className="font-mono text-white/70">freetour_enabled</span> below.
        </p>
        <p className="mt-2 text-[12px] text-white/35">
          Seed new flags after deploy:{" "}
          <code className="font-mono">bunx convex run flags:seed</code>
        </p>
      </Panel>

      <div className="flex flex-wrap items-center gap-3">
        <input
          type="search"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          placeholder="Search flags…"
          className="min-w-[200px] flex-1 rounded-lg border border-white/15 bg-white/5 px-3 py-2 text-sm text-white placeholder:text-white/30 focus:border-purple-400/50 focus:outline-none"
        />
        {flags && (
          <span className="text-[13px] text-white/45">
            {enabledCount} / {flags.length} on
          </span>
        )}
      </div>

      {flags === undefined ? (
        <Panel className="p-6">
          <Skeleton className="h-40 w-full" />
        </Panel>
      ) : grouped.length === 0 ? (
        <Panel className="p-8 text-center text-sm text-white/45">No flags match your search.</Panel>
      ) : (
        grouped.map(({ id, meta, items }) => (
          <Panel key={id} className="overflow-hidden">
            <div className="border-b border-white/10 bg-white/[0.02] px-5 py-4">
              <h3 className="text-sm font-semibold text-white">{meta?.label ?? id}</h3>
              {meta?.description && (
                <p className="mt-0.5 text-[12px] text-white/45">{meta.description}</p>
              )}
            </div>
            <ul className="divide-y divide-white/5">
              {items.map((f) => (
                <FlagRowItem key={f.key} flag={f} busy={busy === f.key} onToggle={() => toggle(f)} />
              ))}
            </ul>
          </Panel>
        ))
      )}
    </div>
  );
}

function FlagRowItem({
  flag: f,
  busy,
  onToggle,
}: {
  flag: FlagRow;
  busy: boolean;
  onToggle: () => void;
}) {
  const kind = KIND_LABEL[f.kind] ?? { text: "Product", tone: "neutral" as const };
  const effectiveOn =
    f.kind === "kill_switch"
      ? f.enabled !== false
      : f.kind === "opt_in"
        ? f.enabled === true
        : f.enabled === true;

  return (
    <li className="flex items-start justify-between gap-4 px-5 py-4 transition hover:bg-white/[0.02]">
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm font-medium text-white">{f.label}</span>
          <Badge tone={kind.tone}>{kind.text}</Badge>
          {f.status && (
            <Badge tone={f.status === "live" ? "success" : f.status === "beta" ? "accent" : "neutral"}>
              {STATUS_LABEL[f.status] ?? f.status}
            </Badge>
          )}
          {!f.seeded && (
            <Badge tone="warning">Unseeded</Badge>
          )}
        </div>
        <p className="mt-1 text-[13px] leading-relaxed text-white/45">{f.description}</p>
        <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-white/30">
          <span className="font-mono">{f.key}</span>
          <span>·</span>
          <span>
            Default: {f.defaultEnabled ? "on" : "off"}
          </span>
          <span>·</span>
          <span className={effectiveOn ? "text-emerald-300/80" : "text-white/35"}>
            Effective: {effectiveOn ? "on" : "off"}
          </span>
          {f.routes?.length ? (
            <>
              <span>·</span>
              <span className="truncate">{f.routes.join(", ")}</span>
            </>
          ) : null}
        </div>
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={f.enabled}
        aria-label={`Toggle ${f.label}`}
        disabled={busy}
        onClick={onToggle}
        className={cn(
          "relative mt-1 h-6 w-11 shrink-0 rounded-full transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-purple-400/60 disabled:opacity-50",
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
  );
}
