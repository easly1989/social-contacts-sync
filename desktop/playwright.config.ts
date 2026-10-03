import { defineConfig } from "@playwright/test";

// Launches the packaged app (npm run pack) with Playwright's Electron support.
export default defineConfig({
  testDir: "./e2e",
  outputDir: "./e2e/.results",
  timeout: 60_000,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [["github"], ["list"]] : "list",
});
