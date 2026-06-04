import { describe, expect, it } from "vitest";
import { affiliateEarningsMicroForUsage } from "./affiliateEarnings";

describe("affiliateEarningsMicroForUsage", () => {
  it("pays the referrer from realized coding margin", () => {
    expect(
      affiliateEarningsMicroForUsage({
        costMicroUsd: 1_000_000,
        priceMicroUsd: 1_500_000,
        shareBps: 2000,
      }),
    ).toBe(100_000);
  });

  it("uses the discounted holder margin instead of global markup assumptions", () => {
    expect(
      affiliateEarningsMicroForUsage({
        costMicroUsd: 1_000_000,
        priceMicroUsd: 1_200_000,
        shareBps: 2000,
      }),
    ).toBe(40_000);
  });

  it("does not accrue earnings when a charge has no realized margin", () => {
    expect(
      affiliateEarningsMicroForUsage({
        costMicroUsd: 1_000_000,
        priceMicroUsd: 900_000,
        shareBps: 2000,
      }),
    ).toBe(0);
  });
});
