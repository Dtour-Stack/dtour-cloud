import { ACCENT, CANVAS_BG, type Renderer, type Scene, type View } from "./types";

function rgba(c: [number, number, number, number]) {
  const [r, g, b, a] = c;
  return `rgba(${Math.round(r * 255)}, ${Math.round(g * 255)}, ${Math.round(b * 255)}, ${a})`;
}

/** Robust 2D fallback used when WebGPU is unavailable. */
export function createCanvas2DRenderer(canvas: HTMLCanvasElement): Renderer | null {
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  let dpr = 1;

  return {
    backend: "canvas2d",

    resize() {
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      const w = Math.max(1, Math.round(canvas.clientWidth * dpr));
      const h = Math.max(1, Math.round(canvas.clientHeight * dpr));
      if (canvas.width !== w) canvas.width = w;
      if (canvas.height !== h) canvas.height = h;
    },

    render(scene: Scene, view: View, selectionId: string | null) {
      const cssW = canvas.clientWidth || 1;
      const cssH = canvas.clientHeight || 1;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.fillStyle = rgba(CANVAS_BG);
      ctx.fillRect(0, 0, cssW, cssH);

      for (const n of scene.nodes) {
        if (n.type === "text") continue; // text drawn on the 2D overlay
        const sx = n.x * view.zoom + view.panX;
        const sy = n.y * view.zoom + view.panY;
        ctx.fillStyle = rgba(n.fill);
        ctx.fillRect(sx, sy, n.w * view.zoom, n.h * view.zoom);
      }

      const sel = selectionId && scene.nodes.find((n) => n.id === selectionId);
      if (sel) {
        const sx = sel.x * view.zoom + view.panX;
        const sy = sel.y * view.zoom + view.panY;
        ctx.strokeStyle = rgba(ACCENT);
        ctx.lineWidth = 2;
        ctx.strokeRect(sx - 1, sy - 1, sel.w * view.zoom + 2, sel.h * view.zoom + 2);
      }
    },

    destroy() {},
  };
}
