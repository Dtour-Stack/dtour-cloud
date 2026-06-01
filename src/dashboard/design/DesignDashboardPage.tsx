import type { ReactNode } from "react";
import { Navigate, useMatch, useNavigate, useParams } from "react-router-dom";
import { Badge, Button, Icon, Panel, SectionHeading } from "@/ui";
import { GalleryHome } from "../gallery/GalleryHome";
import { AppShell, type NavItem } from "../AppShell";
import { StudioCanvas } from "./canvas/StudioCanvas";
import { ExcalidrawDesignCanvas } from "./canvas/ExcalidrawDesignCanvas";
import { GeneratePanel } from "./generate/GeneratePanel";
import { ProjectsOverview } from "./projects/ProjectsOverview";
import { WorkflowEditor } from "./workflow/WorkflowEditor";

const DESIGN_NAV: NavItem[] = [
  { to: "/design", label: "Overview", icon: <Icon.Home />, end: true },
  { to: "/design/system", label: "Design System", icon: <Icon.Palette /> },
  { to: "/design/library", label: "Style Library", icon: <Icon.LayoutGrid /> },
  { to: "/design/canvas", label: "Studio", icon: <Icon.Frame /> },
  { to: "/design/sketch", label: "Sketch", icon: <Icon.SquarePen /> },
  { to: "/design/workflows", label: "Workflows", icon: <Icon.Plug /> },
  { to: "/design/generate", label: "Generate", icon: <Icon.Wand /> },
  { to: "/design/projects", label: "All projects", icon: <Icon.LayoutGrid />, group: "Projects", end: true },
  {
    to: "/design/projects/gallery",
    label: "Gallery",
    icon: <Icon.Image />,
    group: "Projects",
  },
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
    <div className="mx-auto max-w-5xl space-y-6 px-6 py-8">
      <header className="fade-up">
        <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
        <p className="mt-1 text-[13px] text-white/45">{description}</p>
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
      to: "/design/system",
      icon: <Icon.Palette size={18} />,
      title: "Design System",
      desc: "Detour's living tokens — color, type, radius, components.",
    },
    {
      to: "/design/library",
      icon: <Icon.LayoutGrid size={18} />,
      title: "Style Library",
      desc: "Curated aesthetic directions to start a project from.",
    },
    {
      to: "/design/canvas",
      icon: <Icon.Frame size={18} />,
      title: "Studio",
      desc: "Canva-style artboards — shapes, text, AI graphics, images, websites.",
    },
    {
      to: "/design/projects",
      icon: <Icon.Image size={18} />,
      title: "Projects",
      desc: "Built-in Gallery and your media library for workflows.",
    },
  ];
  return (
    <Section
      title="Design Studio"
      description="A design surface for Pro members — Detour's system, a style library, and AI generation."
    >
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        {cards.map((c) => (
          <button
            key={c.to}
            type="button"
            onClick={() => navigate(c.to)}
            className="fade-up flex flex-col gap-2 rounded-2xl border border-white/10 bg-white/[0.02] p-5 text-left transition hover:border-white/20 hover:bg-white/[0.04]"
          >
            <span className="flex h-9 w-9 items-center justify-center rounded-full border border-white/10 bg-white/[0.04] text-white/70">
              {c.icon}
            </span>
            <span className="mt-1 text-sm font-medium text-white">{c.title}</span>
            <span className="text-[12.5px] leading-relaxed text-white/45">{c.desc}</span>
          </button>
        ))}
      </div>

      <Panel className="fade-up p-6">
        <SectionHeading
          title="Studio + Sketch"
          description="Canva-style layout on WebGPU, Excalidraw for diagrams, AI for graphics, images, and websites."
        />
        <p className="mt-3 text-[13px] leading-relaxed text-white/55">
          Design → Studio is the main artboard editor: frames, shapes, text, gallery assets, and three AI modes
          (graphic layout, image, website mockup). Workflows send outputs to the canvas in one click. Sketch keeps
          Excalidraw for whiteboard-style diagrams.
        </p>
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
      description="Detour's tokens, rendered live from DESIGN.md — the source of truth for every surface."
    >
      <Panel className="fade-up p-6">
        <SectionHeading title="Color" description="Monochrome dark canvas, hairline borders, one violet→blue accent." />
        <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-6">
          {SWATCHES.map((s) => (
            <div key={s.label} className="overflow-hidden rounded-xl border border-white/10">
              <div className="h-14 w-full" style={{ background: s.css }} />
              <div className="px-2.5 py-2">
                <div className="text-[12px] text-white/85">{s.label}</div>
                <div className="font-mono text-[10px] text-white/35">{s.value}</div>
              </div>
            </div>
          ))}
        </div>
      </Panel>

      <Panel className="fade-up p-6">
        <SectionHeading title="Typography" description="Inter, hierarchy via weight + opacity." />
        <div className="mt-4 space-y-3">
          <p className="text-4xl font-bold tracking-tight">Display — the scenic route</p>
          <p className="text-2xl font-semibold tracking-tight">Heading one</p>
          <p className="text-base text-white/90">Body — say what it does. No marketing fluff.</p>
          <p className="text-[13px] text-white/60">Supporting copy at white/60 for metadata and hints.</p>
          <p className="text-[11px] uppercase tracking-widest text-white/50">Caption label</p>
        </div>
      </Panel>

      <Panel className="fade-up p-6">
        <SectionHeading title="Radius" description="Pills are the signature; cards 2xl; inputs xl." />
        <div className="mt-4 flex flex-wrap gap-3">
          {RADII.map((r) => (
            <div key={r.label} className="flex flex-col items-center gap-2">
              <div className={`h-14 w-20 border border-white/15 bg-white/[0.05] ${r.cls}`} />
              <span className="text-[11px] text-white/45">{r.label}</span>
            </div>
          ))}
        </div>
      </Panel>

      <Panel className="fade-up p-6">
        <SectionHeading title="Components" description="The white pill is the one strong action; everything else recedes." />
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <Button>Primary action</Button>
          <Button variant="secondary">Secondary</Button>
          <Badge tone="accent">Accent</Badge>
          <Badge tone="neutral">Neutral</Badge>
          <Badge tone="success">Holding $DTOUR</Badge>
        </div>
      </Panel>
    </Section>
  );
}

