/** A node on the design studio canvas. Coordinates are world px at zoom=1. */
export type NodeType = "frame" | "rect" | "ellipse" | "text" | "image" | "embed";

export type Node = {
  id: string;
  type: NodeType;
  x: number;
  y: number;
  w: number;
  h: number;
  /** Fill (shapes) or text color — straight-alpha RGBA 0..1. */
  fill: [number, number, number, number];
  /** Text nodes */
  text?: string;
  fontSize?: number;
  fontWeight?: number;
  /** Frame label (artboard name) */
  label?: string;
  /** Image URL (image nodes) */
  url?: string;
  /** Raw HTML for website/mockup embeds */
  html?: string;
  locked?: boolean;
};

export type Scene = { nodes: Node[] };

/** Pan/zoom. screen = world * zoom + pan. */
export type View = { panX: number; panY: number; zoom: number };

export type ArtboardPreset = { name: string; w: number; h: number };

export const ARTBOARD_PRESETS: ArtboardPreset[] = [
  { name: "Presentation 16:9", w: 1920, h: 1080 },
  { name: "Instagram post", w: 1080, h: 1080 },
  { name: "Instagram story", w: 1080, h: 1920 },
  { name: "LinkedIn banner", w: 1584, h: 396 },
  { name: "Mobile screen", w: 390, h: 844 },
  { name: "A4 portrait", w: 794, h: 1123 },
];

export interface Renderer {
  readonly backend: "webgpu" | "canvas2d";
  render(scene: Scene, view: View, selectionId: string | null): void;
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
export const FRAME_FILL: Node["fill"] = [0.98, 0.98, 0.99, 1];
export const RECT_FILL: Node["fill"] = [0.55, 0.4, 0.96, 0.95];
export const ELLIPSE_FILL: Node["fill"] = [0.38, 0.55, 0.98, 0.95];
export const TEXT_FILL: Node["fill"] = [0.08, 0.08, 0.1, 1];
export const IMAGE_PLACEHOLDER: Node["fill"] = [0.15, 0.15, 0.18, 1];

/** GPU/canvas layer draws these; text/image/embed use the DOM overlay. */
export function isGpuNode(type: NodeType): boolean {
  return type === "frame" || type === "rect" || type === "ellipse";
}

export function isDomNode(type: NodeType): boolean {
  return type === "text" || type === "image" || type === "embed";
}
