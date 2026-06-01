import type { Role } from "./roles";

export type OpenRouterServiceTier = "flex" | "priority";
export type OpenRouterRequestClass = "free" | "paid" | "privileged";

export type OpenRouterPlan = "lifetime" | null;

export type OpenRouterKeyResponse = {
  data?: {
    label?: string;
    limit?: number | null;
    limit_remaining?: number | null;
    usage?: number;
    usage_daily?: number;
    usage_weekly?: number;
    usage_monthly?: number;
    is_free_tier?: boolean;
  };
};

export type OpenRouterCreditStatus = {
  label: string | null;
  limitUsd: number | null;
  remainingUsd: number | null;
  usageUsd: number;
  dailyUsageUsd: number;
  weeklyUsageUsd: number;
  monthlyUsageUsd: number;
  freeTier: boolean;
  fetchedAt: number;
};

export type OpenRouterCreditReserve = {
  paidReserveUsd: number;
  freeReserveUsd: number;
};

export type OpenRouterCreditDecision =
  | { ok: true }
  | {
      ok: false;
      reason: "low_credits" | "negative_credits";
      remainingUsd: number;
      reserveUsd: number;
    };

const PRIVILEGED_ROLES = new Set<Role>([
  "dev_tester",
  "pro_user",
  "super_user",
  "admin",
  "super_admin",
]);

function nullableNumber(value: number | null | undefined): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function numberOrZero(value: number | undefined): number {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

export function openRouterRequestClass(input: {
  free: boolean;
  role: Role;
  plan: OpenRouterPlan;
}): OpenRouterRequestClass {
  if (input.free) return "free";
  if (input.plan === "lifetime" || PRIVILEGED_ROLES.has(input.role)) return "privileged";
  return "paid";
}

export function openRouterServiceTier(requestClass: OpenRouterRequestClass): OpenRouterServiceTier {
  return requestClass === "free" ? "flex" : "priority";
}

export function normalizeOpenRouterKeyResponse(
  response: OpenRouterKeyResponse,
  fetchedAt: number,
): OpenRouterCreditStatus {
  const data = response.data;
  if (!data) throw new Error("OpenRouter key response missing data");
  return {
    label: data.label ?? null,
    limitUsd: nullableNumber(data.limit),
    remainingUsd: nullableNumber(data.limit_remaining),
    usageUsd: numberOrZero(data.usage),
    dailyUsageUsd: numberOrZero(data.usage_daily),
    weeklyUsageUsd: numberOrZero(data.usage_weekly),
    monthlyUsageUsd: numberOrZero(data.usage_monthly),
    freeTier: data.is_free_tier === true,
    fetchedAt,
  };
}

export function assessOpenRouterCredits(
  status: OpenRouterCreditStatus,
  requestClass: OpenRouterRequestClass,
  reserve: OpenRouterCreditReserve,
): OpenRouterCreditDecision {
  if (status.remainingUsd === null) return { ok: true };
  const reserveUsd = requestClass === "free" ? reserve.freeReserveUsd : reserve.paidReserveUsd;
  if (status.remainingUsd < 0) {
    return {
      ok: false,
      reason: "negative_credits",
      remainingUsd: status.remainingUsd,
      reserveUsd,
    };
  }
  if (status.remainingUsd <= reserveUsd) {
    return {
      ok: false,
      reason: "low_credits",
      remainingUsd: status.remainingUsd,
      reserveUsd,
    };
  }
  return { ok: true };
}
