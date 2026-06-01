import { useAction } from "convex/react";
import { anyApi } from "convex/server";
import { useState } from "react";
import { Icon } from "@/ui";
import { generateGraphicLayout, generateWebsiteEmbed } from "./canvasDesignAi";
import type { Node } from "./types";

export type AiMode = "graphic" | "image" | "website";

export function StudioAiPanel({
  token,
  onInsertNodes,
  onInsertImage,
  onInsertEmbed,
}: {
  token: string;
  onInsertNodes: (nodes: Node[]) => void;
  onInsertImage: (url: string) => void;
  onInsertEmbed: (embed: { html: string; w: number; h: number; label?: string }) => void;
}) {
  const runChat = useAction(anyApi.inference.runChat);
  const runImage = useAction(anyApi.inference.runImage);
  const [mode, setMode] = useState<AiMode>("graphic");
  const [prompt, setPrompt] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function generate() {
    if (!prompt.trim() || busy) return;
    setBusy(true);
    setError(null);
    const refId = `studio-ai-${mode}-${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
    try {
      if (mode === "graphic") {
        const nodes = await generateGraphicLayout(runChat, token, prompt.trim(), refId);
        onInsertNodes(nodes);
      } else if (mode === "image") {
        const { url } = await runImage({ token, prompt: prompt.trim(), refId });
        onInsertImage(url);
      } else {
        const embed = await generateWebsiteEmbed(runChat, token, prompt.trim(), refId);
        onInsertEmbed({ ...embed, label: prompt.trim().slice(0, 48) });
      }
      setPrompt("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Generation failed");
    } finally {
      setBusy(false);
    }
  }

  const modes: { id: AiMode; label: string; hint: string }[] = [
    { id: "graphic", label: "Graphics", hint: "Layout — frames, shapes, text" },
    { id: "image", label: "Image", hint: "AI photo / illustration" },
    { id: "website", label: "Website", hint: "HTML mockup in an embed" },
  ];

  return (
    <aside className="flex w-80 shrink-0 flex-col border-l border-white/10 bg-[#0d0d0d]/95 backdrop-blur-xl">
      <div className="border-b border-white/10 p-4">
        <h2 className="text-sm font-medium text-white">AI create</h2>
        <p className="mt-1 text-[12px] leading-relaxed text-white/45">
          Generate graphic layouts, images, or website mockups straight onto the artboard.
        </p>
        <div className="mt-3 flex flex-wrap gap-1.5">
          {modes.map((m) => (
            <button
              key={m.id}
              type="button"
              onClick={() => setMode(m.id)}
              className={`rounded-full px-3 py-1 text-[11px] transition ${
                mode === m.id
                  ? "bg-white text-black"
                  : "border border-white/15 text-white/65 hover:bg-white/10"
              }`}
            >
              {m.label}
            </button>
          ))}
        </div>
        <p className="mt-2 text-[11px] text-white/35">{modes.find((m) => m.id === mode)?.hint}</p>
      </div>

      <div className="flex min-h-0 flex-1 flex-col p-4">
        <textarea
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          rows={8}
          placeholder={
            mode === "graphic"
              ? "e.g. Instagram post for a coffee shop — headline, photo frame, CTA button"
              : mode === "image"
                ? "e.g. minimal product hero on violet gradient"
                : "e.g. mobile landing page for an AI agent app"
          }
          className="w-full flex-1 resize-none rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2.5 text-[13px] text-white placeholder:text-white/30 focus:border-violet-400/50 focus:outline-none"
        />
        {error && <p className="mt-2 text-[12px] text-red-400/90">{error}</p>}
        <button
          type="button"
          onClick={() => void generate()}
          disabled={busy || !prompt.trim()}
          className="mt-3 flex w-full items-center justify-center gap-2 rounded-full bg-white py-2.5 text-[13px] font-medium text-black transition hover:shadow-lg hover:shadow-white/10 disabled:opacity-50"
        >
          <Icon.Wand size={14} />
          {busy ? "Generating…" : "Add to canvas"}
        </button>
      </div>
    </aside>
  );
}

/** Re-export for callers that need a fresh id when inserting AI nodes manually. */
export { newId } from "./studioDoc";