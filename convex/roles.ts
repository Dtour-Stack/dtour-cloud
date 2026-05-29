// Shared role logic (plain TS, imported by Convex functions).

export type Role = "user" | "pro_user" | "super_user" | "admin" | "super_admin";
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
  return "user";
}

const RANK: Record<Role, number> = {
  user: 0,
  pro_user: 1,
  super_user: 2,
  admin: 3,
  super_admin: 4,
};

export function atLeast(role: Role, min: Role): boolean {
  return RANK[role] >= RANK[min];
}

export const ROLE_LABEL: Record<Role, string> = {
  user: "User",
  pro_user: "Pro",
  super_user: "Super User",
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
    case "super_user":
      return "Super";
    case "pro_user":
      return "Pro";
    default:
      return "Member";
  }
}
