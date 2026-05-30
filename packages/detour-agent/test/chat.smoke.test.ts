import { describe, expect, test } from "bun:test";

/**
 * End-to-end smoke: the success criterion for sub-project 1. Proves the full
 * pipe auth -> runtime boot -> ElizaOS Cloud inference (fees pass) -> SSE.
 *
 * Requires a running server, a real Postgres + ELIZAOS_CLOUD_API_KEY, and a
 * seeded session token (insert a `sessions` row + a `users` row with balance > 0
 * via `bunx convex run`, then pass it as SMOKE_SESSION_TOKEN). Gated behind
 * RUN_INTEGRATION=1; skipped in unit runs. See README.md.
 */
const runIntegration = !!process.env.RUN_INTEGRATION;
const maybe = runIntegration ? test : test.skip;

const baseUrl = process.env.AGENT_BASE_URL ?? "http://localhost:3000";
const token = process.env.SMOKE_SESSION_TOKEN ?? "";

describe("chat smoke (integration, end to end)", () => {
  maybe("POST /agent/chat streams an in-character reply ending in [DONE]", async () => {
    const res = await fetch(`${baseUrl}/agent/chat`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ roomId: "smoke", text: "say hi in one line" }),
    });

    expect(res.status).toBe(200);

    const body = await res.text();
    const dataChunks = body
      .split("\n")
      .filter((line) => line.startsWith("data:"))
      .map((line) => line.slice("data:".length).trim());

    expect(dataChunks.some((chunk) => chunk.length > 0 && chunk !== "[DONE]")).toBe(true);
    expect(dataChunks).toContain("[DONE]");
  });
});
