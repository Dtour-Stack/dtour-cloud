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
import { getDtourSessionToken } from "@/lib/session";
import { cn, Icon } from "@/ui";
import { CANVAS_TOUR, GuidedTour } from "../GuidedTour";
import { createCanvas2DRenderer } from "./canvas2dRenderer";
import { drawTextOverlay } from "./textOverlay";
import type { Node, Renderer, Scene, View } from "./types";
import { createWebGPURenderer } from "./webgpuRenderer";

type Tool = "select" | "frame" | "rect" | "text";

type Gesture =
  | { kind: "pan"; sx: number; sy: number; panX: number; panY: number }
  | { kind: "move"; id: string; sx: number; sy: number; ox: number; oy: number }
  | { kind: "create"; id: string; wx: number; wy: number };

const FRAME_FILL: Node["fill"] = [0.93, 0.93, 0.95, 1];
const RECT_FILL: Node["fill"] = [0.55, 0.4, 0.96, 1];
const TEXT_FILL: Node["fill"] = [1, 1, 1, 1];

function newId() {
  return typeof crypto !== "undefined" && crypto.randomUUID
    ? crypto.randomUUID()
    : `n${Date.now()}${Math.floor(Math.random() * 1e6)}`;
}

export function DesignCanvas() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const overlayRef = useRef<HTMLCanvasElement>(null);
  const rendererRef = useRef<Renderer | null>(null);
  const gestureRef = useRef<Gesture | null>(null);

  const [scene, setScene] = useState<Scene>({ nodes: [] });
  const [view, setView] = useState<View>({ panX: 120, panY: 80, zoom: 1 });
  const [tool, setTool] = useState<Tool>("select");
  const [selection, setSelection] = useState<string | null>(null);
  const [backend, setBackend] = useState<"webgpu" | "canvas2d" | "loading">("loading");

  // Mirror live state into refs so pointer handlers read fresh values.
  const sceneRef = useRef(scene);
  const viewRef = useRef(view);
  const toolRef = useRef(tool);
  sceneRef.current = scene;
  viewRef.current = view;
  toolRef.current = tool;

  // ── persistence ──
  const token = getDtourSessionToken();
  const saved = useQuery(
    anyApi.design.getDoc,
    token ? { token, kind: "canvas" } : "skip",
  ) as { data: string; updatedAt: number } | null | undefined;
  const saveDoc = useMutation(anyApi.design.saveDoc);
  const hydrated = useRef(false);
  const [saveState, setSaveState] = useState<"idle" | "saving" | "saved">("idle");

  useEffect(() => {
    if (saved === undefined || hydrated.current) return;
    hydrated.current = true;
    if (saved?.data) {
      try {
        const g = JSON.parse(saved.data);
        if (g.nodes) setScene({ nodes: g.nodes });
        if (g.view) setView(g.view);
      } catch {
        /* ignore corrupt save */
      }
    }
  }, [saved]);

  async function save() {
    if (!token) return;
    setSaveState("saving");
    try {
      await saveDoc({
        token,
        kind: "canvas",
        data: JSON.stringify({ nodes: sceneRef.current.nodes, view: viewRef.current }),
      });
      setSaveState("saved");
      window.setTimeout(() => setSaveState("idle"), 1500);
    } catch {
      setSaveState("idle");
    }
  }

  const sizeOverlay = useCallback(() => {
    const o = overlayRef.current;
    if (!o) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = Math.max(1, Math.round(o.clientWidth * dpr));
    const h = Math.max(1, Math.round(o.clientHeight * dpr));
    if (o.width !== w) o.width = w;
    if (o.height !== h) o.height = h;
  }, []);

  const draw = useCallback(() => {
    rendererRef.current?.render(sceneRef.current, viewRef.current, selection);
    const octx = overlayRef.current?.getContext("2d");
    if (octx) drawTextOverlay(octx, sceneRef.current, viewRef.current);
  }, [selection]);

  // Initialise renderer (WebGPU, falling back to Canvas2D).
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
      sizeOverlay();
      setBackend(renderer.backend);
      draw();
    })();

    const ro = new ResizeObserver(() => {
      rendererRef.current?.resize();
      sizeOverlay();
      draw();
    });
    ro.observe(canvas);

    return () => {
      disposed = true;
      ro.disconnect();
      rendererRef.current?.destroy();
      rendererRef.current = null;
    };
  }, [draw, sizeOverlay]);

  // Redraw on any scene/view/selection change (and once the backend is ready).
  useEffect(() => {
    draw();
  }, [scene, view, selection, backend, draw]);

  // Non-passive wheel zoom (so we can preventDefault).
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
        const zoom = Math.min(8, Math.max(0.1, v.zoom * factor));
        const wx = (sx - v.panX) / v.zoom;
        const wy = (sy - v.panY) / v.zoom;
        return { zoom, panX: sx - wx * zoom, panY: sy - wy * zoom };
      });
    }
    canvas.addEventListener("wheel", onWheel, { passive: false });
    return () => canvas.removeEventListener("wheel", onWheel);
  }, []);

  // Keyboard: delete selection, tool shortcuts.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const el = document.activeElement;
      if (el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA")) return;
      if ((e.key === "Backspace" || e.key === "Delete") && selection) {
        e.preventDefault();
        setScene((s) => ({ nodes: s.nodes.filter((n) => n.id !== selection) }));
        setSelection(null);
      } else if (e.key === "v" || e.key === "V") setTool("select");
      else if (e.key === "f" || e.key === "F") setTool("frame");
      else if (e.key === "r" || e.key === "R") setTool("rect");
      else if (e.key === "t" || e.key === "T") setTool("text");
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [selection]);

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
    try {
      canvasRef.current?.setPointerCapture(e.pointerId);
    } catch {
      /* synthetic or already-released pointer */
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
      const fontSize = 24;
      const node: Node = {
        id,
        type: "text",
        x: wx,
        y: wy,
        w: 160,
        h: fontSize * 1.3,
        fill: TEXT_FILL,
        text: "Text",
        fontSize,
      };
      setScene((s) => ({ nodes: [...s.nodes, node] }));
      setSelection(id);
      setTool("select");
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
      fill: t === "frame" ? FRAME_FILL : RECT_FILL,
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
      const dx = (sx - g.sx) / z;
      const dy = (sy - g.sy) / z;
      setScene((s) => ({
        nodes: s.nodes.map((n) => (n.id === g.id ? { ...n, x: g.ox + dx, y: g.oy + dy } : n)),
      }));
    } else {
      const x = Math.min(g.wx, wx);
      const y = Math.min(g.wy, wy);
      const w = Math.abs(wx - g.wx);
      const h = Math.abs(wy - g.wy);
      setScene((s) => ({
        nodes: s.nodes.map((n) => (n.id === g.id ? { ...n, x, y, w, h } : n)),
      }));
    }
  }

  function onPointerUp(e: RPointerEvent) {
    try {
      canvasRef.current?.releasePointerCapture(e.pointerId);
    } catch {
      /* pointer was never captured */
    }
    const g = gestureRef.current;
    gestureRef.current = null;
    if (g?.kind === "create") {
      // A click (no drag) drops a default-sized element.
      setScene((s) => ({
        nodes: s.nodes.map((n) => {
          if (n.id !== g.id) return n;
          if (n.w < 4 && n.h < 4) {
            const w = n.type === "frame" ? 320 : 160;
            const h = n.type === "frame" ? 200 : 120;
            return { ...n, w, h };
          }
          return n;
        }),
      }));
      setTool("select");
    }
  }

  const selected = scene.nodes.find((n) => n.id === selection) ?? null;

  function updateNode(patch: Partial<Node>) {
    if (!selection) return;
    setScene((s) => ({
      nodes: s.nodes.map((n) => (n.id === selection ? { ...n, ...patch } : n)),
    }));
  }

  function deleteSelected() {
    if (!selection) return;
    setScene((s) => ({ nodes: s.nodes.filter((n) => n.id !== selection) }));
    setSelection(null);
  }

  const cursor =
    tool === "select" ? (gestureRef.current?.kind === "pan" ? "grabbing" : "default") : "crosshair";

  return (
    <div className="relative h-full min-h-0 w-full overflow-hidden bg-[#0a0a0a]">
      <canvas
        ref={canvasRef}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        className="block h-full w-full touch-none"
        style={{ cursor }}
      />
      <canvas ref={overlayRef} className="pointer-events-none absolute inset-0 block h-full w-full" />

      {/* Toolbar */}
      <div className="pointer-events-auto absolute left-1/2 top-4 flex -translate-x-1/2 items-center gap-1 rounded-full border border-white/12 bg-[#0d0d0d]/90 p-1 shadow-2xl backdrop-blur-xl">
        <ToolButton active={tool === "select"} label="Select (V)" onClick={() => setTool("select")}>
          <Icon.MousePointer size={16} />
        </ToolButton>
        <ToolButton active={tool === "frame"} label="Frame (F)" onClick={() => setTool("frame")}>
          <Icon.Frame size={16} />
        </ToolButton>
        <ToolButton active={tool === "rect"} label="Rectangle (R)" onClick={() => setTool("rect")}>
          <Icon.Square size={16} />
        </ToolButton>
        <ToolButton active={tool === "text"} label="Text (T)" onClick={() => setTool("text")}>
          <Icon.Type size={16} />
        </ToolButton>
        <GuidedTour id="canvas" heading="Design Canvas" steps={CANVAS_TOUR} />
        <div className="mx-1 h-5 w-px bg-white/10" />
        <button
          type="button"
          aria-label="Reset view"
          onClick={() => setView({ panX: 120, panY: 80, zoom: 1 })}
          className="rounded-full px-3 py-1.5 text-[12px] tabular-nums text-white/55 transition hover:bg-white/10 hover:text-white"
        >
          {Math.round(view.zoom * 100)}%
        </button>
        <button
          type="button"
          onClick={save}
          disabled={saveState === "saving"}
          className="flex items-center gap-1.5 rounded-full bg-white px-3 py-1.5 text-[12px] font-medium text-black transition hover:shadow-lg hover:shadow-white/10 disabled:opacity-50"
        >
          {saveState === "saved" ? <Icon.Check size={13} /> : null}
          {saveState === "saving" ? "Saving…" : saveState === "saved" ? "Saved" : "Save"}
        </button>
      </div>

      {/* Backend badge */}
      <div className="absolute right-4 top-4 flex items-center gap-1.5 rounded-full border border-white/10 bg-[#0d0d0d]/80 px-3 py-1.5 text-[11px] text-white/55 backdrop-blur-xl">
        <span
          className={cn(
            "h-1.5 w-1.5 rounded-full",
            backend === "webgpu" ? "bg-emerald-400" : backend === "canvas2d" ? "bg-amber-400" : "bg-white/30",
          )}
        />
        {backend === "webgpu" ? "WebGPU" : backend === "canvas2d" ? "Canvas2D" : "…"}
      </div>

      {selected && (
        <PropertiesPanel node={selected} onChange={updateNode} onDelete={deleteSelected} />
      )}

      {scene.nodes.length === 0 && (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
          <p className="text-center text-[13px] leading-relaxed text-white/30">
            Pick Frame or Rectangle and draw on the canvas.
            <br />
            Scroll to zoom · drag empty space to pan.
          </p>
        </div>
      )}
    </div>
  );
}

