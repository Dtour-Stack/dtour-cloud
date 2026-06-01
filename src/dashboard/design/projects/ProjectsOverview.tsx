import { useQuery } from "convex/react";
import { anyApi } from "convex/server";
import { Link } from "react-router-dom";
import { getDtourSessionToken } from "@/lib/session";
import { Badge, Icon, Panel } from "@/ui";
import { listDefaultProjects } from "./defaultProjects";

export function ProjectsOverview() {
  const token = getDtourSessionToken();
  const assets = useQuery(
    anyApi.assets.myGallery,
    token ? { token } : "skip",
  ) as { id: string }[] | undefined;

  const projects = listDefaultProjects();
  const imageCount = assets?.length ?? 0;

  return (
    <div className="mx-auto max-w-5xl space-y-6 px-6 py-8">
      <header className="fade-up">
        <h1 className="text-2xl font-semibold tracking-tight">Projects</h1>
        <p className="mt-1 text-[13px] text-white/45">
          Your design workspace — built-in projects are ready on first sign-in.
        </p>
      </header>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {projects.map((p) => (
          <Link
            key={p.id}
            to={p.to}
            className="fade-up group flex flex-col overflow-hidden rounded-2xl border border-white/10 bg-white/[0.02] transition hover:border-white/20 hover:bg-white/[0.04]"
          >
            <div className="relative flex h-32 items-center justify-center bg-gradient-to-br from-purple-500/15 via-indigo-500/10 to-blue-500/15">
              <span className="rounded-xl border border-white/10 bg-black/20 p-3 text-white/70 transition group-hover:text-white">
                <Icon.Image size={22} />
              </span>
              {p.id === "gallery" && assets !== undefined && imageCount > 0 ? (
                <Badge tone="neutral" className="absolute right-3 top-3">
                  {imageCount} {imageCount === 1 ? "image" : "images"}
                </Badge>
              ) : null}
            </div>
            <Panel className="flex flex-1 flex-col gap-1 border-0 bg-transparent p-4 shadow-none">
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium text-white">{p.name}</span>
                <Badge tone="accent">Built-in</Badge>
              </div>
              <p className="text-[12.5px] leading-relaxed text-white/45">{p.description}</p>
            </Panel>
          </Link>
        ))}
      </div>
    </div>
  );
}
