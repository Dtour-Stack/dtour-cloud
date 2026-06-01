import { useAction, useMutation, useQuery } from "convex/react";
import { anyApi } from "convex/server";
import {
  lazy,
  Suspense,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import "@excalidraw/excalidraw/index.css";
import "./excalidrawSketch.css";
import type {
  AppState,
  BinaryFiles,
  ExcalidrawImperativeAPI,
  ExcalidrawInitialDataState,
  OrderedExcalidrawElement,
} from "@excalidraw/excalidraw/types";
import { GalleryPicker } from "@/dashboard/gallery/GalleryPicker";
import {
  DTOUR_TEST_SESSION_TOKEN,
  readDtourPlaywrightUser,
} from "@/lib/playwright-dtour-auth";
import { getDtourSessionToken } from "@/lib/session";
import { cn, Icon } from "@/ui";
import { DESIGN_SURFACE } from "../designProject";
import { DesignProjectControls } from "../DesignProjectControls";
import { useDesignProject } from "../DesignProjectContext";
import { GuidedTour, SKETCH_TOUR } from "../GuidedTour";
import { generateCanvasElements } from "./canvasAiGenerate";
import { insertImageFromUrl } from "./canvasImageInsert";
import {
  clearPendingImageUrls,
  hydrateCanvasSave,
  readPendingImageUrls,
  serializeCanvasSave,
} from "./canvasStorage";

const Excalidraw = lazy(() =>
  import("@excalidraw/excalidraw").then((mod) => ({ default: mod.Excalidraw })),
);

const AUTO_SAVE_MS = 2500;

export function ExcalidrawDesignCanvas() {
  const isTestAuth = readDtourPlaywrightUser() !== null;
  const token = isTestAuth ? DTOUR_TEST_SESSION_TOKEN : getDtourSessionToken();
  const { project } = useDesignProject();
  const saved = useQuery(
    anyApi.design.getDoc,
    token && !isTestAuth ? { token, kind: DESIGN_SURFACE.sketch, project } : "skip",
  ) as { data: string; updatedAt: number } | null | undefined;
  const saveDoc = useMutation(anyApi.design.saveDoc);
  const saveProjectAs = useMutation(anyApi.design.saveProjectAs);
  const runChat = useAction(anyApi.inference.runChat);

  const apiRef = useRef<ExcalidrawImperativeAPI | null>(null);
  const hydrated = useRef(false);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingHandled = useRef(false);

  function handlePendingImages(api: ExcalidrawImperativeAPI) {
    if (pendingHandled.current) return;
    const urls = readPendingImageUrls();
    if (urls.length === 0) return;
    pendingHandled.current = true;
    void (async () => {
      for (let i = 0; i < urls.length; i++) {
        try {
          await insertImageFromUrl(api, urls[i]!, i);
        } catch {
          continue;
        }
      }
      clearPendingImageUrls();
    })();
  }

  const [initialData, setInitialData] = useState<ExcalidrawInitialDataState | null | undefined>(
    undefined,
  );
  const [ready, setReady] = useState(false);
  const [saveState, setSaveState] = useState<"idle" | "saving" | "saved">("idle");
  const [showGallery, setShowGallery] = useState(false);
  const [aiOpen, setAiOpen] = useState(false);
  const [aiPrompt, setAiPrompt] = useState("");
  const [aiBusy, setAiBusy] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);
  const [insertError, setInsertError] = useState<string | null>(null);

  useEffect(() => {
    hydrated.current = isTestAuth;
    pendingHandled.current = false;
    setInitialData(isTestAuth ? null : undefined);
    setReady(isTestAuth);
    setSaveState("idle");
  }, [project, isTestAuth]);

  useEffect(() => {
    if (isTestAuth) return;
    if (saved === undefined || hydrated.current) return;
    hydrated.current = true;
    void (async () => {
      if (saved?.data) {
        setInitialData(await hydrateCanvasSave(saved.data));
      } else {
        setInitialData(null);
      }
      setReady(true);
    })();
  }, [saved, project, isTestAuth]);

  const persist = useCallback(
    async (
      elements: readonly OrderedExcalidrawElement[],
      appState: AppState,
      files: BinaryFiles,
      manual = false,
    ) => {
      if (!token) return;
      if (isTestAuth) {
        setSaveState("saved");
        if (manual) {
          window.setTimeout(() => setSaveState("idle"), 1800);
        }
        return;
      }
      setSaveState("saving");
      try {
        await saveDoc({
          token,
          kind: DESIGN_SURFACE.sketch,
          project,
          data: serializeCanvasSave(elements, appState, files),
        });
        setSaveState("saved");
        if (manual) {
          window.setTimeout(() => setSaveState("idle"), 1800);
        }
      } catch {
        setSaveState("idle");
      }
    },
    [saveDoc, token, project, isTestAuth],
  );

  const scheduleSave = useCallback(
    (elements: readonly OrderedExcalidrawElement[], appState: AppState, files: BinaryFiles) => {
      if (saveTimer.current) clearTimeout(saveTimer.current);
      saveTimer.current = setTimeout(() => {
        void persist(elements, appState, files);
      }, AUTO_SAVE_MS);
    },
    [persist],
  );

  const onChange = useCallback(
    (elements: readonly OrderedExcalidrawElement[], appState: AppState, files: BinaryFiles) => {
      if (!hydrated.current) return;
      scheduleSave(elements, appState, files);
    },
    [scheduleSave],
  );

  async function saveNow() {
    const api = apiRef.current;
    if (!api || !token) return;
    await persist(api.getSceneElements(), api.getAppState(), api.getFiles(), true);
  }

  async function insertUrl(url: string, index = 0) {
    const api = apiRef.current;
    if (!api) return;
    setInsertError(null);
    try {
      await insertImageFromUrl(api, url, index);
    } catch (e) {
      setInsertError(e instanceof Error ? e.message : "Could not insert image");
    }
  }

  async function generateAi() {
    if (!token || !aiPrompt.trim() || aiBusy) return;
    const api = apiRef.current;
    if (!api) return;
    setAiBusy(true);
    setAiError(null);
    try {
      const refId = `canvas-ai-${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
      const newElements = await generateCanvasElements(runChat, token, aiPrompt.trim(), refId);
      const existing = api.getSceneElements();
      api.updateScene({ elements: [...existing, ...newElements] });
      api.scrollToContent(undefined, { fitToContent: true });
      setAiPrompt("");
    } catch (e) {
      setAiError(e instanceof Error ? e.message : "Generation failed");
    } finally {
      setAiBusy(false);
    }
  }

  if (!token) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-white/50">
        Sign in to use the design canvas.
      </div>
    );
  }

  if (!ready) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-white/50">
        Loading canvas…
      </div>
    );
  }

  const excalidrawInitial =
    initialData === undefined
      ? undefined
      : {
          ...(initialData ?? {}),
          appState: {
            ...(initialData?.appState ?? {}),
            showWelcomeScreen: false,
          },
        };

  return (
    <div className="flex h-full min-h-0 w-full flex-col overflow-hidden bg-[#0a0a0a]">
      <div
        data-tour="sketch-toolbar"
        className="z-20 flex min-h-14 shrink-0 flex-wrap items-center gap-2 border-b border-white/10 bg-[#0d0d0d]/95 px-3 py-2 backdrop-blur-xl lg:flex-nowrap"
      >
        <DesignProjectControls
          saveState={saveState}
          onSave={() => void saveNow()}
          onSaveAs={async (newName) => {
            const api = apiRef.current;
            if (!api || !token || isTestAuth) return;
            await saveProjectAs({
              token,
              kind: DESIGN_SURFACE.sketch,
              fromProject: project,
              toName: newName,
              data: serializeCanvasSave(api.getSceneElements(), api.getAppState(), api.getFiles()),
            });
          }}
        />
        <div className="hidden h-6 w-px bg-white/10 sm:block" />
        <div className="ml-auto flex min-w-0 flex-wrap items-center gap-1">
          <GuidedTour id="sketch" heading="Sketch" steps={SKETCH_TOUR} />
          <button
            type="button"
            onClick={() => setShowGallery(true)}
            className="flex h-8 items-center gap-1.5 rounded-lg px-2.5 text-[12px] text-white/65 transition hover:bg-white/10 hover:text-white"
          >
            <Icon.Image size={14} /> Assets
          </button>
          <button
            type="button"
            onClick={() => setAiOpen((v) => !v)}
            className={cn(
              "flex h-8 items-center gap-1.5 rounded-lg px-2.5 text-[12px] transition",
              aiOpen ? "bg-white text-black" : "text-white/65 hover:bg-white/10 hover:text-white",
            )}
          >
            <Icon.Wand size={14} /> AI diagram
          </button>
        </div>
      </div>

      <div className="relative flex min-h-0 min-w-0 flex-1">
        <div className="excalidraw-sketch-host relative min-h-0 min-w-0 flex-1">
          <Suspense
            fallback={
              <div className="flex h-full items-center justify-center text-sm text-white/50">
                Loading Excalidraw…
              </div>
            }
          >
            <div className="h-full w-full">
              <Excalidraw
                theme="dark"
                aiEnabled={false}
                initialData={excalidrawInitial}
                excalidrawAPI={(api) => {
                  apiRef.current = api;
                  api.updateScene({
                    appState: { showWelcomeScreen: false },
                  });
                  handlePendingImages(api);
                }}
                onChange={onChange}
                UIOptions={{
                  canvasActions: {
                    loadScene: false,
                    saveToActiveFile: false,
                    export: false,
                  },
                }}
              />
            </div>
          </Suspense>

          {insertError && (
            <div className="pointer-events-none absolute bottom-3 left-1/2 z-20 max-w-md -translate-x-1/2 rounded-xl border border-red-400/30 bg-red-950/90 px-4 py-2 text-[12px] text-red-200 shadow-lg">
              {insertError}
            </div>
          )}
        </div>

        {aiOpen && (
          <aside className="flex w-80 shrink-0 flex-col border-l border-white/10 bg-[#0d0d0d]/95 p-4 backdrop-blur-xl">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-medium text-white">AI diagram</h2>
              <button
                type="button"
                onClick={() => setAiOpen(false)}
                className="text-white/40 transition hover:text-white/80"
              >
                ✕
              </button>
            </div>
            <p className="mt-1 text-[12px] leading-relaxed text-white/45">
              Describe a diagram or layout. Detour Cloud inference adds shapes and labels to your
              canvas.
            </p>
            <textarea
              value={aiPrompt}
              onChange={(e) => setAiPrompt(e.target.value)}
              rows={6}
              placeholder="e.g. A 3-box flow: user → API → database with arrows"
              className="mt-4 w-full resize-none rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2.5 text-[13px] text-white placeholder:text-white/30 focus:border-violet-400/50 focus:outline-none"
            />
            {aiError && (
              <p className="mt-2 text-[12px] text-red-400/90">{aiError}</p>
            )}
            <button
              type="button"
              onClick={() => void generateAi()}
              disabled={aiBusy || !aiPrompt.trim()}
              className="mt-3 flex w-full items-center justify-center gap-2 rounded-full bg-white py-2 text-[13px] font-medium text-black transition hover:shadow-lg hover:shadow-white/10 disabled:opacity-50"
            >
              <Icon.Wand size={14} />
              {aiBusy ? "Generating…" : "Generate on canvas"}
            </button>
          </aside>
        )}
      </div>

      {showGallery && token && (
        <GalleryPicker
          token={token}
          onClose={() => setShowGallery(false)}
          onPick={(url) => {
            setShowGallery(false);
            void insertUrl(url);
          }}
        />
      )}
    </div>
  );
}
