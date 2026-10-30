import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { readFileSync } from "node:fs";
import { unpackDataset } from "../../src/lib/codec";
import { forecast } from "../../src/lib/model";
import { resolveTime } from "../../src/lib/time";
const data = unpackDataset(
  JSON.parse(readFileSync("public/data/southampton.json", "utf8")),
);
const scenarios = [
  ["Wednesday noon term", "2026-10-28", 12],
  ["Friday 18 term", "2026-10-30", 18],
  ["Friday 23 term", "2026-10-30", 23],
  ["Saturday 14", "2026-10-31", 14],
  ["Sunday 09", "2026-11-01", 9],
  ["Vacation Wednesday noon", "2026-12-23", 12],
] as const;
test.beforeEach(async ({ page }) => {
  // Separate remote-tile failure tests below exercise later tile failures too.
  await page.route("https://tiles.openfreemap.org/**", (route) =>
    route.abort(),
  );
});

for (const size of [
  { width: 1440, height: 1000 },
  { width: 390, height: 844 },
]) {
  test(`all six scenarios and geographic controls at ${size.width}px`, async ({
    page,
  }, info) => {
    await page.setViewportSize(size);
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await page.goto("./");
    await expect(
      page.getByRole("heading", { name: /Where Southampton/ }),
    ).toBeVisible();
    if (size.width < 720)
      await page.getByLabel("Expand forecast panel").click();
    await page
      .getByRole("button", { name: "Date & time", exact: true })
      .click();
    await page.getByLabel("Limit ranked list to walking distance").uncheck();
    const topIds: string[] = [];
    for (const [name, date, hour] of scenarios) {
      await page.getByLabel("Forecast date").fill(date);
      await page.getByLabel("Forecast hour").fill(String(hour));
      const expected = forecast(
        data,
        resolveTime(
          { mode: "date", date, hour, weekday: 1, typicalTerm: true },
          data,
        ),
        "general",
      ).cells[0];
      const first = page.locator(".area-card").first();
      await expect(first).toHaveAttribute("data-cell-id", expected.cell.id);
      await expect(first).toHaveAttribute("data-index", String(expected.index));
      expect(Number(await first.getAttribute("data-raw"))).toBeCloseTo(
        expected.activity,
        8,
      );
      topIds.push(expected.cell.id);
      await info.attach(name, {
        body: JSON.stringify({
          cell: expected.cell.id,
          raw: expected.activity,
          index: expected.index,
          rank: expected.rank,
        }),
        contentType: "application/json",
      });
    }
    expect(new Set(topIds).size).toBeGreaterThan(1);
    await page.getByLabel("Forecast date").fill("2026-10-28");
    await page.getByLabel("Forecast hour").fill("12");
    const map = page.locator(".map-canvas");
    await expect(map).toHaveAttribute("data-map-ready", "true", {
      timeout: 45000,
    });
    await expect(map).toHaveAttribute(
      "data-activity-cells",
      String(data.cells.length),
    );
    for (const campus of [
      "Highfield Campus",
      "Avenue Campus",
      "Boldrewood Innovation Campus",
      "Solent University",
    ]) {
      await page.getByLabel("Search areas or businesses").fill(campus);
      await expect(page.locator(".area-card").first()).toBeVisible();
      await expect(map).toHaveAttribute(
        "data-activity-cells",
        String(data.cells.length),
      );
    }
    await page
      .getByLabel("Search areas or businesses")
      .fill("Highfield Campus");
    await page.getByLabel("Limit ranked list to walking distance").check();
    await expect(page.locator(".area-card")).toHaveCount(0);
    await expect(map).toHaveAttribute(
      "data-activity-cells",
      String(data.cells.length),
    );
    await page.getByLabel("Limit ranked list to walking distance").uncheck();
    await expect(page.locator(".area-card").first()).toBeVisible();
    await page.locator(".area-card").first().click();
    const details = page.getByRole("article", {
      name: "Selected area details",
    });
    await expect(details).toBeVisible();
    await expect(details).toContainText("model units");
    const direction = details.getByRole("link", { name: /Walking directions/ });
    await expect(direction).toHaveAttribute(
      "href",
      /^https:\/\/www.google.com\/maps\/dir\/\?api=1&destination=50\./,
    );
    await expect(direction).toHaveAttribute("href", /travelmode=walking/);
    await expect(direction).toHaveAttribute("target", "_blank");
    await page.screenshot({
      path: `docs/audit/highfield-${size.width}.png`,
      animations: "disabled",
    });
    await details
      .getByRole("button", { name: "Start here", exact: true })
      .click();
    if (size.width < 720)
      await page.getByLabel("Expand forecast panel").click();
    await page.getByLabel("Limit ranked list to walking distance").check();
    await expect(page.locator(".area-card").first()).toBeVisible();
    await page.getByLabel("Clear search").click();
    const count10 = async () =>
      Number(await page.locator(".results-heading h2 span").innerText());
    await page.getByLabel("Walking limit").selectOption("10");
    const small = await count10();
    await page.getByLabel("Walking limit").selectOption("45");
    await expect.poll(count10).toBeGreaterThan(small);
    expect(errors).toEqual([]);
  });
}

