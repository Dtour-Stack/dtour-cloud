import type {
  AppState,
  BinaryFiles,
  ExcalidrawInitialDataState,
  OrderedExcalidrawElement,
} from "@excalidraw/excalidraw/types";

type LegacyNode = {
  type: string;
  x: number;
  y: number;
  w: number;
  h: number;
  text?: string;
};

export type CanvasSavePayload = {
  version: 2;
  elements: readonly OrderedExcalidrawElement[];
  appState: Partial<AppState>;
  files: BinaryFiles;
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

async function migrateLegacyNodes(nodes: LegacyNode[]): Promise<ExcalidrawInitialDataState> {
  const { convertToExcalidrawElements } = await import("@excalidraw/excalidraw");
  const skeletons = nodes.map((n) => {
    if (n.type === "text") {
      return {
        type: "text" as const,
        x: n.x,
        y: n.y,
        text: n.text ?? "Text",
        width: Math.max(n.w, 80),
        height: Math.max(n.h, 24),
      };
    }
    return {
      type: "rectangle" as const,
      x: n.x,
      y: n.y,
      width: Math.max(n.w, 40),
      height: Math.max(n.h, 40),
    };
  });
  return {
    elements: convertToExcalidrawElements(skeletons, { regenerateIds: true }),
  };
}

/** Parse persisted JSON into Excalidraw initial state (handles legacy WebGPU saves). */
export async function hydrateCanvasSave(raw: string): Promise<ExcalidrawInitialDataState | null> {
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object") return null;
    const data = parsed as Record<string, unknown>;

    if (data.version === 2 && Array.isArray(data.elements)) {
      return {
        elements: data.elements as OrderedExcalidrawElement[],
        appState: (data.appState as Partial<AppState>) ?? {},
        files: (data.files as BinaryFiles) ?? {},
      };
    }

    if (Array.isArray(data.elements)) {
      return {
        elements: data.elements as OrderedExcalidrawElement[],
        appState: (data.appState as Partial<AppState>) ?? {},
        files: (data.files as BinaryFiles) ?? {},
      };
    }

    if (Array.isArray(data.nodes)) {
      return migrateLegacyNodes(data.nodes as LegacyNode[]);
    }
  } catch {
    /* corrupt save */
  }
  return null;
}

/** Strip volatile appState before persisting. */
export function serializeCanvasSave(
  elements: readonly OrderedExcalidrawElement[],
  appState: AppState,
  files: BinaryFiles,
): string {
  const payload: CanvasSavePayload = {
    version: 2,
    elements,
    appState: {
      scrollX: appState.scrollX,
      scrollY: appState.scrollY,
      zoom: appState.zoom,
      theme: appState.theme,
    },
    files,
  };
  return JSON.stringify(payload);
}
