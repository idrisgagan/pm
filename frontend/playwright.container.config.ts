import { defineConfig } from "@playwright/test";
import baseConfig from "./playwright.config";

// Same tests, run against the app in Docker. Start it first with
// scripts/start-<os>.
export default defineConfig({
  ...baseConfig,
  use: {
    ...baseConfig.use,
    baseURL: "http://127.0.0.1:8000",
  },
  webServer: undefined,
});
