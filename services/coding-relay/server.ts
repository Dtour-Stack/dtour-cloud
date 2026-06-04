/**
 * Detour coding-relay — bridges the browser wterm terminal to a coding backend
 * over WebSocket. Two backends:
 *
 *   • runner  (E2B):      wterm ──WSS /coding-ws?token=…──▶ relay ──▶ E2B sandbox PTY
 *   • selfhost (device):  wterm ──WSS /coding-ws?token=…&backend=selfhost──▶ relay
 *                          ──(multiplexed)──▶ the user's detour desktop app, which
 *                          dialed in at /selfhost-device?token=<deviceToken> and runs
 *                          the PTY on the user's own machine ($0 — user compute).
 *
 * The E2B API key lives ONLY here (server-side). Wire protocol (web client→relay):
 *   "d<keystrokes>"  input · "r<json {cols,rows}>"  resize · "w<json {name?}>"  save.
 * Relay→web frames are raw PTY output bytes. The relay↔device protocol is the
 * JSON frame codec in ./broker (open/in/resize/close ↔ out/exit).
 */
import type { ServerWebSocket } from "bun";
import { ConvexHttpClient } from "convex/browser";
import { anyApi } from "convex/server";
import { Sandbox } from "e2b";
import { bootstrapCodingSandbox } from "./bootstrap";
import {
  DeviceRegistry,
  SessionRouter,
  decodeFromDevice,
  encodeToDevice,
  parseWebFrame,
} from "./broker";
import { Logger } from "./logger";
import { saveWorkspaceFromSandbox } from "./workspaceSave";

const PORT = Number(process.env.PORT ?? 8787);
const E2B_TEMPLATE = process.env.E2B_TEMPLATE?.trim() || undefined;
const E2B_API_KEY = process.env.E2B_API_KEY ?? "";
const CONVEX_URL = process.env.CONVEX_URL ?? "http://backend:3210";
// Hard cap on a single sandbox's lifetime — bounds E2B cost per session.
const SESSION_MS = Number(process.env.CODING_SESSION_MS ?? 15 * 60 * 1000);
// Default sandbox resources — MUST match the size E2B actually provisions so the
// metered cost is accurate. Update alongside any Sandbox.create() size change.
const SANDBOX_VCPU = Number(process.env.SANDBOX_VCPU ?? 2);
const SANDBOX_RAM_GIB = Number(process.env.SANDBOX_RAM_GIB ?? 0.5);

const convex = new ConvexHttpClient(CONVEX_URL);

// Self-host broker state: connected detour devices + web-session output routing.
const devices = new DeviceRegistry();
const sessions = new SessionRouter();
const selfhostWeb = new Map<string, ServerWebSocket<WSData>>(); // sid → web socket

async function validSession(token: string | null): Promise<boolean> {
  if (!token) return false;
  try {
    // Any authenticated Detour session may open a terminal. (The /coding route
    // is already pro-gated in the SPA; tighten here later if needed.)
    const me = await convex.query(anyApi.users.me, { token });
    return !!me;
  } catch {
    return false;
  }
}

async function sessionPubkey(token: string | null): Promise<string | null> {
  if (!token) return null;
  try {
    const me = (await convex.query(anyApi.users.me, { token })) as
      | { pubkey?: string }
      | null;
    return me?.pubkey ?? null;
  } catch {
    return null;
  }
}

type RunnerWSData = {
  kind: "runner";
  token: string;
  agent: string;
  sandbox: Sandbox | null;
  pid: number | null;
  closed: boolean;
  startedAtMs: number;
  sandboxId: string;
  saving: boolean;
};

type DeviceWSData = {
  kind: "device";
  token: string;
  pubkey: string;
  deviceId: string;
  closed: boolean;
};

type SelfhostWSData = {
  kind: "selfhost";
  token: string;
  pubkey: string;
  agent: string;
  sid: string;
  closed: boolean;
};

