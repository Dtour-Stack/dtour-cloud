/**
 * Runtime boot for the headless Detour Cloud agent server.
 *
 * PATH CHOICE: Path B (lower-level construction), NOT Path A
 * (`RuntimeFactory.createRuntimeForUser`).
 *
 * Why: `createRuntimeForUser` always resolves its character through
 * `agentLoader.getDefaultCharacter` / `loadCharacter`, which read from the
 * cloud characters DB (`charactersService` / `memoriesRepository`) or the
 * hardcoded `defaultAgent`. There is no parameter to inject a custom in-memory
 * character. Detour Cloud boots its OWN minimal Squirrel character, so we must
 * mirror the leaf construction the vendored initializer performs internally,
 * without editing any vendored file:
 *
 *   new AgentRuntime({ character, plugins: [], agentId, settings })
 *     -> registerDatabaseAdapter(dbAdapterPool.getOrCreate(...))
 *     -> initialize({ skipMigrations: true })
 *     -> runtime.messageService = new CloudBootstrapMessageService()
 *     -> runtimeCache.set(...)
 *
 * We import the LEAF cloud-shared modules directly (cache, adapter-pool,
 * settings, message service) and deliberately do NOT import
 * `runtime/initializer.ts`: it has top-level side effects (agent-loader
 * `preloadPlugins()` + dom-polyfills) that pull in DB/services we do not want
 * in a headless boot.
 *
 * Plugins are `[]` for sub-project 1. The plugin subset (and therefore real
 * inference via the cloud model provider) lands in sub-project 2. The DB layer
 * is still satisfied because we register the Postgres adapter manually, exactly
 * as the vendored initializer does after it strips `@elizaos/plugin-sql`.
 */

import { AgentRuntime, type Plugin, stringToUuid, type UUID } from "@elizaos/core";
import { buildRuntimeCacheKey, runtimeCache } from "@/lib/eliza/runtime/cache";
import { dbAdapterPool } from "@/lib/eliza/runtime/database/adapter-pool";
import { buildRuntimeSettings, buildSettings } from "@/lib/eliza/runtime/settings";
import { CloudBootstrapMessageService } from "@/lib/eliza/plugin-cloud-bootstrap/services/cloud-bootstrap-message-service";
import type { UserContext } from "@/lib/eliza/user-context";
import { SQUIRREL_BASE_CHARACTER } from "./character";

const SQUIRREL_PLUGINS: Plugin[] = [];

/**
 * Get (or boot and cache) an AgentRuntime for a request.
 *
 * The cache key folds in the user's organization + mode so two users do not
 * share a runtime, while one user reusing the same agent hits the warm cache.
 */
export async function getRuntimeForRequest(
  userCtx: UserContext,
  agentId: string,
): Promise<AgentRuntime> {
  const agentUuid = stringToUuid(agentId) as UUID;

  const cacheKey = buildRuntimeCacheKey({
    agentId: agentUuid,
    organizationId: userCtx.organizationId,
    effectiveMode: userCtx.agentMode,
    pluginNames: SQUIRREL_PLUGINS.map((p) => p.name),
    webSearchEnabled: userCtx.webSearchEnabled,
  });

  const cached = await runtimeCache.get(cacheKey);
  if (cached) return cached;

  // Embedding model is unset for the minimal character; the adapter pool falls
  // back to the static default embedding dimension.
  const embeddingModel =
    (SQUIRREL_BASE_CHARACTER.settings?.OPENAI_EMBEDDING_MODEL as string | undefined) ??
    (SQUIRREL_BASE_CHARACTER.settings?.ELIZAOS_CLOUD_EMBEDDING_MODEL as string | undefined);

  const dbAdapter = await dbAdapterPool.getOrCreate(agentUuid, embeddingModel);

  const runtime = new AgentRuntime({
    character: {
      ...SQUIRREL_BASE_CHARACTER,
      id: agentUuid,
      settings: buildSettings(SQUIRREL_BASE_CHARACTER, userCtx),
    },
    plugins: SQUIRREL_PLUGINS,
    agentId: agentUuid,
    settings: buildRuntimeSettings(userCtx),
  });

  runtime.registerDatabaseAdapter(dbAdapter);
  await runtime.initialize({ skipMigrations: true });

  // With `[]` plugins nothing populates messageService, so set it explicitly to
  // the cloud bootstrap service (mirrors the vendored initializer). The
  // message-handler also falls back to DefaultMessageService, but the cloud
  // bootstrap service is what the rest of the harness expects.
  runtime.messageService = new CloudBootstrapMessageService();

  await runtimeCache.set(cacheKey, runtime, SQUIRREL_BASE_CHARACTER.name ?? "", agentUuid);

  return runtime;
}
