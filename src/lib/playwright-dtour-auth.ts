import type { Role } from "@/lib/roles";

export const DTOUR_TEST_AUTH_COOKIE = "dtour-test-auth";
export const DTOUR_TEST_SESSION_TOKEN = "playwright-test-session";

export type DtourPlaywrightUser = {
  pubkey: string;
  balance: number;
  lastLoginAt: number | null;
  username: string;
  email: string;
  role: Role;
  swerveTags: string[];
  avatarUrl: string | null;
  plan: "lifetime" | null;
  creatorRewardsEligible: boolean;
};

function isEnabled(): boolean {
  return import.meta.env.VITE_PLAYWRIGHT_TEST_AUTH === "true";
}

function hasCookie(name: string, value: string): boolean {
  if (typeof document === "undefined") return false;
  return document.cookie
    .split(";")
    .some((part) => part.trim() === `${name}=${value}`);
}

function readRole(value: string | null): Role {
  switch (value) {
    case "user":
      return "user";
    case "dev_tester":
      return "dev_tester";
    case "pro_user":
      return "pro_user";
    case "super_user":
      return "super_user";
    case "admin":
      return "admin";
    case "super_admin":
      return "super_admin";
    default:
      return "super_admin";
  }
}

export function readDtourPlaywrightUser(): DtourPlaywrightUser | null {
  if (!isEnabled()) return null;
  if (!hasCookie(DTOUR_TEST_AUTH_COOKIE, "1")) return null;

  const role =
    typeof localStorage === "undefined"
      ? "super_admin"
      : readRole(localStorage.getItem("dtour-test-role"));

  return {
    pubkey: "Playwright111111111111111111111111111111111",
    balance: 10_000_000,
    lastLoginAt: Date.now(),
    username: "playwright",
    email: "playwright@detour.local",
    role,
    swerveTags: ["test"],
    avatarUrl: null,
    plan: "lifetime",
    creatorRewardsEligible: role === "dev_tester" || role === "super_admin",
  };
}

export function isDtourPlaywrightAuthActive(): boolean {
  return readDtourPlaywrightUser() !== null;
}
