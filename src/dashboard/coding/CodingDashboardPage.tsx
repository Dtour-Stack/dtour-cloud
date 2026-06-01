import { BashShell } from "@wterm/just-bash";
import { Terminal, type TerminalHandle } from "@wterm/react";
import "@wterm/react/css";
// @ts-expect-error — Vite ?url asset import
import coreWasmUrl from "@wterm/core/wasm?url";
import { useAction, useQuery } from "convex/react";
import { anyApi } from "convex/server";
import { useCallback, useEffect, useRef, useState } from "react";
import { Navigate, useParams } from "react-router-dom";
import { AppShell } from "@/dashboard/AppShell";
import { providerById } from "@/lib/codingProviders";
import { runSandboxBootstrap } from "@/lib/codingSandboxBootstrap";
import { envExportScript } from "@/lib/codingSandboxEnv";
import { getDtourSessionToken } from "@/lib/session";
import { Button, cn, Icon } from "@/ui";
import { CodingDraftPage } from "./CodingDraftPage";
import { CodingKeysPage } from "./CodingKeysPage";
import { CodingSavesPage } from "./CodingSavesPage";
import {
  CodingSessionProvider,
  useCodingProviderFromRoute,
  useCodingSession,
  type CodingBackend,
} from "./CodingSessionContext";
import { CodingSetupPage } from "./CodingSetupPage";
import { CODING_NAV } from "./codingNav";
import { TopUpModal } from "./TopUpModal";

function wsEndpoint(backend: CodingBackend): string {
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
  const { section } = useParams();
  const providerFromRoute = useCodingProviderFromRoute(section);

  return (
    <CodingSessionProvider>
      <CodingShell section={section} providerFromRoute={providerFromRoute} />
    </CodingSessionProvider>
  );
}

function CodingShell({
  section,
  providerFromRoute,
}: {
  section: string | undefined;
  providerFromRoute: ReturnType<typeof useCodingProviderFromRoute>;
}) {
  if (providerFromRoute) {
    return (
      <AppShell title="Coding" nav={CODING_NAV} context="coding">
        <CodingKeysPage providerId={providerFromRoute} />
      </AppShell>
    );
  }

  if (section && section !== "terminal") {
    if (section === "setup") {
      return (
        <AppShell title="Coding" nav={CODING_NAV} context="coding">
          <CodingSetupPage />
        </AppShell>
      );
    }
    if (section === "draft") {
      return (
        <AppShell title="Coding" nav={CODING_NAV} context="coding">
          <CodingDraftPage />
        </AppShell>
      );
    }
    if (section === "saves") {
      return (
        <AppShell title="Coding" nav={CODING_NAV} context="coding">
          <CodingSavesPage />
        </AppShell>
      );
    }
    return <Navigate to="/coding" replace />;
  }

  return <CodingTerminalView />;
}

function CodingTerminalView() {
  const token = getDtourSessionToken();
  const { backend, activeProvider } = useCodingSession();
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
  const provider = providerById(activeProvider);

  return (
    <AppShell title="Coding" nav={CODING_NAV} context="coding" bare>
      <div className="flex h-full flex-col bg-[#08080b]">
        <div className="flex flex-wrap items-center gap-2 border-b border-white/10 px-4 py-2">
          <span className="text-xs text-white/50">
            {provider.label} · OpenCode · Codex · Claude · Pi
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

        <div className="min-h-0 flex-1 p-3" data-tour="coding-terminal">
          <div className="h-full overflow-hidden rounded-xl border border-white/10 bg-black">
            <CodingTerminal key={`${backend}-${token ?? "anon"}`} />
          </div>
        </div>
      </div>
      {topUpOpen && token && (
        <TopUpModal token={token} onClose={() => setTopUpOpen(false)} onCredited={() => {}} />
      )}
    </AppShell>
  );
}

function CodingTerminal() {
  const token = getDtourSessionToken();
  const {
    backend,
    activeProvider,
    injectRef,
    runnerWsRef,
    setRunnerConnected,
  } = useCodingSession();
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
        env: { TERM: "xterm-256color", SHELL: "/bin/bash", HOME: "/home/user" },
        greeting: [
          "Detour — in-browser Sandbox (WASM bash + npm CLIs).",
          "Preparing ~/workspace and installing agents…",
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
      const bash = shell.bash;
      if (bash) {
        await runSandboxBootstrap(bash, shell.cwd, envScript, (chunk) => write(chunk));
      }
      write(
        `\r\n  \x1b[32mready\x1b[0m — \x1b[36m${provider.label}\x1b[0m · run \x1b[36m${provider.launchCmd}\x1b[0m · work in ~/workspace\r\n\r\n`,
      );
      return;
    }
    const url = wsEndpoint(backend);
    if (!url) {
      write(
        "\r\n  \x1b[33mThis backend isn't connected yet.\x1b[0m\r\n" +
          "  Pick a backend under Coding → Setup in the sidebar.\r\n",
      );
      return;
    }
    const ws = new WebSocket(url);
    ws.binaryType = "arraybuffer";
    ws.onmessage = (e) =>
      write(typeof e.data === "string" ? e.data : new Uint8Array(e.data as ArrayBuffer));
    ws.onopen = () => setRunnerConnected(true);
    ws.onerror = () => {
      setRunnerConnected(false);
      write("\r\n  \x1b[31mconnection error\x1b[0m\r\n");
    };
    ws.onclose = () => {
      setRunnerConnected(false);
      write("\r\n  session closed.\r\n");
    };
    wsRef.current = ws;
    runnerWsRef.current = ws;
  }, [
    backend,
    write,
    provider.label,
    provider.launchCmd,
    token,
    sessionEnv,
    runnerWsRef,
    setRunnerConnected,
  ]);

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
    setRunnerConnected(false);
    const ws = wsRef.current;
    return () => {
      ws?.close();
      runnerWsRef.current = null;
    };
  }, [setRunnerConnected, runnerWsRef]);

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
