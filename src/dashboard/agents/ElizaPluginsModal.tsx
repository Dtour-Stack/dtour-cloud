import { useMutation } from "convex/react";
import { anyApi } from "convex/server";
import { useEffect, useState } from "react";
import { ELIZA_PLUGINS } from "@/dashboard/design/workflow/registry";
import { Icon } from "@/ui";

export function ElizaPluginsModal({
  token,
  agentId,
  initialPlugins,
  onClose,
}: {
  token: string;
  agentId: string;
  initialPlugins: string[];
  onClose: () => void;
}) {
  const setPlugins = useMutation(anyApi.agents.setPlugins);
  const [selected, setSelected] = useState<string[]>(initialPlugins);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    function onKey(e: globalThis.KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  function toggle(id: string) {
    setSelected((cur) => (cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id]));
  }

  async function save() {
    setSaving(true);
    setError(null);
    try {
      await setPlugins({ token, id: agentId, plugins: selected });
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save plugins");
    } finally {
      setSaving(false);
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
      <div className="relative z-10 flex max-h-[min(80vh,560px)] w-full max-w-lg flex-col overflow-hidden rounded-2xl border border-white/10 bg-[#0d0d0d] shadow-2xl">
        <div className="flex items-center justify-between border-b border-white/10 px-5 py-3.5">
          <div className="flex items-center gap-2">
            <Icon.Brain size={16} />
            <span className="text-sm font-semibold">elizaOS plugins</span>
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
        <div className="overflow-y-auto px-5 py-4">
          <p className="mb-3 text-[13px] text-white/50">
            Plugin ids stored on this agent and surfaced in turn context (Detour lightweight path).
          </p>
          <div className="flex flex-wrap gap-2">
            {ELIZA_PLUGINS.map((p) => {
              const on = selected.includes(p);
              return (
                <button
                  key={p}
                  type="button"
                  onClick={() => toggle(p)}
                  className={
                    on
                      ? "rounded-full border border-purple-400/50 bg-purple-500/20 px-3 py-1.5 text-[12px] text-white"
                      : "rounded-full border border-white/12 bg-white/5 px-3 py-1.5 text-[12px] text-white/70 transition hover:border-white/25"
                  }
                >
                  {p.replace(/^plugin-/, "")}
                </button>
              );
            })}
          </div>
          {error && <p className="mt-3 text-[13px] text-red-300/90">{error}</p>}
        </div>
        <div className="flex justify-end gap-2 border-t border-white/10 px-5 py-3">
          <button
            type="button"
            onClick={onClose}
            className="rounded-full px-4 py-2 text-[13px] text-white/55 transition hover:bg-white/10 hover:text-white"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={saving}
            onClick={() => void save()}
            className="rounded-full bg-white px-4 py-2 text-[13px] font-medium text-black transition hover:bg-white/90 disabled:opacity-40"
          >
            {saving ? "Saving…" : "Save"}
          </button>
        </div>
      </div>
    </div>
  );
}
