import { describe, expect, test, mock } from "bun:test";
import { makeVerifySession } from "../src/auth";

describe("verifySession", () => {
  test("returns a UserContext for a valid token", async () => {
    const convex = { query: mock(async () => ({ valid: true, pubkey: "PUB", balance: 5, organizationId: "PUB" })) };
    const verify = makeVerifySession(convex as never, "test-eliza-key");
    const ctx = await verify("good-token");
    expect(ctx?.userId).toBe("PUB");
    expect(ctx?.apiKey).toBe("test-eliza-key");
    expect(ctx?.isAnonymous).toBe(false);
  });
  test("returns null for an invalid token", async () => {
    const convex = { query: mock(async () => ({ valid: false })) };
    const verify = makeVerifySession(convex as never, "k");
    expect(await verify("bad")).toBeNull();
  });
});
