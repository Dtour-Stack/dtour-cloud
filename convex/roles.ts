// Shared role logic (plain TS, imported by Convex functions).

export type Role = "free" | "user" | "dev_tester" | "pro_user" | "super_user" | "admin" | "super_admin";
export type AdminRole = "admin" | "super_admin";

// User-tier thresholds (denominator #1 = $DTOUR held). More denominators can
// be folded in later; for now tier is derived from balance.
export const PRO_USER_MIN = 1_000_000;
export const SUPER_USER_MIN = 10_000_000;

export function tierFromBalance(
  balance: number,
  thresholds?: { pro: number; super: number },
): Role {
  const pro = thresholds?.pro ?? PRO_USER_MIN;
  const sup = thresholds?.super ?? SUPER_USER_MIN;
  if (balance >= sup) return "super_user";
  if (balance >= pro) return "pro_user";
  if (balance > 0) return "user";
  return "free";
}

const RANK: Record<Role, number> = {
  free: 0,
  user: 0,
  dev_tester: 1,
  pro_user: 1,
  super_user: 2,
  admin: 3,
  super_admin: 4,
};

export function atLeast(role: Role, min: Role): boolean {
  return RANK[role] >= RANK[min];
}

export const ROLE_LABEL: Record<Role, string> = {
  free: "Free",
  user: "Holder",
  dev_tester: "Dev / Tester",
  pro_user: "Scout",
  super_user: "Operator",
  admin: "Admin",
  super_admin: "Super Admin",
};

/** Base "swerve" tag derived from role/tier (the simple-for-now denominator).
 *  Merged with any admin-assigned custom tags on the profile. */
export function baseSwerveTag(role: Role): string {
  switch (role) {
    case "super_admin":
      return "Founder";
    case "admin":
      return "Team";
    case "dev_tester":
      return "Builder";
    case "super_user":
      return "Operator";
    case "pro_user":
      return "Scout";
    case "user":
      return "Holder";
    default:
      return "Explorer";
  }
}
