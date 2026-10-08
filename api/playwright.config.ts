import { defineConfig } from "@playwright/test";
import { E2E } from "./tests/e2e/support/env";

const PORT = process.env.PORT ?? "4000";

export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: false,
  workers: 1,

  forbidOnly: !!process.env.CI,
  retries: 0,
  timeout: 30_000,
  expect: { timeout: 10_000 },

  reporter: [["list"], ["html", { outputFolder: "playwright-report", open: "never" }]],

  use: {
    baseURL: E2E.baseURL,
    extraHTTPHeaders: { "Content-Type": "application/json" },
    trace: "retain-on-failure",
  },

  // Si la API ya está corriendo en local, se reutiliza; si no, Playwright la
  // levanta con `npm run dev` y espera al health check.
  webServer: {
    command: "npm run dev",
    url: `http://localhost:${PORT}/api/v1/health`,
    reuseExistingServer: true,
    timeout: 90_000,
    stdout: "ignore",
    stderr: "pipe",
  },
});
