import { useAction, useMutation, useQuery } from "convex/react";
import { anyApi } from "convex/server";
import {
  type PointerEvent as RPointerEvent,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import { getDtourSessionToken } from "@/lib/session";
import { cn, Icon } from "@/ui";
import { GuidedTour, WORKFLOW_TOUR } from "../GuidedTour";
import { generateWorkflowGraph } from "./aiGenerate";
import { NodeInspector } from "./NodeInspector";
import { defaultValues, getDef, NODE_DEFS, PORT_COLOR } from "./registry";
import { type Graph, TEMPLATES } from "./templates";
import type { Edge, NodeDef, NodeInstance, PortType, Viewport } from "./types";

const NODE_W = 208;
const HEADER_H = 38;
const PORT_ROW_H = 26;
const DOT = 12;
const HIT = 20; // graph-units radius for drop hit-test

const STATUS_COLOR: Record<string, string> = {
  idle: "rgba(255,255,255,0.25)",
  running: "#FDE68A",
  done: "#6EE7B7",
  error: "#F87171",
};

type Sel = { kind: "node" | "edge"; id: string } | null;
type Pending = { node: string; port: string; type: PortType; cx: number; cy: number } | null;
type Gesture =
  | { kind: "pan"; sx: number; sy: number; panX: number; panY: number }
  | { kind: "move"; id: string; gx: number; gy: number; ox: number; oy: number }
  | { kind: "connect" };

function portRowY(index: number) {
  return HEADER_H + index * PORT_ROW_H + PORT_ROW_H / 2;
}

export function WorkflowEditor() {
  const ref = useRef<HTMLDivElement>(null);
  const gestureRef = useRef<Gesture | null>(null);

  const [nodes, setNodes] = useState<NodeInstance[]>([]);
  const [edges, setEdges] = useState<Edge[]>([]);
  const [vp, setVp] = useState<Viewport>({ panX: 80, panY: 80, scale: 1 });
  const [sel, setSel] = useState<Sel>(null);
  const [pending, setPending] = useState<Pending>(null);
  const [menu, setMenu] = useState<{ sx: number; sy: number; gx: number; gy: number } | null>(null);
  const [runId, setRunId] = useState<string | null>(null);

  const vpRef = useRef(vp);
  vpRef.current = vp;
  const ids = useRef({ n: 0, e: 0 });

  // ── persistence ──
  const token = getDtourSessionToken();
  const saved = useQuery(
    anyApi.design.getDoc,
    token ? { token, kind: "workflow" } : "skip",
  ) as { data: string; updatedAt: number } | null | undefined;
  const saveDoc = useMutation(anyApi.design.saveDoc);
  const hydrated = useRef(false);
  const [saveState, setSaveState] = useState<"idle" | "saving" | "saved">("idle");

  useEffect(() => {
    if (saved === undefined || hydrated.current) return;
    hydrated.current = true;
    if (saved?.data) {
      try {
        const g = JSON.parse(saved.data);
        if (Array.isArray(g.nodes)) setNodes(g.nodes);
        if (Array.isArray(g.edges)) setEdges(g.edges);
        if (g.vp) setVp(g.vp);
        if (g.counters) ids.current = g.counters;
        if (g.lastRunId) setRunId(g.lastRunId);
      } catch {
        /* ignore corrupt save */
      }
    }
  }, [saved]);

  async function save() {
    if (!token) return;
    setSaveState("saving");
    try {
      await saveDoc({
        token,
        kind: "workflow",
        data: JSON.stringify({ nodes, edges, vp, counters: ids.current, lastRunId: runId }),
      });
      setSaveState("saved");
      window.setTimeout(() => setSaveState("idle"), 1500);
    } catch {
      setSaveState("idle");
    }
  }

  function screenToGraph(clientX: number, clientY: number) {
    const r = ref.current!.getBoundingClientRect();
    const v = vpRef.current;
    return { x: (clientX - r.left - v.panX) / v.scale, y: (clientY - r.top - v.panY) / v.scale };
  }

  // Analytical port positions in graph coords.
  function inPos(n: NodeInstance, i: number) {
    return { x: n.x, y: n.y + portRowY(i) };
  }
  function outPos(n: NodeInstance, i: number) {
    return { x: n.x + NODE_W, y: n.y + portRowY(i) };
  }

  function addNode(
    type: string,
    gx: number,
    gy: number,
    values?: Record<string, string | number>,
  ) {
    const def = getDef(type);
    const id = `n_${ids.current.n++}`;
    setNodes((ns) => [
      ...ns,
      { id, type, x: gx, y: gy, values: { ...defaultValues(def), ...(values ?? {}) } },
    ]);
    setSel({ kind: "node", id });
    setMenu(null);
  }

  function removeNode(id: string) {
    setNodes((ns) => ns.filter((n) => n.id !== id));
    setEdges((es) => es.filter((e) => e.source.node !== id && e.target.node !== id));
  }

  // ── execution ──
  const runWorkflow = useAction(anyApi.workflow.runWorkflow);
  const [running, setRunning] = useState(false);
  const run = useQuery(
    anyApi.workflow.getRun,
    token && runId ? { token, runId } : "skip",
  ) as
    | { status: string; nodes: Record<string, { status: string; output?: string; error?: string }> }
    | null
    | undefined;
  const nodeStates = run?.nodes ?? {};

  async function runGraph() {
    if (!token || running || nodes.length === 0) return;
    setRunning(true);
    setRunId(null);
    try {
      const r = (await runWorkflow({ token, graph: JSON.stringify({ nodes, edges }) })) as {
        runId: string;
      };
      setRunId(r.runId);
    } finally {
      setRunning(false);
    }
  }

  // ── image assets (save outputs, re-drop as Image Input nodes) ──
  const saveAsset = useAction(anyApi.assets.saveAsset);
  const removeAsset = useMutation(anyApi.assets.removeAsset);
  const assets = useQuery(anyApi.assets.listAssets, token ? { token } : "skip") as
    | { id: string; name: string; url: string | null; createdAt: number }[]
    | undefined;
  const [showAssets, setShowAssets] = useState(false);
  const [savingUrl, setSavingUrl] = useState<string | null>(null);

  // ── run history ──
  const runs = useQuery(anyApi.workflow.listRuns, token ? { token } : "skip") as
    | { id: string; status: string; createdAt: number; thumb: string | null; counts: Record<string, number> }[]
    | undefined;
  const [showHistory, setShowHistory] = useState(false);

  // ── templates ──
  const userTemplates = useQuery(anyApi.templates.listTemplates, token ? { token } : "skip") as
    | { id: string; name: string; graph: string; createdAt: number }[]
    | undefined;
  const saveTemplate = useMutation(anyApi.templates.saveTemplate);
  const removeTemplate = useMutation(anyApi.templates.removeTemplate);
  const [showTemplates, setShowTemplates] = useState(false);
  const [tplName, setTplName] = useState("");

  function loadGraph(g: Graph) {
    setNodes(g.nodes);
    setEdges(g.edges);
    const maxN = Math.max(-1, ...g.nodes.map((n) => Number(/^n_(\d+)$/.exec(n.id)?.[1] ?? -1)));
    const maxE = Math.max(-1, ...g.edges.map((e) => Number(/^e_(\d+)$/.exec(e.id)?.[1] ?? -1)));
    ids.current = { n: maxN + 1, e: maxE + 1 };
    setSel(null);
    setRunId(null);
    setShowTemplates(false);
  }

  // ── AI generate (prompt → node graph, via metered inference) ──
  const runChat = useAction(anyApi.inference.runChat);
  const [showGen, setShowGen] = useState(false);
  const [genPrompt, setGenPrompt] = useState("");
  const [genBusy, setGenBusy] = useState(false);
  const [genError, setGenError] = useState<string | null>(null);

  async function generate() {
    if (!token || !genPrompt.trim() || genBusy) return;
    setGenBusy(true);
    setGenError(null);
    try {
      const refId = `gen-wf-${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
      const g = await generateWorkflowGraph(runChat, token, genPrompt.trim(), refId);
      loadGraph(g);
      setShowGen(false);
      setGenPrompt("");
    } catch (e) {
      setGenError(e instanceof Error ? e.message : "Generation failed");
    } finally {
      setGenBusy(false);
    }
  }

  async function saveAsTemplate() {
    if (!token || !tplName.trim() || nodes.length === 0) return;
    await saveTemplate({ token, name: tplName.trim(), graph: JSON.stringify({ nodes, edges }) });
    setTplName("");
  }

  async function saveOutput(url: string) {
    if (!token) return;
    setSavingUrl(url);
    try {
      await saveAsset({ token, url, name: "Workflow output" });
      setShowAssets(true);
    } finally {
      setSavingUrl(null);
    }
  }

  function addImageFromAsset(url: string) {
    const r = ref.current!.getBoundingClientRect();
    const p = screenToGraph(r.left + r.width / 2, r.top + r.height / 2);
    addNode("input.image", p.x, p.y, { url });
    setShowAssets(false);
  }

  // ── wheel zoom (non-passive) ──
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    function onWheel(e: WheelEvent) {
      e.preventDefault();
      const r = el!.getBoundingClientRect();
      const sx = e.clientX - r.left;
      const sy = e.clientY - r.top;
      setVp((v) => {
        const scale = Math.min(2.5, Math.max(0.25, v.scale * Math.exp(-e.deltaY * 0.001)));
        const gx = (sx - v.panX) / v.scale;
        const gy = (sy - v.panY) / v.scale;
        return { scale, panX: sx - gx * scale, panY: sy - gy * scale };
      });
    }
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, []);

  // ── keyboard ──
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const t = document.activeElement;
      if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA")) return;
      if (e.key === "Escape") {
        setPending(null);
        setMenu(null);
        setSel(null);
      } else if ((e.key === "Delete" || e.key === "Backspace") && sel) {
        e.preventDefault();
        if (sel.kind === "node") removeNode(sel.id);
        else setEdges((es) => es.filter((x) => x.id !== sel.id));
        setSel(null);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [sel]);

  // ── gesture handlers (on the container) ──
  function capture(e: RPointerEvent) {
    try {
      ref.current?.setPointerCapture(e.pointerId);
    } catch {
      /* synthetic / inactive pointer */
    }
  }

  function bgPointerDown(e: RPointerEvent) {
    setSel(null);
    setMenu(null);
    capture(e);
    const v = vpRef.current;
    gestureRef.current = { kind: "pan", sx: e.clientX, sy: e.clientY, panX: v.panX, panY: v.panY };
  }

  function onPointerMove(e: RPointerEvent) {
    const g = gestureRef.current;
    if (pending) {
      const p = screenToGraph(e.clientX, e.clientY);
      setPending((cur) => (cur ? { ...cur, cx: p.x, cy: p.y } : cur));
      return;
    }
    if (!g) return;
    if (g.kind === "pan") {
      setVp((v) => ({ ...v, panX: g.panX + (e.clientX - g.sx), panY: g.panY + (e.clientY - g.sy) }));
    } else if (g.kind === "move") {
      const p = screenToGraph(e.clientX, e.clientY);
      setNodes((ns) =>
        ns.map((n) => (n.id === g.id ? { ...n, x: g.ox + (p.x - g.gx), y: g.oy + (p.y - g.gy) } : n)),
      );
    }
  }

  function onPointerUp(e: RPointerEvent) {
    try {
      ref.current?.releasePointerCapture(e.pointerId);
    } catch {
      /* not captured */
    }
    if (pending) {
      const p = screenToGraph(e.clientX, e.clientY);
      const hit = findInputPort(p.x, p.y, pending.type, pending.node);
      if (hit) connect(pending.node, pending.port, hit.node, hit.port, pending.type);
      setPending(null);
    }
    gestureRef.current = null;
  }

  function findInputPort(gx: number, gy: number, type: PortType, fromNode: string) {
    let best: { node: string; port: string; d: number } | null = null;
    for (const n of nodes) {
      if (n.id === fromNode) continue;
      const def = getDef(n.type);
      def.inputs.forEach((port, i) => {
        // type-equality, or either side is the wildcard "any"
        if (!(port.type === type || port.type === "any" || type === "any")) return;
        const pos = inPos(n, i);
        const d = Math.hypot(pos.x - gx, pos.y - gy);
        if (d <= HIT && (!best || d < best.d)) best = { node: n.id, port: port.name, d };
      });
    }
    return best;
  }

  function connect(sn: string, sp: string, tn: string, tp: string, type: PortType) {
    // A `multi` input port fans in (keeps existing edges); a normal input is
    // single-source (a new edge replaces the old one).
    const tNode = nodes.find((n) => n.id === tn);
    const isMulti = tNode
      ? !!getDef(tNode.type).inputs.find((p) => p.name === tp)?.multi
      : false;
    setEdges((es) => {
      // Never duplicate the exact same source→target wire.
      if (
        es.some(
          (x) =>
            x.source.node === sn &&
            x.source.port === sp &&
            x.target.node === tn &&
            x.target.port === tp,
        )
      ) {
        return es;
      }
      const kept = isMulti
        ? es
        : es.filter((x) => !(x.target.node === tn && x.target.port === tp));
      return [
        ...kept,
        { id: `e_${ids.current.e++}`, source: { node: sn, port: sp }, target: { node: tn, port: tp }, type },
      ];
    });
  }

  function startConnect(e: RPointerEvent, node: string, port: string, type: PortType) {
    e.stopPropagation();
    capture(e);
    gestureRef.current = { kind: "connect" };
    const p = screenToGraph(e.clientX, e.clientY);
    setPending({ node, port, type, cx: p.x, cy: p.y });
    setSel(null);
  }

  function startMove(e: RPointerEvent, id: string) {
    e.stopPropagation();
    capture(e);
    const n = nodes.find((x) => x.id === id);
    if (!n) return;
    const p = screenToGraph(e.clientX, e.clientY);
    gestureRef.current = { kind: "move", id, gx: p.x, gy: p.y, ox: n.x, oy: n.y };
    setSel({ kind: "node", id });
  }

  const transform = `translate(${vp.panX}px, ${vp.panY}px) scale(${vp.scale})`;

  return (
    <div
      ref={ref}
      onPointerDown={bgPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onDoubleClick={(e) => {
        const p = screenToGraph(e.clientX, e.clientY);
        const r = ref.current!.getBoundingClientRect();
        setMenu({ sx: e.clientX - r.left, sy: e.clientY - r.top, gx: p.x, gy: p.y });
      }}
      className="relative h-full w-full touch-none overflow-hidden bg-[#0a0a0a]"
      style={{ cursor: gestureRef.current?.kind === "pan" ? "grabbing" : "default" }}
    >
      {/* dotted backdrop */}
      <div
        className="pointer-events-none absolute inset-0 opacity-[0.4]"
        style={{
          backgroundImage: "radial-gradient(circle, rgba(255,255,255,0.07) 1px, transparent 1px)",
          backgroundSize: `${24 * vp.scale}px ${24 * vp.scale}px`,
          backgroundPosition: `${vp.panX}px ${vp.panY}px`,
        }}
      />

      <div className="absolute left-0 top-0 origin-top-left" style={{ transform }}>
        <svg className="pointer-events-none absolute left-0 top-0 overflow-visible" style={{ width: 1, height: 1 }}>
          <title>Workflow edges</title>
          {edges.map((edge) => {
            const sn = nodes.find((n) => n.id === edge.source.node);
            const tn = nodes.find((n) => n.id === edge.target.node);
            if (!sn || !tn) return null;
            const si = getDef(sn.type).outputs.findIndex((p) => p.name === edge.source.port);
            const ti = getDef(tn.type).inputs.findIndex((p) => p.name === edge.target.port);
            if (si < 0 || ti < 0) return null;
            const a = outPos(sn, si);
            const b = inPos(tn, ti);
            const d = edgePath(a.x, a.y, b.x, b.y);
            const active = sel?.kind === "edge" && sel.id === edge.id;
            return (
              <g key={edge.id}>
                <path
                  d={d}
                  fill="none"
                  stroke="transparent"
                  strokeWidth={14}
                  style={{ pointerEvents: "stroke", cursor: "pointer" }}
                  onPointerDown={(ev) => {
                    ev.stopPropagation();
                    setSel({ kind: "edge", id: edge.id });
                  }}
                />
                <path
                  d={d}
                  fill="none"
                  stroke={active ? "#A855F7" : PORT_COLOR[edge.type]}
                  strokeWidth={active ? 2.5 : 1.75}
                  style={{ vectorEffect: "non-scaling-stroke", pointerEvents: "none" }}
                />
              </g>
            );
          })}
          {pending &&
            (() => {
              const sn = nodes.find((n) => n.id === pending.node);
              if (!sn) return null;
              const si = getDef(sn.type).outputs.findIndex((p) => p.name === pending.port);
              const a = outPos(sn, si);
              return (
                <path
                  d={edgePath(a.x, a.y, pending.cx, pending.cy)}
                  fill="none"
                  stroke="#A855F7"
                  strokeWidth={2}
                  strokeDasharray="5 4"
                  style={{ vectorEffect: "non-scaling-stroke", pointerEvents: "none" }}
                />
              );
            })()}
        </svg>

        {nodes.map((n) => {
          const def = getDef(n.type);
          const rows = Math.max(def.inputs.length, def.outputs.length);
          const selected = sel?.kind === "node" && sel.id === n.id;
          const st = nodeStates[n.id];
          const typeColor = PORT_COLOR[(def.outputs[0]?.type ?? def.inputs[0]?.type) as PortType] ?? "#94A3B8";
          const dotColor = st ? (STATUS_COLOR[st.status] ?? typeColor) : typeColor;
          const isImg = (s?: string) => !!s && /^(https?:|data:)/.test(s);
          return (
            <div
              key={n.id}
              onPointerDown={(e) => startMove(e, n.id)}
              className={cn(
                "absolute cursor-grab rounded-2xl border bg-black/50 shadow-2xl backdrop-blur-md active:cursor-grabbing",
                selected ? "border-purple-400/70 ring-1 ring-purple-400/40" : "border-white/10",
              )}
              style={{ left: n.x, top: n.y, width: NODE_W, zIndex: selected ? 2 : 1 }}
            >
              {/* title bar */}
              <button
                type="button"
                onPointerDown={(e) => startMove(e, n.id)}
                className="flex h-[38px] w-full cursor-grab items-center gap-2 rounded-t-2xl border-b border-white/10 px-3 text-left active:cursor-grabbing"
              >
                <span
                  className={cn("h-1.5 w-1.5 rounded-full", st?.status === "running" && "motion-safe:animate-pulse")}
                  style={{ background: dotColor }}
                />
                <span className="truncate text-[13px] font-semibold text-white">{def.title}</span>
                <span className="ml-auto text-[9px] uppercase tracking-widest text-white/30">{def.category}</span>
              </button>

              {/* ports region */}
              <div className="relative" style={{ height: rows * PORT_ROW_H }}>
                {def.inputs.map((p, i) => (
                  <div key={p.name} className="absolute left-0 flex items-center gap-1.5" style={{ top: i * PORT_ROW_H, height: PORT_ROW_H, paddingLeft: 12 }}>
                    <span
                      className="absolute rounded-full border border-black/40"
                      style={{ left: -DOT / 2, width: DOT, height: DOT, top: PORT_ROW_H / 2 - DOT / 2, background: PORT_COLOR[p.type] }}
                    />
                    <span className="text-[11px] text-white/55">{p.name}</span>
                  </div>
                ))}
                {def.outputs.map((p, i) => (
                  <div key={p.name} className="absolute right-0 flex items-center justify-end gap-1.5" style={{ top: i * PORT_ROW_H, height: PORT_ROW_H, paddingRight: 12 }}>
                    <span className="text-[11px] text-white/55">{p.name}</span>
                    <span
                      role="button"
                      tabIndex={-1}
                      aria-label={`Connect ${p.name}`}
                      onPointerDown={(e) => startConnect(e, n.id, p.name, p.type)}
                      className="absolute cursor-crosshair rounded-full border border-black/40 transition hover:scale-125"
                      style={{ right: -DOT / 2, width: DOT, height: DOT, top: PORT_ROW_H / 2 - DOT / 2, background: PORT_COLOR[p.type] }}
                    />
                  </div>
                ))}
              </div>

              {/* compact value summary — full editing lives in the Node Inspector */}
              {def.widgets.length > 0 &&
                (() => {
                  const sum = summarize(def, n.values);
                  return sum ? (
                    <div className="truncate px-3 pb-2.5 pt-1 text-[11px] text-white/40">{sum}</div>
                  ) : null;
                })()}

              {/* run status / output */}
              {st?.status === "error" && (
                <div className="px-3 pb-3 text-[11px] leading-relaxed text-red-400/90">{st.error}</div>
              )}
              {n.type === "output.preview" && st?.status === "done" && (() => {
                const inEdge = edges.find((e) => e.target.node === n.id && e.target.port === "in");
                const srcNode = inEdge && nodes.find((x) => x.id === inEdge.source.node);
                const inType = srcNode
                  ? getDef(srcNode.type).outputs.find((o) => o.name === inEdge?.source.port)?.type
                  : undefined;
                const val = st.output ?? "";
                const media = isImg(val);
                return (
                  <div className="space-y-2 px-3 pb-3">
                    {inType === "video" && media ? (
                      // biome-ignore lint/a11y/useMediaCaption: generated preview
                      <video controls src={val} className="w-full rounded-lg border border-white/10" />
                    ) : inType === "audio" && media ? (
                      // biome-ignore lint/a11y/useMediaCaption: generated preview
                      <audio controls src={val} className="w-full" />
                    ) : media ? (
                      <img src={val} alt="output" className="w-full rounded-lg border border-white/10" />
                    ) : val ? (
                      <div className="max-h-36 overflow-auto whitespace-pre-wrap rounded-lg border border-white/10 bg-white/[0.03] p-2.5 text-[11px] leading-relaxed text-white/75">
                        {val}
                      </div>
                    ) : (
                      <div className="rounded-lg border border-dashed border-white/15 px-3 py-4 text-center text-[11px] text-white/40">
                        no input yet
                      </div>
                    )}
                    {media && (
                      <button
                        type="button"
                        onPointerDown={(e) => e.stopPropagation()}
                        onClick={() => saveOutput(val)}
                        disabled={savingUrl === val}
                        className="flex w-full items-center justify-center gap-1.5 rounded-lg border border-white/15 py-1.5 text-[11px] text-white/70 transition hover:bg-white/10 hover:text-white disabled:opacity-50"
                      >
                        <Icon.Plus size={12} /> {savingUrl === val ? "Saving…" : "Save to library"}
                      </button>
                    )}
                  </div>
                );
              })()}
            </div>
          );
        })}
      </div>

      {/* toolbar */}
      <div
        onPointerDown={(e) => e.stopPropagation()}
        className="absolute left-1/2 top-4 flex -translate-x-1/2 items-center gap-1 rounded-full border border-white/12 bg-[#0d0d0d]/90 p-1 shadow-2xl backdrop-blur-xl"
      >
        <button
          type="button"
          data-tour="add-node"
          onClick={() => {
            const r = ref.current!.getBoundingClientRect();
            const cx = r.width / 2;
            const cy = r.height / 2;
            const p = screenToGraph(r.left + cx, r.top + cy);
            setMenu({ sx: cx, sy: cy, gx: p.x, gy: p.y });
          }}
          className="flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[12px] text-white/75 transition hover:bg-white/10 hover:text-white"
        >
          <Icon.Plus size={14} /> Add node
        </button>
        <button
          type="button"
          onClick={() => setShowAssets((v) => !v)}
          className={cn(
            "flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[12px] transition hover:bg-white/10 hover:text-white",
            showAssets ? "bg-white/10 text-white" : "text-white/75",
          )}
        >
          <Icon.Image size={14} /> Assets
        </button>
        <button
          type="button"
          onClick={() => setShowHistory((v) => !v)}
          className={cn(
            "flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[12px] transition hover:bg-white/10 hover:text-white",
            showHistory ? "bg-white/10 text-white" : "text-white/75",
          )}
        >
          <Icon.List size={14} /> History
        </button>
        <button
          type="button"
          onClick={() => setShowTemplates((v) => !v)}
          className={cn(
            "flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[12px] transition hover:bg-white/10 hover:text-white",
            showTemplates ? "bg-white/10 text-white" : "text-white/75",
          )}
        >
          <Icon.LayoutGrid size={14} /> Templates
        </button>
        <button
          type="button"
          data-tour="generate"
          onClick={() => setShowGen((v) => !v)}
          className={cn(
            "flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[12px] transition hover:bg-white/10 hover:text-white",
            showGen ? "bg-white/10 text-white" : "text-white/75",
          )}
        >
          <Icon.Sparkles size={14} /> Generate
        </button>
        <GuidedTour id="workflow" heading="Workflows" steps={WORKFLOW_TOUR} />
        <div className="mx-1 h-5 w-px bg-white/10" />
        <button
          type="button"
          onClick={() => setVp({ panX: 80, panY: 80, scale: 1 })}
          className="rounded-full px-3 py-1.5 text-[12px] tabular-nums text-white/55 transition hover:bg-white/10 hover:text-white"
          title="Reset view"
        >
          {Math.round(vp.scale * 100)}%
        </button>
        <button
          type="button"
          onClick={save}
          disabled={saveState === "saving"}
          className="flex items-center gap-1.5 rounded-full border border-white/15 px-3 py-1.5 text-[12px] text-white/70 transition hover:bg-white/10 hover:text-white disabled:opacity-50"
        >
          {saveState === "saved" ? <Icon.Check size={13} /> : null}
          {saveState === "saving" ? "Saving…" : saveState === "saved" ? "Saved" : "Save"}
        </button>
        <button
          type="button"
          data-tour="run"
          onClick={runGraph}
          disabled={running || nodes.length === 0}
          className="flex items-center gap-1.5 rounded-full bg-white px-3 py-1.5 text-[12px] font-medium text-black transition hover:shadow-lg hover:shadow-white/10 disabled:opacity-40"
        >
          <Icon.Play size={12} />
          {running ? "Running…" : "Run"}
        </button>
      </div>

      {/* add-node menu */}
      {menu && (
        <AddMenu
          x={menu.sx}
          y={menu.sy}
          onPick={(type) => addNode(type, menu.gx, menu.gy)}
          onClose={() => setMenu(null)}
        />
      )}

      {/* image library */}
      {showAssets && (
        <div
          onPointerDown={(e) => e.stopPropagation()}
          className="absolute right-4 top-16 z-20 flex max-h-[75%] w-64 flex-col rounded-2xl border border-white/10 bg-[#0d0d0d]/95 shadow-2xl backdrop-blur-xl"
        >
          <div className="flex items-center justify-between border-b border-white/10 px-4 py-3">
            <span className="text-[12px] font-semibold text-white/80">Image library</span>
            <button
              type="button"
              aria-label="Close"
              onClick={() => setShowAssets(false)}
              className="flex h-6 w-6 items-center justify-center rounded-full text-white/45 transition hover:bg-white/10 hover:text-white"
            >
              <Icon.X size={14} />
            </button>
          </div>
          <div className="flex-1 space-y-2 overflow-y-auto p-2">
            {assets === undefined ? (
              <p className="px-2 py-3 text-[12px] text-white/35">Loading…</p>
            ) : assets.length === 0 ? (
              <p className="px-2 py-3 text-[12px] leading-relaxed text-white/35">
                No saved images yet. Run a workflow and click “Save to library” on an Output
                node — saved images can be dropped back in as Image Input nodes.
              </p>
            ) : (
              assets.map((a) => (
                <div key={a.id} className="overflow-hidden rounded-xl border border-white/10">
                  {a.url && <img src={a.url} alt={a.name} className="h-28 w-full object-cover" />}
                  <div className="flex items-center justify-between gap-2 px-2.5 py-2">
                    <span className="truncate text-[11px] text-white/55">{a.name}</span>
                    <div className="flex shrink-0 items-center gap-1">
                      <button
                        type="button"
                        onClick={() => a.url && addImageFromAsset(a.url)}
                        className="rounded-md px-2 py-1 text-[11px] text-white/70 transition hover:bg-white/10 hover:text-white"
                      >
                        Add
                      </button>
                      <button
                        type="button"
                        aria-label="Delete"
                        onClick={() => token && removeAsset({ token, id: a.id })}
                        className="flex h-6 w-6 items-center justify-center rounded-md text-white/45 transition hover:bg-white/10 hover:text-white"
                      >
                        <Icon.Trash size={13} />
                      </button>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      )}

      {/* run history */}
      {showHistory && (
        <div
          onPointerDown={(e) => e.stopPropagation()}
          className="absolute left-4 top-16 z-20 flex max-h-[75%] w-64 flex-col rounded-2xl border border-white/10 bg-[#0d0d0d]/95 shadow-2xl backdrop-blur-xl"
        >
          <div className="flex items-center justify-between border-b border-white/10 px-4 py-3">
            <span className="text-[12px] font-semibold text-white/80">Run history</span>
            <button
              type="button"
              aria-label="Close"
              onClick={() => setShowHistory(false)}
              className="flex h-6 w-6 items-center justify-center rounded-full text-white/45 transition hover:bg-white/10 hover:text-white"
            >
              <Icon.X size={14} />
            </button>
          </div>
          <div className="flex-1 space-y-1.5 overflow-y-auto p-2">
            {runs === undefined ? (
              <p className="px-2 py-3 text-[12px] text-white/35">Loading…</p>
            ) : runs.length === 0 ? (
              <p className="px-2 py-3 text-[12px] leading-relaxed text-white/35">
                No runs yet. Press Run to execute the graph — past runs and their outputs show up here.
              </p>
            ) : (
              runs.map((r) => (
                <button
                  key={r.id}
                  type="button"
                  onClick={() => {
                    setRunId(r.id);
                    setShowHistory(false);
                  }}
                  className={cn(
                    "flex w-full items-center gap-2.5 rounded-xl border p-2 text-left transition hover:bg-white/[0.05]",
                    r.id === runId ? "border-purple-400/40 bg-white/[0.04]" : "border-white/10",
                  )}
                >
                  {r.thumb ? (
                    <img src={r.thumb} alt="run" className="h-9 w-9 shrink-0 rounded-md border border-white/10 object-cover" />
                  ) : (
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md border border-white/10 text-white/40">
                      <Icon.Plug size={14} />
                    </span>
                  )}
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5 text-[12px] text-white/80">
                      <span
                        className="h-1.5 w-1.5 rounded-full"
                        style={{ background: r.counts.error ? "#F87171" : "#6EE7B7" }}
                      />
                      {new Date(r.createdAt).toLocaleTimeString()}
                    </div>
                    <div className="text-[10px] text-white/35">
                      {(r.counts.done ?? 0)} done · {(r.counts.error ?? 0)} error
                    </div>
                  </div>
                </button>
              ))
            )}
          </div>
        </div>
      )}

      {/* templates */}
      {showTemplates && (
        <div
          onPointerDown={(e) => e.stopPropagation()}
          className="absolute left-1/2 top-16 z-20 flex max-h-[80%] w-80 -translate-x-1/2 flex-col rounded-2xl border border-white/10 bg-[#0d0d0d]/95 shadow-2xl backdrop-blur-xl"
        >
          <div className="flex items-center justify-between border-b border-white/10 px-4 py-3">
            <span className="text-[12px] font-semibold text-white/80">Templates</span>
            <button
              type="button"
              aria-label="Close"
              onClick={() => setShowTemplates(false)}
              className="flex h-6 w-6 items-center justify-center rounded-full text-white/45 transition hover:bg-white/10 hover:text-white"
            >
              <Icon.X size={14} />
            </button>
          </div>
          <div className="flex-1 space-y-3 overflow-y-auto p-2">
            {[...new Set(TEMPLATES.map((t) => t.category))].map((cat) => (
              <div key={cat}>
                <div className="px-2 pb-1 text-[9px] uppercase tracking-widest text-white/35">{cat}</div>
                {TEMPLATES.filter((t) => t.category === cat).map((t) => (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => loadGraph(t.build())}
                    className="w-full rounded-xl px-2.5 py-2 text-left transition hover:bg-white/[0.06]"
                  >
                    <div className="text-[13px] text-white/90">{t.name}</div>
                    <div className="text-[11px] leading-relaxed text-white/40">{t.description}</div>
                  </button>
                ))}
              </div>
            ))}

            <div>
              <div className="px-2 pb-1 text-[9px] uppercase tracking-widest text-white/35">Your templates</div>
              {userTemplates === undefined ? (
                <p className="px-2 py-2 text-[12px] text-white/35">Loading…</p>
              ) : userTemplates.length === 0 ? (
                <p className="px-2 py-2 text-[11px] leading-relaxed text-white/35">
                  Save the current graph below to reuse it later.
                </p>
              ) : (
                userTemplates.map((t) => (
                  <div key={t.id} className="flex items-center gap-1 rounded-xl px-2.5 py-1.5 hover:bg-white/[0.05]">
                    <button
                      type="button"
                      onClick={() => {
                        try {
                          loadGraph(JSON.parse(t.graph));
                        } catch {
                          /* corrupt */
                        }
                      }}
                      className="min-w-0 flex-1 truncate text-left text-[13px] text-white/85"
                    >
                      {t.name}
                    </button>
                    <button
                      type="button"
                      aria-label="Delete template"
                      onClick={() => token && removeTemplate({ token, id: t.id })}
                      className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-white/40 transition hover:bg-white/10 hover:text-white"
                    >
                      <Icon.Trash size={13} />
                    </button>
                  </div>
                ))
              )}
            </div>
          </div>

          <div className="flex items-center gap-2 border-t border-white/10 p-2">
            <input
              value={tplName}
              onChange={(e) => setTplName(e.target.value)}
              placeholder="Save current as…"
              className="min-w-0 flex-1 rounded-lg border border-white/12 bg-white/5 px-2.5 py-1.5 text-[12px] text-white placeholder:text-white/30 focus:border-purple-400/50 focus:outline-none"
            />
            <button
              type="button"
              onClick={saveAsTemplate}
              disabled={!tplName.trim() || nodes.length === 0}
              className="shrink-0 rounded-lg bg-white px-3 py-1.5 text-[12px] font-medium text-black transition hover:shadow-lg disabled:opacity-40"
            >
              Save
            </button>
          </div>
        </div>
      )}

      {/* node inspector — editing surface for the selected node */}
      {sel?.kind === "node" &&
        (() => {
          const node = nodes.find((n) => n.id === sel.id);
          if (!node) return null;
          return (
            <NodeInspector
              node={node}
              nodes={nodes}
              edges={edges}
              onChange={(key, val) =>
                setNodes((ns) =>
                  ns.map((x) => (x.id === node.id ? { ...x, values: { ...x.values, [key]: val } } : x)),
                )
              }
              onDelete={() => {
                removeNode(node.id);
                setSel(null);
              }}
              onClose={() => setSel(null)}
            />
          );
        })()}

      {/* AI generate */}
      {showGen && (
        <div
          onPointerDown={(e) => e.stopPropagation()}
          className="absolute left-1/2 top-16 z-20 flex w-[26rem] max-w-[92vw] -translate-x-1/2 flex-col gap-3 rounded-2xl border border-white/10 bg-[#0d0d0d]/95 p-4 shadow-2xl backdrop-blur-xl"
        >
          <div className="flex items-center justify-between">
            <span className="flex items-center gap-1.5 text-[12px] font-semibold text-white/80">
              <Icon.Sparkles size={14} /> Generate a workflow
            </span>
            <button
              type="button"
              aria-label="Close"
              onClick={() => setShowGen(false)}
              className="flex h-6 w-6 items-center justify-center rounded-full text-white/45 transition hover:bg-white/10 hover:text-white"
            >
              <Icon.X size={14} />
            </button>
          </div>
          <p className="text-[11px] leading-relaxed text-white/40">
            Describe what you want to build — Detour designs the node graph and drops it
            onto the canvas. Replaces the current graph.
          </p>
          <textarea
            rows={3}
            value={genPrompt}
            onChange={(e) => setGenPrompt(e.target.value)}
            onKeyDown={(e) => {
              if ((e.metaKey || e.ctrlKey) && e.key === "Enter") generate();
            }}
            placeholder="e.g. Generate a portrait, upscale it, and preview the result"
            className="resize-none rounded-xl border border-white/12 bg-white/5 px-3 py-2.5 text-[13px] text-white placeholder:text-white/30 focus:border-purple-400/50 focus:outline-none"
          />
          <div className="flex flex-wrap gap-1.5">
            {[
              "Generate an image from a prompt and upscale it",
              "Build a Discord agent that replies with recent-message context",
              "Turn a prompt into speech",
            ].map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => setGenPrompt(s)}
                className="rounded-full border border-white/12 px-2.5 py-1 text-[11px] text-white/55 transition hover:bg-white/10 hover:text-white"
              >
                {s}
              </button>
            ))}
          </div>
          {genError && <p className="text-[11px] leading-relaxed text-red-400/90">{genError}</p>}
          <button
            type="button"
            onClick={generate}
            disabled={!genPrompt.trim() || genBusy}
            className="flex items-center justify-center gap-1.5 rounded-xl bg-white px-3 py-2 text-[13px] font-medium text-black transition hover:shadow-lg hover:shadow-white/10 disabled:opacity-40"
          >
            <Icon.Sparkles size={13} />
            {genBusy ? "Designing…" : "Generate"}
          </button>
        </div>
      )}

      {nodes.length === 0 && (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
          <p className="text-center text-[13px] leading-relaxed text-white/30">
            Double-click anywhere (or “Add node”) to drop a node.
            <br />
            Drag a right-side port to another node’s input to wire them.
          </p>
        </div>
      )}
    </div>
  );
}

function edgePath(sx: number, sy: number, tx: number, ty: number) {
  const dx = Math.max(40, Math.min(Math.abs(tx - sx) / 1.5, 160));
  return `M ${sx} ${sy} C ${sx + dx} ${sy} ${tx - dx} ${ty} ${tx} ${ty}`;
}

/** One-line node-body preview of the most salient values (full editing is in
 *  the Node Inspector). Empty string → render nothing. */
function summarize(def: NodeDef, values: Record<string, string | number>): string {
  return def.widgets
    .map((w) => values[w.key])
    .filter((v) => v !== undefined && v !== "" && !(typeof v === "number" && Number.isNaN(v)))
    .slice(0, 2)
    .map((v) => String(v))
    .join(" · ");
}

function AddMenu({
  x,
  y,
  onPick,
  onClose,
}: {
  x: number;
  y: number;
  onPick: (type: string) => void;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    function onDoc(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    }
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [onClose]);

  const cats = [...new Set(NODE_DEFS.map((d) => d.category))];
  return (
    <div
      ref={ref}
      onPointerDown={(e) => e.stopPropagation()}
      className="absolute z-20 max-h-[70%] w-56 overflow-y-auto rounded-2xl border border-white/10 bg-[#0d0d0d]/95 p-1.5 shadow-2xl backdrop-blur-xl"
      style={{ left: Math.min(x, 9999), top: y }}
    >
      {cats.map((c) => (
        <div key={c}>
          <div className="px-2.5 pb-1 pt-2 text-[9px] uppercase tracking-widest text-white/35">{c}</div>
          {NODE_DEFS.filter((d) => d.category === c).map((d) => (
            <button
              key={d.type}
              type="button"
              onClick={() => onPick(d.type)}
              className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-[13px] text-white/85 transition hover:bg-white/[0.06]"
            >
              <span className="h-1.5 w-1.5 rounded-full" style={{ background: PORT_COLOR[(d.outputs[0]?.type ?? d.inputs[0]?.type) as PortType] ?? "#94A3B8" }} />
              {d.title}
            </button>
          ))}
        </div>
      ))}
    </div>
  );
}
