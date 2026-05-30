import { Hono } from "hono";

const app = new Hono();

app.get("/agent/health", (c) => c.json({ ok: true }));

const port = Number(process.env.AGENT_PORT ?? 3000);
console.log(`[detour-agent] listening on :${port}`);
export default { port, fetch: app.fetch };
