/** Curated OpenRouter :free models + the aggregate freetour router. */
export const FREE_MODELS = [
  "meta-llama/llama-3.3-70b-instruct:free",
  "qwen/qwen3-next-80b-a3b-instruct:free",
  "openrouter/free",
] as const;

export const FREETOUR_MODEL = "freetour";

/** True when inference should use the free OpenRouter pool (no credits). */
export function freetourActive(model: string): boolean {
  if (!!process.env.FREETOUR) return true;
  if (model === FREETOUR_MODEL || model === "openrouter/free") return true;
  if (model.endsWith(":free")) return true;
  return (FREE_MODELS as readonly string[]).includes(model);
}

/** Models exposed in pickers when freetour is visible + enabled. */
export function listFreeModelOptions(): Array<{ id: string; free: boolean }> {
  return [
    { id: FREETOUR_MODEL, free: true },
    ...FREE_MODELS.map((id) => ({ id, free: true })),
  ];
}
