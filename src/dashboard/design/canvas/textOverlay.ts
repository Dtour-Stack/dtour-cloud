import type { Scene, View } from "./types";

function rgba(c: [number, number, number, number]) {
  const [r, g, b, a] = c;
  return `rgba(${Math.round(r * 255)}, ${Math.round(g * 255)}, ${Math.round(b * 255)}, ${a})`;
}

/** Draw text nodes onto a transparent 2D overlay stacked above the fill layer. */
export function drawTextOverlay(ctx: CanvasRenderingContext2D, scene: Scene, view: View) {
  const canvas = ctx.canvas;
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const cssW = canvas.clientWidth || 1;
  const cssH = canvas.clientHeight || 1;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, cssW, cssH);
  ctx.textBaseline = "top";

  for (const n of scene.nodes) {
    if (n.type !== "text") continue;
    const sx = n.x * view.zoom + view.panX;
    const sy = n.y * view.zoom + view.panY;
    const fs = Math.max(1, (n.fontSize ?? 24) * view.zoom);
    ctx.fillStyle = rgba(n.fill);
    ctx.font = `600 ${fs}px Inter, system-ui, sans-serif`;
    ctx.fillText(n.text ?? "", sx, sy);
  }
}
