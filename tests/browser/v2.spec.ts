import { test, expect, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

async function fixedNoon(page: Page, mobile = false) {
  await page.route("https://tiles.openfreemap.org/**", (r) => r.abort());
  await page.goto("./");
  await expect(page.locator(".map-canvas")).toHaveAttribute(
    "data-activity-loaded",
    "true",
    { timeout: 45000 },
  );
  if (mobile) await page.getByLabel("Expand forecast panel").click();
  await page.getByRole("button", { name: "Date & time", exact: true }).click();
  await page.getByLabel("Forecast date").fill("2026-10-28");
  await page.getByLabel("Forecast hour").fill("12");
}

test("v2 desktop explorer and area details collapse independently; scores retain raw ranks", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await fixedNoon(page);
  const host = page.locator(".map-canvas");
  const width = (await host.boundingBox())!.width;
  await page.getByLabel("Hide explorer").click();
  await expect(page.locator(".sidebar")).not.toBeVisible();
  await expect
    .poll(async () => (await host.boundingBox())!.width)
    .toBeGreaterThan(width + 300);
  await page.getByLabel("Show explorer").click();
  const row = page.locator(".area-card").first();
  const raw = Number(await row.getAttribute("data-raw"));
  const intensity = Number(await row.getAttribute("data-intensity"));
  expect(intensity).toBeGreaterThan(0);
  expect(intensity).toBeLessThan(100);
  await expect(row.locator(".index-pill")).toContainText(intensity.toFixed(1));
  await expect(row.locator(".area-number")).toHaveText(
    `#${await row.getAttribute("data-rank")}`,
  );
  await row.click();
  const area = page.getByRole("article", { name: "Selected area details" });
  await expect(area).toContainText("28 Oct 2026");
  await expect(area).toContainText("no observed pedestrian counts");
  await area.getByText("Raw estimate & sensitivity", { exact: true }).click();
  await expect(area).toContainText(`${raw.toFixed(6)} model units`);
  await page.getByLabel("Collapse area details", { exact: true }).click();
  await expect(area.locator(".detail-scroll")).not.toBeVisible();
  await page.getByLabel("Expand area details", { exact: true }).click();
  await expect(area.locator(".detail-scroll")).toBeVisible();
  await page.screenshot({
    path: "docs/fieldnotes-v2/after/selected-desktop.png",
    animations: "disabled",
  });
  await page.getByLabel("Close area details").click();
  await page.locator(".sidebar-scroll").evaluate((el) => (el.scrollTop = 0));
  await page.screenshot({
    path: "docs/fieldnotes-v2/after/desktop.png",
    animations: "disabled",
  });
});

test("v2 keyboard opens selected evidence and restores focus to its area", async ({
  page,
}) => {
  await fixedNoon(page);
  const row = page.locator(".area-card").first();
  await row.focus();
  await page.keyboard.press("Enter");
  await expect(page.locator(".detail-card h2")).toBeFocused();
  await page.getByLabel("Close area details").focus();
  await page.keyboard.press("Enter");
  await expect(row).toBeFocused();
  await page.getByLabel("Hide explorer").focus();
  await page.keyboard.press("Enter");
  await expect(page.getByLabel("Show explorer")).toBeFocused();
});

