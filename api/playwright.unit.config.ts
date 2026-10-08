import { defineConfig } from "@playwright/test";

/**
 * Runner unitario. A propósito NO toca Postgres ni levanta la API: solo evalúa
 * la lógica pura del núcleo de permisos y de seguridad. `env.config.ts` exige
 * DATABASE_URL/PORT/JWT_SECRET al importarse, así que se proveen valores
 * descartables aquí (el config se evalúa antes que los specs).
 */
process.env.NODE_ENV ??= "test";
process.env.PORT ??= "4000";
process.env.DATABASE_URL ??= "postgresql://cyc:cyc@localhost:5432/cyc_test?schema=public";
process.env.JWT_SECRET ??= "unit-test-secret";
process.env.JWT_EXPIRES_IN ??= "7d";
process.env.JWT_REFRESH_EXPIRES_IN ??= "30d";

export default defineConfig({
  testDir: "./tests/unit",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: 0,
  timeout: 15_000,
  expect: { timeout: 5_000 },
  reporter: [["list"]],
  use: { trace: "retain-on-failure" },
});
