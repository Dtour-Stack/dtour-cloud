import { BashShell } from "@wterm/just-bash";
import { Terminal, type TerminalHandle } from "@wterm/react";
import "@wterm/react/css";
// @ts-expect-error — Vite ?url asset import
import coreWasmUrl from "@wterm/core/wasm?url";
import { useAction, useQuery } from "convex/react";
import { anyApi } from "convex/server";
import { useCallback, useEffect, useRef, useState } from "react";
import { AppShell } from "@/dashboard/AppShell";
import { CODING_CLI_NPM_INSTALL } from "@/lib/codingCliInstall";
import { providerById, type CodingProviderId } from "@/lib/codingProviders";
import { envExportScript } from "@/lib/codingSandboxEnv";
import { getDtourSessionToken } from "@/lib/session";
import { Button, cn, Icon } from "@/ui";
import { CodingSidebar } from "./CodingSidebar";
import { TopUpModal } from "./TopUpModal";

type Backend = "runner" | "sandbox" | "selfhost";

function wsEndpoint(backend: Backend): string {
  if (backend === "runner" && typeof window !== "undefined") {
    const token = getDtourSessionToken();
    if (!token) return "";
    const proto = window.location.protocol === "https:" ? "wss" : "ws";
    return `${proto}://${window.location.host}/coding-ws?token=${encodeURIComponent(token)}`;
  }
  return "";
}

type Credits = { balanceUsd: number; holder: boolean } | null | undefined;
type Pricing =
  | { example: { nonHolderPerHourUsd: number; holderPerHourUsd: number } }
  | undefined;

export default function CodingDashboardPage() {
  const [backend, setBackend] = useState<Backend>("runner");
  const [activeProvider, setActiveProvider] = useState<CodingProviderId>("opencode");
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
  const injectRef = useRef<((cmd: string) => void) | null>(null);

  const onLaunchInTerminal = useCallback((cmd: string) => {
    injectRef.current?.(`${cmd}\r`);
  }, []);

  return (
    <AppShell title="Coding" context="coding" bare>
      <div className="flex h-full flex-col bg-[#08080b]">
        <div className="flex flex-wrap items-center gap-2 border-b border-white/10 px-4 py-2">
          <span className="text-xs text-white/50">
            OpenCode · Codex · Claude · Pi — E2B or in-browser Sandbox
          </span>
          <div className="ml-auto flex items-center gap-3">
            {backend === "runner" && (
              <div
                className={cn(
                  "flex items-center gap-2 rounded-full border px-3 py-1.5 text-[12px]",
                  lowBalance
                    ? "border-amber-400/40 bg-amber-400/10 text-amber-200"
                    : "border-white/10 bg-white/[0.03] text-white/70",
                )}
              >
                <Icon.Coins size={13} />
                {credits === undefined ? (
                  "…"
                ) : (
                  <>
                    <span className="tabular-nums">${(credits?.balanceUsd ?? 0).toFixed(2)}</span>
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

        <div className="flex min-h-0 flex-1">
          <CodingSidebar
            backend={backend}
            onBackend={setBackend}
            activeProvider={activeProvider}
            onProvider={setActiveProvider}
            token={token}
            onLaunchInTerminal={onLaunchInTerminal}
          />
          <div className="min-h-0 flex-1 p-3" data-tour="coding-terminal">
            <div className="h-full overflow-hidden rounded-xl border border-white/10 bg-black">
              <CodingTerminal
                key={`${backend}-${token ?? "anon"}`}
                backend={backend}
                activeProvider={activeProvider}
                token={token}
                injectRef={injectRef}
              />
            </div>
          </div>
        </div>
      </div>
      {topUpOpen && token && (
        <TopUpModal token={token} onClose={() => setTopUpOpen(false)} onCredited={() => {}} />
      )}
    </AppShell>
  );
}

function CodingTerminal({
  backend,
  activeProvider,
  token,
  injectRef,
}: {
  backend: Backend;
  activeProvider: CodingProviderId;
  token: string | null;
  injectRef: React.MutableRefObject<((cmd: string) => void) | null>;
}) {
  const termRef = useRef<TerminalHandle>(null);
  const shellRef = useRef<BashShell | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const provider = providerById(activeProvider);
  const sessionEnv = useAction(anyApi.codingProviderActions.sessionEnvForSandbox);

  const write = useCallback((d: string | Uint8Array) => {
    termRef.current?.write(d);
  }, []);

  useEffect(() => {
    injectRef.current = (cmd: string) => {
      if (backend === "sandbox") {
        void shellRef.current?.handleInput(cmd);
      } else if (wsRef.current?.readyState === WebSocket.OPEN) {
        wsRef.current.send("d" + cmd);
      }
    };
    return () => {
      injectRef.current = null;
    };
  }, [backend, injectRef]);

  const onReady = useCallback(async () => {
    if (backend === "sandbox") {
      const shell = new BashShell({
        env: { TERM: "xterm-256color", SHELL: "/bin/bash" },
        greeting: [
          "Detour — in-browser Sandbox (WASM bash + npm CLIs).",
          "Installing OpenCode, Codex, Claude Code, Pi (first connect may take ~1 min)…",
          "",
        ],
      });
      await shell.attach((out) => write(out));
      shellRef.current = shell;

      let userEnv: Record<string, string> = {};
      if (token) {
        try {
          userEnv = ((await sessionEnv({ token })) as Record<string, string> | null) ?? {};
        } catch {
          userEnv = {};
        }
      }
      const envScript = envExportScript(userEnv);
      await shell.handleInput(
        `mkdir -p ~/.detour && cat > ~/.detour/env << 'DETOUR_ENV_EOF'\n${envScript}\nDETOUR_ENV_EOF\n`,
      );
      await shell.handleInput(
        `grep -q 'detour/env' ~/.bashrc 2>/dev/null || echo '[ -f ~/.detour/env ] && . ~/.detour/env' >> ~/.bashrc\n`,
      );
      await shell.handleInput(". ~/.detour/env 2>/dev/null\n");
      await shell.handleInput(`${CODING_CLI_NPM_INSTALL}\n`);
      write(
        `\r\n  \x1b[32mready\x1b[0m — agent tab: \x1b[36m${provider.label}\x1b[0m · run \x1b[36m${provider.launchCmd}\x1b[0m\r\n\r\n`,
      );
      return;
    }
    const url = wsEndpoint(backend);
    if (!url) {
      write(
        "\r\n  \x1b[33mThis backend isn't connected yet.\x1b[0m\r\n" +
          "  Self-host is future work — use Detour Cloud or Sandbox.\r\n",
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
  }, [backend, write, provider.label, provider.launchCmd, token, sessionEnv]);

  const onData = useCallback(
    (data: string) => {
      if (backend === "sandbox") {
        void shellRef.current?.handleInput(data);
      } else if (wsRef.current?.readyState === WebSocket.OPEN) {
        wsRef.current.send("d" + data);
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
