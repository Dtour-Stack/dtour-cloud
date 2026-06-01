import { type CSSProperties, useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { Button, cn, Icon } from "@/ui";

/** `anchor` matches a `[data-tour="<anchor>"]` element to spotlight for the
 *  step; without it the step renders as a centered card. */
export type TourStep = { title: string; body: string; anchor?: string };

const CARD_W = 360;
const SPOT_PAD = 10;

export function GuidedTour({
  id,
  heading,
  steps,
  label = "Guide",
}: {
  id: string;
  heading: string;
  steps: TourStep[];
  label?: string;
}) {
  const [open, setOpen] = useState(false);
  const [i, setI] = useState(0);
  const [rect, setRect] = useState<DOMRect | null>(null);

  const step = steps[i];
  const anchor = step?.anchor;

  // Track the spotlighted element's box for the current step (and on resize/scroll).
  useEffect(() => {
    if (!open || !anchor) {
      setRect(null);
      return;
    }
    const measure = () => {
      const el = document.querySelector(`[data-tour="${anchor}"]`);
      setRect(el ? el.getBoundingClientRect() : null);
    };
    measure();
    window.addEventListener("resize", measure);
    window.addEventListener("scroll", measure, true);
    return () => {
      window.removeEventListener("resize", measure);
      window.removeEventListener("scroll", measure, true);
    };
  }, [open, anchor]);

  function dismiss() {
    setOpen(false);
    setI(0);
    setRect(null);
  }

  const last = i === steps.length - 1;

  // Card + spotlight geometry when anchored.
  let cardStyle: CSSProperties | null = null;
  let spotStyle: CSSProperties | null = null;
  if (rect) {
    const placeBelow = rect.bottom + 260 < window.innerHeight;
    const top = placeBelow ? rect.bottom + 14 : Math.max(14, rect.top - 274);
    const left = Math.max(14, Math.min(rect.left + rect.width / 2 - CARD_W / 2, window.innerWidth - CARD_W - 14));
    cardStyle = { position: "fixed", top, left, width: CARD_W };
    spotStyle = {
      position: "fixed",
      left: rect.left - SPOT_PAD,
      top: rect.top - SPOT_PAD,
      width: rect.width + SPOT_PAD * 2,
      height: rect.height + SPOT_PAD * 2,
      borderRadius: 16,
      boxShadow: "0 0 0 9999px rgba(0,0,0,0.62)",
    };
  }

  const card = step && (
    <>
      <div className="flex items-center gap-2 text-xs uppercase tracking-widest text-violet-300/80">
        <Icon.Sparkles size={14} /> {heading}
      </div>
      <h3 className="mt-3 text-lg font-medium text-white">{step.title}</h3>
      <p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed text-white/65">{step.body}</p>

      <div className="mt-5 flex items-center gap-1.5" aria-hidden>
        {steps.map((_, n) => (
          <span
            key={n}
            className={cn(
              "h-1.5 rounded-full transition-all",
              n === i ? "w-5 bg-violet-400" : "w-1.5 bg-white/20",
            )}
          />
        ))}
      </div>

      <div className="mt-6 flex items-center justify-between gap-3">
        <button
          type="button"
          onClick={dismiss}
          className="text-xs text-white/40 transition hover:text-white/70"
        >
          Close
        </button>
        <div className="flex items-center gap-2">
          {i > 0 && (
            <Button size="sm" variant="ghost" onClick={() => setI(i - 1)}>
              <Icon.ArrowLeft size={14} /> Back
            </Button>
          )}
          <Button size="sm" onClick={() => (last ? dismiss() : setI(i + 1))}>
            {last ? "Done" : "Next"}
          </Button>
        </div>
      </div>
    </>
  );

  return (
    <>
      <button
        type="button"
        aria-label={label}
        onClick={() => {
          setI(0);
          setOpen(true);
        }}
        className="flex h-8 items-center gap-1.5 rounded-lg px-2.5 text-[12px] text-white/65 transition hover:bg-white/10 hover:text-white"
      >
        <Icon.BookOpen size={14} />
        <span className="hidden sm:inline">{label}</span>
      </button>

      {/* Portalled to <body>: the toolbar's backdrop-filter would otherwise make
          it the containing block for position:fixed, trapping the overlay. */}
      {open &&
        step &&
        createPortal(
          rect && cardStyle && spotStyle ? (
            // anchored: spotlight the element, park the card beside it
            <div className="fixed inset-0 z-[60]">
              <div
                className="pointer-events-none rounded-2xl ring-2 ring-violet-400/80 transition-all duration-200"
                style={spotStyle}
              />
              <div
                className="rounded-2xl border border-white/10 bg-[#0d0d12] p-5 shadow-2xl transition-all duration-200"
                style={cardStyle}
              >
                {card}
              </div>
            </div>
          ) : (
            // unanchored: centered card
            <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm">
              <div className="w-full max-w-md rounded-2xl border border-white/10 bg-[#0d0d12] p-6 shadow-2xl">
                {card}
              </div>
            </div>
          ),
          document.body,
        )}
    </>
  );
}

export const WORKFLOW_TOUR: TourStep[] = [
  {
    title: "Build workflows visually",
    body: "This is the node canvas. Drop nodes from the palette, wire them together, and Run — for image/video/audio generation and for composing elizaOS agents.",
  },
  {
    title: "1 · Add nodes",
    body: "Use “Add node” to drop nodes: Input, Generate, Tools, Refine/Output, and the elizaOS Agent pieces — Character, Plugin, Provider, Action, Evaluator.",
    anchor: "add-node",
  },
  {
    title: "2 · Connect them",
    body: "Drag from an output port (right edge of a node) to an input port (left edge of another). Port colors are data types — matching colors connect; “any” accepts anything.",
  },
  {
    title: "3 · Edit in the inspector",
    body: "Click any node to open its inspector on the right — every editable field lives there, plus an agent’s inner flow (its wired plugins, providers and actions).",
  },
  {
    title: "✨ Generate from a prompt",
    body: "Short on time? Describe what you want and Generate designs the whole node graph for you. (Agents can be generated from a prompt too, over on the Agents page.)",
    anchor: "generate",
  },
  {
    title: "Run & save",
    body: "Hit Run to execute — node status updates live. Save the graph to keep working, or save it as a reusable template. Re-open this guide anytime from the “Guide” button.",
    anchor: "run",
  },
];

export const SKETCH_TOUR: TourStep[] = [
  {
    title: "Sketch",
    body: "Excalidraw whiteboard for diagrams and flows. Detour adds gallery inserts, AI-generated shapes, and auto-save — without replacing Excalidraw's drawing tools.",
  },
  {
    title: "Detour toolbar",
    body: "Assets drops images onto the board. AI adds labeled shapes from a prompt. Save persists to your account. Excalidraw's drawing tools stay in the canvas below this rail.",
    anchor: "sketch-toolbar",
  },
];

export const CANVAS_TOUR: TourStep[] = [
  {
    title: "Design Studio",
    body: "A focused canvas for artboards, shapes, text, images, AI graphics, and artifact embeds. WebGPU accelerates shape rendering when your browser supports it.",
  },
  {
    title: "1 · Layout tools",
    body: "Add artboards (presets in the toolbar), rectangles, ellipses, and text. Drag to move, scroll to zoom, drag empty space to pan. Auto-save runs every few seconds.",
    anchor: "canvas-toolbar",
  },
  {
    title: "2 · AI & assets",
    body: "Open AI to generate graphic layouts, images, or artifact previews. Assets and workflow outputs land on the canvas too. Excalidraw diagrams live under Sketch in the sidebar.",
    anchor: "canvas-toolbar",
  },
];
