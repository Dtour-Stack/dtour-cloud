import { useMutation, useQuery } from "convex/react";
import { anyApi } from "convex/server";
import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { readDtourPlaywrightUser } from "@/lib/playwright-dtour-auth";
import { getDtourSessionToken } from "@/lib/session";
import { Badge, Button, Icon, Panel } from "@/ui";
import { designPath } from "../designProject";
import { GALLERY_PROJECT_ID } from "./defaultProjects";
import { listDefaultProjects } from "./defaultProjects";

type ProjectRow = {
  name: string;
  updatedAt: number;
  hasStudio: boolean;
  hasSketch: boolean;
  hasWorkflow: boolean;
};

export function ProjectsOverview() {
  const token = getDtourSessionToken();
  const navigate = useNavigate();
  const createProject = useMutation(anyApi.design.createProject);
  const userProjects = useQuery(
    anyApi.design.listProjects,
    token ? { token } : "skip",
  ) as ProjectRow[] | null | undefined;

  const [busy, setBusy] = useState(false);
  const builtins = listDefaultProjects();

  async function handleNew() {
    const name = window.prompt("New project name");
    if (!name?.trim() || !token) return;
    setBusy(true);
    try {
      const res = await createProject({ token, name: name.trim() });
      navigate(designPath("canvas", res.project));
    } catch (e) {
      window.alert(e instanceof Error ? e.message : "Could not create project");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto max-w-5xl space-y-8 px-6 py-8">
      <header className="fade-up flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Projects</h1>
          <p className="mt-1 max-w-xl text-[13px] text-white/45">
            Each project keeps its own Studio canvas, Sketch board, and workflow graph. Open a
            surface from the Design sidebar — the same project name carries across Studio, Sketch,
            and Workflows.
          </p>
        </div>
        <Button size="sm" disabled={busy || !token} onClick={() => void handleNew()}>
          <Icon.Plus size={14} /> New project
        </Button>
      </header>

      <section className="space-y-3">
        <h2 className="text-xs font-medium uppercase tracking-widest text-white/40">Your projects</h2>
        {userProjects === undefined ? (
          <p className="text-sm text-white/40">Loading…</p>
        ) : userProjects.length === 0 ? (
          <Panel className="p-6 text-center text-[13px] text-white/45">
            No projects yet. Create one to start designing — auto-save runs while you work.
          </Panel>
        ) : (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {userProjects.map((p) => (
              <ProjectCard key={p.name} project={p} />
            ))}
          </div>
        )}
      </section>

      <section className="space-y-3">
        <h2 className="text-xs font-medium uppercase tracking-widest text-white/40">Built-in</h2>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {builtins.map((p) => (
            <BuiltinCard key={p.id} id={p.id} name={p.name} description={p.description} to={p.to} />
          ))}
        </div>
      </section>
    </div>
  );
}

function surfaceLabel(p: ProjectRow) {
  return [p.hasStudio && "Studio", p.hasSketch && "Sketch", p.hasWorkflow && "Workflows"]
    .filter(Boolean)
    .join(" · ");
}

function ProjectCard({ project: p }: { project: ProjectRow }) {
  const updated = new Date(p.updatedAt).toLocaleString(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  });

  return (
    <Panel className="flex flex-col gap-3 p-4">
      <div>
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium text-white">{p.name}</span>
        </div>
        <p className="mt-1 text-[11px] text-white/40">
          {surfaceLabel(p) || "Empty"} · updated {updated}
        </p>
      </div>
      <div className="flex flex-wrap gap-2">
        <Link
          to={designPath("canvas", p.name)}
          className="rounded-full border border-white/12 px-3 py-1 text-[12px] text-white/75 transition hover:bg-white/10 hover:text-white"
        >
          Studio
        </Link>
        <Link
          to={designPath("sketch", p.name)}
          className="rounded-full border border-white/12 px-3 py-1 text-[12px] text-white/75 transition hover:bg-white/10 hover:text-white"
        >
          Sketch
        </Link>
        <Link
          to={designPath("workflows", p.name)}
          className="rounded-full border border-white/12 px-3 py-1 text-[12px] text-white/75 transition hover:bg-white/10 hover:text-white"
        >
          Workflows
        </Link>
      </div>
    </Panel>
  );
}

function BuiltinCard({
  id,
  name,
  description,
  to,
}: {
  id: string;
  name: string;
  description: string;
  to: string;
}) {
  const testUser = readDtourPlaywrightUser();
  const token = getDtourSessionToken();
  const assets = useQuery(
    anyApi.assets.myGallery,
    token && !testUser && id === GALLERY_PROJECT_ID ? { token } : "skip",
  ) as { id: string }[] | undefined;
  const imageCount = testUser ? 0 : (assets?.length ?? 0);

  return (
    <Link
      to={to}
      className="fade-up group flex flex-col overflow-hidden rounded-2xl border border-white/10 bg-white/[0.02] transition hover:border-white/20 hover:bg-white/[0.04]"
    >
      <div className="relative flex h-32 items-center justify-center bg-gradient-to-br from-purple-500/15 via-indigo-500/10 to-blue-500/15">
        <span className="rounded-xl border border-white/10 bg-black/20 p-3 text-white/70 transition group-hover:text-white">
          <Icon.Image size={22} />
        </span>
        {id === GALLERY_PROJECT_ID && assets !== undefined && imageCount > 0 ? (
          <Badge tone="neutral" className="absolute right-3 top-3">
            {imageCount} {imageCount === 1 ? "image" : "images"}
          </Badge>
        ) : null}
      </div>
      <Panel className="flex flex-1 flex-col gap-1 border-0 bg-transparent p-4 shadow-none">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium text-white">{name}</span>
          <Badge tone="accent">Built-in</Badge>
        </div>
        <p className="text-[12.5px] leading-relaxed text-white/45">{description}</p>
      </Panel>
    </Link>
  );
}
