import { defineConfig, devices } from "@playwright/test";
import { E2E, healthUrl } from "./tests/e2e/support/env";

const PUERTO_WEB = new URL(E2E.webUrl).port || "5173";

export default defineConfig({
  testDir: "./tests/e2e",
  globalTeardown: "./tests/e2e/support/global-teardown.ts",

  // Serie a propósito: los tests comparten la base real, y las altas de usuario
  // y sus consecutivos no toleran dos corridas concurrentes.
  fullyParallel: false,
  workers: 1,

  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  timeout: 60_000,
  expect: { timeout: 15_000 },

  reporter: [["list"], ["html", { outputFolder: "playwright-report", open: "never" }]],

  use: {
    baseURL: E2E.webUrl,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
    // La app escribe en español; fijarlo evita diferencias de formato.
    locale: "es-MX",
    // Mismo huso que resuelve la API por defecto (`America/Mexico_City`).
    timezoneId: "America/Mexico_City",
  },

  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],

  // Los dos servidores reales: la API y la app. Si ya están corriendo, se
  // reutilizan; si no, Playwright los levanta y espera a que respondan.
  webServer: [
    {
      command: "npm run dev",
      cwd: "../api",
      url: healthUrl,
      reuseExistingServer: true,
      timeout: 90_000,
      stdout: "ignore",
      stderr: "pipe",
    },
    {
      command: "npm run dev",
      url: `http://localhost:${PUERTO_WEB}`,
      reuseExistingServer: true,
      timeout: 120_000,
      stdout: "ignore",
      stderr: "pipe",
    },
  ],
});
