import { test, expect, type Page } from "@playwright/test";

async function loaded(page: Page) {
  await page.route("https://tiles.openfreemap.org/**", (r) => r.abort());
  await page.goto("./?view=scientific");
  await page.getByLabel("Forecast date", { exact: true }).fill("2026-10-28");
  await page.getByLabel("Forecast hour", { exact: true }).selectOption("12");
  await expect(page.locator(".map-canvas")).toHaveAttribute(
    "data-activity-loaded",
    "true",
    { timeout: 45000 },
  );
}
const ids = async (page: Page, name: string) =>
  JSON.parse((await page.locator(".map-canvas").getAttribute(name))!);

test("persistent phone time controls update values while candidate and active identities stay stable", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await loaded(page);
  const host = page.locator(".map-canvas");
  const before = await ids(page, "data-candidate-ids"),
    compared = await ids(page, "data-compared-ids");
  const selected = await host.getAttribute("data-selected-id");
  const centre = await host.getAttribute("data-map-centre");
  const row = page.locator(`[data-cell-id="${before[0]}"].area-card`);
  const value = await row.getAttribute("data-intensity");
  await page.getByLabel("Forecast hour", { exact: true }).selectOption("23");
  await expect(row).not.toHaveAttribute("data-intensity", value!);
  expect(await ids(page, "data-candidate-ids")).toEqual(before);
  expect(await ids(page, "data-compared-ids")).toEqual(compared);
  await expect(host).toHaveAttribute("data-selected-id", selected!);
  await expect(host).toHaveAttribute("data-map-centre", centre!);
  await expect(
    page.getByLabel("Forecast date", { exact: true }),
  ).toBeInViewport({ ratio: 1 });
  await expect(
    page.getByLabel("Forecast hour", { exact: true }),
  ).toBeInViewport({ ratio: 1 });
  await expect(page.locator(".sidebar")).not.toHaveClass(/expanded/);
  await page.locator(".time-options>summary").click();
  await page.getByRole("button", { name: "Typical week", exact: true }).click();
  await page.getByLabel("Typical weekday").selectOption("5");
  await expect(page.locator(".time-mode-label")).toContainText(
    "Typical Friday",
  );
  await page.locator(".time-options>summary").click();
  await page.getByLabel("Switch to date", { exact: true }).fill("2026-10-30");
  await expect(page.getByLabel("Forecast date", { exact: true })).toHaveValue(
    "2026-10-30",
  );
});

test("comparison fourth addition requires an explicit focused replacement and never changes active destination", async ({
  page,
}) => {
  await loaded(page);
  const host = page.locator(".map-canvas");
  const active = await host.getAttribute("data-selected-id");
  const initial = await ids(page, "data-compared-ids");
  const third = page.locator(".compare-control input:not(:checked)").first();
  await third.check();
  const three = await ids(page, "data-compared-ids");
  expect(three).toHaveLength(3);
  await page.getByRole("button", { name: "All areas", exact: true }).click();
  const fourthCandidate = page
    .locator(".candidate-row")
    .filter({ has: page.locator("input:not(:checked)") })
    .first();
  const fourthId = await fourthCandidate
    .locator(".area-card")
    .getAttribute("data-cell-id");
  const fourth = page
    .locator(".candidate-row")
    .filter({ has: page.locator(`.area-card[data-cell-id="${fourthId}"]`) });
  await fourth.locator("input").click();
  const chooser = page.getByRole("region", {
    name: "Replace a comparison area",
  });
  await expect(chooser.getByRole("heading")).toBeFocused();
  expect(await ids(page, "data-compared-ids")).toEqual(three);
  await expect(host).toHaveAttribute("data-selected-id", active!);
  await chooser.getByRole("button", { name: /^Replace A/ }).click();
  const replaced = await ids(page, "data-compared-ids");
  expect(replaced).toContain(fourthId);
  expect(replaced).not.toContain(initial[0]);
  await expect(fourth.locator("input")).toBeFocused();
  await page.getByLabel("Close area details").click();
  expect(await ids(page, "data-compared-ids")).toEqual(replaced);
  await fourth.locator(".area-card").focus();
  await page.keyboard.press("Enter");
  await expect(page.locator(".detail-card h2")).toBeFocused();
  await expect(host).toHaveAttribute("data-selected-id", fourthId!);
  expect(await ids(page, "data-compared-ids")).toEqual(replaced);
  await page.getByLabel("Close area details").click();
  await expect(fourth.locator(".area-card")).toBeFocused();
});

