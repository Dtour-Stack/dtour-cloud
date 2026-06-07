import { expect, test } from "@playwright/test";

test.describe("login gate", () => {
  test("renders sign-in options without wallet access", async ({
    page,
  }) => {
    await page.goto("/login");

    await expect(page.getByRole("heading", { name: "Detour Cloud" })).toBeVisible();
    await expect(page.getByText("Build autonomous agents on the open elizaOS framework")).toBeVisible();
    await expect(page.getByRole("button", { name: "Sign in with passkey" })).toBeVisible();
    await expect(page.getByRole("button", { name: /Connect wallet/i })).toBeVisible();
    await expect(page.getByText("Free tier available")).toBeVisible();
    await expect(page.getByText("$DTOUR holders unlock tier perks")).toBeVisible();
  });

  test("protected dashboard routes redirect unauthenticated users", async ({
    page,
  }) => {
    await page.goto("/dashboard");

    await expect(page).toHaveURL(/\/login$/);
    await expect(page.getByRole("heading", { name: "Detour Cloud" })).toBeVisible();
  });
});
