/** Design surface kinds persisted in Convex `designDocs`. */
export const DESIGN_SURFACE = {
  studio: "studio",
  sketch: "sketch",
  workflow: "workflow",
} as const;

export type DesignSurfaceKind = (typeof DESIGN_SURFACE)[keyof typeof DESIGN_SURFACE];

export const DEFAULT_PROJECT_NAME = "Untitled";

export function projectFromSearchParam(raw: string | null): string {
  const trimmed = raw?.trim();
  return trimmed && trimmed.length > 0 ? trimmed.slice(0, 80) : DEFAULT_PROJECT_NAME;
}

export function designPath(
  section: "canvas" | "sketch" | "workflows",
  project: string,
): string {
  const q = new URLSearchParams({ project });
  return `/design/${section}?${q}`;
}