type WSData = RunnerWSData | DeviceWSData | SelfhostWSData;

const ENV_KEYS_FOR_AGENT: Record<string, string[]> = {
  opencode: ["OPENROUTER_API_KEY"],
  codex: ["OPENAI_API_KEY"],
  claude: ["ANTHROPIC_API_KEY"],
  pi: ["ANTHROPIC_API_KEY"],
};

function filterEnvForAgent(env: Record<string, string>, agent: string): Record<string, string> {
  const keys = ENV_KEYS_FOR_AGENT[agent] ?? ENV_KEYS_FOR_AGENT.opencode ?? [];
  const out: Record<string, string> = {};
  for (const k of keys) {
    if (env[k]) out[k] = env[k];
  }
  return out;
}

const enc = new TextEncoder();

// ── runner (E2B) handlers — unchanged behavior, just narrowed to RunnerWSData ──
async function runnerOpen(ws: ServerWebSocket<WSData>, data: RunnerWSData) {
  if (!E2B_API_KEY) {
    ws.send(
      "\r\n  \x1b[33mCoding backend isn't configured yet.\x1b[0m\r\n" +
        "  Set E2B_API_KEY on the server to enable real sandboxes.\r\n",
    );
    ws.close();
    return;
  }
  // Gate on credits BEFORE spinning up a billable sandbox.
  try {
    const gate = (await convex.query(anyApi.coding.canStart, {
      token: data.token,
    })) as { ok: boolean; balanceUsd?: number } | null;
    if (!gate?.ok) {
      ws.send(
        `\r\n  \x1b[33mout of credits\x1b[0m — balance $${(gate?.balanceUsd ?? 0).toFixed(2)}.\r\n` +
          "  Top up to start a coding session.\r\n",
      );
      ws.close();
      return;
    }
  } catch {
    ws.send("\r\n  \x1b[31mbilling check failed — try again shortly.\x1b[0m\r\n");
    ws.close();
    return;
  }
  try {
    ws.send("\r\n  spinning up a Firecracker sandbox…\r\n");
    let userEnv: Record<string, string> = {};
    try {
      userEnv =
        ((await convex.action(anyApi.codingProviderActions.sessionEnvForRelay, {
          token: data.token,
        })) as Record<string, string> | null) ?? {};
    } catch {
      userEnv = {};
    }
    const sandbox = await Sandbox.create({
      apiKey: E2B_API_KEY,
      timeoutMs: SESSION_MS,
      ...(E2B_TEMPLATE ? { template: E2B_TEMPLATE } : {}),
    });
    if (data.closed) {
      await sandbox.kill().catch(() => {});
      return;
    }
    data.sandbox = sandbox;
    data.startedAtMs = Date.now();
    data.sandboxId = (sandbox as { sandboxId?: string }).sandboxId ?? "";
    const term = await sandbox.pty.create({
      cols: 80,
      rows: 24,
      timeoutMs: SESSION_MS,
      onData: (d: Uint8Array) => {
        if (!data.closed) ws.send(d);
      },
    });
    data.pid = term.pid;
    ws.send(
      "\r\n  \x1b[32mconnected\x1b[0m — Detour Cloud sandbox (E2B · Firecracker microVM)\r\n",
    );
    await bootstrapCodingSandbox(
      sandbox,
      filterEnvForAgent(userEnv, data.agent),
      data.agent,
      (msg) => {
        if (!data.closed) ws.send(msg);
      },
    );
    // Reload env in the interactive shell.
    await sandbox.pty.sendInput(
      term.pid,
      new TextEncoder().encode("source ~/.detour/env 2>/dev/null || true\r"),
    );
  } catch (e) {
    ws.send(`\r\n  \x1b[31mcouldn't start sandbox:\x1b[0m ${String(e).slice(0, 240)}\r\n`);
    ws.close();
  }
}

