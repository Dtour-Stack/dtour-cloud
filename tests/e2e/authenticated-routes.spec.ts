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
    await expect(page.getByText("Open beta").first()).toBeVisible();
    await expect(page.getByText("Coming soon").first()).toBeVisible();
    await expect(page.getByText("$0.25 starter credit claimed")).toBeVisible();
    await expect(page.getByText("Starter credit is ready")).toBeVisible();
    await expect(page.getByRole("link", { name: /Try Agents/i })).toBeVisible();
  });

  test("open beta users can reach beta dashboards", async ({ page }) => {
    await installDtourTestSession(page, "user");

    await page.goto("/dashboard");

    await expect(page.getByRole("button", { name: "User Dashboard" })).toBeVisible();
    await page.getByRole("button", { name: "User Dashboard" }).click({ force: true });
    await expect(page.getByRole("menuitem", { name: /Design Studio/i })).toBeVisible();
    await expect(page.getByRole("menuitem", { name: /Coding/i })).toBeVisible();

    await page.goto("/design");
    await expect(page).toHaveURL(/\/design$/);
    await expect(page.getByRole("button", { name: "Design Studio" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Design Studio" })).toBeVisible();

    await page.goto("/coding/setup");
    await expect(page).toHaveURL(/\/coding\/setup$/);
    await expect(page.getByRole("button", { name: "Coding" })).toBeVisible();
    await expect(page.getByRole("button", { name: /Detour Cloud \(E2B\)/i })).toBeVisible();

    await page.goto("/coding/setup?pair=ABCD1234");
    await expect(page.getByRole("heading", { name: "Approve this desktop" })).toBeVisible();
    await expect(page.getByText("ABCD1234")).toBeVisible();
    await expect(page.getByRole("button", { name: /Approve desktop/i })).toBeVisible();
    await expect(page.getByRole("img", { name: "Approval QR code" })).toBeVisible();
    await expect(page.getByText("Scan to approve")).toBeVisible();
    await expect(page.getByRole("button", { name: "Copy approval link" })).toBeVisible();

    const approvalUrl = page.url();
    await page.context().grantPermissions(["clipboard-read", "clipboard-write"], {
      origin: new URL(approvalUrl).origin,
    });
    await page.getByRole("button", { name: "Copy approval link" }).click();
    await expect(page.getByText("Approval link copied.")).toBeVisible();
    await expect.poll(() => page.evaluate(() => navigator.clipboard.readText())).toBe(approvalUrl);

    await page.goto("/instances");
    await expect(page).toHaveURL(/\/instances$/);
    await expect(page.getByRole("heading", { name: "Remote Runtime" })).toBeVisible();
    await expect(page.getByText("24/7 remote")).toBeVisible();
    await expect(page.getByText("Web UI access")).toBeVisible();
    await expect(page.getByText("Agent-to-Agent endpoint")).toBeVisible();
    await expect(page.getByText("Runtime endpoints")).toBeVisible();
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

  test("design editors expose focused rails and artifact language", async ({ page }) => {
    await page.goto("/design/canvas");

    await expect(page.locator('[data-tour="canvas-toolbar"]')).toBeVisible();
    await expect(page.getByText("Start with an artboard")).toBeVisible();
    await expect(page.getByText("Canva-style")).toHaveCount(0);
    await page.getByRole("button", { name: "Assets" }).click();
    await expect(page.getByRole("button", { name: /Upload & use/i })).toBeVisible();
    await page.getByRole("button", { name: "Close gallery" }).click();

    await page.goto("/design/sketch");

    await expect(page.locator('[data-tour="sketch-toolbar"]')).toBeVisible();
    await expect(page.getByText("Loading canvas…")).toHaveCount(0);
    await expect(page.getByRole("button", { name: /Assets/i })).toBeVisible();
    const sketch = page.locator(".excalidraw");
    await expect(sketch.locator('[data-testid="toolbar-rectangle"]')).toBeVisible();
    await sketch.locator('label:has([data-testid="toolbar-rectangle"])').click();
    await expect(sketch.locator('[aria-label="Rectangle"]')).toBeChecked();
    await sketch.locator('[data-testid="main-menu-trigger"]').click();
    await expect(sketch.locator('[data-testid="dropdown-menu"]')).toBeVisible();
    await expect(sketch.locator('[data-testid="image-export-button"]')).toBeVisible();
    await expect(sketch.locator('[data-testid="load-button"]')).toBeVisible();

    await page.goto("/design/generate");

    await expect(page.getByRole("heading", { name: "Generate dashboard UI" })).toBeVisible();
    await expect(page.getByText("Live sandbox preview")).toBeVisible();
    await expect(page.getByRole("button", { name: /Use as dashboard/i })).toBeVisible();
    await expect(page.getByText("Copy HTML")).toHaveCount(0);
  });

  test("admin dashboard exposes Admin Detour workflows", async ({ page }) => {
    await page.goto("/admin");

    await expect(page.getByRole("button", { name: "Admin", exact: true })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Overview" })).toBeVisible();
    await expect(page.getByRole("link", { name: /Requests/i })).toBeVisible();
    await expect(page.getByText("OpenRouter credit health")).toBeVisible();
    await expect(page.getByText("Remaining balance")).toBeVisible();
    await expect(page.getByText("$4.25", { exact: true })).toBeVisible();
    await expect(page.getByText("Paid traffic", { exact: true })).toBeVisible();
    await expect(page.getByText("Free traffic", { exact: true })).toBeVisible();
    await expect(page.getByText("OpenRouter credit warning:")).toBeVisible();
    await expect(page.getByRole("button", { name: "Open Admin Detour" })).toBeVisible();

    await page.getByRole("button", { name: "Open Admin Detour" }).click();

    await expect(page.getByRole("heading", { name: "Admin Detour" })).toBeVisible();
    await expect(page.getByRole("button", { name: "workflows" })).toBeVisible();
    await expect(page.getByRole("button", { name: "chat" })).toBeVisible();
    await expect(page.getByRole("button", { name: "applicants" })).toBeVisible();
  });

  test("planned dashboard surfaces are gated behind coming soon", async ({ page }) => {
    await page.goto("/api-keys");

    await expect(page.getByText("Coming soon").first()).toBeVisible();
    await expect(
      page.getByText("Programmatic access keys are being hardened before public launch."),
    ).toBeVisible();
    await expect(page.getByRole("button", { name: /Create/i })).toHaveCount(0);

    await page.goto("/developers");
    await expect(page.getByRole("button", { name: "Docs Open beta", exact: true })).toBeVisible();
    await page.getByRole("button", { name: "API Explorer Coming soon", exact: true }).click();
    await expect(
      page.getByText("Live proxy calls will open after metering and key auth are hardened."),
    ).toBeVisible();
    await page.getByRole("button", { name: "API Keys Coming soon", exact: true }).click();
    await expect(
      page.getByText("Programmatic access keys are being hardened before public launch."),
    ).toBeVisible();
  });

  test("billing, affiliate, and docs copy matches open beta rails", async ({ page }) => {
    await page.goto("/profile/billing");

    await expect(
      page.getByText("Paid chat and image generation debit credits at gateway cost"),
    ).toBeVisible();
    await expect(page.getByText("holder discount applies")).toHaveCount(0);

    await page.goto("/profile/affiliates");
    await expect(
      page.getByText("Top-ups and MCP connections do not accrue affiliate earnings yet."),
    ).toBeVisible();
    await expect(page.getByText(/Pending earnings can be requested as \$ELIZA/)).toBeVisible();
    await expect(page.getByRole("button", { name: "Request $ELIZA payout" })).toBeVisible();

    await page.goto("/docs");
    await expect(page.getByText("Connect a Solana wallet and create a beta account.")).toBeVisible();
    await expect(page.getByText("Earn a share of referred coding sandbox fees.")).toBeVisible();
    await expect(page.getByText("Programmatic access docs and launch status")).toBeVisible();
    await expect(page.getByText("waives the markup")).toHaveCount(0);

    await page.goto("/api-explorer");
    await expect(
      page.getByText("Live proxy calls will open after metering and key auth are hardened."),
    ).toBeVisible();
    await expect(page.getByText("Mint a key")).toHaveCount(0);
  });
});
