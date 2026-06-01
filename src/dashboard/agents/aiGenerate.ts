/**
 * AI agent generation: prompt → a draft agent config (name, persona, model,
 * plugins), via the metered inference gateway (runChat). The result pre-fills
 * the create form so the user reviews/edits before saving — never auto-creates.
 */
import { ELIZA_PLUGINS } from "@/dashboard/design/workflow/registry";

type RunChat = (args: {
  token: string;
  model: string;
  messages: { role: string; content: string }[];
  refId: string;
}) => Promise<{ text: string }>;

export type AgentDraft = {
  name: string;
  description: string;
  systemPrompt: string;
  model: string;
  plugins: string[];
};

function systemPrompt(modelIds: string[]): string {
  const models = modelIds.length
    ? `Available model ids (or "auto" to let Detour route): ${modelIds.slice(0, 40).join(", ")}.`
    : `Use "auto" for the model (Detour routes the best one).`;
  return `You design Detour Cloud agents. Given a user's idea, produce ONE agent config.

Output ONLY raw JSON (no prose, no markdown fences):
{"name":"...","description":"...","systemPrompt":"...","model":"auto","plugins":["plugin-..."]}

- name: short, no quotes. description: one line.
- systemPrompt: a strong persona + behavior spec written in the second person ("You are...").
- model: prefer "auto" unless the user clearly wants a specific one. ${models}
- plugins: pick ONLY what the agent needs, from this exact list: ${ELIZA_PLUGINS.join(", ")}. Empty array if none.`;
}

function extractJson(raw: string): Record<string, unknown> {
  const t = raw.trim().replace(/^```(?:json)?/i, "").replace(/```$/i, "").trim();
  const start = t.indexOf("{");
  const end = t.lastIndexOf("}");
  if (start === -1 || end === -1) throw new Error("No JSON in the response.");
  return JSON.parse(t.slice(start, end + 1)) as Record<string, unknown>;
}

const ALLOWED = new Set(ELIZA_PLUGINS);

export async function generateAgentConfig(
  runChat: RunChat,
  token: string,
  prompt: string,
  refId: string,
  modelIds: string[],
): Promise<AgentDraft> {
  const { text } = await runChat({
    token,
    model: "openrouter/auto",
    messages: [
      { role: "system", content: systemPrompt(modelIds) },
      { role: "user", content: prompt },
    ],
    refId,
  });
  const obj = extractJson(text);

  const name = typeof obj.name === "string" ? obj.name.trim() : "";
  if (!name) throw new Error("The model didn't return an agent name.");
  const rawModel = typeof obj.model === "string" ? obj.model.trim() : "auto";
  const model = rawModel && (rawModel === "auto" || modelIds.includes(rawModel)) ? rawModel : "auto";
  const plugins = Array.isArray(obj.plugins)
    ? obj.plugins.filter((p): p is string => typeof p === "string" && ALLOWED.has(p))
    : [];

  return {
    name,
    description: typeof obj.description === "string" ? obj.description.trim() : "",
    systemPrompt: typeof obj.systemPrompt === "string" ? obj.systemPrompt.trim() : "",
    model,
    plugins,
  };
}
