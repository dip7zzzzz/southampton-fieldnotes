import { test, expect } from "@playwright/test";

for (const width of [1440, 390]) {
  test(`scientific components and separate resident context at ${width}px`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: width === 390 ? 844 : 1000 });
    await page.route("https://tiles.openfreemap.org/**", (route) =>
      route.abort(),
    );
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.goto("./");
    await expect(
      page.getByRole("heading", { name: /Where Southampton/ }),
    ).toBeVisible();
    if (width === 390) await page.getByLabel("Expand forecast panel").click();
    await page
      .getByRole("button", { name: "Date & time", exact: true })
      .click();
    await page.getByLabel("Forecast date").fill("2026-10-30");
    await page.getByLabel("Forecast hour").fill("23");
    await page.locator(".explore-options > summary").click();
    await page.getByLabel("Limit ranked list to walking distance").uncheck();
    await page
      .getByRole("button", { name: "Pubs, bars & nightlife", exact: true })
      .click();
    const first = page.locator(".area-card").first();
    await expect(first).toBeVisible();
    expect(Number(await first.getAttribute("data-raw"))).toBeGreaterThan(0);
    const raw = await first.getAttribute("data-raw"),
      cell = await first.getAttribute("data-cell-id");
    await page.getByLabel("Map view", { exact: true }).selectOption("women");
    await expect(
      page.locator(`.area-card[data-cell-id="${cell}"]`),
    ).toHaveAttribute("data-raw", raw!);
    await page.getByLabel("Map view", { exact: true }).selectOption("general");
    await first.click();
    const details = page.getByRole("article", {
      name: "Selected area details",
    });
    await expect(details).toBeVisible();
    if (width === 390) await page.getByLabel("Expand area sheet").click();
    const residential = details.locator(".residential-context");
    await residential.locator(":scope > summary").click();
    await expect(residential).toContainText("2024");
    await expect(residential).toContainText("not a measured cell population");
    await expect(residential).toContainText("does not change activity scores");
    await details.locator(".contributor-disclosure > summary").click();
    await expect(details.locator(".venue-row").first()).toBeVisible();
    await details.locator(".venue-row summary").first().click();
    await expect(details).toContainText("uncalibrated hypothesis");
    await page.screenshot({
      path: `docs/scientific-v02/scientific-${width}.png`,
      animations: "disabled",
    });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    expect(errors).toEqual([]);
  });
}
