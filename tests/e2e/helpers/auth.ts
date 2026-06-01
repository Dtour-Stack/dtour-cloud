import type { Page } from "@playwright/test";

type TestRole =
  | "user"
  | "dev_tester"
  | "pro_user"
  | "super_user"
  | "admin"
  | "super_admin";

export async function installDtourTestSession(
  page: Page,
  role: TestRole = "super_admin",
) {
  await page.goto("/");
  await page.evaluate((selectedRole) => {
    document.cookie = "dtour-test-auth=1; path=/; SameSite=Lax";
    localStorage.setItem("dtour-session", "playwright-test-session");
    localStorage.setItem("dtour-test-role", selectedRole);
  }, role);
}
