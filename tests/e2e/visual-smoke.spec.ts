import { test } from "@playwright/test";
import { installDtourTestSession } from "./helpers/auth";
import { expectUsableScreenshot } from "./helpers/screenshot-quality";

test.describe("visual smoke", () => {
  test("public surfaces are not blank", async ({ page }) => {
    for (const route of ["/", "/login", "/token"]) {
      await page.goto(route);
      await expectUsableScreenshot(page, route);
    }
  });

  test("authenticated surfaces are not blank", async ({ page }) => {
    await installDtourTestSession(page);

    for (const route of ["/dashboard", "/design", "/admin"]) {
      await page.goto(route);
      await expectUsableScreenshot(page, route);
    }
  });
});
