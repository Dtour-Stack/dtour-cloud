import { useAction } from "convex/react";
import { anyApi } from "convex/server";
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { AppShell } from "@/dashboard/AppShell";
import { getDtourSessionToken } from "@/lib/session";
import { Button } from "@/ui";

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

export default function ApiExplorerPage({ embedded = false }: { embedded?: boolean } = {}) {
  const token = getDtourSessionToken();
  const status = useAction(anyApi.proxy.status);
  const forward = useAction(anyApi.proxy.forward);
  const [configured, setConfigured] = useState<boolean | null>(null);

  const [method, setMethod] = useState("GET");
  const [path, setPath] = useState("/v1/agents");
  const [body, setBody] = useState("");
  const [resp, setResp] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    void status({}).then((s) => setConfigured((s as { configured: boolean }).configured)).catch(() => setConfigured(false));
  }, [status]);

  async function send() {
    if (!token) return;
    setBusy(true);
    setResp(null);
    try {
      const r = (await forward({ token, method, path, body: body || undefined })) as {
        ok: boolean;
        status?: number;
        data?: string;
        reason?: string;
      };
      setResp(r.ok ? `${r.status}\n${r.data ?? ""}` : `Error: ${r.reason ?? r.status}`);
    } catch (e) {
      setResp(e instanceof Error ? e.message : "Request failed");
    } finally {
      setBusy(false);
    }
  }

  const content = (
      <div className="mx-auto max-w-4xl space-y-6">
        <div>
          <h1 className="text-xl font-semibold text-white">API Explorer</h1>
          <p className="mt-1 text-sm text-white/50">
            The Detour API (proxied to ElizaCloud). Mint a key in{" "}
            <Link to="/api-keys" className="text-purple-300 hover:underline">API Keys</Link>.
          </p>
        </div>

        {configured === false && (
          <div className="rounded-lg border border-amber-400/30 bg-amber-400/[0.06] px-4 py-2.5 text-xs text-amber-200">
            The ElizaCloud proxy isn't configured yet — set ELIZACLOUD_API_URL + ELIZACLOUD_API_KEY
            to enable live calls. The catalog below is the real surface.
          </div>
        )}

        {/* Try-it console */}
        <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-4">
          <div className="flex gap-2">
            <select
              value={method}
              onChange={(e) => setMethod(e.target.value)}
              className="rounded-lg border border-white/15 bg-white/5 px-2 py-2 text-sm text-white focus:outline-none"
            >
              <option>GET</option>
              <option>POST</option>
            </select>
            <input
              value={path}
              onChange={(e) => setPath(e.target.value)}
              className="flex-1 rounded-lg border border-white/15 bg-white/5 px-3 py-2 font-mono text-xs text-white focus:border-purple-400/50 focus:outline-none"
            />
            <Button onClick={send} disabled={busy || !configured}>
              {busy ? "…" : "Send"}
            </Button>
          </div>
          {method === "POST" && (
            <textarea
              value={body}
              onChange={(e) => setBody(e.target.value)}
              placeholder='{ "json": "body" }'
              rows={3}
              className="mt-2 w-full rounded-lg border border-white/15 bg-white/5 px-3 py-2 font-mono text-xs text-white placeholder:text-white/30 focus:outline-none"
            />
          )}
          {resp && (
            <pre className="mt-3 max-h-64 overflow-auto rounded-lg bg-black/40 p-3 font-mono text-xs text-white/80">
              {resp}
            </pre>
          )}
        </div>

        {GROUPS.map((g) => (
          <div key={g.group}>
            <div className="mb-2 text-xs uppercase tracking-widest text-white/45">{g.group}</div>
            <div className="overflow-hidden rounded-2xl border border-white/10 bg-white/[0.02]">
              {g.routes.map((r) => (
                <button
                  type="button"
                  key={r.path}
                  onClick={() => {
                    setMethod(r.method);
                    setPath(r.path);
                  }}
                  className="flex w-full items-center gap-3 border-b border-white/5 px-4 py-2.5 text-left text-sm transition last:border-0 hover:bg-white/[0.03]"
                >
                  <span className={`w-12 shrink-0 font-mono text-xs font-semibold ${COLOR[r.method] ?? "text-white/50"}`}>
                    {r.method}
                  </span>
                  <code className="font-mono text-xs text-white/80">{r.path}</code>
                  <span className="ml-auto text-xs text-white/40">{r.desc}</span>
                </button>
              ))}
            </div>
          </div>
        ))}
      </div>
    );
  return embedded ? content : <AppShell title="API Explorer">{content}</AppShell>;
}
