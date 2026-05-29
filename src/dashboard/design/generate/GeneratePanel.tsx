import { useAction, useQuery } from "convex/react";
import { anyApi } from "convex/server";
import { useState } from "react";
import { getDtourSessionToken } from "@/lib/session";
import { Button, Icon, Panel } from "@/ui";

type NodeState = { status: string; output?: string; error?: string };
type Run = { status: string; nodes: Record<string, NodeState> } | null | undefined;

const isImg = (s?: string) => !!s && /^(https?:|data:)/.test(s);

/** Generate runs the same execution pipeline as the Workflow editor: it builds
 *  a Prompt → Image Generate → Output graph and submits it via runWorkflow. */
export function GeneratePanel() {
  const token = getDtourSessionToken();
  const runWorkflow = useAction(anyApi.workflow.runWorkflow);
  const saveAsset = useAction(anyApi.assets.saveAsset);
  const [prompt, setPrompt] = useState("a serene mountain at dawn, cinematic");
  const [runId, setRunId] = useState<string | null>(null);
  const [running, setRunning] = useState(false);
  const [savingUrl, setSavingUrl] = useState<string | null>(null);

  const run = useQuery(
    anyApi.workflow.getRun,
    token && runId ? { token, runId } : "skip",
  ) as Run;
  const gen = run?.nodes?.g;
  const out = run?.nodes?.o;

  async function generate() {
    if (!token || running || !prompt.trim()) return;
    setRunning(true);
    setRunId(null);
    const graph = {
      nodes: [
        { id: "p", type: "input.prompt", values: { text: prompt } },
        { id: "g", type: "generate.image", values: { width: 1024, height: 1024 } },
        { id: "o", type: "output.preview", values: {} },
      ],
      edges: [
        { source: { node: "p", port: "prompt" }, target: { node: "g", port: "prompt" } },
        { source: { node: "g", port: "image" }, target: { node: "o", port: "image" } },
      ],
    };
    try {
      const r = (await runWorkflow({ token, graph: JSON.stringify(graph) })) as { runId: string };
      setRunId(r.runId);
    } finally {
      setRunning(false);
    }
  }

  async function save(url: string) {
    if (!token) return;
    setSavingUrl(url);
    try {
      await saveAsset({ token, url, name: prompt.slice(0, 40) || "Generated image" });
    } finally {
      setSavingUrl(null);
    }
  }

  return (
    <Panel className="fade-up p-6">
      <div className="rounded-2xl border border-white/12 bg-white/[0.04] p-4">
        <textarea
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          rows={3}
          placeholder="Describe the image you want…"
          className="w-full resize-none bg-transparent text-[15px] text-white placeholder:text-white/30 focus:outline-none"
        />
        <div className="mt-2 flex items-center justify-between">
          <span className="text-[11px] text-white/30">1024×1024 · routes through Detour Cloud</span>
          <Button onClick={generate} disabled={running || !prompt.trim()}>
            <Icon.Wand size={14} /> {running ? "Generating…" : "Generate"}
          </Button>
        </div>
      </div>

      {runId && (
        <div className="mt-5">
          {gen?.status === "error" ? (
            <div className="rounded-xl border border-red-400/20 bg-red-400/5 px-4 py-3 text-[13px] leading-relaxed text-red-300/90">
              {gen.error}
            </div>
          ) : isImg(out?.output) ? (
            <div className="space-y-3">
              <img
                src={out?.output}
                alt={prompt}
                className="w-full max-w-md rounded-2xl border border-white/10"
              />
              <Button
                variant="secondary"
                size="sm"
                onClick={() => out?.output && save(out.output)}
                disabled={savingUrl === out?.output}
              >
                <Icon.Plus size={13} /> {savingUrl === out?.output ? "Saving…" : "Save to library"}
              </Button>
            </div>
          ) : (
            <div className="flex items-center gap-2 text-[13px] text-white/45">
              <span className="h-1.5 w-1.5 rounded-full bg-amber-300 motion-safe:animate-pulse" />
              {gen?.status === "running" ? "Generating image…" : "Working…"}
            </div>
          )}
        </div>
      )}
    </Panel>
  );
}
