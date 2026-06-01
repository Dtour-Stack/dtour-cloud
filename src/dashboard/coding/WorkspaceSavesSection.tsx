import { useQuery } from "convex/react";
import { anyApi } from "convex/server";
import { useState } from "react";

type WorkspaceRow = {
  id: string;
  name: string;
  sizeBytes: number;
  at: number;
  downloadUrl: string | null;
};

export function WorkspaceSavesSection({
  token,
  onSaveInTerminal,
  runnerActive,
}: {
  token: string | null;
  onSaveInTerminal: (name: string) => void;
  runnerActive: boolean;
}) {
  const pricing = useQuery(anyApi.coding.pricing, {});
  const workspaces = useQuery(
    anyApi.coding.listWorkspaces,
    token ? { token } : "skip",
  ) as WorkspaceRow[] | undefined;
  const [name, setName] = useState("workspace");

  if (!token) return null;

  const saveUsd = pricing?.workspaceSaveUsd ?? 0.05;

  return (
    <section data-tour="coding-workspace-save">
      <h3 className="mb-2 text-[10px] font-semibold uppercase tracking-widest text-white/35">
        Save work
      </h3>
      <p className="mb-2 text-[10px] leading-relaxed text-white/40">
        Snapshot <span className="font-mono text-white/55">~/workspace</span> from an active Detour
        Cloud session — ${saveUsd.toFixed(2)} per save
        {pricing?.workspaceMaxMiB != null ? ` (≤ ${pricing.workspaceMaxMiB} MiB)` : ""}. Holder
        discount applies.
      </p>
      <input
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="Snapshot name"
        className="mb-2 w-full rounded-lg border border-white/12 bg-black/40 px-2.5 py-2 text-[12px] text-white placeholder:text-white/30 focus:border-violet-400/40 focus:outline-none"
      />
      <button
        type="button"
        disabled={!runnerActive}
        onClick={() => onSaveInTerminal(name.trim() || "workspace")}
        className="mb-2 w-full rounded-lg border border-white/15 bg-white/[0.06] py-2 text-[12px] text-white/85 transition hover:bg-white/10 disabled:opacity-40"
      >
        Save workspace now
      </button>
      {!runnerActive && (
        <p className="mb-2 text-[10px] text-white/35">Connect Detour Cloud (E2B) first.</p>
      )}
      {workspaces && workspaces.length > 0 && (
        <ul className="space-y-1.5 text-[10px] text-white/50">
          {workspaces.slice(0, 5).map((w) => (
            <li key={w.id} className="flex items-center justify-between gap-2">
              <span className="truncate">{w.name}</span>
              {w.downloadUrl ? (
                <a
                  href={w.downloadUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="shrink-0 text-violet-300/90 hover:underline"
                >
                  download
                </a>
              ) : (
                <span className="text-white/25">…</span>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