async function runnerMessage(
  ws: ServerWebSocket<WSData>,
  data: RunnerWSData,
  message: string | Buffer,
) {
  const { sandbox, pid } = data;
  if (!sandbox || pid == null) return;
  const str = typeof message === "string" ? message : new TextDecoder().decode(message);
  const frame = parseWebFrame(str);
  if (!frame) return;
  try {
    if (frame.kind === "save") {
      if (data.saving) return;
      data.saving = true;
      void saveWorkspaceFromSandbox(
        convex,
        sandbox,
        data.token,
        data.sandboxId,
        frame.name,
        (msg) => {
          if (!data.closed) ws.send(msg);
        },
      ).finally(() => {
        data.saving = false;
      });
    } else if (frame.kind === "resize") {
      await sandbox.pty.resize(pid, { cols: frame.cols, rows: frame.rows });
    } else {
      await sandbox.pty.sendInput(pid, enc.encode(frame.data));
    }
  } catch {
    /* transient PTY error — ignore a single frame */
  }
}

async function runnerClose(data: RunnerWSData) {
  data.closed = true;
  try {
    await data.sandbox?.kill();
  } catch {
    /* already gone */
  }
  // Meter + debit — only if a sandbox actually ran this connection.
  if (data.startedAtMs > 0) {
    try {
      await convex.mutation(anyApi.coding.recordSession, {
        token: data.token,
        sandboxId: data.sandboxId || `sb_${data.startedAtMs}`,
        startedAtMs: data.startedAtMs,
        endedAtMs: Date.now(),
        vcpu: SANDBOX_VCPU,
        ramGiB: SANDBOX_RAM_GIB,
      });
    } catch {
      /* metering failure must not crash the relay; logged server-side */
    }
  }
}

