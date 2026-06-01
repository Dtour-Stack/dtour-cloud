import { createOpenAI, openai } from "@ai-sdk/openai";
import { RAG } from "@convex-dev/rag";
import { components } from "./_generated/api";

const EMBEDDING_DIMENSION = 1536;

function embeddingModel() {
  const orKey = process.env.OPENROUTER_API_KEY;
  if (orKey) {
    return createOpenAI({
      apiKey: orKey,
      baseURL: "https://openrouter.ai/api/v1",
    }).embedding("openai/text-embedding-3-small");
  }
  const oaiKey = process.env.OPENAI_API_KEY;
  if (oaiKey) {
    return openai.embedding("text-embedding-3-small");
  }
  return null;
}

let cached: RAG | null | undefined;

export function ragConfigured(): boolean {
  return !!(process.env.OPENROUTER_API_KEY || process.env.OPENAI_API_KEY);
}

/** Lazy singleton — embedding model reads Convex deployment env at runtime. */
export function getRag(): RAG | null {
  if (cached !== undefined) return cached;
  const model = embeddingModel();
  if (!model) {
    cached = null;
    return null;
  }
  cached = new RAG(components.rag, {
    textEmbeddingModel: model,
    embeddingDimension: EMBEDDING_DIMENSION,
  });
  return cached;
}

export function agentNamespace(agentId: string): string {
  return `agent:${agentId}`;
}
