import { test, expect } from "@playwright/test";

test("desktop dragging pans the working map from the public entry at its initial zoom", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("./");
  const map = page.locator(".map-canvas");
  await expect(map).toHaveAttribute("data-map-ready", "true", {
    timeout: 45000,
  });
  await expect(map).toHaveAttribute("data-activity-loaded", "true");
  const centre = await map.getAttribute("data-map-centre");
  const frame = (await map.boundingBox())!;
  await page.mouse.move(
    frame.x + frame.width * 0.55,
    frame.y + frame.height * 0.3,
  );
  await page.mouse.down();
  await page.mouse.move(
    frame.x + frame.width * 0.7,
    frame.y + frame.height * 0.45,
    { steps: 12 },
  );
  await page.mouse.up();
  await expect.poll(() => map.getAttribute("data-map-centre")).not.toBe(centre);
  await test.info().attach("desktop drag changes geographic centre", {
    body: JSON.stringify({
      before: centre,
      after: await map.getAttribute("data-map-centre"),
    }),
    contentType: "application/json",
  });
  await expect(map).toHaveAttribute("data-activity-loaded", "true");
  const row = page.locator(".candidate-row.selected");
  const walk = (await row.locator(".area-copy > span").boundingBox())!;
  const actions = (await row.locator(".candidate-actions").boundingBox())!;
  expect(walk.y + walk.height).toBeLessThanOrEqual(actions.y);
});

test("the public entry opens the working map with real time, search and directions", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("./");
  await expect(page.locator(".illustrated-atlas")).toHaveCount(0);
  await expect(page.locator(".map-canvas")).toHaveAttribute(
    "data-activity-loaded",
    "true",
    { timeout: 45000 },
  );
  await page.getByLabel("Forecast date", { exact: true }).fill("2026-10-28");
  await page.getByLabel("Forecast hour", { exact: true }).selectOption("12");
  const first = page.locator(".area-card").first();
  const midday = await first.getAttribute("data-raw");
  await page.getByLabel("Forecast hour", { exact: true }).selectOption("23");
  await expect(page.locator(".map-title-card")).toContainText("23:00");
  await expect(first).not.toHaveAttribute("data-raw", midday!);
  await page.getByLabel("Search areas or businesses").fill("Poundland");
  const result = page
    .locator(".area-card")
    .filter({ hasText: "Poundland" })
    .first();
  await expect(result).toBeVisible();
  await result.click();
  const details = page.getByRole("article", { name: "Selected area details" });
  await expect(details).toBeVisible();
  await details.getByLabel("Save selected area").click();
  await expect(details.getByLabel("Save selected area")).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await details.getByRole("button", { name: /^Directions/ }).click();
  const directions = page.getByRole("link", { name: "Google Maps" });
  const target = new URL((await directions.getAttribute("href"))!);
  expect(target.hostname).toBe("www.google.com");
  expect(target.searchParams.get("travelmode")).toBe("walking");
  expect(target.searchParams.get("destination")).toMatch(/^-?\d/);
});

test.describe("phone touch", () => {
  test.use({ hasTouch: true, isMobile: true });
  test("tapping a phone destination reveals its usable actions", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 390, height: 667 });
    await page.goto("./");
    await expect(page.locator(".area-card").first()).toBeVisible();
    await page.locator(".area-card").nth(1).tap();
    await expect(page.locator(".sidebar")).toHaveClass(/expanded/);
    const directions = page.getByRole("button", { name: /^Directions/ });
    await expect(directions).toBeInViewport({ ratio: 1 });
    await directions.tap();
    await expect(page.getByRole("link", { name: "Apple Maps" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Google Maps" })).toBeVisible();
  });
});

for (const [width, height] of [
  [320, 480],
  [390, 400],
  [600, 400],
  [844, 390],
]) {
  test(`working entry remains usable at ${width}x${height}`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height });
    await page.goto("./");
    await expect(
      page.getByLabel("Forecast date", { exact: true }),
    ).toBeVisible();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    for (const control of [
      page.getByLabel("Forecast date", { exact: true }),
      page.getByLabel("Forecast hour", { exact: true }),
      page.getByRole("button", { name: "Filters", exact: true }),
      page.getByRole("button", { name: "Saved places", exact: true }),
    ])
      await expect(control).toBeInViewport({ ratio: 1 });
    await page.getByRole("button", { name: "Filters", exact: true }).click();
    await expect(page.getByLabel("Walking limit")).toBeVisible();
    await page.screenshot({
      path: `docs/atlas-functional-2026-11-04/working-${width}x${height}.png`,
    });
  });
}
