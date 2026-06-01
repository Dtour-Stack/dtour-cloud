import type { PointerEvent as RPointerEvent } from "react";
import type { WidgetDef } from "./types";

/** One editable field for a node value. Used inline (legacy) and in the
 *  Node Inspector. Stops pointer events so editing never starts a canvas drag. */
export function Widget({
  def,
  value,
  onChange,
}: {
  def: WidgetDef;
  value: string | number;
  onChange: (v: string | number) => void;
}) {
  const stop = (e: RPointerEvent) => e.stopPropagation();
  const field =
    "w-full rounded-lg border border-white/15 bg-white/5 px-2.5 py-1.5 text-[12px] text-white focus:border-purple-400/50 focus:outline-none";
  return (
    <label className="block" onPointerDown={stop}>
      <span className="mb-1 block text-[9px] uppercase tracking-widest text-white/35">{def.label}</span>
      {def.kind === "textarea" ? (
        <textarea rows={3} value={String(value)} onChange={(e) => onChange(e.target.value)} className={`${field} resize-none`} />
      ) : def.kind === "select" ? (
        <select value={String(value)} onChange={(e) => onChange(e.target.value)} className={field}>
          {def.options?.map((o) => (
            <option key={o} value={o}>
              {o}
            </option>
          ))}
        </select>
      ) : def.kind === "slider" ? (
        <div className="flex items-center gap-2">
          <input type="range" min={def.min} max={def.max} step={def.step} value={Number(value)} onChange={(e) => onChange(Number(e.target.value))} className="flex-1 accent-purple-500" />
          <span className="w-8 text-right text-[11px] tabular-nums text-white/60">{Number(value)}</span>
        </div>
      ) : def.kind === "number" ? (
        <input type="number" min={def.min} max={def.max} step={def.step} value={Number(value)} onChange={(e) => onChange(Number(e.target.value))} className={`${field} tabular-nums`} />
      ) : (
        <input type="text" value={String(value)} onChange={(e) => onChange(e.target.value)} className={field} />
      )}
    </label>
  );
}