// ── Style Library ────────────────────────────────────────────────────────────

const STYLES: { name: string; vibe: string; bg: string; accent: string }[] = [
  { name: "Detour Glass", vibe: "Near-black, hairline borders, violet accent.", bg: "#0A0A0A", accent: "linear-gradient(90deg,#C084FC,#818CF8,#60A5FA)" },
  { name: "Minimal", vibe: "Restraint, whitespace, one weight of ink.", bg: "#F7F7F5", accent: "#111111" },
  { name: "Brutalist", vibe: "Raw structure, hard edges, mono type.", bg: "#111111", accent: "#E5FF00" },
  { name: "Editorial", vibe: "Serif headlines, generous columns.", bg: "#FBF7EF", accent: "#7A1F1F" },
  { name: "Bento", vibe: "Tiled cards, soft radius, playful.", bg: "#0E1116", accent: "#34D399" },
  { name: "Claymorphism", vibe: "Soft 3D, pastel depth, rounded.", bg: "#EEF1FF", accent: "#7C6FF0" },
];

function StyleLibrary() {
  return (
    <Section
      title="Style Library"
      description="Aesthetic directions to start from. Applying a style to a project is coming with the generation engine."
    >
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {STYLES.map((s) => (
          <Panel key={s.name} className="fade-up overflow-hidden p-0">
            <div className="relative h-28 w-full" style={{ background: s.bg }}>
              <div
                className="absolute bottom-3 left-3 h-8 w-8 rounded-full border border-black/10"
                style={{ background: s.accent }}
              />
            </div>
            <div className="flex items-start justify-between gap-2 p-4">
              <div className="min-w-0">
                <div className="text-sm font-medium text-white">{s.name}</div>
                <div className="mt-0.5 text-[12px] leading-relaxed text-white/45">{s.vibe}</div>
              </div>
              <Badge tone="neutral">Soon</Badge>
            </div>
          </Panel>
        ))}
      </div>
    </Section>
  );
}

// ── Generate (wired to the workflow execution pipeline) ──────────────────────

function Generate() {
  return (
    <Section
      title="Generate"
      description="Describe an image; Detour Cloud generates it through the workflow engine."
    >
      <GeneratePanel />
    </Section>
  );
}

const SECTIONS: Record<string, ReactNode> = {
  overview: <Overview />,
  system: <DesignSystem />,
  library: <StyleLibrary />,
  generate: <Generate />,
};

export default function DesignDashboardPage() {
  const { section } = useParams();
  const projectMatch = useMatch("/design/projects/:projectId");
  const projectsList = useMatch({ path: "/design/projects", end: true });
  const projectId = projectMatch?.params.projectId;
  const key = section ?? "overview";

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
  if (key === "canvas") {
    return (
      <AppShell title="Design Studio" nav={DESIGN_NAV} context="design" bare>
        <StudioCanvas />
      </AppShell>
    );
  }
  if (key === "sketch") {
    return (
      <AppShell title="Design Studio" nav={DESIGN_NAV} context="design" bare>
        <ExcalidrawDesignCanvas />
      </AppShell>
    );
  }
  if (key === "workflows") {
    return (
      <AppShell title="Design Studio" nav={DESIGN_NAV} context="design" bare>
        <WorkflowEditor />
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
