/**
 * Detour coding-relay — bridges the browser wterm terminal to an E2B Firecracker
 * sandbox PTY over WebSocket. The E2B API key lives ONLY here (server-side); the
 * browser never sees it. Pairs with src/dashboard/coding/CodingDashboardPage.tsx.
 *
 *   wterm (browser) ──WSS /coding-ws?token=…──▶ this relay ──▶ E2B sandbox PTY
 *
 * Wire protocol (client→server): a 1-char type prefix per text frame —
 *   "d<keystrokes>"  input to the PTY
 *   "r<json {cols,rows}>"  resize
 * Server→client frames are raw PTY output bytes (written straight to the term).
 */
import { ConvexHttpClient } from "convex/browser";
import { anyApi } from "convex/server";
import { Sandbox } from "e2b";

const PORT = Number(process.env.PORT ?? 8787);
const E2B_API_KEY = process.env.E2B_API_KEY ?? "";
const CONVEX_URL = process.env.CONVEX_URL ?? "http://backend:3210";
// Hard cap on a single sandbox's lifetime — bounds E2B cost per session.
const SESSION_MS = Number(process.env.CODING_SESSION_MS ?? 15 * 60 * 1000);

const convex = new ConvexHttpClient(CONVEX_URL);

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

type WSData = {
  sandbox: Sandbox | null;
  pid: number | null;
  closed: boolean;
};

const enc = new TextEncoder();

Bun.serve<WSData>({
  port: PORT,
  async fetch(req, server) {
    const url = new URL(req.url);
    if (url.pathname.endsWith("/health")) return new Response("ok");
    const token = url.searchParams.get("token");
    if (!(await validSession(token))) {
      return new Response("unauthorized", { status: 401 });
    }
    if (server.upgrade(req, { data: { sandbox: null, pid: null, closed: false } })) {
      return undefined;
    }
    return new Response("expected a websocket upgrade", { status: 426 });
  },
  websocket: {
    idleTimeout: 600, // seconds; wterm has no keepalive, so allow long idles
    async open(ws) {
      if (!E2B_API_KEY) {
        ws.send(
          "\r\n  \x1b[33mCoding backend isn't configured yet.\x1b[0m\r\n" +
            "  Set E2B_API_KEY on the server to enable real sandboxes.\r\n",
        );
        ws.close();
        return;
      }
      try {
        ws.send("\r\n  spinning up a Firecracker sandbox…\r\n");
        const sandbox = await Sandbox.create({
          apiKey: E2B_API_KEY,
          timeoutMs: SESSION_MS,
        });
        if (ws.data.closed) {
          await sandbox.kill().catch(() => {});
          return;
        }
        ws.data.sandbox = sandbox;
        const term = await sandbox.pty.create({
          cols: 80,
          rows: 24,
          timeoutMs: SESSION_MS,
          onData: (data: Uint8Array) => {
            if (!ws.data.closed) ws.send(data);
          },
        });
        ws.data.pid = term.pid;
        ws.send(
          "\r\n  \x1b[32mconnected\x1b[0m — Detour Cloud sandbox (E2B · Firecracker microVM)\r\n\r\n",
        );
      } catch (e) {
        ws.send(`\r\n  \x1b[31mcouldn't start sandbox:\x1b[0m ${String(e).slice(0, 240)}\r\n`);
        ws.close();
      }
    },
    async message(ws, message) {
      const { sandbox, pid } = ws.data;
      if (!sandbox || pid == null) return;
      const str = typeof message === "string" ? message : new TextDecoder().decode(message);
      const type = str[0];
      const payload = str.slice(1);
      try {
        if (type === "r") {
          const { cols, rows } = JSON.parse(payload) as { cols: number; rows: number };
          if (cols > 0 && rows > 0) await sandbox.pty.resize(pid, { cols, rows });
        } else {
          // default: treat as PTY input ("d"-prefixed, or raw for safety)
          await sandbox.pty.sendInput(pid, enc.encode(type === "d" ? payload : str));
        }
      } catch {
        /* transient PTY error — ignore a single frame */
      }
    },
    async close(ws) {
      ws.data.closed = true;
      try {
        await ws.data.sandbox?.kill();
      } catch {
        /* already gone */
      }
    },
  },
});

console.log(
  `coding-relay listening on :${PORT} — e2b ${E2B_API_KEY ? "configured" : "NOT configured"}, convex ${CONVEX_URL}`,
);
