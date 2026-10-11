import { defineConfig } from "@playwright/test";
import {
  baseURL,
  testPort,
  relayPort,
  actionPort,
} from "./tests/helpers/fixture-ports";
export default defineConfig({
  testDir: "tests/browser",
  timeout: 30000,
  workers: 1,
  use: {
    baseURL,
    viewport: { width: 1440, height: 1050 },
    channel: process.env.ZMAP_BROWSER_CHANNEL || "chrome",
    trace: {
      mode: "retain-on-failure",
      screenshots: process.env.ZMAP_TRACE_SCREENSHOTS !== "0",
    },
  },
  webServer: {
    command: "npm run dev",
    url: baseURL,
    reuseExistingServer: false,
    timeout: 20000,
    env: {
      ZMAP_PORT: String(testPort),
      ZMAP_RELAY_PORT: String(relayPort),
      ZMAP_ACTION_PORT: String(actionPort),
      ZMAP_DATA_DIR: ".data/browser-tests",
    },
  },
});
