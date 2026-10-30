import { test, expect } from "@playwright/test";
test("map renders a source-backed layer after basemap failure", async ({
  page,
}) => {
  const messages: string[] = [];
  page.on("console", (m) => {
    if (m.type() === "error" || m.type() === "warning") messages.push(m.text());
  });
  // Deterministic local fallback, without bypassing certificate or permission errors.
  await page.route("https://tiles.openfreemap.org/**", (route) =>
    route.abort(),
  );
  await page.goto("./");
  await expect(
    page.getByRole("heading", { name: /Where Southampton/ }),
  ).toBeVisible();
  try {
    await expect(page.locator(".map-canvas")).toHaveAttribute(
      "data-map-ready",
      "true",
      { timeout: 45000 },
    );
  } finally {
    console.log("Map diagnostics:", messages.slice(0, 12));
  }
  // The lazy MapLibre stylesheet can load after the app stylesheet. Its relative
  // positioning must never collapse the absolute map host to zero height.
  const dimensions = await page.locator(".map-canvas").evaluate((el) => {
    const host = el.getBoundingClientRect(),
      region = el.parentElement!.getBoundingClientRect(),
      canvas = el.querySelector("canvas")!.getBoundingClientRect();
    return {
      hostHeight: host.height,
      regionHeight: region.height,
      canvasHeight: canvas.height,
    };
  });
  expect(dimensions.hostHeight).toBeGreaterThan(300);
  expect(
    Math.abs(dimensions.hostHeight - dimensions.regionHeight),
  ).toBeLessThan(2);
  expect(
    Math.abs(dimensions.canvasHeight - dimensions.hostHeight),
  ).toBeLessThan(2);
  await page.evaluate(() => {
    document.querySelector(".sidebar-scroll")!.scrollTop = 0;
  });
  await page.screenshot({
    path: "test-results/map.png",
    fullPage: true,
    animations: "disabled",
  });
  console.log("Map warnings:", messages.slice(0, 8));
});
