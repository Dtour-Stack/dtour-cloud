import type { Node, Scene, View } from "./types";

export type StudioSavePayload = {
  version: 3;
  nodes: Node[];
  view: View;
};

const PENDING_IMAGES_KEY = "dtour-canvas-pending-images";

export function readPendingImageUrls(): string[] {
  try {
    const raw = sessionStorage.getItem(PENDING_IMAGES_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    return Array.isArray(parsed) ? parsed.filter((u): u is string => typeof u === "string") : [];
  } catch {
    return [];
  }
}

export function clearPendingImageUrls() {
  try {
    sessionStorage.removeItem(PENDING_IMAGES_KEY);
  } catch {
    /* ignore */
  }
}

export function queueCanvasImage(url: string) {
  const existing = readPendingImageUrls();
  try {
    sessionStorage.setItem(PENDING_IMAGES_KEY, JSON.stringify([...existing, url]));
  } catch {
    /* ignore */
  }
}

function normalizeNode(raw: unknown): Node | null {
  if (!raw || typeof raw !== "object") return null;
  const n = raw as Record<string, unknown>;
  const type = n.type;
  if (
    type !== "frame" &&
    type !== "rect" &&
    type !== "ellipse" &&
    type !== "text" &&
    type !== "image" &&
    type !== "embed"
  ) {
    return null;
  }
  const fill = n.fill;
  if (!Array.isArray(fill) || fill.length !== 4) return null;
  return {
    id: String(n.id ?? crypto.randomUUID?.() ?? `n${Date.now()}`),
    type,
    x: Number(n.x) || 0,
    y: Number(n.y) || 0,
    w: Math.max(1, Number(n.w) || 100),
    h: Math.max(1, Number(n.h) || 100),
    fill: fill as Node["fill"],
    ...(typeof n.text === "string" ? { text: n.text } : {}),
    ...(typeof n.fontSize === "number" ? { fontSize: n.fontSize } : {}),
    ...(typeof n.fontWeight === "number" ? { fontWeight: n.fontWeight } : {}),
    ...(typeof n.label === "string" ? { label: n.label } : {}),
    ...(typeof n.url === "string" ? { url: n.url } : {}),
    ...(typeof n.html === "string" ? { html: n.html } : {}),
    ...(n.locked === true ? { locked: true } : {}),
  };
}

/** Load studio scene from Convex JSON (ignores legacy Excalidraw v2 saves). */
export function hydrateStudioDoc(raw: string): { scene: Scene; view: View } | null {
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object") return null;
    const data = parsed as Record<string, unknown>;

    if (data.version === 3 && Array.isArray(data.nodes)) {
      const nodes = data.nodes.map(normalizeNode).filter((n): n is Node => n !== null);
      const view = data.view as View;
      return {
        scene: { nodes },
        view: view?.panX != null ? view : { panX: 120, panY: 80, zoom: 0.45 },
      };
    }

    if (Array.isArray(data.nodes)) {
      const nodes = data.nodes.map(normalizeNode).filter((n): n is Node => n !== null);
      const view = (data.view as View) ?? { panX: 120, panY: 80, zoom: 1 };
      return { scene: { nodes }, view };
    }
  } catch {
    /* corrupt */
  }
  return null;
}

export function serializeStudioDoc(scene: Scene, view: View): string {
  const payload: StudioSavePayload = { version: 3, nodes: scene.nodes, view };
  return JSON.stringify(payload);
}

export function newId() {
  return typeof crypto !== "undefined" && crypto.randomUUID
    ? crypto.randomUUID()
    : `n${Date.now()}${Math.floor(Math.random() * 1e6)}`;
}

/** Place new nodes in the viewport center with a stagger offset. */
export function viewportCenter(view: View, cssW: number, cssH: number, w: number, h: number, index = 0) {
  const cx = (cssW / 2 - view.panX) / view.zoom;
  const cy = (cssH / 2 - view.panY) / view.zoom;
  return {
    x: cx - w / 2 + (index % 3) * 32,
    y: cy - h / 2 + Math.floor(index / 3) * 32,
  };
}
