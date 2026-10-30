import { defineConfig } from "@playwright/test";
const existingUrl = process.env.FIELDNOTES_TEST_URL;
export default defineConfig({
  testDir: "./tests/browser",
  use: {
    baseURL: existingUrl ?? "http://127.0.0.1:5174",
    channel: "msedge",
    headless: true,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  webServer: existingUrl
    ? undefined
    : {
        command: "npm run preview -- --port 5174",
        url: "http://127.0.0.1:5174",
        reuseExistingServer: true,
        timeout: 30000,
      },
  workers: 1,
  timeout: 60000,
  reporter: [
    ["list"],
    ["json", { outputFile: "docs/audit/browser-results.json" }],
  ],
});
