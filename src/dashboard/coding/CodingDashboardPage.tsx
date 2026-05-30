import { BashShell } from "@wterm/just-bash";
import { Terminal, type TerminalHandle } from "@wterm/react";
import "@wterm/react/css";
// Explicit ?url so Vite emits + hashes the terminal-core WASM; without this the
// library's default loader can't find it under our bundle.
// @ts-expect-error — Vite ?url asset import (typed by vite/client at build time).
import coreWasmUrl from "@wterm/core/wasm?url";
import { useQuery } from "convex/react";
import { anyApi } from "convex/server";
import { useCallback, useEffect, useRef, useState } from "react";
import { AppShell } from "@/dashboard/AppShell";
import { getDtourSessionToken } from "@/lib/session";
import { Button, cn, Icon } from "@/ui";
import { TopUpModal } from "./TopUpModal";

/**
 * Coding dashboard — an embedded web terminal (wterm). The primary backend is a
 * real E2B Firecracker sandbox bridged over WebSocket by the coding-relay
 * service (server holds the E2B key; goes live once E2B_API_KEY is set). Also a
 * zero-server in-browser sandbox, and a placeholder for a future self-host tier.
 */
type Backend = "runner" | "sandbox" | "selfhost";

const BACKENDS: {
  key: Backend;
  label: string;
  desc: string;
  live: boolean;
  icon: React.ReactNode;
}[] = [
  {
    key: "runner",
    label: "Detour Cloud",
    desc: "Real coding agent in an E2B Firecracker microVM (server-side, isolated).",
    live: true,
    icon: <Icon.Bot size={13} />,
  },
  {
    key: "sandbox",
    label: "Sandbox",
    desc: "WASM bash, runs entirely in your browser — no server.",
    live: true,
    icon: <Icon.Shield size={13} />,
  },
  {
    key: "selfhost",
    label: "Self-host",
    desc: "Your own gVisor/Firecracker container (DOKS) — future sovereign tier.",
    live: false,
    icon: <Icon.Plug size={13} />,
  },
];

/** WebSocket PTY endpoint for a backend, or "" if none. The runner points at the
 *  same-origin coding-relay (/coding-ws), authenticated with the session token. */
function wsEndpoint(backend: Backend): string {
  if (backend === "runner" && typeof window !== "undefined") {
    const token = getDtourSessionToken();
    if (!token) return "";
    const proto = window.location.protocol === "https:" ? "wss" : "ws";
    return `${proto}://${window.location.host}/coding-ws?token=${encodeURIComponent(token)}`;
  }
  return ""; // selfhost: pending its endpoint
}

type Credits = { balanceUsd: number; holder: boolean } | null | undefined;
type Pricing =
  | { example: { nonHolderPerHourUsd: number; holderPerHourUsd: number } }
  | undefined;