const TWO = (n: number) => n.toString(16).padStart(2, "0");
function rgbToHex(c: Node["fill"]) {
  return `#${TWO(Math.round(c[0] * 255))}${TWO(Math.round(c[1] * 255))}${TWO(Math.round(c[2] * 255))}`;
}
function hexToRgb(hex: string, a: number): Node["fill"] {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return [1, 1, 1, a];
  const int = parseInt(m[1], 16);
  return [((int >> 16) & 255) / 255, ((int >> 8) & 255) / 255, (int & 255) / 255, a];
}

const num =
  "w-full rounded-lg border border-white/12 bg-white/5 px-2 py-1.5 text-[12px] tabular-nums text-white focus:border-purple-400/50 focus:outline-none";

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
  return (
    <div className="pointer-events-auto absolute right-4 top-16 w-60 rounded-2xl border border-white/12 bg-[#0d0d0d]/90 p-4 shadow-2xl backdrop-blur-xl">
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
        <Field label="X">
          <input type="number" value={round(node.x)} onChange={(e) => onChange({ x: Number(e.target.value) })} className={num} />
        </Field>
        <Field label="Y">
          <input type="number" value={round(node.y)} onChange={(e) => onChange({ y: Number(e.target.value) })} className={num} />
        </Field>
        <Field label="W">
          <input type="number" value={round(node.w)} onChange={(e) => onChange({ w: Math.max(0, Number(e.target.value)) })} className={num} />
        </Field>
        <Field label="H">
          <input type="number" value={round(node.h)} onChange={(e) => onChange({ h: Math.max(0, Number(e.target.value)) })} className={num} />
        </Field>
      </div>

      <div className="mt-3">
        <Field label={node.type === "text" ? "Color" : "Fill"}>
          <div className="flex items-center gap-2">
            <input
              type="color"
              value={rgbToHex(node.fill)}
              onChange={(e) => onChange({ fill: hexToRgb(e.target.value, node.fill[3]) })}
              className="h-7 w-9 shrink-0 cursor-pointer rounded-md border border-white/12 bg-transparent"
            />
            <span className="font-mono text-[11px] uppercase text-white/45">{rgbToHex(node.fill)}</span>
          </div>
        </Field>
      </div>

      {node.type === "text" && (
        <div className="mt-3 space-y-2">
          <Field label="Text">
            <textarea
              value={node.text ?? ""}
              onChange={(e) => onChange({ text: e.target.value })}
              rows={2}
              className="w-full resize-none rounded-lg border border-white/12 bg-white/5 px-2 py-1.5 text-[12px] text-white focus:border-purple-400/50 focus:outline-none"
            />
          </Field>
          <Field label="Font size">
            <input
              type="number"
              value={round(node.fontSize ?? 24)}
              onChange={(e) => onChange({ fontSize: Math.max(1, Number(e.target.value)) })}
              className={num}
            />
          </Field>
        </div>
      )}
    </div>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-[10px] uppercase tracking-widest text-white/40">{label}</span>
      {children}
    </label>
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
      onClick={onClick}
      className={cn(
        "flex h-8 w-8 items-center justify-center rounded-full transition",
        active ? "bg-white text-black" : "text-white/55 hover:bg-white/10 hover:text-white",
      )}
    >
      {children}
    </button>
  );
}
