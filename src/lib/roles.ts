export type Role =
  | "user"
  | "dev_tester"
  | "pro_user"
  | "super_user"
  | "admin"
  | "super_admin";

const RANK: Record<Role, number> = {
  user: 0,
  dev_tester: 1,
  pro_user: 1,
  super_user: 2,
  admin: 3,
  super_admin: 4,
};

export function atLeast(role: Role | null | undefined, min: Role): boolean {
  return role ? RANK[role] >= RANK[min] : false;
}

export function isAdmin(role: Role | null | undefined): boolean {
  return atLeast(role, "admin");
}

export function isPro(role: Role | null | undefined): boolean {
  return atLeast(role, "pro_user");
}

export const ROLE_LABEL: Record<Role, string> = {
  user: "User",
  dev_tester: "Dev / Tester",
  pro_user: "Pro",
  super_user: "Super User",
  admin: "Admin",
  super_admin: "Super Admin",
};
