import type { ExcalidrawElementSkeleton } from "@excalidraw/excalidraw/data/transform";
import type { OrderedExcalidrawElement } from "@excalidraw/excalidraw/element/types";

type RunChat = (args: {
  token: string;
  model: string;
  messages: { role: string; content: string }[];
  refId: string;
}) => Promise<{ text: string }>;

const SYSTEM = `You are a diagram designer for Excalidraw. Given a user goal, output ONLY a raw JSON array of element skeletons (no prose, no markdown fences).

Allowed types: rectangle, ellipse, diamond, text, arrow, line, frame.
Do NOT use type "image" (no fileId available).

Example:
[
  {"type":"rectangle","x":80,"y":80,"width":240,"height":140,"label":{"text":"API"}},
  {"type":"text","x":100,"y":120,"text":"Request flow"},
  {"type":"arrow","x":320,"y":150,"width":120,"height":0}
]

Rules:
- Spread elements across the canvas (x/y between 40 and 900).
- Use labels on shapes when helpful.
- Keep it minimal but readable — 3–12 elements typical.
- Arrows connect concepts; rectangles/ellipses are boxes.`;

function extractJsonArray(raw: string): unknown {
  const t = raw.trim().replace(/^```(?:json)?/i, "").replace(/```$/i, "").trim();
  const start = t.indexOf("[");
  const end = t.lastIndexOf("]");
  if (start === -1 || end === -1) throw new Error("No JSON array in the response.");
  return JSON.parse(t.slice(start, end + 1));
}

function normalizeSkeletons(raw: unknown): ExcalidrawElementSkeleton[] {
  if (!Array.isArray(raw)) throw new Error("Expected a JSON array of elements.");
  const allowed = new Set(["rectangle", "ellipse", "diamond", "text", "arrow", "line", "frame"]);
  const out: ExcalidrawElementSkeleton[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const type = (item as { type?: string }).type;
    if (!type || !allowed.has(type)) continue;
    out.push(item as ExcalidrawElementSkeleton);
  }
  if (out.length === 0) throw new Error("The model returned no valid elements.");
  return out;
}

export async function generateCanvasElements(
  runChat: RunChat,
  token: string,
  prompt: string,
  refId: string,
): Promise<readonly OrderedExcalidrawElement[]> {
  const { text } = await runChat({
    token,
    model: "anthropic/claude-sonnet-4.5",
    refId,
    messages: [
      { role: "system", content: SYSTEM },
      { role: "user", content: prompt },
    ],
  });
  const skeletons = normalizeSkeletons(extractJsonArray(text));
  const { convertToExcalidrawElements } = await import("@excalidraw/excalidraw");
  return convertToExcalidrawElements(skeletons, { regenerateIds: true });
}
