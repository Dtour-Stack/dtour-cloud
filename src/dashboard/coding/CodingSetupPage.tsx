import { useMutation, useQuery } from "convex/react";
import { anyApi } from "convex/server";
import { QRCodeSVG } from "qrcode.react";
import { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
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

function normalizePairCode(raw: string): string {
  return raw.trim().toUpperCase().replace(/\s+/g, "");
}

export function CodingSetupPage() {
  const { backend, setBackend } = useCodingSession();
  const [relay, setRelay] = useState<RelayHealth>(null);
  const [params] = useSearchParams();
  const pairCode = normalizePairCode(params.get("pair") ?? "");

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

      {(backend === "selfhost" || pairCode) && <SelfHostPairing prefillCode={pairCode} />}

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

type PairingInfo =
  | { deviceName: string; status: "pending" | "approved" | "consumed" | "expired" }
  | null
  | undefined;

function SelfHostPairing({ prefillCode = "" }: { prefillCode?: string }) {
  const token = getDtourSessionToken();
  const normalizedPrefillCode = normalizePairCode(prefillCode);
  const deepLinked = normalizedPrefillCode.length > 0;
  const devices = useQuery(
    anyApi.codingDevices.listDevices,
    token ? { token } : "skip",
  ) as PairedDevice[] | undefined;
  const info = useQuery(
    anyApi.codingDevices.pairingInfo,
    deepLinked ? { code: normalizedPrefillCode } : "skip",
  ) as PairingInfo;
  const approve = useMutation(anyApi.codingDevices.approveDevicePairing);
  const revoke = useMutation(anyApi.codingDevices.revokeDevice);
  const [code, setCode] = useState(normalizedPrefillCode);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [copyState, setCopyState] = useState<"idle" | "copied" | "failed">("idle");

  useEffect(() => {
    if (deepLinked) setCode(normalizedPrefillCode);
  }, [deepLinked, normalizedPrefillCode]);

  const approveCode = async (raw: string) => {
    const c = normalizePairCode(raw);
    if (!token || c.length < 4) return;
    setBusy(true);
    setMsg(null);
    try {
      const result = (await approve({ token, code: c })) as { deviceName: string };
      setMsg({ ok: true, text: `Paired ${result.deviceName}.` });
      setCode("");
    } catch (e) {
      setMsg({ ok: false, text: e instanceof Error ? e.message : "Pairing failed" });
    } finally {
      setBusy(false);
    }
  };

  const copyApprovalLink = async () => {
    if (!navigator.clipboard) {
      setCopyState("failed");
      return;
    }
    try {
      await navigator.clipboard.writeText(window.location.href);
      setCopyState("copied");
    } catch {
      setCopyState("failed");
    }
  };

  const canApproveLinkedCode = Boolean(token && info?.status === "pending" && !busy);
  const linkedDeviceName = info?.status === "pending" ? info.deviceName : null;
  const approvalUrl = typeof window === "undefined" ? "" : window.location.href;
  const linkedStatus =
    info === undefined
      ? "Checking pairing code"
      : info === null
        ? "Pairing code not found"
        : info.status === "pending"
          ? `Ready to approve ${info.deviceName}`
          : info.status === "expired"
            ? "Pairing code expired"
            : "Pairing code already used";

  return (
    <section className="rounded-xl border border-white/10 bg-white/[0.02] p-4">
      <h2 className="mb-1 text-[11px] font-semibold uppercase tracking-widest text-white/35">
        {deepLinked ? "Approve this desktop" : "Pair your desktop"}
      </h2>

      {deepLinked ? (
        <div className="space-y-3">
          <p className="text-[13px] leading-relaxed text-white/60">
            Link{" "}
            <span className="font-medium text-white/90">
              {linkedDeviceName ?? "this desktop"}
            </span>{" "}
            to run coding sessions on your own machine with no sandbox charge.
          </p>
          <div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-start">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:pt-1">
              <code className="w-fit rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-sm tracking-widest text-white/75">
                {normalizedPrefillCode}
              </code>
              <button
                type="button"
                onClick={() => approveCode(normalizedPrefillCode)}
                disabled={!canApproveLinkedCode}
                className="w-fit rounded-lg bg-white px-5 py-2.5 text-sm font-medium text-black transition hover:bg-white/90 disabled:opacity-40"
              >
                {busy
                  ? "Approving..."
                  : linkedDeviceName
                    ? `Approve ${linkedDeviceName}`
                    : "Approve desktop"}
              </button>
              <button
                type="button"
                onClick={() => void copyApprovalLink()}
                className="w-fit rounded-lg border border-white/10 bg-white/[0.03] px-4 py-2.5 text-sm font-medium text-white/70 transition hover:bg-white/10 hover:text-white"
              >
                Copy approval link
              </button>
            </div>
            {approvalUrl && (
              <div className="order-first flex w-fit flex-col items-center gap-2 rounded-xl border border-white/10 bg-black/30 p-3 sm:order-none">
                <div className="rounded-lg bg-white p-2">
                  <QRCodeSVG
                    value={approvalUrl}
                    size={104}
                    role="img"
                    aria-label="Approval QR code"
                  />
                </div>
                <span className="text-center text-[10px] font-medium uppercase tracking-wide text-white/35">
                  Scan to approve
                </span>
              </div>
            )}
          </div>
          <p
            className={cn(
              "text-[12px]",
              info?.status === "pending" ? "text-emerald-300/90" : "text-white/40",
            )}
          >
            {linkedStatus}
          </p>
          {copyState !== "idle" && (
            <p
              className={cn(
                "text-[12px]",
                copyState === "copied" ? "text-emerald-300/90" : "text-amber-300/90",
              )}
            >
              {copyState === "copied"
                ? "Approval link copied."
                : "Could not copy approval link."}
            </p>
          )}
          {msg && (
            <p className={cn("text-[12px]", msg.ok ? "text-emerald-300/90" : "text-amber-300/90")}>
              {msg.text}
            </p>
          )}
        </div>
      ) : (
        <>
          <p className="mb-3 text-[12px] leading-relaxed text-white/45">
            Open the <span className="text-white/70">Detour desktop app</span> → enable Self-host →
            scan its QR, copy its approval link, or enter the 8-character code it shows. Sessions
            then run on your own computer — no sandbox charge.
          </p>
          <div className="flex items-center gap-2">
            <input
              value={code}
              onChange={(e) => setCode(normalizePairCode(e.target.value))}
              placeholder="ABCD1234"
              maxLength={8}
              className="w-36 rounded-lg border border-white/10 bg-black/30 px-3 py-2 font-mono text-sm uppercase tracking-widest text-white outline-none focus:border-violet-400/40"
            />
            <button
              type="button"
              onClick={() => approveCode(code)}
              disabled={busy || normalizePairCode(code).length < 4}
              className="rounded-lg bg-white px-4 py-2 text-sm font-medium text-black transition hover:bg-white/90 disabled:opacity-40"
            >
              {busy ? "Pairing..." : "Pair"}
            </button>
          </div>
          {msg && (
            <p className={cn("mt-2 text-[12px]", msg.ok ? "text-emerald-300/90" : "text-amber-300/90")}>
              {msg.text}
            </p>
          )}
        </>
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
