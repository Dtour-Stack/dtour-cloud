import {
  ACCENT,
  CANVAS_BG,
  IMAGE_PLACEHOLDER,
  isGpuNode,
  type Renderer,
  type Scene,
  type View,
} from "./types";

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
        if (!isGpuNode(n.type) && n.type !== "image") continue;
        const sx = n.x * view.zoom + view.panX;
        const sy = n.y * view.zoom + view.panY;
        const sw = n.w * view.zoom;
        const sh = n.h * view.zoom;

        if (n.type === "image") {
          ctx.fillStyle = rgba(IMAGE_PLACEHOLDER);
          ctx.fillRect(sx, sy, sw, sh);
          ctx.strokeStyle = "rgba(255,255,255,0.12)";
          ctx.lineWidth = 1;
          ctx.strokeRect(sx + 0.5, sy + 0.5, sw - 1, sh - 1);
          continue;
        }

        ctx.fillStyle = rgba(n.fill);
        if (n.type === "ellipse") {
          ctx.beginPath();
          ctx.ellipse(sx + sw / 2, sy + sh / 2, Math.max(1, sw / 2), Math.max(1, sh / 2), 0, 0, Math.PI * 2);
          ctx.fill();
        } else {
          ctx.fillRect(sx, sy, sw, sh);
          if (n.type === "frame") {
            ctx.strokeStyle = "rgba(0,0,0,0.08)";
            ctx.lineWidth = 1;
            ctx.strokeRect(sx + 0.5, sy + 0.5, sw - 1, sh - 1);
          }
        }
      }

      const sel = selectionId && scene.nodes.find((n) => n.id === selectionId);
      if (sel) {
        const sx = sel.x * view.zoom + view.panX;
        const sy = sel.y * view.zoom + view.panY;
        ctx.strokeStyle = rgba(ACCENT);
        ctx.lineWidth = 2;
        if (sel.type === "ellipse") {
          const sw = sel.w * view.zoom;
          const sh = sel.h * view.zoom;
          ctx.beginPath();
          ctx.ellipse(sx + sw / 2, sy + sh / 2, Math.max(1, sw / 2), Math.max(1, sh / 2), 0, 0, Math.PI * 2);
          ctx.stroke();
        } else {
          ctx.strokeRect(sx - 1, sy - 1, sel.w * view.zoom + 2, sel.h * view.zoom + 2);
        }
      }
    },

    destroy() {},
  };
}
