import type { PointerEvent as RPointerEvent } from "react";
import { cn } from "@/ui";
import type { Node, Scene, View } from "./types";

type Props = {
  scene: Scene;
  view: View;
  selection: string | null;
  onSelect: (id: string | null) => void;
  onChangeNode: (id: string, patch: Partial<Node>) => void;
  onDragStart?: (id: string, e: React.PointerEvent) => void;
};

/** DOM layer for text, images, and website embeds — transforms with pan/zoom. */
export function DomNodeLayer({ scene, view, selection, onSelect, onChangeNode, onDragStart }: Props) {
  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden">
      {scene.nodes.map((n) => {
        if (n.type !== "text" && n.type !== "image" && n.type !== "embed") return null;
        const left = n.x * view.zoom + view.panX;
        const top = n.y * view.zoom + view.panY;
        const width = n.w * view.zoom;
        const height = n.h * view.zoom;
        const selected = selection === n.id;
        const rgba = `rgba(${Math.round(n.fill[0] * 255)}, ${Math.round(n.fill[1] * 255)}, ${Math.round(n.fill[2] * 255)}, ${n.fill[3]})`;

        return (
          <div
            key={n.id}
            className={cn(
              "pointer-events-auto absolute box-border",
              selected && "ring-2 ring-violet-400/80 ring-offset-0",
            )}
            style={{ left, top, width, height }}
            onPointerDown={(e) => {
              e.stopPropagation();
              onSelect(n.id);
              onDragStart?.(n.id, e);
            }}
          >
            {n.type === "text" && (
              <div
                contentEditable
                suppressContentEditableWarning
                className="h-full w-full overflow-hidden outline-none"
                style={{
                  color: rgba,
                  fontSize: Math.max(10, (n.fontSize ?? 24) * view.zoom),
                  fontWeight: n.fontWeight ?? 600,
                  lineHeight: 1.25,
                  fontFamily: "Inter, system-ui, sans-serif",
                }}
                onBlur={(e) => onChangeNode(n.id, { text: e.currentTarget.textContent ?? "" })}
              >
                {n.text ?? "Text"}
              </div>
            )}
            {n.type === "image" && n.url && (
              <img
                src={n.url}
                alt=""
                draggable={false}
                className="h-full w-full rounded-sm object-cover"
              />
            )}
            {n.type === "embed" && n.html && (
              <iframe
                title={n.label ?? "Website preview"}
                sandbox="allow-same-origin"
                srcDoc={n.html}
                className="h-full w-full rounded-md border border-black/10 bg-white"
              />
            )}
          </div>
        );
      })}
    </div>
  );
}
