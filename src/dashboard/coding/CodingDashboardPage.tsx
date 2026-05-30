import { BashShell } from "@wterm/just-bash";
import { Terminal, type TerminalHandle } from "@wterm/react";
import "@wterm/react/css";
// Explicit ?url so Vite emits + hashes the terminal-core WASM; without this the
// library's default loader can't find it under our bundle.
// @ts-expect-error — Vite ?url asset import (typed by vite/client at build time).
import coreWasmUrl from "@wterm/core/wasm?url";
import { useCallback, useEffect, useRef, useState } from "react";
import { AppShell } from "@/dashboard/AppShell";
import { cn, Icon } from "@/ui";

/**
 * Coding dashboard — an embedded web terminal (wterm) with three selectable
 * backends. Only the in-browser sandbox has a live endpoint today; the runner
 * and self-host modes connect to a WebSocket PTY endpoint the moment one is
 * wired (ElizaCloud coding-remote-runner proxy, or the DOKS platform).
 */
type Backend = "sandbox" | "runner" | "selfhost";

const BACKENDS: {
  key: Backend;
  label: string;
  desc: string;
  live: boolean;
  icon: React.ReactNode;
}[] = [
  {
    key: "sandbox",
    label: "Sandbox",
    desc: "WASM bash, runs entirely in your browser — no server, fully isolated.",
    live: true,
    icon: <Icon.Shield size={13} />,
  },
  {
    key: "runner",
    label: "ElizaCloud runner",
    desc: "Real coding agent via ElizaCloud's coding-remote-runner (proxied).",
    live: false,
    icon: <Icon.Bot size={13} />,
  },
  {
    key: "selfhost",
    label: "Self-host",
    desc: "Your own gVisor-sandboxed container on DigitalOcean (DOKS).",
    live: false,
    icon: <Icon.Plug size={13} />,
  },
];

// Configurable per-backend WebSocket PTY endpoint. Empty until the backend
// exists; when set (e.g. wss://detour.ninja/coding/runner), the terminal wires
// straight through with no other change.
const WS_ENDPOINT: Record<Exclude<Backend, "sandbox">, string> = {
  runner: "",
  selfhost: "",
};

export default function CodingDashboardPage() {
  const [backend, setBackend] = useState<Backend>("sandbox");
  const active = BACKENDS.find((b) => b.key === backend)!;

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
          <span className="ml-auto hidden text-xs text-white/40 sm:block">{active.desc}</span>
        </div>

        {/* terminal — keyed by backend so switching cleanly remounts */}
        <div className="min-h-0 flex-1 p-3">
          <div className="h-full overflow-hidden rounded-xl border border-white/10 bg-black">
            <CodingTerminal key={backend} backend={backend} />
          </div>
        </div>
      </div>
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
    const url = WS_ENDPOINT[backend];
    if (!url) {
      write(
        "\r\n  \x1b[33mThis backend isn't connected yet.\x1b[0m\r\n" +
          "  It will go live the moment the " +
          (backend === "runner" ? "ElizaCloud coding-remote-runner" : "self-host DOKS") +
          " endpoint is wired —\r\n  no other change needed. Use the Sandbox backend meanwhile.\r\n",
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
        wsRef.current.send(data);
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
      autoResize
      cursorBlink
      className="h-full w-full"
    />
  );
}