export default function CodingDashboardPage() {
  const [backend, setBackend] = useState<Backend>("runner");
  const active = BACKENDS.find((b) => b.key === backend)!;
  const token = getDtourSessionToken();
  const credits = useQuery(
    anyApi.coding.myCredits,
    token ? { token } : "skip",
  ) as Credits;
  const pricing = useQuery(anyApi.coding.pricing, {}) as Pricing;
  const rateUsd = pricing
    ? credits?.holder
      ? pricing.example.holderPerHourUsd
      : pricing.example.nonHolderPerHourUsd
    : null;
  const lowBalance = backend === "runner" && credits != null && credits.balanceUsd < 0.05;
  const [topUpOpen, setTopUpOpen] = useState(false);

  return (
    <AppShell title="Coding" context="coding" bare>
      <div className="flex h-full flex-col bg-[#08080b]">
        {/* backend selector */}
        <div className="flex flex-wrap items-center gap-2 border-b border-white/10 px-4 py-3">
          <span className="text-xs uppercase tracking-widest text-white/40">Backend</span>
          {BACKENDS.map((b) => (
            <button
              key={b.key}
              type="button"
              onClick={() => setBackend(b.key)}
              className={cn(
                "flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-[12px] transition",
                backend === b.key
                  ? "border-violet-400/50 bg-violet-400/10 text-white"
                  : "border-white/10 text-white/65 hover:bg-white/5 hover:text-white",
              )}
            >
              {b.icon}
              {b.label}
              {b.live ? (
                <span className="ml-0.5 h-1.5 w-1.5 rounded-full bg-emerald-400" title="Live" />
              ) : (
                <span className="ml-0.5 rounded-full bg-white/10 px-1.5 text-[9px] uppercase text-white/45">
                  soon
                </span>
              )}
            </button>
          ))}
          <div className="ml-auto flex items-center gap-3">
            <span className="hidden text-xs text-white/40 lg:block">{active.desc}</span>
            {backend === "runner" && (
              <div
                className={cn(
                  "flex items-center gap-2 rounded-full border px-3 py-1.5 text-[12px]",
                  lowBalance
                    ? "border-amber-400/40 bg-amber-400/10 text-amber-200"
                    : "border-white/10 bg-white/[0.03] text-white/70",
                )}
                title={
                  rateUsd != null
                    ? `Metered E2B cost × 2 (holders −20%) → ~$${rateUsd.toFixed(2)}/sandbox-hr`
                    : undefined
                }
              >
                <Icon.Coins size={13} />
                {credits === undefined ? (
                  "…"
                ) : (
                  <>
                    <span className="tabular-nums">
                      ${(credits?.balanceUsd ?? 0).toFixed(2)}
                    </span>
                    {rateUsd != null && (
                      <span className="text-white/40">
                        · ~${rateUsd.toFixed(2)}/hr{credits?.holder ? " · holder" : ""}
                      </span>
                    )}
                  </>
                )}
              </div>
            )}
            {backend === "runner" && (
              <Button size="sm" variant="secondary" onClick={() => setTopUpOpen(true)}>
                <Icon.Plus size={13} /> Top up
              </Button>
            )}
          </div>
        </div>
        {lowBalance && (
          <div className="flex items-center justify-between gap-3 border-b border-amber-400/20 bg-amber-400/[0.06] px-4 py-2 text-xs text-amber-200/90">
            <span>Low credits — top up with $DTOUR to keep running Detour Cloud sandboxes.</span>
            <button
              type="button"
              onClick={() => setTopUpOpen(true)}
              className="shrink-0 rounded-full bg-amber-400/20 px-3 py-1 font-medium text-amber-100 transition hover:bg-amber-400/30"
            >
              Top up
            </button>
          </div>
        )}

        {/* terminal — keyed by backend so switching cleanly remounts */}
        <div className="min-h-0 flex-1 p-3">
          <div className="h-full overflow-hidden rounded-xl border border-white/10 bg-black">
            <CodingTerminal key={backend} backend={backend} />
          </div>
        </div>
      </div>
      {topUpOpen && token && (
        <TopUpModal token={token} onClose={() => setTopUpOpen(false)} onCredited={() => {}} />
      )}
    </AppShell>
  );
}

function CodingTerminal({ backend }: { backend: Backend }) {
  const termRef = useRef<TerminalHandle>(null);
  const shellRef = useRef<BashShell | null>(null);
  const wsRef = useRef<WebSocket | null>(null);

  const write = useCallback((d: string | Uint8Array) => {
    termRef.current?.write(d);
  }, []);

  const onReady = useCallback(async () => {
    if (backend === "sandbox") {
      const shell = new BashShell({
        greeting: [
          "Detour Cloud — sandboxed bash (in-browser WASM).",
          "Everything here runs in your browser. Try: ls, echo hi, help",
          "",
        ],
      });
      await shell.attach((out) => write(out));
      shellRef.current = shell;
      return;
    }
    const url = wsEndpoint(backend);
    if (!url) {
      write(
        "\r\n  \x1b[33mThis backend isn't connected yet.\x1b[0m\r\n" +
          "  The self-host (DOKS) tier is future work — use Detour Cloud or the\r\n" +
          "  in-browser Sandbox meanwhile.\r\n",
      );
      return;
    }
    const ws = new WebSocket(url);
    ws.binaryType = "arraybuffer";
    ws.onmessage = (e) =>
      write(typeof e.data === "string" ? e.data : new Uint8Array(e.data as ArrayBuffer));
    ws.onerror = () => write("\r\n  \x1b[31mconnection error\x1b[0m\r\n");
    ws.onclose = () => write("\r\n  session closed.\r\n");
    wsRef.current = ws;
  }, [backend, write]);

  const onData = useCallback(
    (data: string) => {
      if (backend === "sandbox") {
        void shellRef.current?.handleInput(data);
      } else if (wsRef.current?.readyState === WebSocket.OPEN) {
        wsRef.current.send("d" + data); // "d" = PTY input (see relay wire protocol)
      }
    },
    [backend],
  );

  const onResize = useCallback(
    (cols: number, rows: number) => {
      if (backend !== "sandbox" && wsRef.current?.readyState === WebSocket.OPEN) {
        wsRef.current.send("r" + JSON.stringify({ cols, rows }));
      }
    },
    [backend],
  );

  useEffect(() => {
    const ws = wsRef.current;
    return () => {
      ws?.close();
    };
  }, []);

  return (
    <Terminal
      ref={termRef}
      wasmUrl={coreWasmUrl}
      onReady={onReady}
      onData={onData}
      onResize={onResize}
      autoResize
      cursorBlink
      className="h-full w-full"
    />
  );
}
