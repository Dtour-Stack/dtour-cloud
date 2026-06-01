import type { Node } from "./types";
import { ELLIPSE_FILL, FRAME_FILL, RECT_FILL, TEXT_FILL } from "./types";

type RunChat = (args: {
  token: string;
  model: string;
  messages: { role: string; content: string }[];
  refId: string;
}) => Promise<{ text: string }>;

const GRAPHIC_SYSTEM = `You are a Canva-style layout designer for Detour Studio. Output ONLY raw JSON (no markdown):
{"nodes":[...]}

Each node:
{"type":"frame"|"rect"|"ellipse"|"text","x":number,"y":number,"w":number,"h":number,"fill":"#RRGGBB","text?":"...","fontSize?":number,"label?":"..."}

Rules:
- Prefer one top-level "frame" artboard (e.g. 1080×1080 or 1920×1080) with children visually inside it.
- Use rects/ellipses for cards, buttons, badges; text for headlines and labels.
- Detour palette: dark text #141414, white frames #FAFAFA, accent violet #A855F7, blue #3B82F6.
- Coordinates in px relative to canvas origin. Keep 4–14 nodes. No image or embed types.`;

const WEBSITE_SYSTEM = `You are a web UI designer. Output ONLY raw JSON (no markdown):
{"html":"<style>...</style><div>...</div>","w":390,"h":844}

Rules:
- Self-contained HTML+CSS+lightweight vanilla JS snippet for an iframe srcdoc.
- No external URLs, imports, network calls, storage, cookies, or remote fonts.
- Scripts are only for local UI behavior: tabs, toggles, filters, menus, and fake preview state.
- Mobile-first unless the prompt says desktop. w/h = artboard size in px.
- Modern Detour aesthetic: near-black text, white cards, violet accent, Inter-like system font.
- Keep HTML under 12kb.`;

function extractJsonObject(raw: string): unknown {
  const t = raw.trim().replace(/^```(?:json)?/i, "").replace(/```$/i, "").trim();
  const start = t.indexOf("{");
  const end = t.lastIndexOf("}");
  if (start === -1 || end === -1) throw new Error("No JSON object in the response.");
  return JSON.parse(t.slice(start, end + 1));
}

function hexToFill(hex: string): Node["fill"] {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return RECT_FILL;
  const int = parseInt(m[1], 16);
  return [((int >> 16) & 255) / 255, ((int >> 8) & 255) / 255, (int & 255) / 255, 1];
}

function defaultFill(type: Node["type"]): Node["fill"] {
  if (type === "frame") return FRAME_FILL;
  if (type === "ellipse") return ELLIPSE_FILL;
  if (type === "text") return TEXT_FILL;
  return RECT_FILL;
}

export function parseGraphicNodes(raw: unknown, idFn: () => string): Node[] {
  const obj = raw as { nodes?: unknown };
  const list = Array.isArray(obj.nodes) ? obj.nodes : [];
  const out: Node[] = [];
  for (const item of list) {
    if (!item || typeof item !== "object") continue;
    const n = item as Record<string, unknown>;
    const type = n.type;
    if (type !== "frame" && type !== "rect" && type !== "ellipse" && type !== "text") continue;
    const w = Math.max(8, Number(n.w) || 120);
    const h = Math.max(8, Number(n.h) || 80);
    const fill =
      typeof n.fill === "string" ? hexToFill(n.fill) : defaultFill(type as Node["type"]);
    out.push({
      id: idFn(),
      type: type as Node["type"],
      x: Number(n.x) || 0,
      y: Number(n.y) || 0,
      w,
      h,
      fill,
      ...(typeof n.text === "string" ? { text: n.text } : {}),
      ...(typeof n.fontSize === "number" ? { fontSize: n.fontSize } : type === "text" ? { fontSize: 28 } : {}),
      ...(typeof n.label === "string" ? { label: n.label } : {}),
    });
  }
  if (out.length === 0) throw new Error("The model returned no valid layout nodes.");
  return out;
}

export async function generateGraphicLayout(
  runChat: RunChat,
  token: string,
  prompt: string,
  refId: string,
): Promise<Node[]> {
  const { text } = await runChat({
    token,
    model: "anthropic/claude-sonnet-4.5",
    refId,
    messages: [
      { role: "system", content: GRAPHIC_SYSTEM },
      { role: "user", content: prompt },
    ],
  });
  return parseGraphicNodes(extractJsonObject(text), () =>
    typeof crypto !== "undefined" && crypto.randomUUID
      ? crypto.randomUUID()
      : `n${Date.now()}${Math.floor(Math.random() * 1e6)}`,
  );
}

export async function generateWebsiteEmbed(
  runChat: RunChat,
  token: string,
  prompt: string,
  refId: string,
): Promise<{ html: string; w: number; h: number }> {
  const { text } = await runChat({
    token,
    model: "anthropic/claude-sonnet-4.5",
    refId,
    messages: [
      { role: "system", content: WEBSITE_SYSTEM },
      { role: "user", content: prompt },
    ],
  });
  const obj = extractJsonObject(text) as { html?: string; w?: number; h?: number };
  if (typeof obj.html !== "string" || !obj.html.trim()) throw new Error("No HTML in the response.");
  return {
    html: obj.html,
    w: Math.max(200, Math.min(1920, Number(obj.w) || 390)),
    h: Math.max(200, Math.min(2400, Number(obj.h) || 844)),
  };
}
