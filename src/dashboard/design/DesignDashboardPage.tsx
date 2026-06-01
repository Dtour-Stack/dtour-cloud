import type { ReactNode } from "react";
import { Navigate, useMatch, useNavigate, useParams } from "react-router-dom";
import { Badge, Button, Icon, Panel, SectionHeading } from "@/ui";
import { GalleryHome } from "../gallery/GalleryHome";
import { AppShell, type NavItem } from "../AppShell";
import { StudioCanvas } from "./canvas/StudioCanvas";
import { ExcalidrawDesignCanvas } from "./canvas/ExcalidrawDesignCanvas";
import { GeneratePanel } from "./generate/GeneratePanel";
import { DesignProjectProvider, useDesignProject } from "./DesignProjectContext";
import { ProjectsOverview } from "./projects/ProjectsOverview";
import { WorkflowEditor } from "./workflow/WorkflowEditor";

const DESIGN_NAV: NavItem[] = [
  { to: "/design/generate", label: "Prototype", icon: <Icon.Wand /> },
  { to: "/design/canvas", label: "Canvas", icon: <Icon.Frame /> },
  { to: "/design/sketch", label: "Sketch", icon: <Icon.SquarePen /> },
  { to: "/design/workflows", label: "Workflows", icon: <Icon.Plug /> },
  { to: "/design/library", label: "Library", icon: <Icon.LayoutGrid /> },
];

function Section({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children: ReactNode;
}) {
  return (
    <div className="mx-auto max-w-6xl space-y-6 px-6 py-8 md:px-8 md:py-10">
      <header className="fade-up flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div className="max-w-2xl">
          <h1 className="text-2xl font-semibold tracking-tight text-white">{title}</h1>
          <p className="mt-1 text-[13px] leading-relaxed text-white/55">{description}</p>
        </div>
      </header>
      {children}
    </div>
  );
}

// ── Overview ────────────────────────────────────────────────────────────────