test("filter and deliberate suggestion refresh retain compared IDs with honest outside-results notes", async ({
  page,
}) => {
  await loaded(page);
  const compared = await ids(page, "data-compared-ids");
  const active = await page
    .locator(".map-canvas")
    .getAttribute("data-selected-id");
  await page.getByLabel("Search areas or businesses").fill("no such place xyz");
  await expect(
    page.getByText("No supported areas found", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText("Compared outside these results:", { exact: false }),
  ).toBeVisible();
  expect(await ids(page, "data-compared-ids")).toEqual(compared);
  await expect(page.locator(".detail-card")).toContainText(
    "Outside current results",
  );
  await page
    .getByRole("button", { name: "Refresh suggestions", exact: true })
    .click();
  expect(await ids(page, "data-candidate-ids")).toEqual(
    expect.arrayContaining(compared),
  );
  await expect(page.locator(".map-canvas")).toHaveAttribute(
    "data-selected-id",
    active!,
  );
  await page.getByRole("button", { name: "Clear search", exact: true }).click();
  expect(await ids(page, "data-compared-ids")).toEqual(compared);
});

test("directions provider choice sends only the current graph destination and closes with keyboard focus", async ({
  page,
}) => {
  await loaded(page);
  const trigger = page.getByRole("button", { name: /^Directions/ });
  await trigger.click();
  const a = new URL(
    (await page
      .getByRole("link", { name: "Apple Maps" })
      .getAttribute("href"))!,
  );
  const g = new URL(
    (await page
      .getByRole("link", { name: "Google Maps" })
      .getAttribute("href"))!,
  );
  expect(a.protocol).toBe("https:");
  expect(g.protocol).toBe("https:");
  expect(a.searchParams.get("destination")).toBe(
    g.searchParams.get("destination"),
  );
  expect(a.searchParams.get("mode")).toBe("walking");
  expect(g.searchParams.get("travelmode")).toBe("walking");
  expect(a.searchParams.has("source")).toBe(false);
  expect(g.searchParams.has("origin")).toBe(false);
  await page.getByRole("link", { name: "Apple Maps" }).focus();
  await page.keyboard.press("Escape");
  await expect(trigger).toBeFocused();
  await expect(page.getByRole("link", { name: "Apple Maps" })).toHaveCount(0);
  await page.locator(".candidate-row").nth(1).locator(".area-card").click();
  await trigger.click();
  expect(
    new URL(
      (await page
        .getByRole("link", { name: "Apple Maps" })
        .getAttribute("href"))!,
    ).searchParams.get("destination"),
  ).not.toBe(a.searchParams.get("destination"));
});

for (const [width, height] of [
  [390, 844],
  [320, 640],
]) {
  test(`loaded phone map leaves every candidate clear of key and keeps outside-slot active identity at ${width}px`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height });
    await loaded(page);
    await expect(page.locator(".candidate-pin")).toHaveCount(3);
    const map = (await page.locator(".map-canvas").boundingBox())!,
      key = (await page.locator(".map-legend").boundingBox())!;
    expect(map.height).toBeGreaterThanOrEqual(220);
    const pinBoxes = await Promise.all(
      (await page.locator(".candidate-pin").all()).map((pin) =>
        pin.boundingBox(),
      ),
    );
    for (let i = 0; i < pinBoxes.length; i++)
      for (let j = i + 1; j < pinBoxes.length; j++) {
        const a = pinBoxes[i]!,
          b = pinBoxes[j]!;
        // Pins are circles: diagonally intersecting bounding squares are fine.
        expect(
          Math.hypot(
            a.x + a.width / 2 - b.x - b.width / 2,
            a.y + a.height / 2 - b.y - b.height / 2,
          ),
        ).toBeGreaterThanOrEqual((a.width + b.width) / 2);
      }
    for (const pin of await page.locator(".candidate-pin").all()) {
      const b = (await pin.boundingBox())!;
      expect(b.x).toBeGreaterThanOrEqual(map.x);
      expect(b.y).toBeGreaterThanOrEqual(map.y);
      expect(b.x + b.width).toBeLessThanOrEqual(map.x + map.width);
      expect(b.y + b.height).toBeLessThanOrEqual(map.y + map.height);
      expect(
        b.x < key.x + key.width &&
          b.x + b.width > key.x &&
          b.y < key.y + key.height &&
          b.y + b.height > key.y,
      ).toBe(false);
    }
    await page.getByLabel("Expand forecast panel").click();
    await page.getByRole("button", { name: "All areas", exact: true }).click();
    const row = page
      .locator(".candidate-row")
      .filter({ has: page.locator(".compare-control span", { hasText: "+" }) })
      .first();
    const name = await row.locator(".area-copy>strong").textContent();
    await row.locator(".area-card").click();
    await expect(page.locator(".detail-card h2")).toHaveText(name!);
    await expect(page.locator(".detail-card h2")).toBeInViewport({ ratio: 1 });
  });
}

