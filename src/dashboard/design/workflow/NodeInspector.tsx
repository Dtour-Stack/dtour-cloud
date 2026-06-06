import { Icon } from "@/ui";
import { getDef } from "./registry";
import type { Edge, NodeInstance } from "./types";
import { Widget } from "./Widget";

/** Undirected connected component containing `startId` — used to scope an
 *  agent's wired pieces (plugins, providers, actions…) to the selected
 *  Character node, so multiple agents on one canvas don't bleed together. */
function component(startId: string, edges: Edge[]): Set<string> {
  const adj = new Map<string, string[]>();
  for (const e of edges) {
    appendEdge(adj, e.source.node, e.target.node);
    appendEdge(adj, e.target.node, e.source.node);
  }
  const seen = new Set<string>([startId]);
  const stack = [startId];
  while (stack.length) {
    const cur = stack.pop();
    if (cur === undefined) break;
    for (const next of adj.get(cur) ?? []) {
      if (!seen.has(next)) {
        seen.add(next);
        stack.push(next);
      }
    }
  }
  return seen;
}

function appendEdge(adj: Map<string, string[]>, from: string, to: string) {
  const row = adj.get(from);
  if (row) row.push(to);
  else adj.set(from, [to]);
}

/** The agent sub-pipeline for a Character node, read off the wired graph. */
function innerFlow(node: NodeInstance, nodes: NodeInstance[], edges: Edge[]) {
  const ids = component(node.id, edges);
  const inComp = (n: NodeInstance) => ids.has(n.id);
  const named = (n: NodeInstance, key: string) => String(n.values[key] ?? "");
  return {
    plugins: nodes.filter((n) => n.type === "eliza.plugin" && inComp(n)).map((n) => named(n, "name")),
    triggers: nodes.filter((n) => n.type === "eliza.message" && inComp(n)).map((n) => named(n, "source")),
    providers: nodes.filter((n) => n.type === "eliza.provider" && inComp(n)).map((n) => named(n, "name")),
    actions: nodes
      .filter((n) => n.type === "eliza.action" && inComp(n))
      .map((n) => ({ name: named(n, "name"), desc: named(n, "description") })),
    evaluators: nodes.filter((n) => n.type === "eliza.evaluator" && inComp(n)).map((n) => named(n, "name")),
    responds: nodes.filter((n) => n.type === "eliza.respond" && inComp(n)).length,
  };
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-start gap-2 text-[12px]">
      <span className="w-16 shrink-0 text-white/35">{label}</span>
      <span className="min-w-0 flex-1 text-white/75">{children}</span>
    </div>
  );
}

/** Right-docked editor for the selected node: all editable fields live here, plus
 *  an agent's inner sub-pipeline and (groundwork) a nested sub-canvas opener. */
