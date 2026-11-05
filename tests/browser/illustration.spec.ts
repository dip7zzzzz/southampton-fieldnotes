import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

test("reference illustration keeps exact values and separates scientific forecasts", async ({
  page,
}) => {
  await page.goto("./?view=illustration");
  await expect(page.locator(".ia-value")).toHaveText([
    "91.6/100",
    "92.0/100",
    "28.3/100",
  ]);
  await expect(page.locator(".ia-candidate.is-active")).toContainText(
    "Sir John Everett",
  );
  await page
    .getByRole("button", {
      name: /^Poundland/,
      exact: true,
    })
    .click();
  await expect(page.locator(".ia-candidate.is-active")).toContainText(
    "Poundland",
  );
  await page
    .getByRole("button", { name: "About this estimate", exact: true })
    .click();
  await expect(page.getByRole("dialog")).toContainText("not live forecasts");
  await page.keyboard.press("Escape");
  await expect(
    page.getByRole("button", { name: "About this estimate", exact: true }),
  ).toBeFocused();
  await page.getByRole("button", { name: "Zoom illustration in" }).click();
  await expect(page.locator(".ia-map-image")).toHaveAttribute(
    "style",
    /scale\(1.25\)/,
  );
  await page.getByRole("button", { name: "Reset illustration view" }).click();
  await expect(page.locator(".ia-map-image")).toHaveAttribute(
    "style",
    /scale\(1\)/,
  );
  await page.getByRole("link", { name: /Illustrative view/ }).click();
  await expect(page.locator(".map-canvas")).toBeVisible({ timeout: 30000 });
  await expect(page.getByLabel("Forecast date", { exact: true })).toBeVisible();
});

test("illustration search, comparison and saved controls operate on reference areas", async ({
  page,
}) => {
  await page.goto("./?view=illustration");
  await page.getByRole("button", { name: "Compare (3)", exact: true }).click();
  await page
    .getByRole("button", { name: "Save Poundland", exact: true })
    .click();
  await page.getByLabel("Close panel").click();
  await page.getByRole("button", { name: "Saved places", exact: true }).click();
  await expect(page.getByRole("dialog")).toContainText("Poundland");
  await expect(page.getByRole("dialog")).not.toContainText("Starbucks");
  await page.keyboard.press("Escape");
  await page.getByLabel("Search illustrated areas").fill("starbucks");
  await page.getByLabel("Search illustrated areas").press("Enter");
  await expect(page.locator(".ia-comparison-list > div")).toHaveCount(1);
  await page.getByRole("button", { name: /C · Starbucks/ }).click();
  await expect(page.locator(".ia-candidate.is-active")).toContainText(
    "Starbucks",
  );
});

test("illustration keeps the image in bounds when zooming out after an edge drag", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1487, height: 1058 });
  await page.goto("./?view=illustration");
  for (let i = 0; i < 8; i++)
    await page
      .getByRole("button", { name: "Zoom illustration in", exact: true })
      .click();
  const map = (await page.locator(".ia-map").boundingBox())!;
  await page.mouse.move(map.x + 100, map.y + 100);
  await page.mouse.down();
  await page.mouse.move(map.x + map.width - 100, map.y + map.height - 100);
  await page.mouse.up();
  for (let i = 0; i < 6; i++)
    await page
      .getByRole("button", { name: "Zoom illustration out", exact: true })
      .click();
  const frame = (await page.locator(".ia-map-image").boundingBox())!;
  // DOM geometry rounds at fractional CSS pixels; a half-pixel tolerance still
  // detects the large exposed bands caused by an unclamped pan.
  expect(frame.x).toBeLessThanOrEqual(map.x + 0.5);
  expect(frame.y).toBeLessThanOrEqual(map.y + 0.5);
  expect(frame.x + frame.width).toBeGreaterThanOrEqual(map.x + map.width - 0.5);
  expect(frame.y + frame.height).toBeGreaterThanOrEqual(
    map.y + map.height - 0.5,
  );
});

for (const width of [1487, 768, 390, 320]) {
  test(`illustration reflows without overflow and has accessible controls at ${width}px`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: width === 320 ? 640 : 1058 });
    await page.goto("./?view=illustration");
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    for (const value of await page.locator(".ia-value").all())
      await expect(value).toBeInViewport();
    await expect(
      page.getByRole("button", { name: "About this estimate", exact: true }),
    ).toBeInViewport();
    const results = await new AxeBuilder({ page }).analyze();
    expect(results.violations).toEqual([]);
  });
}
