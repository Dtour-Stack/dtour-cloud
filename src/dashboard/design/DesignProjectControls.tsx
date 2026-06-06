import { useMutation, useQuery } from "convex/react";
import { anyApi } from "convex/server";
import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  DTOUR_TEST_SESSION_TOKEN,
  readDtourPlaywrightUser,
} from "@/lib/playwright-dtour-auth";
import { getDtourSessionToken } from "@/lib/session";
import { cn, Icon } from "@/ui";
import { useDesignProject } from "./DesignProjectContext";
import { designPath } from "./designProject";

type SaveState = "idle" | "saving" | "saved";

export function DesignProjectControls({
  saveState,
  onSave,
  onSaveAs,
  className,
  menuPlacement = "bottom",
}: {
  saveState?: SaveState;
  onSave?: () => void;
  /** Copy current surface into a newly named project, then switch to it. */
  onSaveAs?: (newName: string) => Promise<void>;
  className?: string;
  menuPlacement?: "top" | "bottom";
}) {
  const isTestAuth = readDtourPlaywrightUser() !== null;
  const token = isTestAuth ? DTOUR_TEST_SESSION_TOKEN : getDtourSessionToken();
  const navigate = useNavigate();
  const { project, setProject } = useDesignProject();
  const createProject = useMutation(anyApi.design.createProject);
  const remoteProjects = useQuery(
    anyApi.design.listProjects,
    token && !isTestAuth ? { token } : "skip",
  ) as
    | {
        name: string;
        updatedAt: number;
        hasStudio: boolean;
        hasSketch: boolean;
        hasWorkflow: boolean;
        hasInfra: boolean;
      }[]
    | null
    | undefined;
  const projects = isTestAuth ? [] : remoteProjects;

  const [pickerOpen, setPickerOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  async function handleNew() {
    const name = window.prompt("New project name");
    if (!name?.trim() || !token) return;
    if (isTestAuth) {
      setProject(name.trim());
      navigate(designPath("canvas", name.trim()));
      return;
    }
    setBusy(true);
    try {
      const res = await createProject({ token, name: name.trim() });
      setProject(res.project);
      navigate(designPath("canvas", res.project));
    } catch (e) {
      window.alert(e instanceof Error ? e.message : "Could not create project");
    } finally {
      setBusy(false);
    }
  }

  async function handleSaveAs() {
    if (!onSaveAs) return;
    const name = window.prompt("Save copy as project", `${project} copy`);
    if (!name?.trim()) return;
    setBusy(true);
    try {
      await onSaveAs(name.trim());
      setProject(name.trim());
    } catch (e) {
      window.alert(e instanceof Error ? e.message : "Could not save project");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div
      className={cn(
        "flex min-w-0 shrink-0 items-center gap-1 rounded-xl border border-white/10 bg-black/25 p-1 max-sm:gap-0.5 max-sm:p-0.5",
        className,
      )}
    >
      <div className="relative">
        <button
          type="button"
          aria-expanded={pickerOpen}
          aria-haspopup="menu"
          aria-label="Switch project"
          disabled={busy}
          onClick={() => setPickerOpen((v) => !v)}
          className="flex h-7 max-w-[11rem] items-center gap-1.5 truncate rounded-lg px-2.5 text-[12px] font-medium text-white transition hover:bg-white/10 max-sm:max-w-[7.5rem]"
        >
          <Icon.LayoutGrid size={14} className="shrink-0 text-violet-300/90" />
          <span className="truncate">{project}</span>
          <Icon.ChevronDown size={12} className="shrink-0 text-white/40" />
        </button>
        {pickerOpen && (
          <>
            <button
              type="button"
              aria-label="Close project list"
              className="fixed inset-0 z-40 cursor-default"
              onClick={() => setPickerOpen(false)}
            />
            <div
              className={cn(
                "absolute left-0 z-50 w-56 overflow-hidden rounded-xl border border-white/10 bg-[#0d0d12] py-1 shadow-2xl",
                menuPlacement === "top" ? "bottom-full mb-2" : "top-full mt-2",
              )}
            >
              <p className="px-3 py-1.5 text-[10px] uppercase tracking-widest text-white/35">
                Projects
              </p>
              {projects === undefined ? (
                <p className="px-3 py-2 text-[12px] text-white/40">Loading…</p>
              ) : projects.length === 0 ? (
                <p className="px-3 py-2 text-[12px] text-white/40">No projects yet</p>
              ) : (
                projects.map((p) => (
                  <button
                    key={p.name}
                    type="button"
                    onClick={() => {
                      setProject(p.name);
                      setPickerOpen(false);
                    }}
                    className={cn(
                      "flex w-full flex-col px-3 py-2 text-left text-[12px] transition hover:bg-white/10",
                      p.name === project ? "bg-white/[0.06] text-white" : "text-white/75",
                    )}
                  >
                    <span className="font-medium">{p.name}</span>
                    <span className="text-[10px] text-white/35">
                      {[p.hasStudio && "Studio", p.hasSketch && "Sketch", p.hasWorkflow && "Flow", p.hasInfra && "Infra"]
                        .filter(Boolean)
                        .join(" · ") || "Empty"}
                    </span>
                  </button>
                ))
              )}
              <div className="border-t border-white/10 px-2 py-1.5">
                <Link
                  to="/design/projects"
                  onClick={() => setPickerOpen(false)}
                  className="block rounded-lg px-2 py-1.5 text-[12px] text-violet-300/90 hover:bg-white/10"
                >
                  All projects →
                </Link>
              </div>
            </div>
          </>
        )}
      </div>

      <div className="mx-0.5 h-5 w-px bg-white/10" />

      <button
        type="button"
        aria-label="Create new project"
        disabled={busy}
        onClick={() => void handleNew()}
        className="flex h-7 shrink-0 items-center gap-1 rounded-lg px-2.5 text-[12px] text-white/75 transition hover:bg-white/10 hover:text-white"
      >
        <Icon.Plus size={13} />
        <span className="hidden sm:inline">New</span>
      </button>

      {onSave && (
        <button
          type="button"
          aria-label={`Save ${project}`}
          disabled={busy || saveState === "saving"}
          onClick={onSave}
          className="flex h-7 shrink-0 items-center gap-1 rounded-lg bg-white px-3 text-[12px] font-medium text-black transition hover:shadow-md disabled:opacity-50"
        >
          {saveState === "saved" ? <Icon.Check size={12} /> : null}
          {saveState === "saving" ? "Saving…" : saveState === "saved" ? "Saved" : "Save"}
        </button>
      )}

      {onSaveAs && (
        <button
          type="button"
          aria-label="Save a copy"
          disabled={busy}
          onClick={() => void handleSaveAs()}
          className="hidden h-7 shrink-0 rounded-lg px-2.5 text-[12px] text-white/60 transition hover:bg-white/10 hover:text-white sm:inline-flex sm:items-center"
        >
          Save as…
        </button>
      )}
    </div>
  );
}