export function NodeInspector({
  node,
  nodes,
  edges,
  onChange,
  onToggleSubgraph,
  onToggleNestedSubgraph,
  onSubgraphNodeChange,
  onDelete,
  onClose,
}: {
  node: NodeInstance;
  nodes: NodeInstance[];
  edges: Edge[];
  onChange: (key: string, value: string | number) => void;
  onToggleSubgraph: () => void;
  onToggleNestedSubgraph: (path: string[]) => void;
  onSubgraphNodeChange: (path: string[], key: string, value: string | number) => void;
  onDelete: () => void;
  onClose: () => void;
}) {
  const def = getDef(node.type);
  const isCharacter = node.type === "eliza.character";
  const flow = isCharacter ? innerFlow(node, nodes, edges) : null;
  const hasFlow =
    !!flow &&
    (flow.plugins.length ||
      flow.triggers.length ||
      flow.providers.length ||
      flow.actions.length ||
      flow.evaluators.length ||
      flow.responds);

  return (
    <div
      onPointerDown={(e) => e.stopPropagation()}
      className="absolute right-0 top-0 z-30 flex h-full w-80 flex-col border-l border-white/10 bg-[#0d0d0d]/95 shadow-2xl backdrop-blur-xl"
    >
      <div className="flex items-center justify-between border-b border-white/10 px-4 py-3">
        <div className="min-w-0">
          <div className="truncate text-[13px] font-semibold text-white">{def.title}</div>
          <div className="text-[10px] uppercase tracking-widest text-white/35">{def.category}</div>
        </div>
        <button
          type="button"
          aria-label="Close inspector"
          onClick={onClose}
          className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-white/45 transition hover:bg-white/10 hover:text-white"
        >
          <Icon.X size={14} />
        </button>
      </div>

      <div className="flex-1 space-y-4 overflow-y-auto p-4">
        {/* editable fields — the full surface lives here now */}
        {def.widgets.length > 0 ? (
          <div className="space-y-3">
            {def.widgets.map((w) => (
              <Widget key={w.key} def={w} value={node.values[w.key]} onChange={(val) => onChange(w.key, val)} />
            ))}
          </div>
        ) : (
          <p className="text-[12px] leading-relaxed text-white/35">
            This node has no editable fields — wire its ports to connect it.
          </p>
        )}

        {/* ports */}
        {(def.inputs.length > 0 || def.outputs.length > 0) && (
          <div className="space-y-1.5 border-t border-white/10 pt-3">
            <div className="text-[9px] uppercase tracking-widest text-white/35">Ports</div>
            {def.inputs.length > 0 && (
              <Row label="In">{def.inputs.map((p) => `${p.name} (${p.type})`).join(", ")}</Row>
            )}
            {def.outputs.length > 0 && (
              <Row label="Out">{def.outputs.map((p) => `${p.name} (${p.type})`).join(", ")}</Row>
            )}
          </div>
        )}

        {/* agent inner flow (Character) */}
        {isCharacter && (
          <div className="space-y-2 border-t border-white/10 pt-3">
            <div className="flex items-center gap-1.5 text-[9px] uppercase tracking-widest text-violet-300/70">
              <Icon.Plug size={11} /> Inner flow
            </div>
            {hasFlow && flow ? (
              <div className="space-y-1.5 rounded-xl border border-white/10 bg-white/[0.02] p-3">
                {flow.plugins.length > 0 && <Row label="Plugins">{flow.plugins.map((p) => p.replace(/^plugin-/, "")).join(", ")}</Row>}
                {flow.triggers.length > 0 && <Row label="Trigger">{flow.triggers.join(", ")}</Row>}
                {flow.providers.length > 0 && <Row label="Context">{flow.providers.join(", ")}</Row>}
                {flow.actions.length > 0 && (
                  <Row label="Actions">
                    {flow.actions.map((a) => a.name + (a.desc ? ` — ${a.desc}` : "")).join("; ")}
                  </Row>
                )}
                {flow.evaluators.length > 0 && <Row label="Evals">{flow.evaluators.join(", ")}</Row>}
                {flow.responds > 0 && <Row label="Respond">✓ wired</Row>}
              </div>
            ) : (
              <p className="text-[11px] leading-relaxed text-white/35">
                Wire Plugin, Message Trigger, Provider, Action and Respond nodes to this Character to
                compose its runtime — they'll appear here as the agent's inner flow.
              </p>
            )}
          </div>
        )}

        <div className="border-t border-white/10 pt-3">
          {node.subgraph ? (
            <div className="space-y-2">
              <div className="flex items-center justify-between gap-2">
                <div className="flex min-w-0 items-center gap-1.5 text-[9px] uppercase tracking-widest text-violet-300/70">
                  <Icon.Frame size={11} /> Subgraph
                </div>
                <button
                  type="button"
                  onClick={onToggleSubgraph}
                  className="min-h-8 rounded-full border border-white/12 px-3 text-[11px] text-white/60 transition hover:bg-white/10 hover:text-white"
                >
                  {subgraphCollapsed(node) ? "Expand" : "Collapse"}
                </button>
              </div>
              <p className="text-[11px] leading-relaxed text-white/35">
                {node.subgraph.nodes.length} internal nodes are saved inside this node and travel with the workflow.
              </p>
              {!subgraphCollapsed(node) && (
                <div className="space-y-2">
                  {node.subgraph.nodes.map((child) => (
                    <SubgraphNodeEditor
                      key={child.id}
                      node={child}
                      path={[child.id]}
                      onToggleNestedSubgraph={onToggleNestedSubgraph}
                      onSubgraphNodeChange={onSubgraphNodeChange}
                    />
                  ))}
                </div>
              )}
            </div>
          ) : (
            <div className="rounded-xl border border-white/10 bg-white/[0.02] px-3 py-2 text-[11px] text-white/35">
              This node has no inner subgraph.
            </div>
          )}
        </div>
      </div>

      <div className="border-t border-white/10 p-3">
        <button
          type="button"
          onClick={onDelete}
          className="flex w-full items-center justify-center gap-1.5 rounded-xl border border-red-500/20 py-2 text-[12px] text-red-400/90 transition hover:bg-red-500/10"
        >
          <Icon.Trash size={13} /> Delete node
        </button>
      </div>
    </div>
  );
}

function SubgraphNodeEditor({
  node,
  path,
  onToggleNestedSubgraph,
  onSubgraphNodeChange,
}: {
  node: NodeInstance;
  path: string[];
  onToggleNestedSubgraph: (path: string[]) => void;
  onSubgraphNodeChange: (path: string[], key: string, value: string | number) => void;
}) {
  const def = getDef(node.type);
  return (
    <div className="rounded-xl border border-white/10 bg-black/25 p-3">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="truncate text-[12px] font-medium text-white/80">{def.title}</div>
          <div className="text-[9px] uppercase tracking-widest text-white/30">{def.category}</div>
        </div>
        {node.subgraph && (
          <button
            type="button"
            onClick={() => onToggleNestedSubgraph(path)}
            className="min-h-8 shrink-0 rounded-full border border-white/12 px-2.5 text-[10px] text-white/55 transition hover:bg-white/10 hover:text-white"
          >
            {subgraphCollapsed(node) ? "Open" : "Hide"} · {node.subgraph.nodes.length}
          </button>
        )}
      </div>
      {def.widgets.length > 0 ? (
        <div className="mt-3 space-y-2">
          {def.widgets.map((w) => (
            <Widget
              key={w.key}
              def={w}
              value={node.values[w.key]}
              onChange={(val) => onSubgraphNodeChange(path, w.key, val)}
            />
          ))}
        </div>
      ) : (
        <p className="mt-2 text-[11px] text-white/30">Wire-only node.</p>
      )}
      {node.subgraph && !subgraphCollapsed(node) && (
        <div className="mt-3 space-y-2 border-l border-white/10 pl-3">
          {node.subgraph.nodes.map((child) => (
            <SubgraphNodeEditor
              key={child.id}
              node={child}
              path={[...path, child.id]}
              onToggleNestedSubgraph={onToggleNestedSubgraph}
              onSubgraphNodeChange={onSubgraphNodeChange}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function subgraphCollapsed(node: Pick<NodeInstance, "subgraphCollapsed">) {
  return node.subgraphCollapsed !== false;
}