test("layer, category, sort and term controls preserve raw totals where required", async ({
  page,
}) => {
  await page.goto("./");
  await page.getByRole("button", { name: "Typical week", exact: true }).click();
  await page.getByLabel("Typical weekday").selectOption("3");
  await page.getByLabel("Forecast hour").fill("12");
  const cards = () =>
    page.locator(".area-card").evaluateAll((rows) =>
      rows.map((r) => ({
        id: (r as HTMLElement).dataset.cellId,
        raw: (r as HTMLElement).dataset.raw,
        index: (r as HTMLElement).dataset.index,
        rank: Number((r as HTMLElement).dataset.rank),
      })),
    );
  const initial = await cards();
  for (const view of ["women", "uniform", "general"]) {
    await page.getByLabel("Map view", { exact: true }).selectOption(view);
    await expect.poll(cards).toEqual(initial);
  }
  await page.getByLabel("Assume university term time").uncheck();
  await expect.poll(cards).toEqual(initial);
  for (const day of ["1", "2", "3", "4", "5", "6", "7"])
    await page.getByLabel("Typical weekday").selectOption(day);
  await page.getByLabel("Typical weekday").selectOption("3");
  for (const name of [
    "Shopping",
    "Cafés & food",
    "Leisure & parks",
    "Fitness",
    "Transport",
  ]) {
    await page.getByRole("button", { name, exact: true }).click();
    await expect(
      page.getByRole("button", { name, exact: true }),
    ).toHaveAttribute("aria-pressed", "true");
    const now = await cards();
    for (const row of now) {
      const before = initial.find((r) => r.id === row.id);
      if (before) expect(row.raw).toBe(before.raw);
    }
    await page.getByRole("button", { name, exact: true }).click();
    await expect.poll(cards).toEqual(initial);
  }
  expect(
    initial.every((r, i) => i === 0 || r.rank >= initial[i - 1].rank),
  ).toBe(true);
});

