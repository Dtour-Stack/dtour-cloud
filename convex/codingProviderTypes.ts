/** Convex-safe copy of provider storage keys (no UI imports from src/). */

export const CODING_PROVIDER_STORAGE_KEYS = [
  "openrouter",
  "openai",
  "anthropic",
] as const;

export type CodingProviderStorageKey = (typeof CODING_PROVIDER_STORAGE_KEYS)[number];

export const UI_PROVIDER_ROWS: {
  id: string;
  storageKey: CodingProviderStorageKey;
}[] = [
  { id: "opencode", storageKey: "openrouter" },
  { id: "codex", storageKey: "openai" },
  { id: "claude", storageKey: "anthropic" },
  { id: "pi", storageKey: "anthropic" },
  { id: "openrouter", storageKey: "openrouter" },
];
