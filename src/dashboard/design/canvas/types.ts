/** A node on the design canvas. Coordinates are in world units (px at zoom=1). */
export type Node = {
  id: string;
  type: "frame" | "rect" | "text";
  x: number;
  y: number;
  w: number;
  h: number;
  /** Fill (frame/rect) or text color, as straight-alpha RGBA, each channel 0..1. */
  fill: [number, number, number, number];
  /** Text content (text nodes only). */
  text?: string;
  /** Font size in world px (text nodes only). */
  fontSize?: number;
};

export type Scene = { nodes: Node[] };

/** Pan/zoom. screen = world * zoom + pan. */
export type View = { panX: number; panY: number; zoom: number };

export interface Renderer {
  readonly backend: "webgpu" | "canvas2d";
  render(scene: Scene, view: View, selectionId: string | null): void;
  /** Sync the drawing buffer to the element's CSS size × devicePixelRatio. */
  resize(): void;
  destroy(): void;
}

export const CANVAS_BG: [number, number, number, number] = [
  0x0a / 255,
  0x0a / 255,
  0x0a / 255,
  1,
];
export const ACCENT: [number, number, number, number] = [
  0xa8 / 255,
  0x55 / 255,
  0xf7 / 255,
  1,
];