test("doubled text keeps native time fields readable and offers an explicit map/places mode", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await loaded(page);
  // Stress text reflow independently of viewport zoom; snapshot sizes first so
  // inherited text is doubled once, including labels and native input text.
  await page.evaluate(() => {
    const sizes = [...document.querySelectorAll("body *")]
      .filter((e) => e instanceof HTMLElement && !e.closest(".map-canvas"))
      .map((e) => [e as HTMLElement, getComputedStyle(e).fontSize] as const);
    for (const [e, size] of sizes)
      e.style.fontSize = parseFloat(size) * 2 + "px";
  });
  await expect(page.locator(".app-shell")).toHaveClass(/compact-workspace/);
  await expect(page.getByLabel("Expand forecast panel")).toHaveText(
    /Show places/,
  );
  for (const label of ["Forecast date", "Forecast hour"]) {
    const field = page.getByLabel(label, { exact: true });
    const size = await field.evaluate((e) =>
      parseFloat(getComputedStyle(e).fontSize),
    );
    expect((await field.boundingBox())!.height).toBeGreaterThanOrEqual(size);
    await expect(field).toBeInViewport({ ratio: 1 });
  }
  await page.getByLabel("Expand forecast panel").click();
  await expect(page.locator(".area-card").first()).toBeVisible();
  await page.getByLabel("Collapse forecast panel").click();
  await expect(page.locator(".selected-disclosure")).toBeInViewport({
    ratio: 1,
  });
  // Coverage grows with text; the recenter action must follow its real width.
  const coverage = (await page
    .getByLabel("Show Southampton coverage")
    .boundingBox())!;
  const recenter = (await page
    .getByLabel("Recenter at starting point")
    .boundingBox())!;
  expect(coverage.x + coverage.width).toBeLessThanOrEqual(recenter.x);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
});

test("short landscape retains usable time, map and named places switch without clipped status", async ({
  page,
}) => {
  await page.setViewportSize({ width: 640, height: 390 });
  await loaded(page);
  await expect(page.locator(".app-shell")).toHaveClass(/compact-workspace/);
  await expect(
    page.getByLabel("Forecast date", { exact: true }),
  ).toBeInViewport({ ratio: 1 });
  await expect(
    page.getByLabel("Forecast hour", { exact: true }),
  ).toBeInViewport({ ratio: 1 });
  await expect(page.locator(".selected-disclosure")).toBeInViewport({
    ratio: 1,
  });
  expect(
    (await page.locator(".map-canvas").boundingBox())!.height,
  ).toBeGreaterThan(80);
  await page.getByLabel("Expand forecast panel").click();
  await expect(page.locator(".area-card").first()).toBeVisible();
  await page.getByLabel("Collapse forecast panel").click();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
});

test("autumn repeated hour choice stays directly reachable without phone overflow", async ({
  page,
}) => {
  await page.setViewportSize({ width: 320, height: 640 });
  await loaded(page);
  await page.getByLabel("Forecast date", { exact: true }).fill("2026-10-25");
  await page.getByLabel("Forecast hour", { exact: true }).selectOption("1");
  const fold = page.getByLabel("Repeated clock-change hour", { exact: true });
  await expect(fold).toBeInViewport({ ratio: 1 });
  await fold.selectOption("later");
  await expect(fold).toHaveValue("later");
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
});

test("phone advanced layer and assumptions remain visible after evidence closes, including short screens", async ({
  page,
}) => {
  for (const [width, height] of [
    [390, 844],
    [320, 640],
  ]) {
    await page.setViewportSize({ width, height });
    await loaded(page);
    const about = page
      .locator(".phone-footer")
      .getByRole("button", { name: "About this estimate", exact: true });
    await about.click();
    await page
      .getByRole("button", { name: "Assumptions", exact: true })
      .click();
    await page.getByLabel("Map view", { exact: true }).selectOption("uniform");
    await page
      .getByLabel("Assumption scenario", { exact: true })
      .selectOption("central");
    await page.keyboard.press("Escape");
    const status = page.locator(".phone-layer-status");
    await expect(status).toHaveText("Uniform baseline · central assumptions");
    await expect(status).toBeInViewport({ ratio: 1 });
    await about.click();
    await page
      .getByRole("button", { name: "Assumptions", exact: true })
      .click();
    await page.getByLabel("Map view", { exact: true }).selectOption("women");
    await page
      .getByLabel("Assumption scenario", { exact: true })
      .selectOption("sensitivity");
    await page.keyboard.press("Escape");
    await expect(status).toContainText("uniform resident prior");
    await expect(status).toContainText("sensitivity assumptions");
    await expect(status).toBeInViewport({ ratio: 1 });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
  }
});
