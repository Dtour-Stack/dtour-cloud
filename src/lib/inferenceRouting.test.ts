import { afterEach, describe, expect, it } from "vitest";
import {
  gatewayAttemptOrder,
  inferenceRouteVariantForPubkey,
  resolveInferenceRouteMode,
  resolveRouteVariant,
} from "../../convex/inferenceRouting";

describe("inferenceRouteVariantForPubkey", () => {
  it("is deterministic per pubkey", () => {
    const a = inferenceRouteVariantForPubkey("wallet-a");
    const b = inferenceRouteVariantForPubkey("wallet-a");
    const c = inferenceRouteVariantForPubkey("wallet-b");
    expect(a).toBe(b);
    expect(["eliza_first", "openrouter_first"]).toContain(a);
    expect(["eliza_first", "openrouter_first"]).toContain(c);
  });
});

describe("gatewayAttemptOrder", () => {
  it("tries eliza then openrouter for eliza_first when both available", () => {
    expect(
      gatewayAttemptOrder("eliza_first", { elizacloud: true, openrouter: true }),
    ).toEqual(["elizacloud", "openrouter"]);
  });

  it("tries openrouter then eliza for openrouter_first when both available", () => {
    expect(
      gatewayAttemptOrder("openrouter_first", { elizacloud: true, openrouter: true }),
    ).toEqual(["openrouter", "elizacloud"]);
  });

  it("skips unavailable gateways", () => {
    expect(
      gatewayAttemptOrder("eliza_first", { elizacloud: false, openrouter: true }),
    ).toEqual(["openrouter"]);
  });
});

describe("resolveInferenceRouteMode", () => {
  const prev = process.env.INFERENCE_ROUTE_MODE;

  afterEach(() => {
    if (prev === undefined) delete process.env.INFERENCE_ROUTE_MODE;
    else process.env.INFERENCE_ROUTE_MODE = prev;
  });

  it("defaults to ab", () => {
    delete process.env.INFERENCE_ROUTE_MODE;
    expect(resolveInferenceRouteMode()).toBe("ab");
  });

  it("accepts eliza_first aliases", () => {
    process.env.INFERENCE_ROUTE_MODE = "eliza";
    expect(resolveInferenceRouteMode()).toBe("eliza_first");
  });
});

describe("resolveRouteVariant", () => {
  const prev = process.env.INFERENCE_ROUTE_MODE;

  afterEach(() => {
    if (prev === undefined) delete process.env.INFERENCE_ROUTE_MODE;
    else process.env.INFERENCE_ROUTE_MODE = prev;
  });

  it("forces global mode when not ab", () => {
    process.env.INFERENCE_ROUTE_MODE = "openrouter_first";
    expect(resolveRouteVariant("any-wallet")).toBe("openrouter_first");
  });

  it("uses sticky bucket in ab mode", () => {
    delete process.env.INFERENCE_ROUTE_MODE;
    expect(resolveRouteVariant("sticky-wallet")).toBe(
      inferenceRouteVariantForPubkey("sticky-wallet"),
    );
  });
});
