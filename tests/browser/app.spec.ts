import { test, expect } from "@playwright/test";
test("desktop forecasts, filters, explanations and saved areas", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("./");
  await expect(
    page.getByRole("heading", { name: /Where Southampton/ }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Date & time", exact: true }).click();
  await page.getByLabel("Forecast date").fill("2026-10-30");
  await page.getByLabel("Forecast hour").fill("15");
  await expect(page.locator(".area-card").first()).toBeVisible();
  const firstScore = await page
    .locator(".area-card .index-pill")
    .first()
    .textContent();
  await page.getByLabel("Map view", { exact: true }).selectOption("general");
  await expect(page.locator(".area-card .index-pill").first()).toHaveText(
    firstScore!,
  );
  await page.getByRole("button", { name: "Cafés & food", exact: true }).click();
  await expect(
    page.getByText(
      "Matching areas first. Total activity scores stay unchanged.",
    ),
  ).toBeVisible();
  await page.locator(".area-card").first().click();
  await expect(
    page.getByRole("article", { name: "Selected area details" }),
  ).toBeVisible();
  await page.getByLabel("Save selected area").click();
  await expect(page.getByLabel("Save selected area")).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await page.getByLabel("Close area details").click();
  await page.getByRole("button", { name: "About the model" }).click();
  await expect(
    page.getByRole("heading", { name: "An experiment, explained." }),
  ).toBeVisible();
  await page.getByLabel("Assumption scenario").selectOption("sensitivity");
  await page.keyboard.press("Escape");
  await expect(page.locator("dialog")).not.toBeVisible();
  await page.evaluate(() => {
    document.querySelector(".sidebar-scroll")!.scrollTop = 0;
  });
  await page.screenshot({
    path: "test-results/desktop.png",
    fullPage: true,
    animations: "disabled",
  });
  expect(errors).toEqual([]);
});
test("mobile controls, UK clock-change error and no overflow", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("./");
  await expect(
    page.getByRole("heading", { name: /Where Southampton/ }),
  ).toBeVisible();
  await page.getByLabel("Expand forecast panel").click();
  await page.getByRole("button", { name: "Date & time", exact: true }).click();
  await page.getByLabel("Forecast date").fill("2026-03-29");
  await page.getByLabel("Forecast hour").fill("1");
  await expect(page.getByRole("alert")).toContainText("does not exist");
  await page.getByLabel("Forecast hour").fill("15");
  await expect(page.locator(".area-card").first()).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  await page.getByLabel("Collapse forecast panel").click();
  await page.screenshot({
    path: "test-results/mobile.png",
    fullPage: true,
    animations: "disabled",
  });
});
test("dataset failure is explicit and never replaced by demo data", async ({
  page,
}) => {
  await page.route("**/data/southampton.json", (route) =>
    route.fulfill({ status: 503, body: "Unavailable" }),
  );
  await page.goto("./");
  await expect(
    page.getByRole("heading", { name: "We couldn’t load Southampton" }),
  ).toBeVisible();
  await expect(
    page.getByText(/No sample data has been substituted/),
  ).toBeVisible();
});
test("location is requested only on demand, denial and unavailable storage remain usable", async ({
  page,
}) => {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, "geolocation", {
      value: {
        getCurrentPosition: (_success: unknown, error: () => void) => {
          (window as any).__locationCalls =
            ((window as any).__locationCalls ?? 0) + 1;
          error();
        },
      },
    });
    Storage.prototype.setItem = () => {
      throw new Error("Storage blocked");
    };
  });
  await page.goto("./");
  await expect(
    page.getByRole("heading", { name: /Where Southampton/ }),
  ).toBeVisible();
  expect(await page.evaluate(() => (window as any).__locationCalls ?? 0)).toBe(
    0,
  );
  await page.getByLabel("Use my location").click();
  await expect(
    page.getByText(
      "Location was not available. Your starting point has not changed.",
    ),
  ).toBeVisible();
  expect(await page.evaluate(() => (window as any).__locationCalls)).toBe(1);
  await expect(
    page.getByText(
      "Browser storage is unavailable. Preferences work for this visit.",
    ),
  ).toBeAttached();
});
