import { useMutation, useQuery } from "convex/react";
import { anyApi } from "convex/server";
import {
  type PointerEvent as RPointerEvent,
  type ReactNode,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import { GalleryPicker } from "@/dashboard/gallery/GalleryPicker";
import {
  DTOUR_TEST_SESSION_TOKEN,
  readDtourPlaywrightUser,
} from "@/lib/playwright-dtour-auth";
import { getDtourSessionToken } from "@/lib/session";
import { cn, Icon } from "@/ui";
import { DESIGN_SURFACE } from "../designProject";
import { DesignProjectControls } from "../DesignProjectControls";
import { useDesignProject } from "../DesignProjectContext";
import { CANVAS_TOUR, GuidedTour } from "../GuidedTour";
import { createCanvas2DRenderer } from "./canvas2dRenderer";
import { DomNodeLayer } from "./DomNodeLayer";
import { StudioAiPanel } from "./StudioAiPanel";
import {
  ARTBOARD_PRESETS,
  ELLIPSE_FILL,
  FRAME_FILL,
  RECT_FILL,
  TEXT_FILL,
  type Node,
  type Renderer,
  type Scene,
  type View,
} from "./types";
import {
  clearPendingImageUrls,
  hydrateStudioDoc,
  newId,
  queueCanvasImage,
  readPendingImageUrls,
  serializeStudioDoc,
  viewportCenter,
} from "./studioDoc";
import { createWebGPURenderer } from "./webgpuRenderer";

type Tool = "select" | "frame" | "rect" | "ellipse" | "text" | "image";

type Gesture =
  | { kind: "pan"; sx: number; sy: number; panX: number; panY: number }
  | { kind: "move"; id: string; sx: number; sy: number; ox: number; oy: number }
  | { kind: "create"; id: string; wx: number; wy: number };

const AUTO_SAVE_MS = 2500;

export function StudioCanvas() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const rendererRef = useRef<Renderer | null>(null);
  const gestureRef = useRef<Gesture | null>(null);

  const [scene, setScene] = useState<Scene>({ nodes: [] });
  const [view, setView] = useState<View>({ panX: 120, panY: 80, zoom: 0.55 });
  const [tool, setTool] = useState<Tool>("select");
  const [selection, setSelection] = useState<string | null>(null);
  const [backend, setBackend] = useState<"webgpu" | "canvas2d" | "loading">("loading");
  const [aiOpen, setAiOpen] = useState(false);
  const [layersOpen, setLayersOpen] = useState(false);
  const [showGallery, setShowGallery] = useState(false);
  const [showArtboards, setShowArtboards] = useState(false);

  const sceneRef = useRef(scene);
  const viewRef = useRef(view);
  const toolRef = useRef(tool);
  sceneRef.current = scene;
  viewRef.current = view;
  toolRef.current = tool;

  const testUser = readDtourPlaywrightUser();
  const token = testUser ? DTOUR_TEST_SESSION_TOKEN : getDtourSessionToken();
  const { project } = useDesignProject();
  const saved = useQuery(
    anyApi.design.getDoc,
    token && !testUser ? { token, kind: DESIGN_SURFACE.studio, project } : "skip",
  ) as { data: string; updatedAt: number } | null | undefined;
  const saveDoc = useMutation(anyApi.design.saveDoc);
  const saveProjectAs = useMutation(anyApi.design.saveProjectAs);
  const hydrated = useRef(false);
  const pendingHandled = useRef(false);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [saveState, setSaveState] = useState<"idle" | "saving" | "saved">("idle");

  useEffect(() => {
    hydrated.current = false;
    pendingHandled.current = false;
    setScene({ nodes: [] });
    setView({ panX: 120, panY: 80, zoom: 0.55 });
    setSelection(null);
    setSaveState("idle");
  }, [project]);

  useEffect(() => {
    if (saved === undefined || hydrated.current) return;
    hydrated.current = true;
    if (saved?.data) {
      const doc = hydrateStudioDoc(saved.data);
      if (doc) {
        setScene(doc.scene);
        setView(doc.view);
      }
    }
  }, [saved, project]);

  const persist = useCallback(
    async (manual = false) => {
      if (!token) return;
      if (testUser) {
        setSaveState("saved");
        if (manual) window.setTimeout(() => setSaveState("idle"), 1500);
        return;
      }
      setSaveState("saving");
      try {
        await saveDoc({
          token,
          kind: DESIGN_SURFACE.studio,
          project,
          data: serializeStudioDoc(sceneRef.current, viewRef.current),
        });
        setSaveState("saved");
        if (manual) window.setTimeout(() => setSaveState("idle"), 1500);
      } catch {
        setSaveState("idle");
      }
    },
    [saveDoc, token, project, testUser],
  );

  const scheduleSave = useCallback(() => {
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => void persist(), AUTO_SAVE_MS);
  }, [persist]);

  useEffect(() => {
    if (!hydrated.current) return;
    scheduleSave();
  }, [scene, view, scheduleSave]);

  const draw = useCallback(() => {
    rendererRef.current?.render(sceneRef.current, viewRef.current, selection);
  }, [selection]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    let disposed = false;
    let renderer: Renderer | null = null;

    (async () => {
      renderer = (await createWebGPURenderer(canvas)) ?? createCanvas2DRenderer(canvas);
      if (!renderer || disposed) {
        renderer?.destroy();
        return;
      }
      rendererRef.current = renderer;
      renderer.resize();
      setBackend(renderer.backend);
      draw();
    })();

    const ro = new ResizeObserver(() => {
      rendererRef.current?.resize();
      draw();
    });
    ro.observe(canvas);

    return () => {
      disposed = true;
      ro.disconnect();
      rendererRef.current?.destroy();
      rendererRef.current = null;
    };
  }, [draw]);

  useEffect(() => {
    draw();
  }, [scene, view, selection, backend, draw]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    function onWheel(e: WheelEvent) {
      e.preventDefault();
      const rect = canvas!.getBoundingClientRect();
      const sx = e.clientX - rect.left;
      const sy = e.clientY - rect.top;
      setView((v) => {
        const factor = Math.exp(-e.deltaY * 0.0015);
        const zoom = Math.min(8, Math.max(0.08, v.zoom * factor));
        const wx = (sx - v.panX) / v.zoom;
        const wy = (sy - v.panY) / v.zoom;
        return { zoom, panX: sx - wx * zoom, panY: sy - wy * zoom };
      });
    }
    canvas.addEventListener("wheel", onWheel, { passive: false });
    return () => canvas.removeEventListener("wheel", onWheel);
  }, []);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const el = document.activeElement;
      if (el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || (el as HTMLElement).isContentEditable))
        return;
      if ((e.key === "Backspace" || e.key === "Delete") && selection) {
        e.preventDefault();
        setScene((s) => ({ nodes: s.nodes.filter((n) => n.id !== selection) }));
        setSelection(null);
      } else if (e.key === "v" || e.key === "V") setTool("select");
      else if (e.key === "f" || e.key === "F") setTool("frame");
      else if (e.key === "r" || e.key === "R") setTool("rect");
      else if (e.key === "o" || e.key === "O") setTool("ellipse");
      else if (e.key === "t" || e.key === "T") setTool("text");
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [selection]);

  function insertImageNode(url: string, index = 0) {
    const root = rootRef.current;
    const w = 480;
    const h = 360;
    const pos = viewportCenter(viewRef.current, root?.clientWidth ?? 800, root?.clientHeight ?? 600, w, h, index);
    const node: Node = { id: newId(), type: "image", ...pos, w, h, fill: [1, 1, 1, 1], url };
    setScene((s) => ({ nodes: [...s.nodes, node] }));
    setSelection(node.id);
    setTool("select");
  }

  function handlePendingImages() {
    if (pendingHandled.current) return;
    const urls = readPendingImageUrls();
    if (urls.length === 0) return;
    pendingHandled.current = true;
    urls.forEach((url, i) => insertImageNode(url, i));
    clearPendingImageUrls();
  }

  useEffect(() => {
    if (hydrated.current) handlePendingImages();
  }, [saved]);

  function toWorld(e: RPointerEvent) {
    const rect = canvasRef.current!.getBoundingClientRect();
    const sx = e.clientX - rect.left;
    const sy = e.clientY - rect.top;
    const v = viewRef.current;
    return { sx, sy, wx: (sx - v.panX) / v.zoom, wy: (sy - v.panY) / v.zoom };
  }

  function hitTest(wx: number, wy: number): string | null {
    const nodes = sceneRef.current.nodes;
    for (let i = nodes.length - 1; i >= 0; i--) {
      const n = nodes[i];
      if (wx >= n.x && wx <= n.x + n.w && wy >= n.y && wy <= n.y + n.h) return n.id;
    }
    return null;
  }

  function onPointerDown(e: RPointerEvent) {
    if ((e.target as HTMLElement).closest("[data-studio-ui]")) return;
    try {
      canvasRef.current?.setPointerCapture(e.pointerId);
    } catch {
      /* ignore */
    }
    const { sx, sy, wx, wy } = toWorld(e);
    const t = toolRef.current;

    if (t === "select") {
      const id = hitTest(wx, wy);
      setSelection(id);
      if (id) {
        const n = sceneRef.current.nodes.find((x) => x.id === id) as Node;
        gestureRef.current = { kind: "move", id, sx, sy, ox: n.x, oy: n.y };
      } else {
        const v = viewRef.current;
        gestureRef.current = { kind: "pan", sx, sy, panX: v.panX, panY: v.panY };
      }
      return;
    }

    if (t === "text") {
      const id = newId();
      const fontSize = 32;
      const node: Node = {
        id,
        type: "text",
        x: wx,
        y: wy,
        w: 280,
        h: fontSize * 1.4,
        fill: TEXT_FILL,
        text: "Heading",
        fontSize,
      };
      setScene((s) => ({ nodes: [...s.nodes, node] }));
      setSelection(id);
      setTool("select");
      return;
    }

    if (t === "image") {
      setShowGallery(true);
      return;
    }

    const id = newId();
    const node: Node = {
      id,
      type: t,
      x: wx,
      y: wy,
      w: 0,
      h: 0,
      fill: t === "frame" ? FRAME_FILL : t === "ellipse" ? ELLIPSE_FILL : RECT_FILL,
    };
    setScene((s) => ({ nodes: [...s.nodes, node] }));
    setSelection(id);
    gestureRef.current = { kind: "create", id, wx, wy };
  }

  function onPointerMove(e: RPointerEvent) {
    const g = gestureRef.current;
    if (!g) return;
    const { sx, sy, wx, wy } = toWorld(e);

    if (g.kind === "pan") {
      setView((v) => ({ ...v, panX: g.panX + (sx - g.sx), panY: g.panY + (sy - g.sy) }));
    } else if (g.kind === "move") {
      const z = viewRef.current.zoom;
      setScene((s) => ({
        nodes: s.nodes.map((n) =>
          n.id === g.id ? { ...n, x: g.ox + (sx - g.sx) / z, y: g.oy + (sy - g.sy) / z } : n,
        ),
      }));
    } else {
      const x = Math.min(g.wx, wx);
      const y = Math.min(g.wy, wy);
      setScene((s) => ({
        nodes: s.nodes.map((n) =>
          n.id === g.id ? { ...n, x, y, w: Math.abs(wx - g.wx), h: Math.abs(wy - g.wy) } : n,
        ),
      }));
    }
  }

  function onPointerUp(e: RPointerEvent) {
    try {
      canvasRef.current?.releasePointerCapture(e.pointerId);
    } catch {
      /* ignore */
    }
    const g = gestureRef.current;
    gestureRef.current = null;
    if (g?.kind === "create") {
      setScene((s) => ({
        nodes: s.nodes.map((n) => {
          if (n.id !== g.id) return n;
          if (n.w < 4 && n.h < 4) {
            if (n.type === "frame") return { ...n, w: 1080, h: 1080 };
            if (n.type === "ellipse") return { ...n, w: 200, h: 200 };
            return { ...n, w: 240, h: 160 };
          }
          return n;
        }),
      }));
      setTool("select");
    }
  }

  function addArtboard(preset: (typeof ARTBOARD_PRESETS)[number]) {
    const root = rootRef.current;
    const pos = viewportCenter(
      viewRef.current,
      root?.clientWidth ?? 800,
      root?.clientHeight ?? 600,
      preset.w,
      preset.h,
    );
    const node: Node = {
      id: newId(),
      type: "frame",
      ...pos,
      w: preset.w,
      h: preset.h,
      fill: FRAME_FILL,
      label: preset.name,
    };
    setScene((s) => ({ nodes: [...s.nodes, node] }));
    setSelection(node.id);
    setShowArtboards(false);
  }

  function insertAiNodes(nodes: Node[]) {
    setScene((s) => ({ nodes: [...s.nodes, ...nodes] }));
    if (nodes[0]) setSelection(nodes[0].id);
  }

  function insertEmbed(embed: { html: string; w: number; h: number; label?: string }) {
    const root = rootRef.current;
    const pos = viewportCenter(
      viewRef.current,
      root?.clientWidth ?? 800,
      root?.clientHeight ?? 600,
      embed.w,
      embed.h,
    );
    const node: Node = {
      id: newId(),
      type: "embed",
      ...pos,
      w: embed.w,
      h: embed.h,
      fill: [1, 1, 1, 1],
      html: embed.html,
      label: embed.label,
    };
    setScene((s) => ({ nodes: [...s.nodes, node] }));
    setSelection(node.id);
  }

  const selected = scene.nodes.find((n) => n.id === selection) ?? null;

  function updateNode(patch: Partial<Node>) {
    if (!selection) return;
    setScene((s) => ({
      nodes: s.nodes.map((n) => (n.id === selection ? { ...n, ...patch } : n)),
    }));
  }

  if (!token) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-white/50">
        Sign in to use Design Studio.
      </div>
    );
  }

  const cursor =
    tool === "select" ? (gestureRef.current?.kind === "pan" ? "grabbing" : "default") : "crosshair";

  const sideMode = showArtboards ? "artboards" : layersOpen ? "layers" : null;

  return (
    <div ref={rootRef} className="flex h-full min-h-0 w-full flex-col overflow-hidden bg-[#0a0a0a]">
      <div
        data-studio-ui
        data-tour="canvas-toolbar"
        className="z-20 flex min-h-14 shrink-0 flex-wrap items-center gap-2 border-b border-white/10 bg-[#0d0d0d]/95 px-3 py-2 backdrop-blur-xl lg:flex-nowrap"
      >
        <DesignProjectControls
          saveState={saveState}
          onSave={() => void persist(true)}
          onSaveAs={async (newName) => {
            if (!token || testUser) return;
            await saveProjectAs({
              token,
              kind: DESIGN_SURFACE.studio,
              fromProject: project,
              toName: newName,
              data: serializeStudioDoc(sceneRef.current, viewRef.current),
            });
          }}
        />

        <div className="hidden h-6 w-px bg-white/10 sm:block" />

        <div className="flex items-center gap-1 rounded-lg border border-white/10 bg-black/25 p-1" role="toolbar" aria-label="Canvas tools">
          <ToolButton active={tool === "select"} label="Select (V)" onClick={() => setTool("select")}>
            <Icon.MousePointer size={15} />
          </ToolButton>
          <ToolButton active={tool === "frame"} label="Artboard (F)" onClick={() => setTool("frame")}>
            <Icon.Frame size={15} />
          </ToolButton>
          <ToolButton active={tool === "rect"} label="Rectangle (R)" onClick={() => setTool("rect")}>
            <Icon.Square size={15} />
          </ToolButton>
          <ToolButton active={tool === "ellipse"} label="Ellipse (O)" onClick={() => setTool("ellipse")}>
            <Icon.Circle size={15} />
          </ToolButton>
          <ToolButton active={tool === "text"} label="Text (T)" onClick={() => setTool("text")}>
            <Icon.Type size={15} />
          </ToolButton>
          <ToolButton active={tool === "image"} label="Image" onClick={() => setShowGallery(true)}>
            <Icon.Image size={15} />
          </ToolButton>
        </div>

        <div className="ml-auto flex min-w-0 flex-wrap items-center gap-1">
          <button
            type="button"
            data-studio-ui
            onClick={() => {
              setShowArtboards((v) => !v);
              setLayersOpen(false);
            }}
            className={cn(
              "flex h-8 items-center gap-1.5 rounded-lg px-2.5 text-[12px] transition",
              showArtboards ? "bg-white/10 text-white" : "text-white/65 hover:bg-white/10 hover:text-white",
            )}
          >
            <Icon.Frame size={14} /> Artboards
          </button>
          <button
            type="button"
            data-studio-ui
            onClick={() => setShowGallery(true)}
            className="flex h-8 items-center gap-1.5 rounded-lg px-2.5 text-[12px] text-white/65 transition hover:bg-white/10 hover:text-white"
          >
            <Icon.Image size={14} /> Assets
          </button>
          <GuidedTour id="canvas" heading="Design Studio" steps={CANVAS_TOUR} />
          <button
            type="button"
            data-studio-ui
            onClick={() => {
              setLayersOpen((v) => !v);
              setShowArtboards(false);
            }}
            className={cn(
              "flex h-8 items-center gap-1.5 rounded-lg px-2.5 text-[12px] transition",
              layersOpen ? "bg-white/10 text-white" : "text-white/65 hover:bg-white/10 hover:text-white",
            )}
          >
            <Icon.LayoutGrid size={14} /> Layers
          </button>
          <button
            type="button"
            data-studio-ui
            onClick={() => setAiOpen((v) => !v)}
            className={cn(
              "flex h-8 items-center gap-1.5 rounded-lg px-2.5 text-[12px] transition",
              aiOpen ? "bg-white text-black" : "text-white/65 hover:bg-white/10 hover:text-white",
            )}
          >
            <Icon.Wand size={14} /> AI
          </button>
          <div className="ml-1 hidden items-center gap-1.5 rounded-full border border-white/10 bg-black/25 px-2.5 py-1 text-[11px] text-white/45 md:flex">
            <span
              className={cn(
                "h-1.5 w-1.5 rounded-full",
                backend === "webgpu" ? "bg-emerald-400" : backend === "canvas2d" ? "bg-amber-400" : "bg-white/30",
              )}
            />
            {backend === "webgpu" ? "WebGPU" : backend === "canvas2d" ? "Canvas2D" : "Rendering"}
          </div>
        </div>
      </div>

      <div className="flex min-h-0 flex-1 overflow-hidden">
        {sideMode && (
          <aside data-studio-ui className="hidden w-64 shrink-0 border-r border-white/10 bg-[#0d0d0d] p-3 md:block">
            {sideMode === "artboards" ? (
              <>
                <div className="px-1 pb-3">
                  <div className="text-[11px] font-medium text-white">Artboards</div>
                  <div className="mt-1 text-[11px] leading-relaxed text-white/40">Add a preset frame to the current viewport.</div>
                </div>
                <div className="space-y-1">
                  {ARTBOARD_PRESETS.map((p) => (
                    <button
                      key={p.name}
                      type="button"
                      onClick={() => addArtboard(p)}
                      className="flex w-full items-center justify-between rounded-lg px-2.5 py-2 text-left transition hover:bg-white/10"
                    >
                      <span className="text-[12px] text-white/75">{p.name}</span>
                      <span className="text-[10px] text-white/35">
                        {p.w}×{p.h}
                      </span>
                    </button>
                  ))}
                </div>
              </>
            ) : scene.nodes.length === 0 ? (
              <p className="px-2 py-3 text-[12px] text-white/40">No layers yet</p>
            ) : (
              <div className="space-y-1">
                {[...scene.nodes].reverse().map((n) => (
                  <button
                    key={n.id}
                    type="button"
                    onClick={() => setSelection(n.id)}
                    className={cn(
                      "flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-[12px] transition hover:bg-white/10",
                      selection === n.id ? "bg-white/10 text-white" : "text-white/60",
                    )}
                  >
                    <span className="truncate capitalize">{n.label ?? n.type}</span>
                  </button>
                ))}
              </div>
            )}
          </aside>
        )}

        <div
          className="relative min-h-0 min-w-0 flex-1"
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
        >
          <canvas
            ref={canvasRef}
            onPointerDown={onPointerDown}
            className="absolute inset-0 block h-full w-full touch-none"
            style={{ cursor }}
          />
          <DomNodeLayer
            scene={scene}
            view={view}
            selection={selection}
            onSelect={setSelection}
            onChangeNode={(id, patch) =>
              setScene((s) => ({ nodes: s.nodes.map((n) => (n.id === id ? { ...n, ...patch } : n)) }))
            }
            onDragStart={(id, e) => {
              const n = sceneRef.current.nodes.find((x) => x.id === id);
              if (!n) return;
              const rect = canvasRef.current!.getBoundingClientRect();
              gestureRef.current = {
                kind: "move",
                id,
                sx: e.clientX - rect.left,
                sy: e.clientY - rect.top,
                ox: n.x,
                oy: n.y,
              };
            }}
          />

          {selected && (
            <PropertiesPanel
              node={selected}
              onChange={updateNode}
              onDelete={() => {
                setScene((s) => ({ nodes: s.nodes.filter((n) => n.id !== selection) }));
                setSelection(null);
              }}
            />
          )}

          {scene.nodes.length === 0 && (
            <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
              <p className="max-w-sm text-center text-[13px] leading-relaxed text-white/30">
                Start with an artboard, shape, text block, image, AI graphic, or artifact embed.
                <br />
                Scroll to zoom · drag canvas to pan.
              </p>
            </div>
          )}
        </div>

        {aiOpen && (
          <StudioAiPanel
            token={token}
            onInsertNodes={insertAiNodes}
            onInsertImage={(url) => insertImageNode(url)}
            onInsertEmbed={insertEmbed}
          />
        )}
      </div>

      {showGallery && (
        <GalleryPicker
          token={token}
          onClose={() => setShowGallery(false)}
          onPick={(url) => {
            setShowGallery(false);
            insertImageNode(url);
          }}
        />
      )}
    </div>
  );
}

