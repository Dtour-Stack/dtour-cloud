import { describe, expect, test } from "vitest";
import {
  assessOpenRouterCredits,
  normalizeOpenRouterKeyResponse,
  openRouterRequestClass,
  openRouterServiceTier,
} from "../../convex/openrouterPolicy";

describe("openRouterServiceTier", () => {
  test("uses flex for free beta traffic", () => {
    expect(
      openRouterServiceTier(
        openRouterRequestClass({ free: true, role: "user", plan: null }),
      ),
    ).toBe("flex");
  });

  test("uses priority for paid user traffic", () => {
    expect(
      openRouterServiceTier(
        openRouterRequestClass({ free: false, role: "user", plan: null }),
      ),
    ).toBe("priority");
  });

  test("uses priority for privileged operators", () => {
    expect(
      openRouterServiceTier(
        openRouterRequestClass({ free: false, role: "admin", plan: null }),
      ),
    ).toBe("priority");
    expect(
      openRouterServiceTier(
        openRouterRequestClass({ free: false, role: "dev_tester", plan: "lifetime" }),
      ),
    ).toBe("priority");
  });
});

describe("normalizeOpenRouterKeyResponse", () => {
  test("normalizes key credit fields from the OpenRouter key endpoint", () => {
    expect(
      normalizeOpenRouterKeyResponse(
        {
          data: {
            label: "production",
            limit: 100,
            limit_remaining: 37.25,
            usage: 62.75,
            usage_daily: 4,
            usage_weekly: 12,
            usage_monthly: 20,
            is_free_tier: false,
          },
        },
        1710000000000,
      ),
    ).toEqual({
      label: "production",
      limitUsd: 100,
      remainingUsd: 37.25,
      usageUsd: 62.75,
      dailyUsageUsd: 4,
      weeklyUsageUsd: 12,
      monthlyUsageUsd: 20,
      freeTier: false,
      fetchedAt: 1710000000000,
    });
  });
});

describe("assessOpenRouterCredits", () => {
  const status = {
    label: "production",
    limitUsd: 100,
    remainingUsd: 12,
    usageUsd: 88,
    dailyUsageUsd: 10,
    weeklyUsageUsd: 40,
    monthlyUsageUsd: 80,
    freeTier: false,
    fetchedAt: 1710000000000,
  };

  test("allows paid traffic above the paid reserve", () => {
    expect(
      assessOpenRouterCredits(status, "paid", {
        paidReserveUsd: 5,
        freeReserveUsd: 25,
      }),
    ).toEqual({ ok: true });
  });

  test("pauses free beta traffic below the larger free reserve", () => {
    expect(
      assessOpenRouterCredits(status, "free", {
        paidReserveUsd: 5,
        freeReserveUsd: 25,
      }),
    ).toEqual({
      ok: false,
      reason: "low_credits",
      remainingUsd: 12,
      reserveUsd: 25,
    });
  });

  test("blocks every OpenRouter class when credits go negative", () => {
    expect(
      assessOpenRouterCredits({ ...status, remainingUsd: -1 }, "paid", {
        paidReserveUsd: 5,
        freeReserveUsd: 25,
      }),
    ).toEqual({
      ok: false,
      reason: "negative_credits",
      remainingUsd: -1,
      reserveUsd: 5,
    });
  });

  test("allows unlimited keys with null remaining balance", () => {
    expect(
      assessOpenRouterCredits({ ...status, remainingUsd: null }, "free", {
        paidReserveUsd: 5,
        freeReserveUsd: 25,
      }),
    ).toEqual({ ok: true });
  });
});
