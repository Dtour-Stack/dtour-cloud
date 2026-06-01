import { expect, type Page } from "@playwright/test";

export async function expectUsableScreenshot(page: Page, label: string) {
  await page.waitForFunction(
    () => (document.body.textContent ?? "").trim().length > 20,
  );
  const text = await page.evaluate(
    () => (document.body.textContent ?? "").trim(),
  );
  const buffer = await page.screenshot({ fullPage: false });
  expect(text.trim().length, `${label} visible text length`).toBeGreaterThan(20);
  expect(buffer.length, `${label} screenshot byte length`).toBeGreaterThan(4_000);
}
