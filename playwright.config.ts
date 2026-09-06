import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: "tests/browser",
  timeout: 30000,
  workers: 1,
  use: {
    baseURL: "http://127.0.0.1:5174",
    viewport: { width: 1440, height: 1050 },
    channel: process.env.ZMAP_BROWSER_CHANNEL || "chrome",
    trace: "retain-on-failure",
  },
  webServer: {
    command: "npm run dev",
    url: "http://127.0.0.1:5174",
    reuseExistingServer: true,
    timeout: 20000,
    env: {
      ZMAP_PORT: "5174",
      ZMAP_RELAY_PORT: "8788",
      ZMAP_DATA_DIR: ".data/browser-tests",
    },
  },
});