function Overview() {
  const navigate = useNavigate();
  const cards = [
    {
      to: "/design/generate",
      icon: <Icon.Wand size={18} />,
      title: "Prototype",
      desc: "Claude-style artifact previews for mockups, wireframes, and small interactive UI.",
    },
    {
      to: "/design/canvas",
      icon: <Icon.Frame size={18} />,
      title: "Canvas",
      desc: "Artboards for frames, text, media, and embedded website previews.",
    },
    {
      to: "/design/workflows",
      icon: <Icon.Plug size={18} />,
      title: "Workflows",
      desc: "Prompt chains for image, video, text, tools, and output previews.",
    },
    {
      to: "/design/library",
      icon: <Icon.LayoutGrid size={18} />,
      title: "Library",
      desc: "Reusable visual directions for generation prompts and mockups.",
    },
    {
      to: "/design/projects",
      icon: <Icon.Image size={18} />,
      title: "Projects",
      desc: "Saved design documents and gallery outputs.",
    },
  ];
  return (
    <Section
      title="Design Studio"
      description="A focused workspace for artifact previews, artboards, sketches, and agent workflow assets."
    >
      <Panel className="fade-up overflow-hidden p-0">
        <div className="grid gap-px bg-white/10 lg:grid-cols-[1fr_420px]">
          <div className="bg-[#0d0d0d] p-6 md:p-8">
            <Badge tone="accent">Design cockpit</Badge>
            <h2 className="mt-4 max-w-2xl text-3xl font-semibold tracking-tight text-white md:text-4xl">
              Generate the interface, inspect it live, then move it into the canvas.
            </h2>
            <p className="mt-4 max-w-xl text-sm leading-relaxed text-white/60">
              The Design area is now centered on working surfaces instead of component inventory. Prototype creates
              artifact previews, Canvas handles artboards and embeds, and Workflows handles repeatable production chains.
            </p>
            <div className="mt-6 flex flex-wrap gap-3">
              <Button onClick={() => navigate("/design/generate")}>
                <Icon.Wand size={14} /> Generate preview
              </Button>
              <Button variant="secondary" onClick={() => navigate("/design/canvas")}>
                <Icon.Frame size={14} /> Open canvas
              </Button>
            </div>
          </div>
          <div className="bg-black p-4 md:p-6">
            <div className="overflow-hidden rounded-2xl border border-white/10 bg-white/[0.03] shadow-2xl">
              <div className="flex h-9 items-center gap-1.5 border-b border-white/10 px-3">
                <span className="h-2.5 w-2.5 rounded-full bg-red-400/70" />
                <span className="h-2.5 w-2.5 rounded-full bg-amber-300/70" />
                <span className="h-2.5 w-2.5 rounded-full bg-emerald-300/70" />
                <span className="ml-2 rounded-full border border-white/10 bg-black/50 px-2 py-0.5 text-[10px] text-white/45">
                  artifact.preview
                </span>
              </div>
              <div className="space-y-3 p-4">
                <div className="rounded-xl border border-white/10 bg-[#0a0a0a] p-4">
                  <div className="h-2 w-24 rounded-full bg-white/20" />
                  <div className="mt-5 h-7 w-3/4 rounded-full bg-white/85" />
                  <div className="mt-2 h-7 w-1/2 rounded-full bg-white/55" />
                  <div className="mt-5 grid grid-cols-3 gap-2">
                    <div className="h-16 rounded-lg border border-purple-400/25 bg-purple-400/10" />
                    <div className="h-16 rounded-lg border border-white/10 bg-white/[0.04]" />
                    <div className="h-16 rounded-lg border border-white/10 bg-white/[0.04]" />
                  </div>
                </div>
                <div className="grid grid-cols-4 gap-2">
                  {["Artifact", "Styles", "State", "Agent"].map((label) => (
                    <div key={label} className="rounded-lg border border-white/10 bg-white/[0.03] px-2 py-2 text-center text-[10px] text-white/45">
                      {label}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      </Panel>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {cards.map((c) => (
          <button
            key={c.to}
            type="button"
            onClick={() => navigate(c.to)}
            className="fade-up flex min-h-36 flex-col gap-3 rounded-2xl border border-white/10 bg-white/[0.02] p-5 text-left transition hover:border-white/20 hover:bg-white/[0.05] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-purple-400/60"
          >
            <span className="flex h-9 w-9 items-center justify-center rounded-full border border-white/10 bg-white/[0.04] text-white/70">
              {c.icon}
            </span>
            <span className="mt-1 text-sm font-medium text-white">{c.title}</span>
            <span className="text-[12.5px] leading-relaxed text-white/45">{c.desc}</span>
          </button>
        ))}
      </div>

      <Panel className="fade-up p-5">
        <div className="grid gap-3 md:grid-cols-4">
          {[
            ["Brief", "Prompt and constraints"],
            ["Preview", "Sandboxed artifact viewer"],
            ["Canvas", "Artboard and embeds"],
            ["Workflow", "Repeatable generation"],
          ].map(([label, value]) => (
            <div key={label} className="rounded-xl border border-white/10 bg-black/30 px-4 py-3">
              <div className="text-[10px] uppercase tracking-widest text-white/35">{label}</div>
              <div className="mt-1 text-[13px] text-white/75">{value}</div>
            </div>
          ))}
        </div>
      </Panel>
    </Section>
  );
}

// ── Design System (live Detour tokens) ──────────────────────────────────────

const SWATCHES: { label: string; value: string; css: string }[] = [
  { label: "canvas", value: "#0A0A0A", css: "#0A0A0A" },
  { label: "raised", value: "#0D0D0D", css: "#0D0D0D" },
  { label: "border", value: "white/12", css: "rgba(255,255,255,0.12)" },
  { label: "text", value: "#FFFFFF", css: "#FFFFFF" },
  { label: "text/60", value: "white/60", css: "rgba(255,255,255,0.6)" },
  { label: "violet", value: "#A855F7", css: "#A855F7" },
  { label: "indigo", value: "#6366F1", css: "#6366F1" },
  { label: "blue", value: "#3B82F6", css: "#3B82F6" },
  { label: "success", value: "#6EE7B7", css: "#6EE7B7" },
  { label: "warning", value: "#FDE68A", css: "#FDE68A" },
  { label: "danger", value: "#F87171", css: "#F87171" },
  { label: "elizaos", value: "#0057FF", css: "#0057FF" },
];

const RADII = [
  { label: "pill", cls: "rounded-full" },
  { label: "card · 2xl", cls: "rounded-2xl" },
  { label: "panel · xl", cls: "rounded-xl" },
  { label: "sm · lg", cls: "rounded-lg" },
  { label: "icon · md", cls: "rounded-md" },
];

function DesignSystem() {
  return (
    <Section
      title="Design System"
      description="Detour's live UI contract: dark canvas, white opacity ramp, hairline borders, and one restrained violet-blue accent."
    >
      <Panel className="fade-up overflow-hidden p-0">
        <div className="grid gap-px bg-white/10 lg:grid-cols-[1.2fr_0.8fr]">
          <div className="bg-[#0d0d0d] p-6">
            <SectionHeading title="Color" description="Use color as information, not decoration." />
            <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
              {SWATCHES.map((s) => (
                <div key={s.label} className="overflow-hidden rounded-xl border border-white/10 bg-black/20">
                  <div className="h-14 w-full" style={{ background: s.css }} />
                  <div className="px-2.5 py-2">
                    <div className="text-[12px] text-white/85">{s.label}</div>
                    <div className="font-mono text-[10px] text-white/40">{s.value}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
          <div className="bg-[#0d0d0d] p-6">
            <SectionHeading title="Type + Actions" description="Small chrome, clear hierarchy, white pill for the strongest action." />
            <div className="mt-5 space-y-4">
              <p className="text-4xl font-bold tracking-tight">Display</p>
              <p className="text-xl font-semibold tracking-tight">Interface heading</p>
              <p className="text-sm leading-relaxed text-white/60">
                Body copy stays restrained and readable. Metadata moves down the opacity ramp.
              </p>
              <p className="text-[11px] uppercase tracking-widest text-white/50">Caption label</p>
              <div className="flex flex-wrap items-center gap-3 pt-1">
                <Button>Primary</Button>
                <Button variant="secondary">Secondary</Button>
                <Badge tone="success">Ready</Badge>
              </div>
            </div>
          </div>
        </div>
      </Panel>

      <Panel className="fade-up p-6">
        <SectionHeading title="Radii" description="One shape language across buttons, panels, inputs, and icon controls." />
        <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-6">
          {RADII.map((r) => (
            <div key={r.label} className="rounded-xl border border-white/10 bg-black/25 p-4">
              <div className={`h-14 w-full border border-white/15 bg-white/[0.05] ${r.cls}`} />
              <div className="mt-3 text-[11px] text-white/50">{r.label}</div>
            </div>
          ))}
        </div>
      </Panel>

      <Panel className="fade-up p-6">
        <SectionHeading title="Surface recipe" description="Glass, blur, and hairlines provide structure without heavy chrome." />
        <div className="mt-4 grid gap-3 md:grid-cols-3">
          {[
            ["Canvas", "#0A0A0A", "App background"],
            ["Raised", "#0D0D0D", "Panels and drawers"],
            ["Sunken", "#000000", "Preview backdrops"],
          ].map(([label, color, note]) => (
            <div key={label} className="rounded-2xl border border-white/10 p-4" style={{ background: color }}>
              <div className="text-sm font-medium text-white">{label}</div>
              <div className="mt-1 text-[12px] text-white/45">{note}</div>
              <div className="mt-4 h-px bg-white/10" />
              <div className="mt-4 rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2 text-[11px] text-white/45">
                border-white/10 + backdrop blur
              </div>
            </div>
          ))}
        </div>
      </Panel>
    </Section>
  );
}

// ── Style Library ────────────────────────────────────────────────────────────

const STYLES: { name: string; vibe: string; bg: string; accent: string; prompt: string }[] = [
  {
    name: "Detour Glass",
    vibe: "Near-black, glass panels, one violet-blue focus moment.",
    bg: "#0A0A0A",
    accent: "linear-gradient(90deg,#C084FC,#818CF8,#60A5FA)",
    prompt: "dark glass SaaS UI with hairline borders and one violet-blue accent",
  },
  {
    name: "Wireframe",
    vibe: "Fast structural mockups with clean spacing and neutral placeholders.",
    bg: "#111111",
    accent: "repeating-linear-gradient(90deg,#ffffff33 0 8px,#ffffff0d 8px 16px)",
    prompt: "high-fidelity wireframe with labeled layout blocks and clear hierarchy",
  },
  {
    name: "Editorial Tool",
    vibe: "Wide columns, restrained typography, strong preview canvas.",
    bg: "#101010",
    accent: "#F5F5F5",
    prompt: "editorial product tool with roomy columns and strong typographic hierarchy",
  },
  {
    name: "Ops Console",
    vibe: "Dense tables, filters, status rails, and repeat-action ergonomics.",
    bg: "#050505",
    accent: "#6EE7B7",
    prompt: "dense operational dashboard with tables filters and status rails",
  },
  {
    name: "Creator Kit",
    vibe: "Media-first studio surface with asset rails and preview states.",
    bg: "#0E1116",
    accent: "#A855F7",
    prompt: "creator studio with media rail, preview canvas, and asset controls",
  },
  {
    name: "Mobile Agent",
    vibe: "Compact app screens for onboarding, chat, and agent controls.",
    bg: "#000000",
    accent: "#60A5FA",
    prompt: "mobile-first AI agent app with chat controls and account setup",
  },
];

function StyleLibrary() {
  return (
    <Section
      title="Style Library"
      description="Reusable prompt directions for mockups, wireframes, and agent-generated previews."
    >
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {STYLES.map((s) => (
          <Panel key={s.name} className="fade-up overflow-hidden p-0">
            <div className="relative h-32 w-full" style={{ background: s.bg }}>
              <div
                className="absolute bottom-4 left-4 h-10 w-10 rounded-full border border-white/15"
                style={{ background: s.accent }}
              />
              <div className="absolute right-4 top-4 grid w-28 gap-1.5">
                <div className="h-2 rounded-full bg-white/25" />
                <div className="h-2 rounded-full bg-white/10" />
                <div className="h-2 w-2/3 rounded-full bg-white/10" />
              </div>
            </div>
            <div className="space-y-3 p-4">
              <div className="min-w-0">
                <div className="text-sm font-medium text-white">{s.name}</div>
                <div className="mt-0.5 text-[12px] leading-relaxed text-white/45">{s.vibe}</div>
              </div>
              <div className="rounded-xl border border-white/10 bg-black/25 px-3 py-2 font-mono text-[10px] leading-relaxed text-white/45">
                {s.prompt}
              </div>
            </div>
          </Panel>
        ))}
      </div>
    </Section>
  );
}

// ── Generate (wired to the workflow execution pipeline) ──────────────────────

function Generate() {
  return <GeneratePanel />;
}

const SECTIONS: Record<string, ReactNode> = {
  overview: <Overview />,
  system: <DesignSystem />,
  library: <StyleLibrary />,
  generate: <Generate />,
};

function DesignEditorSurface({ section }: { section: "canvas" | "sketch" | "workflows" }) {
  const { project } = useDesignProject();
  const surface =
    section === "canvas" ? (
      <StudioCanvas />
    ) : section === "sketch" ? (
      <ExcalidrawDesignCanvas />
    ) : (
      <WorkflowEditor />
    );
  return <div key={project} className="flex h-full min-h-0 flex-col">{surface}</div>;
}

export default function DesignDashboardPage() {
  const { section } = useParams();
  const projectMatch = useMatch("/design/projects/:projectId");
  const projectsList = useMatch({ path: "/design/projects", end: true });
  const projectId = projectMatch?.params.projectId;
  const key = section ?? "overview";

  if (key === "ai-elements") return <Navigate to="/design/generate" replace />;

  if (projectId === "gallery") {
    return (
      <AppShell title="Design Studio" nav={DESIGN_NAV} context="design">
        <GalleryHome title="Gallery" />
      </AppShell>
    );
  }
  if (projectId) {
    return <Navigate to="/design/projects" replace />;
  }
  if (projectsList) {
    return (
      <AppShell title="Design Studio" nav={DESIGN_NAV} context="design">
        <ProjectsOverview />
      </AppShell>
    );
  }

  // The canvas + workflow editor fill the whole main area (no scroll/padding).
  if (key === "generate" || key === "canvas" || key === "sketch" || key === "workflows") {
    return (
      <AppShell title="Design Studio" nav={DESIGN_NAV} context="design" bare>
        {key === "generate" ? (
          <Generate />
        ) : (
          <DesignProjectProvider>
            <DesignEditorSurface section={key} />
          </DesignProjectProvider>
        )}
      </AppShell>
    );
  }

  const content = SECTIONS[key];
  if (!content) return <Navigate to="/design" replace />;

  return (
    <AppShell title="Design Studio" nav={DESIGN_NAV} context="design">
      {content}
    </AppShell>
  );
}