// Re-export for workflow handoff
export { queueCanvasImage };

function PropertiesPanel({
  node,
  onChange,
  onDelete,
}: {
  node: Node;
  onChange: (patch: Partial<Node>) => void;
  onDelete: () => void;
}) {
  const round = (n: number) => Math.round(n);
  const rgbToHex = (c: Node["fill"]) => {
    const TWO = (x: number) => x.toString(16).padStart(2, "0");
    return `#${TWO(Math.round(c[0] * 255))}${TWO(Math.round(c[1] * 255))}${TWO(Math.round(c[2] * 255))}`;
  };
  const hexToRgb = (hex: string, a: number): Node["fill"] => {
    const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
    if (!m) return node.fill;
    const int = parseInt(m[1], 16);
    return [((int >> 16) & 255) / 255, ((int >> 8) & 255) / 255, (int & 255) / 255, a];
  };
  const num =
    "w-full rounded-lg border border-white/12 bg-white/5 px-2 py-1.5 text-[12px] tabular-nums text-white focus:border-purple-400/50 focus:outline-none";

  return (
    <div
      data-studio-ui
      className="pointer-events-auto absolute right-4 top-16 z-20 w-60 rounded-2xl border border-white/12 bg-[#0d0d0d]/90 p-4 shadow-2xl backdrop-blur-xl"
    >
      <div className="mb-3 flex items-center justify-between">
        <span className="text-[11px] uppercase tracking-widest text-white/45">{node.type}</span>
        <button
          type="button"
          onClick={onDelete}
          aria-label="Delete"
          className="flex h-6 w-6 items-center justify-center rounded-full text-white/45 transition hover:bg-white/10 hover:text-white"
        >
          <Icon.Trash size={13} />
        </button>
      </div>
      <div className="grid grid-cols-2 gap-2">
        {(["x", "y", "w", "h"] as const).map((k) => (
          <label key={k} className="block">
            <span className="mb-1 block text-[10px] uppercase tracking-widest text-white/40">{k.toUpperCase()}</span>
            <input
              type="number"
              value={round(node[k])}
              onChange={(e) => onChange({ [k]: Number(e.target.value) })}
              className={num}
            />
          </label>
        ))}
      </div>
      {node.type !== "image" && node.type !== "embed" && (
        <div className="mt-3">
          <span className="mb-1 block text-[10px] uppercase tracking-widest text-white/40">
            {node.type === "text" ? "Color" : "Fill"}
          </span>
          <input
            type="color"
            value={rgbToHex(node.fill)}
            onChange={(e) => onChange({ fill: hexToRgb(e.target.value, node.fill[3]) })}
            className="h-8 w-full cursor-pointer rounded-lg border border-white/12 bg-transparent"
          />
        </div>
      )}
      {node.type === "frame" && (
        <div className="mt-3">
          <span className="mb-1 block text-[10px] uppercase tracking-widest text-white/40">Label</span>
          <input
            value={node.label ?? ""}
            onChange={(e) => onChange({ label: e.target.value })}
            className={num}
          />
        </div>
      )}
    </div>
  );
}

function ToolButton({
  active,
  label,
  onClick,
  children,
}: {
  active: boolean;
  label: string;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      aria-pressed={active}
      title={label}
      data-studio-ui
      onClick={onClick}
      className={cn(
        "flex h-7 w-7 items-center justify-center rounded-md transition",
        active ? "bg-white text-black" : "text-white/55 hover:bg-white/10 hover:text-white",
      )}
    >
      {children}
    </button>
  );
}
