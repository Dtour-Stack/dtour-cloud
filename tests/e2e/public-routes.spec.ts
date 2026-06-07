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
    await expect(page.getByText("Real tool use")).toHaveCount(0);
    await expect(page.getByText("Full REST API per agent")).toHaveCount(0);
    await expect(page.getByRole("heading", { name: "Everywhere You Need It" })).toBeVisible();
    await expect(page.getByText("Discord", { exact: true }).first()).toBeVisible();
    await expect(page.getByText("Embed anywhere")).toHaveCount(0);
  });

  test("token page renders access-token details", async ({ page }) => {
    await page.goto("/token");

    await expect(page.getByRole("heading", { name: "$DTOUR", level: 1 })).toBeVisible();
    await expect(page.getByText("DijmsEDeTXsWCkCLkhYJNTutKaHf541xZshVrCUbcozy")).toBeVisible();
    await expect(page.getByText("perks token", { exact: false })).toBeVisible();
    await expect(page.getByText("everything you run")).toHaveCount(0);
  });
});
