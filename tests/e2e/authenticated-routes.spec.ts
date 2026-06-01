import { expect, test } from "@playwright/test";
import { installDtourTestSession } from "./helpers/auth";

test.describe("authenticated dashboard routes", () => {
  test.beforeEach(async ({ page }) => {
    await installDtourTestSession(page);
  });

  test("dashboard renders the test session and launcher", async ({ page }) => {
    await page.goto("/dashboard");

    await expect(page.getByRole("button", { name: "User Dashboard" })).toBeVisible();
    await expect(page.getByRole("heading", { name: /Welcome back/i })).toBeVisible();
    await expect(page.locator("body")).toContainText("@playwright");
    await expect(page.getByRole("link", { name: /Design/i })).toBeVisible();
    await expect(page.getByRole("link", { name: /Coding/i })).toBeVisible();
  });

  test("design studio exposes generate preview and removes AI components inventory", async ({
    page,
  }) => {
    await page.goto("/design");

    await expect(page.getByRole("button", { name: "Design Studio" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Design Studio" })).toBeVisible();
    await expect(page.getByText("Design cockpit")).toBeVisible();
    await expect(page.getByRole("button", { name: /Generate preview/i })).toBeVisible();
    await expect(page.getByText("AI components")).toHaveCount(0);
  });

  test("admin dashboard exposes Admin Detour workflows", async ({ page }) => {
    await page.goto("/admin");

    await expect(page.getByRole("button", { name: "Admin", exact: true })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Overview" })).toBeVisible();
    await expect(page.getByRole("link", { name: /Requests/i })).toBeVisible();
    await expect(page.getByRole("button", { name: "Open Admin Detour" })).toBeVisible();

    await page.getByRole("button", { name: "Open Admin Detour" }).click();

    await expect(page.getByRole("heading", { name: "Admin Detour" })).toBeVisible();
    await expect(page.getByRole("button", { name: "workflows" })).toBeVisible();
    await expect(page.getByRole("button", { name: "chat" })).toBeVisible();
    await expect(page.getByRole("button", { name: "applicants" })).toBeVisible();
  });
});