Bun.serve<WSData>({
  port: PORT,
  async fetch(req, server) {
    const url = new URL(req.url);
    if (url.pathname.endsWith("/health") || url.pathname.endsWith("/coding-health")) {
      return Response.json({
        ok: true,
        e2b: !!E2B_API_KEY,
        template: E2B_TEMPLATE ?? "default",
        devicesOnline: undefined, // registry is in-memory; omit count to avoid leaking
      });
    }
    const token = url.searchParams.get("token");

    // ── detour desktop app dials in as a Self-host device ──
    if (url.pathname.endsWith("/selfhost-device")) {
      const dev = (await convex
        .query(anyApi.codingDevices.deviceByToken, { token })
        .catch(() => null)) as { pubkey?: string; deviceId?: string } | null;
      if (!dev?.pubkey || !dev.deviceId) {
        return new Response("unauthorized", { status: 401 });
      }
      if (
        server.upgrade(req, {
          data: {
            kind: "device",
            token: token as string,
            pubkey: dev.pubkey,
            deviceId: dev.deviceId,
            closed: false,
          } satisfies DeviceWSData,
        })
      ) {
        return undefined;
      }
      return new Response("expected a websocket upgrade", { status: 426 });
    }

    // ── browser terminal (/coding-ws) ──
    if (!(await validSession(token))) {
      return new Response("unauthorized", { status: 401 });
    }
    const rawAgent = url.searchParams.get("agent")?.trim() || "opencode";
    const agent = rawAgent in ENV_KEYS_FOR_AGENT ? rawAgent : "opencode";
    const backend = url.searchParams.get("backend")?.trim();

    if (backend === "selfhost") {
      const pubkey = await sessionPubkey(token);
      if (!pubkey) return new Response("unauthorized", { status: 401 });
      if (
        server.upgrade(req, {
          data: {
            kind: "selfhost",
            token: token as string,
            pubkey,
            agent,
            sid: crypto.randomUUID(),
            closed: false,
          } satisfies SelfhostWSData,
        })
      ) {
        return undefined;
      }
      return new Response("expected a websocket upgrade", { status: 426 });
    }

    if (
      server.upgrade(req, {
        data: {
          kind: "runner",
          token: token as string,
          agent,
          sandbox: null,
          pid: null,
          closed: false,
          startedAtMs: 0,
          sandboxId: "",
          saving: false,
        } satisfies RunnerWSData,
      })
    ) {
      return undefined;
    }
    return new Response("expected a websocket upgrade", { status: 426 });
  },
  websocket: {
    idleTimeout: 600, // seconds; wterm has no keepalive, so allow long idles
    async open(ws) {
      const data = ws.data;
      if (data.kind === "runner") {
        await runnerOpen(ws, data);
        return;
      }
      if (data.kind === "device") {
        devices.register({
          pubkey: data.pubkey,
          deviceId: data.deviceId,
          send: (frame) => {
            if (!data.closed) ws.send(frame);
          },
        });
        void convex.mutation(anyApi.codingDevices.markDeviceSeen, { token: data.token }).catch(
          () => {},
        );
        return;
      }
      // selfhost web session — bridge to the owner's connected device
      const dev = devices.get(data.pubkey);
      if (!dev) {
        ws.send(
          "\r\n  \x1b[33mno detour desktop connected\x1b[0m — open the Detour app and\r\n" +
            "  enable Self-host, then reconnect.\r\n",
        );
        ws.close();
        return;
      }
      sessions.open(data.sid, (out) => {
        if (!data.closed) ws.send(out);
      });
      selfhostWeb.set(data.sid, ws);
      dev.send(encodeToDevice({ t: "open", sid: data.sid, agent: data.agent }));
      ws.send("\r\n  \x1b[32mconnected\x1b[0m — your machine (Detour desktop · self-host)\r\n");
    },
    async message(ws, message) {
      const data = ws.data;
      if (data.kind === "runner") {
        await runnerMessage(ws, data, message);
        return;
      }
      if (data.kind === "device") {
        const str = typeof message === "string" ? message : new TextDecoder().decode(message);
        const frame = decodeFromDevice(str);
        if (!frame) return;
        if (frame.t === "out") {
          sessions.route(frame.sid, frame.data);
        } else {
          // session exited on the device — close the matching web socket
          selfhostWeb.get(frame.sid)?.close();
        }
        return;
      }
      // selfhost web → forward input/resize to the device (save is a no-op here:
      // it's the user's own machine, their files are already local)
      const dev = devices.get(data.pubkey);
      if (!dev) {
        ws.send("\r\n  \x1b[33mdetour desktop disconnected\x1b[0m\r\n");
        ws.close();
        return;
      }
      const str = typeof message === "string" ? message : new TextDecoder().decode(message);
      const frame = parseWebFrame(str);
      if (!frame) return;
      if (frame.kind === "input") {
        dev.send(encodeToDevice({ t: "in", sid: data.sid, data: frame.data }));
      } else if (frame.kind === "resize") {
        dev.send(encodeToDevice({ t: "resize", sid: data.sid, cols: frame.cols, rows: frame.rows }));
      }
    },
    async close(ws) {
      const data = ws.data;
      if (data.kind === "runner") {
        await runnerClose(data);
        return;
      }
      if (data.kind === "device") {
        data.closed = true;
        devices.unregister(data.pubkey);
        // Tear down any web sessions that were bridged to this device.
        for (const [sid, web] of selfhostWeb) {
          if (web.data.kind === "selfhost" && web.data.pubkey === data.pubkey) {
            web.close();
            sessions.close(sid);
            selfhostWeb.delete(sid);
          }
        }
        return;
      }
      // selfhost web session ended — tell the device to kill its PTY. No metering
      // (self-host runs on the user's own machine → $0).
      data.closed = true;
      sessions.close(data.sid);
      selfhostWeb.delete(data.sid);
      devices.get(data.pubkey)?.send(encodeToDevice({ t: "close", sid: data.sid }));
    },
  },
});

Logger.info("[CodingRelay] listening", {
  port: PORT,
  e2bConfigured: !!E2B_API_KEY,
  selfhostBroker: true,
  convexUrl: CONVEX_URL,
});
