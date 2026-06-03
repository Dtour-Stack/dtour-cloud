import { useMutation, useQuery } from "convex/react";
import { anyApi } from "convex/server";
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { GuidedTour } from "@/dashboard/design/GuidedTour";
import { getDtourSessionToken } from "@/lib/session";
import { cn, Icon } from "@/ui";
import { useCodingSession, type CodingBackend } from "./CodingSessionContext";
import { CODING_TOUR } from "./codingGuide";

const BACKENDS: { key: CodingBackend; label: string; live: boolean }[] = [
  { key: "runner", label: "Detour Cloud (E2B)", live: true },
  { key: "sandbox", label: "Sandbox (browser)", live: true },
  { key: "selfhost", label: "Self-host (your machine)", live: true },
];

type RelayHealth = { ok: boolean; e2b: boolean; template: string } | null;

export function CodingSetupPage() {
  const { backend, setBackend } = useCodingSession();
  const [relay, setRelay] = useState<RelayHealth>(null);

  useEffect(() => {
    fetch("/coding-health")
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => setRelay(j as RelayHealth))
      .catch(() => setRelay(null));
  }, []);

  return (
    <div className="mx-auto max-w-lg space-y-6 px-6 py-8" data-tour="coding-setup">
      <header className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Setup</h1>
          <p className="mt-1 text-[13px] text-white/45">
            Pick a backend, then save agent API keys under Agents in the sidebar.
          </p>
        </div>
        <GuidedTour id="coding" heading="Coding" steps={CODING_TOUR} label="Guide" />
      </header>

      <section data-tour="coding-backends">
        <h2 className="mb-3 text-[11px] font-semibold uppercase tracking-widest text-white/35">
          Backend
        </h2>
        <div className="flex flex-col gap-2">
          {BACKENDS.map((b) => (
            <button
              key={b.key}
              type="button"
              onClick={() => setBackend(b.key)}
              className={cn(
                "flex items-center justify-between rounded-xl border px-3 py-3 text-left text-sm transition",
                backend === b.key
                  ? "border-violet-400/40 bg-violet-400/10 text-white"
                  : "border-white/10 text-white/70 hover:bg-white/5",
              )}
            >
              {b.label}
              {b.live ? (
                <span className="h-2 w-2 rounded-full bg-emerald-400" />
              ) : (
                <span className="text-[10px] uppercase text-white/35">soon</span>
              )}
            </button>
          ))}
        </div>
        <p className="mt-3 text-[12px] leading-relaxed text-white/45">
          Detour Cloud uses{" "}
          <a
            href="https://github.com/e2b-dev/e2b"
            target="_blank"
            rel="noreferrer"
            className="text-violet-300/90 underline-offset-2 hover:underline"
          >
            E2B
          </a>{" "}
          microVMs. Sandbox runs the same flow in your browser. Pick an agent in the sidebar
          (OpenCode, Codex, Claude, or Pi); each session creates{" "}
          <span className="font-mono text-white/60">~/workspace</span> and installs only that
          agent&apos;s CLI.
        </p>
      </section>

      {backend === "selfhost" && <SelfHostPairing />}

      <section className="rounded-xl border border-white/10 bg-white/[0.02] p-4 text-[12px] text-white/55">
        <p className="mb-2 font-medium text-white/80">Platform status</p>
        <ul className="space-y-2">
          <li className="flex items-start gap-2">
            <span
              className={cn(
                "mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full",
                relay?.e2b ? "bg-emerald-400" : "bg-amber-400",
              )}
            />
            E2B {relay?.e2b ? "connected" : "not configured on server"}
            {relay?.template && relay.template !== "default" && (
              <span className="text-white/35"> · template {relay.template}</span>
            )}
          </li>
        </ul>
        <Link
          to="/coding"
          className="mt-4 inline-flex items-center gap-1 text-violet-300/90 hover:underline"
        >
          Open terminal <Icon.ArrowUpRight size={12} />
        </Link>
      </section>
    </div>
  );
}

type PairedDevice = { id: string; name: string; lastSeenAt: number | null };

/** Link a Detour desktop app to this account so it can serve Self-host sessions.
 *  The app shows an 8-char code (codingDevices.startDevicePairing); entering it
 *  here approves the pairing and mints the device's relay token. */
function SelfHostPairing() {
  const token = getDtourSessionToken();
  const devices = useQuery(
    anyApi.codingDevices.listDevices,
    token ? { token } : "skip",
  ) as PairedDevice[] | undefined;
  const approve = useMutation(anyApi.codingDevices.approveDevicePairing);
  const revoke = useMutation(anyApi.codingDevices.revokeDevice);
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const onPair = async () => {
    const c = code.trim();
    if (!token || c.length < 4) return;
    setBusy(true);
    setMsg(null);
    try {
      const r = (await approve({ token, code: c })) as { deviceName?: string };
      setMsg({ ok: true, text: `Paired ${r.deviceName ?? "your desktop"}.` });
      setCode("");
    } catch (e) {
      setMsg({ ok: false, text: e instanceof Error ? e.message : "Pairing failed" });
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="rounded-xl border border-white/10 bg-white/[0.02] p-4">
      <h2 className="mb-1 text-[11px] font-semibold uppercase tracking-widest text-white/35">
        Pair your desktop
      </h2>
      <p className="mb-3 text-[12px] leading-relaxed text-white/45">
        Open the <span className="text-white/70">Detour desktop app</span> → enable Self-host →
        it shows an 8-character code. Enter it here to link this machine. Sessions then run on your
        own computer — no sandbox charge.
      </p>
      <div className="flex items-center gap-2">
        <input
          value={code}
          onChange={(e) => setCode(e.target.value.toUpperCase())}
          placeholder="ABCD1234"
          maxLength={8}
          className="w-36 rounded-lg border border-white/10 bg-black/30 px-3 py-2 font-mono text-sm uppercase tracking-widest text-white outline-none focus:border-violet-400/40"
        />
        <button
          type="button"
          onClick={onPair}
          disabled={busy || code.trim().length < 4}
          className="rounded-lg bg-white px-4 py-2 text-sm font-medium text-black transition hover:bg-white/90 disabled:opacity-40"
        >
          {busy ? "Pairing…" : "Pair"}
        </button>
      </div>
      {msg && (
        <p className={cn("mt-2 text-[12px]", msg.ok ? "text-emerald-300/90" : "text-amber-300/90")}>
          {msg.text}
        </p>
      )}
      {devices && devices.length > 0 && (
        <ul className="mt-4 space-y-2">
          {devices.map((d) => (
            <li
              key={d.id}
              className="flex items-center justify-between rounded-lg border border-white/10 px-3 py-2 text-[13px] text-white/70"
            >
              <span className="flex items-center gap-2">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
                {d.name}
              </span>
              <button
                type="button"
                onClick={() => {
                  if (token) void revoke({ token, id: d.id });
                }}
                className="text-[11px] uppercase tracking-wide text-white/35 transition hover:text-amber-300/90"
              >
                Unpair
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
