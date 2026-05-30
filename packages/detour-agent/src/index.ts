import { Hono } from "hono";
import { ConvexHttpClient } from "convex/browser";
import { makeVerifySession } from "./auth";
import { chatRoutes } from "./routes/chat";
import { inspectRoutes } from "./routes/inspect";

const app = new Hono();

app.get("/agent/health", (c) => c.json({ ok: true }));

// Session verification calls the Convex `sessions:verify` query; the ElizaOS
// Cloud key is attached to every UserContext so inference fees pass to Eliza.
const convex = new ConvexHttpClient(process.env.CONVEX_URL ?? "");
const verifySession = makeVerifySession(convex, process.env.ELIZAOS_CLOUD_API_KEY ?? "");

app.route("/agent", chatRoutes({ verifySession }));
app.route("/agent", inspectRoutes({ verifySession }));

const port = Number(process.env.AGENT_PORT ?? 3000);
console.log(`[detour-agent] listening on :${port}`);
export default { port, fetch: app.fetch };