test("v2 mobile sheet touch gestures do not move map; map touch panning remains independent", async ({
  browser,
}) => {
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    hasTouch: true,
    isMobile: true,
  });
  const page = await context.newPage();
  // This context is explicitly new, so relative navigation uses the configured target.
  await page.route("https://tiles.openfreemap.org/**", (r) => r.abort());
  await page.goto(test.info().project.use.baseURL!);
  const host = page.locator(".map-canvas");
  await expect(host).toHaveAttribute("data-activity-loaded", "true", {
    timeout: 45000,
  });
  const cdp = await context.newCDPSession(page);
  const swipe = async (x: number, from: number, to: number) => {
    await cdp.send("Input.dispatchTouchEvent", {
      type: "touchStart",
      touchPoints: [{ x, y: from, id: 0 }],
    });
    for (let i = 1; i <= 8; i++)
      await cdp.send("Input.dispatchTouchEvent", {
        type: "touchMove",
        touchPoints: [{ x, y: from + ((to - from) * i) / 8, id: 0 }],
      });
    await cdp.send("Input.dispatchTouchEvent", {
      type: "touchEnd",
      touchPoints: [],
    });
  };
  const centre = await host.getAttribute("data-map-centre");
  const handle = (await page
    .getByLabel("Expand forecast panel")
    .boundingBox())!;
  await swipe(195, handle.y + 16, handle.y - 130);
  await expect(page.locator(".sidebar")).toHaveClass(/expanded/);
  await expect(host).toHaveAttribute("data-map-centre", centre!);
  await expect(page.getByLabel("Search areas or businesses")).toBeVisible();
  const expandedHandle = (await page
    .getByLabel("Collapse forecast panel")
    .boundingBox())!;
  await swipe(195, expandedHandle.y + 16, expandedHandle.y + 155);
  await expect(page.locator(".sidebar")).not.toHaveClass(/expanded/);
  await swipe(78, 270, 365);
  await expect
    .poll(() => host.getAttribute("data-map-centre"))
    .not.toBe(centre);
  await page.getByLabel("Expand forecast panel").click();
  await page.getByRole("button", { name: "Date & time", exact: true }).click();
  await page.getByLabel("Forecast date").fill("2026-10-28");
  await page.getByLabel("Forecast hour").fill("12");
  await page.locator(".area-card").first().click();
  await expect(page.locator(".sidebar")).not.toBeVisible();
  await expect(page.getByLabel("Expand area sheet")).toBeVisible();
  await expect(page.locator(".selected-disclosure")).toBeInViewport({
    ratio: 1,
  });
  await page.screenshot({
    path: "docs/fieldnotes-v2/after/selected-mobile.png",
    animations: "disabled",
  });
  await page.getByLabel("Expand area sheet").click();
  await page.locator(".contributor-disclosure > summary").click();
  await expect(page.locator(".venue-row").first()).toBeVisible();
  await page.getByLabel("Collapse area sheet").click();
  await page.getByRole("button", { name: /Back to areas/ }).click();
  await page.getByLabel("Collapse forecast panel").click();
  await page.getByLabel("Show Southampton coverage").click();
  await expect
    .poll(async () => Number(await host.getAttribute("data-map-zoom")))
    .toBeLessThan(14);
  await expect
    .poll(async () => Number(await host.getAttribute("data-visible-cells")))
    .toBeGreaterThan(0);
  await expect(host).toHaveAttribute("data-activity-loaded", "true");
  await page.screenshot({
    path: "docs/fieldnotes-v2/after/mobile.png",
    animations: "disabled",
  });
  await context.close();
});

test("v2 loading remains explicit until real data arrive", async ({ page }) => {
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route("**/data/southampton.json", async (route) => {
    await gate;
    await route.continue();
  });
  await page.goto("./", { waitUntil: "domcontentloaded" });
  await expect(
    page.getByRole("heading", { name: "Getting the lay of the land." }),
  ).toBeVisible();
  await expect(page.locator(".area-card")).toHaveCount(0);
  release();
  await expect(page.locator(".area-card").first()).toBeVisible();
});

for (const width of [320, 390, 768, 1440]) {
  test(`v2 scale legend, layout and accessibility at ${width}px`, async ({
    page,
  }, info) => {
    await page.setViewportSize({ width, height: width === 320 ? 640 : 900 });
    await page.emulateMedia({ reducedMotion: "reduce" });
    await fixedNoon(page, width <= 720);
    if (width <= 720) await page.getByLabel("Collapse forecast panel").click();
    await expect(page.locator(".map-legend")).toContainText("coverage unknown");
    await expect(page.locator(".map-legend")).toContainText(
      "not people or a percentile",
    );
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    const violations = (
      await new AxeBuilder({ page })
        .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
        .analyze()
    ).violations;
    await info.attach("v2-accessibility", {
      body: JSON.stringify(violations),
      contentType: "application/json",
    });
    expect(violations).toEqual([]);
    if (width <= 720) {
      await page.getByLabel("Expand forecast panel").click();
      await page.locator(".area-card").first().click();
      await expect(page.locator(".selected-disclosure")).toBeInViewport({
        ratio: 1,
      });
    }
  });
}