test("map pan, zoom, cell click and overview retain all coverage", async ({
  page,
}) => {
  await page.goto("./");
  const host = page.locator(".map-canvas");
  await expect(host).toHaveAttribute("data-activity-loaded", "true", {
    timeout: 45000,
  });
  const screenshotBefore = await host.screenshot();
  await page.getByRole("button", { name: "Zoom in", exact: true }).click();
  const b = (await host.boundingBox())!;
  await page.mouse.move(b.x + b.width * 0.55, b.y + b.height * 0.5);
  await page.mouse.down();
  await page.mouse.move(b.x + b.width * 0.7, b.y + b.height * 0.62, {
    steps: 12,
  });
  await page.mouse.up();
  await page.getByLabel("Show Southampton coverage").click();
  await expect(host).toHaveAttribute(
    "data-activity-cells",
    String(data.cells.length),
  );
  // Real hit-testing: try unoccluded positions until a source-backed cell is hit.
  for (const [x, y] of [
    [0.55, 0.45],
    [0.45, 0.4],
    [0.6, 0.55],
    [0.35, 0.5],
    [0.5, 0.6],
  ]) {
    await page.mouse.click(b.x + b.width * x, b.y + b.height * y);
    if (
      await page
        .getByRole("article", { name: "Selected area details" })
        .isVisible()
    )
      break;
  }
  await expect(
    page.getByRole("article", { name: "Selected area details" }),
  ).toBeVisible();
  expect((await host.screenshot()).equals(screenshotBefore)).toBe(false);
  await page.screenshot({
    path: "docs/audit/map-interaction.png",
    animations: "disabled",
  });
});

test("successful remote style followed by tile failure restores cached paths", async ({
  page,
}) => {
  await page.unroute("https://tiles.openfreemap.org/**");
  await page.route("https://tiles.openfreemap.org/**", (route) => {
    if (route.request().url().includes("/styles/"))
      return route.fulfill({
        json: {
          version: 8,
          sources: {
            broken: {
              type: "raster",
              tiles: ["https://tiles.openfreemap.org/audit/{z}/{x}/{y}.png"],
              tileSize: 256,
            },
          },
          layers: [{ id: "broken", type: "raster", source: "broken" }],
        },
      });
    return route.abort();
  });
  await page.goto("./");
  await expect(
    page.getByText(/Basemap unavailable.*cached public path/),
  ).toBeVisible();
  await expect(page.locator(".map-canvas")).toHaveAttribute(
    "data-activity-loaded",
    "true",
    { timeout: 45000 },
  );
  await expect(page.locator(".map-canvas")).toHaveAttribute(
    "data-map-layers",
    "4",
  );
  await page.screenshot({
    path: "docs/audit/tile-failure.png",
    animations: "disabled",
  });
});

test("unmodelled coverage is explicit; arbitrary searches do not hide the map", async ({
  page,
}) => {
  await page.goto("./");
  await page.getByLabel("Limit ranked list to walking distance").uncheck();
  await page.getByLabel("Search areas or businesses").fill("no-such-place-xyz");
  await expect(page.locator(".area-card")).toHaveCount(0);
  await expect(page.locator(".map-canvas")).toHaveAttribute(
    "data-activity-cells",
    String(data.cells.length),
    { timeout: 45000 },
  );
  await page.getByLabel("Search areas or businesses").fill("Avenue Campus");
  const gap = page
    .locator(".area-card")
    .filter({ hasText: "Activity not modelled" })
    .first();
  if (await gap.count()) {
    await gap.click();
    await expect(
      page.getByRole("article", { name: "Selected area details" }),
    ).toContainText("coverage gap");
  } else {
    const id = data.cells.find((c) => !c.venueIds.length)!.id;
    await page.getByLabel("Clear search").click();
    while (!(await page.locator(`[data-cell-id="${id}"]`).count()))
      await page.getByRole("button", { name: "Show more areas" }).click();
    await page.locator(`[data-cell-id="${id}"]`).click();
    await expect(
      page.getByRole("article", { name: "Selected area details" }),
    ).toContainText("coverage gap");
  }
});

test("malformed dataset and empty date input have recoverable errors", async ({
  page,
}) => {
  await page.route("**/data/southampton.json", (route) =>
    route.fulfill({
      json: {
        version: "broken",
        cells: [{}],
        graph: { nodes: [{}], edges: [] },
      },
    }),
  );
  await page.goto("./");
  await expect(
    page.getByRole("heading", { name: "We couldn’t load Southampton" }),
  ).toBeVisible();
  await page.unroute("**/data/southampton.json");
  await page.getByRole("button", { name: "Try again" }).click();
  await page.getByRole("button", { name: "Date & time", exact: true }).click();
  await page.getByLabel("Forecast date").fill("");
  await expect(page.getByRole("alert")).toHaveText(
    "Choose a valid date and hour.",
  );
  await page.getByLabel("Forecast date").fill("2026-10-28");
  await expect(page.getByRole("alert")).toHaveCount(0);
  await expect(page.locator(".area-card").first()).toBeVisible();
});

