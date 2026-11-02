import { test, expect } from "@playwright/test";
for (const width of [1440, 390]) {
  test(`deployment assets and mobile controls at ${width}px`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: width === 390 ? 844 : 1000 });
    const failures: string[] = [],
      errors: string[] = [];
    const origin = new URL(test.info().project.use.baseURL!).origin;
    page.on("pageerror", (e) => errors.push(e.message));
    page.on("response", (r) => {
      if (new URL(r.url()).origin === origin && r.status() >= 400)
        failures.push(`${r.status()} ${new URL(r.url()).pathname}`);
    });
    page.on("requestfailed", (r) => {
      if (new URL(r.url()).origin === origin)
        failures.push(new URL(r.url()).pathname);
    });
    const dataset = page.waitForResponse((r) =>
      r.url().endsWith("/data/southampton.json"),
    );
    await page.goto("./");
    await expect(page.locator(".map-title-card")).toContainText("125 m cells");
    expect((await dataset).status()).toBe(200);
    expect((await dataset).headers()["content-type"]).toContain(
      "application/json",
    );
    await expect(page.locator(".map-canvas")).toHaveAttribute(
      "data-map-ready",
      "true",
      { timeout: 45000 },
    );
    if (width === 390) await page.getByLabel("Expand forecast panel").click();
    await page
      .getByRole("button", { name: "Date & time", exact: true })
      .click();
    await page.getByLabel("Forecast date").fill("2026-10-28");
    await page.getByLabel("Forecast hour").fill("12");
    await page.locator(".explore-options > summary").click();
    await page.getByLabel("Walking limit").selectOption("45");
    await expect(page.locator(".area-card").first()).toBeVisible();
    expect(
      Number(await page.locator(".area-card").first().getAttribute("data-raw")),
    ).toBeGreaterThan(0);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    expect(failures).toEqual([]);
    expect(errors).toEqual([]);
    await page.screenshot({
      path: `.cache/deployment/pages-${width}.png`,
      animations: "disabled",
    });
  });
}
