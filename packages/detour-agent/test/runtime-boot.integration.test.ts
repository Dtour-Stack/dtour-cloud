import { describe, expect, test } from "bun:test";
import { AgentMode } from "@/lib/eliza/agent-mode-types";
import type { UserContext } from "@/lib/eliza/user-context";

/**
 * Integration boot test. Requires a real Postgres (DATABASE_URL) and an
 * ELIZAOS_CLOUD_API_KEY, so it is gated behind RUN_INTEGRATION=1. Run with a
 * local `postgres:16` container; it is skipped in plain unit runs.
 */
const runIntegration = !!process.env.RUN_INTEGRATION;
const maybe = runIntegration ? test : test.skip;

describe("runtime boot (integration)", () => {
  maybe("boots an AgentRuntime via the cloud-shared harness against Postgres", async () => {
    const { getRuntimeForRequest } = await import("../src/runtime-boot");

    const ctx: UserContext = {
      userId: "smoke-user",
      entityId: "smoke-user",
      organizationId: "smoke-org",
      agentMode: AgentMode.CHAT,
      apiKey: process.env.ELIZAOS_CLOUD_API_KEY ?? "",
      isAnonymous: false,
      sessionToken: "smoke-token",
    };

    const runtime = await getRuntimeForRequest(ctx, "smoke-agent");
    expect(runtime.agentId).toBeDefined();
    expect(runtime.messageService).toBeDefined();
  });
});