test("selected hourly chart uses the selected assumption scenario", async ({
  page,
}) => {
  await page.goto("./");
  await page.getByRole("button", { name: "Date & time", exact: true }).click();
  await page.getByLabel("Forecast date").fill("2026-10-28");
  await page.getByLabel("Forecast hour").fill("12");
  const id = await page
    .locator(".area-card")
    .first()
    .getAttribute("data-cell-id");
  await page.locator(".area-card").first().click();
  await page.getByRole("button", { name: "About the model" }).click();
  await page.getByLabel("Assumption scenario").selectOption("sensitivity");
  await page.keyboard.press("Escape");
  const time = resolveTime(
    {
      mode: "date",
      date: "2026-10-28",
      hour: 12,
      weekday: 3,
      typicalTerm: true,
    },
    data,
  );
  const cell = forecast(data, time, "general", "sensitivity").cells.find(
    (c) => c.cell.id === id,
  )!;
  await expect(
    page.getByLabel("Select 12:00", { exact: true }),
  ).toHaveAttribute(
    "title",
    `12:00 · ${cell.activity.toFixed(2)} relative units`,
  );
});

test("dark theme, selected detail and information dialog accessibility", async ({
  page,
}, info) => {
  await page.emulateMedia({ colorScheme: "dark", reducedMotion: "reduce" });
  await page.goto("./");
  await expect(page.locator(".map-canvas")).toHaveAttribute(
    "data-map-ready",
    "true",
    { timeout: 45000 },
  );
  await page.getByRole("button", { name: "Date & time", exact: true }).click();
  await page.getByLabel("Forecast date").fill("2026-10-28");
  await page.getByLabel("Forecast hour").fill("12");
  await page.locator(".area-card").first().click();
  const detail = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
    .analyze();
  await info.attach("dark-detail-accessibility", {
    body: JSON.stringify(detail.violations, null, 2),
    contentType: "application/json",
  });
  await page.screenshot({
    path: "docs/audit/dark-detail.png",
    animations: "disabled",
  });
  await page.getByLabel("Close area details").click();
  await page.getByRole("button", { name: "About the model" }).click();
  const dialog = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
    .analyze();
  await info.attach("dark-dialog-accessibility", {
    body: JSON.stringify(dialog.violations, null, 2),
    contentType: "application/json",
  });
  expect(detail.violations).toEqual([]);
  expect(dialog.violations).toEqual([]);
});

for (const mobile of [false, true]) {
  test(`accessibility scan and keyboard dialog ${mobile ? "mobile" : "desktop"}`, async ({
    page,
  }, info) => {
    await page.setViewportSize(
      mobile ? { width: 390, height: 844 } : { width: 1440, height: 1000 },
    );
    await page.goto("./");
    await expect(
      page.getByRole("heading", { name: /Where Southampton/ }),
    ).toBeVisible();
    if (mobile) await page.getByLabel("Expand forecast panel").click();
    await expect(page.locator(".map-canvas")).toHaveAttribute(
      "data-map-ready",
      "true",
      { timeout: 45000 },
    );
    const scan = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
      .analyze();
    await info.attach("accessibility", {
      body: JSON.stringify(scan.violations, null, 2),
      contentType: "application/json",
    });
    await page.getByRole("button", { name: "About the model" }).focus();
    await page.keyboard.press("Enter");
    await expect(
      page.getByRole("dialog", { name: "An experiment, explained." }),
    ).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(
      page.getByRole("button", { name: "About the model" }),
    ).toBeFocused();
    expect(scan.violations).toEqual([]);
  });
}
