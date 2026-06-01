import { useAction, useQuery } from "convex/react";
import { anyApi } from "convex/server";
import { useEffect, useState } from "react";
import { GuidedTour } from "@/dashboard/design/GuidedTour";
import { CODING_PROVIDERS, type CodingProviderId } from "@/lib/codingProviders";
import { cn, Icon } from "@/ui";
import { CODING_TOUR } from "./codingGuide";

type Backend = "runner" | "sandbox" | "selfhost";

const BACKENDS: {
  key: Backend;
  label: string;
  live: boolean;
}[] = [
  { key: "runner", label: "Detour Cloud (E2B)", live: true },
  { key: "sandbox", label: "Sandbox (browser)", live: true },
  { key: "selfhost", label: "Self-host", live: false },
];

type KeyRow = { id: string; configured: boolean; prefix: string | null };

type RelayHealth = { ok: boolean; e2b: boolean; template: string } | null;

export function CodingSidebar({
  backend,
  onBackend,
  activeProvider,
  onProvider,
  token,
  onLaunchInTerminal,
}: {
  backend: Backend;
  onBackend: (b: Backend) => void;
  activeProvider: CodingProviderId;
  onProvider: (p: CodingProviderId) => void;
  token: string | null;
  onLaunchInTerminal: (cmd: string) => void;
}) {
  const keys = useQuery(
    anyApi.codingProviders.listKeys,
    token ? { token } : "skip",
  ) as KeyRow[] | null | undefined;
  const setKey = useAction(anyApi.codingProviderActions.setKeyForUi);
  const [relay, setRelay] = useState<RelayHealth>(null);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const provider = CODING_PROVIDERS.find((p) => p.id === activeProvider)!;
  const keyRow = keys?.find((k) => k.id === activeProvider);

  useEffect(() => {
    fetch("/coding-health")
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => setRelay(j as RelayHealth))
      .catch(() => setRelay(null));
  }, []);

  async function saveKey() {
    if (!token || !draft.trim()) return;
    setBusy(true);
    setMsg(null);
    try {
      await setKey({ token, uiProvider: activeProvider, apiKey: draft.trim() });
      setDraft("");
      setMsg(
        backend === "sandbox"
          ? "Saved — refresh Sandbox (re-open backend) to inject keys."
          : "Saved — reconnect Detour Cloud to inject into E2B.",
      );
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Couldn't save key");
    } finally {
      setBusy(false);
    }
  }

  return (
    <aside className="flex w-[300px] shrink-0 border-r border-white/10 bg-[#0a0a0e]">
      {/* Agent tabs — vertical rail */}
      <nav
        className="flex w-[52px] shrink-0 flex-col border-r border-white/10 py-2"
        data-tour="coding-providers"
        aria-label="Coding agents"
      >
        {CODING_PROVIDERS.map((p) => {
          const configured = keys?.find((k) => k.id === p.id)?.configured;
          return (
            <button
              key={p.id}
              type="button"
              title={p.label}
              onClick={() => onProvider(p.id)}
              className={cn(
                "relative mx-1.5 mb-1 flex flex-col items-center rounded-lg py-2.5 text-[10px] font-semibold transition",
                activeProvider === p.id
                  ? "bg-violet-400/15 text-violet-100 ring-1 ring-violet-400/40"
                  : "text-white/50 hover:bg-white/5 hover:text-white/80",
              )}
            >
              <span className="text-[11px] leading-none">{p.shortLabel}</span>
              {configured && (
                <span className="absolute right-1 top-1 h-1.5 w-1.5 rounded-full bg-emerald-400" />
              )}
            </button>
          );
        })}
      </nav>

      <div className="flex min-w-0 flex-1 flex-col">
        <div className="flex items-center justify-between gap-2 border-b border-white/10 px-3 py-2.5">
          <span className="truncate text-[11px] font-medium text-white/70">{provider.label}</span>
          <GuidedTour id="coding" heading="Coding" steps={CODING_TOUR} label="Guide" />
        </div>

        <div className="flex-1 overflow-y-auto p-3 space-y-4">
          <section data-tour="coding-setup">
            <h3 className="mb-2 text-[10px] font-semibold uppercase tracking-widest text-white/35">
              Setup
            </h3>
            <ul className="space-y-1.5 text-[11px] text-white/55">
              <li className="flex items-start gap-2">
                <span
                  className={cn(
                    "mt-1 h-1.5 w-1.5 shrink-0 rounded-full",
                    relay?.e2b ? "bg-emerald-400" : "bg-amber-400",
                  )}
                />
                <span>
                  E2B platform key{" "}
                  {relay?.e2b ? (
                    <span className="text-emerald-300/90">live</span>
                  ) : (
                    <span className="text-amber-200/90">set E2B_API_KEY on server</span>
                  )}
                  {relay?.template && relay.template !== "default" && (
                    <span className="text-white/35"> · {relay.template}</span>
                  )}
                </span>
              </li>
              <li className="flex items-start gap-2">
                <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-white/25" />
                <span>
                  Powered by{" "}
                  <a
                    href="https://github.com/e2b-dev/e2b"
                    target="_blank"
                    rel="noreferrer"
                    className="text-violet-300/90 underline-offset-2 hover:underline"
                  >
                    E2B
                  </a>{" "}
                  — get a key at{" "}
                  <a
                    href="https://e2b.dev"
                    target="_blank"
                    rel="noreferrer"
                    className="text-violet-300/90 underline-offset-2 hover:underline"
                  >
                    e2b.dev
                  </a>
                  .
                </span>
              </li>
              <li className="flex items-start gap-2">
                <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-white/25" />
                <span>Save model keys below — encrypted, injected into E2B or Sandbox.</span>
              </li>
            </ul>
          </section>

          <section data-tour="coding-backends">
            <h3 className="mb-2 text-[10px] font-semibold uppercase tracking-widest text-white/35">
              Backend
            </h3>
            <div className="flex flex-col gap-1">
              {BACKENDS.map((b) => (
                <button
                  key={b.key}
                  type="button"
                  onClick={() => onBackend(b.key)}
                  className={cn(
                    "flex items-center justify-between rounded-lg border px-2.5 py-2 text-left text-[12px] transition",
                    backend === b.key
                      ? "border-violet-400/40 bg-violet-400/10 text-white"
                      : "border-white/10 text-white/65 hover:bg-white/5",
                  )}
                >
                  {b.label}
                  {b.live ? (
                    <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
                  ) : (
                    <span className="text-[9px] uppercase text-white/35">soon</span>
                  )}
                </button>
              ))}
            </div>
            <p className="mt-2 text-[10px] leading-relaxed text-white/40">
              Both backends install OpenCode, Codex, Claude Code, and Pi. Detour Cloud runs them in
              E2B microVMs; Sandbox runs them via npm in your browser (needs network).
            </p>
          </section>

          <section data-tour="coding-launch">
            <h3 className="mb-2 text-[10px] font-semibold uppercase tracking-widest text-white/35">
              API key
            </h3>
            <p className="mb-2 text-[11px] leading-relaxed text-white/45">{provider.hint}</p>
            {keyRow?.configured && keyRow.prefix && (
              <p className="mb-2 font-mono text-[10px] text-white/40">saved {keyRow.prefix}</p>
            )}
            <input
              type="password"
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              placeholder={`${provider.envVar} — paste once`}
              className="mb-2 w-full rounded-lg border border-white/12 bg-black/40 px-2.5 py-2 text-[12px] text-white placeholder:text-white/30 focus:border-violet-400/40 focus:outline-none"
            />
            <button
              type="button"
              disabled={busy || !draft.trim() || !token}
              onClick={saveKey}
              className="mb-2 w-full rounded-lg bg-white/10 py-2 text-[12px] font-medium text-white transition hover:bg-white/15 disabled:opacity-40"
            >
              {busy ? "Saving…" : "Save key"}
            </button>
            {msg && <p className="mb-2 text-[10px] text-violet-200/90">{msg}</p>}
            <button
              type="button"
              onClick={() => onLaunchInTerminal(provider.launchCmd)}
              className="mb-1.5 w-full rounded-lg border border-violet-400/30 bg-violet-400/10 py-2 text-[12px] text-violet-100 transition hover:bg-violet-400/15"
            >
              Run <span className="font-mono">{provider.launchCmd}</span>
            </button>
            <a
              href={provider.docsUrl}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1 text-[10px] text-white/40 hover:text-white/70"
            >
              {provider.label} docs <Icon.ArrowUpRight size={11} />
            </a>
          </section>
        </div>
      </div>
    </aside>
  );
}
