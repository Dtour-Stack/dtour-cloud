import { useEffect, useState } from "react";
import { Button, cn, Icon } from "@/ui";

export type TourStep = { title: string; body: string };

/**
 * Reusable first-visit walkthrough for the builder surfaces. Auto-opens once per
 * `id` (persisted in localStorage), re-openable anytime via the inline "Guide"
 * button, and opt-out-able via "Skip · don't show again". Self-contained: drop
 * `<GuidedTour id=… heading=… steps={…} />` into a toolbar.
 */
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
  const KEY = `dtour-tour-${id}`;
  const [open, setOpen] = useState(false);
  const [i, setI] = useState(0);

  useEffect(() => {
    try {
      if (!localStorage.getItem(KEY)) setOpen(true);
    } catch {
      /* localStorage unavailable → just don't auto-open */
    }
  }, [KEY]);

  function dismiss(remember: boolean) {
    if (remember) {
      try {
        localStorage.setItem(KEY, "1");
      } catch {
        /* ignore */
      }
    }
    setOpen(false);
    setI(0);
  }

  const step = steps[i];
  const last = i === steps.length - 1;

  return (
    <>
      <button
        type="button"
        onClick={() => {
          setI(0);
          setOpen(true);
        }}
        className="flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[12px] text-white/75 transition hover:bg-white/10 hover:text-white"
      >
        <Icon.BookOpen size={14} /> {label}
      </button>

      {open && step && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-2xl border border-white/10 bg-[#0d0d12] p-6 shadow-2xl">
            <div className="flex items-center gap-2 text-xs uppercase tracking-widest text-violet-300/80">
              <Icon.Sparkles size={14} /> {heading}
            </div>
            <h3 className="mt-3 text-lg font-medium text-white">{step.title}</h3>
            <p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed text-white/65">
              {step.body}
            </p>

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
                onClick={() => dismiss(true)}
                className="text-xs text-white/40 transition hover:text-white/70"
              >
                Skip · don't show again
              </button>
              <div className="flex items-center gap-2">
                {i > 0 && (
                  <Button size="sm" variant="ghost" onClick={() => setI(i - 1)}>
                    <Icon.ArrowLeft size={14} /> Back
                  </Button>
                )}
                <Button size="sm" onClick={() => (last ? dismiss(true) : setI(i + 1))}>
                  {last ? "Done" : "Next"}
                </Button>
              </div>
            </div>
          </div>
        </div>
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
    body: "Use “Add node” (top-left) to drop nodes: Input, Generate, Tools, Refine/Output, and the elizaOS Agent pieces — Character, Plugin, Provider, Action, Evaluator.",
  },
  {
    title: "2 · Connect them",
    body: "Drag from an output port (right edge of a node) to an input port (left edge of another). Port colors are data types — matching colors connect; “any” accepts anything.",
  },
  {
    title: "3 · Link several at once",
    body: "Some connectors fan in: drag multiple Plugin nodes into a Character’s “plugins” port to compose one agent from many plugins. The Output node can collect several results the same way.",
  },
  {
    title: "4 · Run & save",
    body: "Hit Run to execute — node status updates live. Save the graph to keep working, or save it as a reusable template. Re-open this guide anytime from the “Guide” button.",
  },
];

export const CANVAS_TOUR: TourStep[] = [
  {
    title: "The design canvas",
    body: "A GPU-accelerated canvas for composing visuals — frames, shapes, text, and generated images — alongside your workflows.",
  },
  {
    title: "1 · Add & arrange",
    body: "Use the toolbar to add frames, shapes, and text. Drag to move, use the handles to resize. Your scene auto-saves.",
  },
  {
    title: "2 · Bring in generations",
    body: "Send outputs from the Workflows builder onto the canvas to lay them out, annotate, and export. Re-open this guide anytime from the “Guide” button.",
  },
];
