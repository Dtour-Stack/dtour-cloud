import { expect, test } from "@playwright/test";

test.describe("public Detour routes", () => {
  test("landing page renders primary product CTAs", async ({ page }) => {
    await page.goto("/");

    await expect(page).toHaveTitle(/Detour Cloud/);
    await expect(
      page.getByRole("heading", { name: /Your AI Agents/i }),
    ).toBeVisible();
    await expect(page.getByRole("link", { name: "Get Started" })).toBeVisible();
    await expect(page.getByRole("link", { name: "$DTOUR Token" })).toBeVisible();
  });

  test("token page renders access-token details", async ({ page }) => {
    await page.goto("/token");

    await expect(page.getByRole("heading", { name: "$DTOUR", level: 1 })).toBeVisible();
    await expect(page.getByText("DijmsEDeTXsWCkCLkhYJNTutKaHf541xZshVrCUbcozy")).toBeVisible();
    await expect(page.getByRole("link", { name: "Open Detour Cloud" })).toBeVisible();
  });
});
