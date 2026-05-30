import { Link } from "react-router-dom";
import { AppShell } from "@/dashboard/AppShell";
import { Icon } from "@/ui";

const GROUPS: { group: string; routes: { method: string; path: string; desc: string }[] }[] = [
  {
    group: "Agents",
    routes: [
      { method: "GET", path: "/v1/agents", desc: "List your agents" },
      { method: "POST", path: "/v1/agents", desc: "Create an agent" },
      { method: "POST", path: "/v1/agents/:id/message", desc: "Send a message" },
    ],
  },
  {
    group: "Inference",
    routes: [
      { method: "POST", path: "/v1/chat/completions", desc: "Chat completion (model-routed)" },
      { method: "POST", path: "/v1/embeddings", desc: "Embeddings" },
    ],
  },
  {
    group: "Media",
    routes: [
      { method: "POST", path: "/v1/images", desc: "Generate an image" },
      { method: "POST", path: "/v1/video", desc: "Generate a video" },
      { method: "POST", path: "/v1/speech", desc: "Text to speech" },
    ],
  },
  {
    group: "MCP & Tools",
    routes: [
      { method: "GET", path: "/v1/mcps", desc: "List hosted MCP servers" },
      { method: "POST", path: "/v1/search", desc: "Web search" },
    ],
  },
];

const COLOR: Record<string, string> = { GET: "text-sky-300", POST: "text-emerald-300" };

export default function ApiExplorerPage() {
  return (
    <AppShell title="API Explorer">
      <div className="mx-auto max-w-4xl space-y-6">
        <div>
          <h1 className="text-xl font-semibold text-white">API Explorer</h1>
          <p className="mt-1 text-sm text-white/50">
            The Detour API surface (proxied to ElizaCloud at a flat passthrough). Mint a key in{" "}
            <Link to="/api-keys" className="text-purple-300 hover:underline">
              API Keys
            </Link>{" "}
            to authenticate.
          </p>
        </div>

        <div className="rounded-lg border border-white/10 bg-white/[0.03] px-4 py-2.5 text-xs text-white/45">
          ⓘ Live "try it" calls activate once the Detour API proxy is wired. The catalog below is the
          real surface map.
        </div>

        {GROUPS.map((g) => (
          <div key={g.group}>
            <div className="mb-2 text-xs uppercase tracking-widest text-white/45">{g.group}</div>
            <div className="overflow-hidden rounded-2xl border border-white/10 bg-white/[0.02]">
              {g.routes.map((r) => (
                <div
                  key={r.path}
                  className="flex items-center gap-3 border-b border-white/5 px-4 py-2.5 text-sm last:border-0"
                >
                  <span className={`w-12 shrink-0 font-mono text-xs font-semibold ${COLOR[r.method] ?? "text-white/50"}`}>
                    {r.method}
                  </span>
                  <code className="font-mono text-xs text-white/80">{r.path}</code>
                  <span className="ml-auto text-xs text-white/40">{r.desc}</span>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </AppShell>
  );
}
