import { Timeline } from "convex-timeline";
import { components } from "./_generated/api";

/** Undo/redo for Design Studio docs (`design:${owner}:${kind}` scopes). */
export const designTimeline = new Timeline(components.timeline, {
  maxNodesPerScope: { "design:": 120 },
});

export function designScope(owner: string, kind: string): string {
  return `design:${owner}:${kind}`;
}
