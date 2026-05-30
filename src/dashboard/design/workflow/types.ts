/** Detour Workflow — a ComfyUI-style node graph. Greenfield model: edges are
 *  readable objects (not positional tuples), node defs (the palette) are kept
 *  separate from node instances (live graph). */

export type PortType = "image" | "text" | "model" | "number" | "audio" | "video" | "any";

export interface PortDef {
  name: string;
  type: PortType;
  /** Input ports only: accept MULTIPLE incoming edges (fan-in) instead of
   *  replacing — e.g. linking several plugins to one Character connector. */
  multi?: boolean;
}

export type WidgetKind = "text" | "textarea" | "number" | "slider" | "select";

export interface WidgetDef {
  key: string;
  kind: WidgetKind;
  label: string;
  default: string | number;
  min?: number;
  max?: number;
  step?: number;
  options?: string[];
}

export interface NodeDef {
  type: string;
  title: string;
  category: string;
  inputs: PortDef[];
  outputs: PortDef[];
  widgets: WidgetDef[];
}

export interface NodeInstance {
  id: string;
  type: string;
  x: number;
  y: number;
  values: Record<string, string | number>;
}

export interface Edge {
  id: string;
  source: { node: string; port: string };
  target: { node: string; port: string };
  type: PortType;
}

export interface Viewport {
  panX: number;
  panY: number;
  scale: number;
}
