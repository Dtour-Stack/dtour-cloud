import { expect, test } from "@playwright/test";

test.describe("login gate", () => {
  test("renders tester application affordance without wallet access", async ({
    page,
  }) => {
    await page.goto("/login");

    await expect(page.getByRole("heading", { name: "Detour Cloud" })).toBeVisible();
    await expect(page.getByRole("button", { name: /Select Wallet|Connect Wallet/i })).toBeVisible();
    await expect(page.getByText("Open beta — connect a Solana wallet to create your account.")).toBeVisible();

    await page.getByRole("button", { name: "Apply to be a tester / early dev" }).click();

    await expect(page.getByPlaceholder("email")).toBeVisible();
    await expect(page.getByPlaceholder("name or handle")).toBeVisible();
    await expect(page.getByPlaceholder("what will you test or build?")).toBeVisible();
    await expect(
      page.getByText("Connect your wallet first so admins can approve the exact address."),
    ).toBeVisible();
    await expect(page.getByRole("button", { name: "Send application" })).toBeDisabled();
  });

  test("protected dashboard routes redirect unauthenticated users", async ({
    page,
  }) => {
    await page.goto("/dashboard");

    await expect(page).toHaveURL(/\/login$/);
    await expect(page.getByRole("heading", { name: "Detour Cloud" })).toBeVisible();
  });
});
