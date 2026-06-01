import { useAction } from "convex/react";
import { anyApi } from "convex/server";
import { useEffect, useState } from "react";
import { Icon } from "@/ui";

export function GenerateImageModal({
  token,
  agentId,
  onAttach,
  onClose,
}: {
  token: string;
  agentId: string;
  onAttach: (url: string) => void;
  onClose: () => void;
}) {
  const runImage = useAction(anyApi.inference.runImage);
  const [prompt, setPrompt] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [preview, setPreview] = useState<string | null>(null);

  useEffect(() => {
    function onKey(e: globalThis.KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  async function generate() {
    if (!prompt.trim() || busy) return;
    setBusy(true);
    setError(null);
    const refId = `chat-gen-${agentId}-${Date.now()}`;
    try {
      const { url } = await runImage({ token, prompt: prompt.trim(), refId });
      setPreview(url);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Image generation failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <button
        type="button"
        aria-label="Close"
        onClick={onClose}
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
      />
      <div className="relative z-10 w-full max-w-md overflow-hidden rounded-2xl border border-white/10 bg-[#0d0d0d] shadow-2xl">
        <div className="flex items-center justify-between border-b border-white/10 px-5 py-3.5">
          <div className="flex items-center gap-2">
            <Icon.Image size={16} />
            <span className="text-sm font-semibold">Generate image</span>
          </div>
          <button
            type="button"
            aria-label="Close"
            onClick={onClose}
            className="flex h-7 w-7 items-center justify-center rounded-full text-white/50 transition hover:bg-white/10 hover:text-white"
          >
            <Icon.X size={15} />
          </button>
        </div>
        <div className="space-y-4 px-5 py-4">
          <textarea
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            placeholder="Describe the image to attach to your next message…"
            rows={3}
            className="w-full resize-none rounded-lg border border-white/12 bg-white/5 px-3 py-2.5 text-[13px] text-white placeholder:text-white/30 focus:border-purple-400/50 focus:outline-none"
          />
          {error && <p className="text-[13px] text-red-300/90">{error}</p>}
          {preview && (
            <img
              src={preview}
              alt="Generated preview"
              className="mx-auto max-h-48 rounded-lg border border-white/15 object-contain"
            />
          )}
          <div className="flex flex-wrap justify-end gap-2">
            <button
              type="button"
              onClick={onClose}
              className="rounded-full px-4 py-2 text-[13px] text-white/55 transition hover:bg-white/10 hover:text-white"
            >
              Cancel
            </button>
            <button
              type="button"
              disabled={!prompt.trim() || busy}
              onClick={() => void generate()}
              className="rounded-full bg-white/10 px-4 py-2 text-[13px] font-medium text-white transition hover:bg-white/15 disabled:opacity-40"
            >
              {busy ? "Generating…" : preview ? "Regenerate" : "Generate"}
            </button>
            {preview && (
              <button
                type="button"
                onClick={() => {
                  onAttach(preview);
                  onClose();
                }}
                className="rounded-full bg-white px-4 py-2 text-[13px] font-medium text-black transition hover:bg-white/90"
              >
                Attach to message
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
