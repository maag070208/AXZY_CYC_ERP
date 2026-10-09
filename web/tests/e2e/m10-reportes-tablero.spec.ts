import { expect, test } from "@playwright/test";
import { E2E, route } from "./support/env";
import { apiAs, ensureActiveTerm, signIn } from "./support/api";
import { typedDate } from "./support/people";

/**
 * Reportes y tablero (M10) en el navegador: KPIs y gráficas en Inicio,
 * consulta de un reporte y exportación con los filtros vigentes; el profesor
 * no ve montos.
 */
test.use({ storageState: { cookies: [], origins: [] } });

// El tablero de Inicio solo pinta indicadores con un ciclo activo.
test.beforeAll(async () => {
  const admin = await apiAs(E2E.admin.username);
  await ensureActiveTerm(admin);
  await admin.dispose();
});

test("Inicio muestra el tablero con KPIs y gráficas", async ({ page }) => {
  await signIn(page, E2E.control.username);
  await page.goto(route("/"));
  const kpis = page.locator("[data-role=dashboard-kpis]");
  await expect(kpis.getByText("Alumnos inscritos")).toBeVisible();
  await expect(kpis.getByText("Adeudo vencido")).toBeVisible();
  // El bloque financiero está; su contenido depende de que el ciclo tenga movimientos.
  const finance = page.locator("[data-role=dashboard-finance]");
  await expect(finance.getByText("Ingresos vs. gastos")).toBeVisible();
  await expect(finance.getByText("Alumnos por nivel")).toBeVisible();
});

test("consulta el reporte de inscripciones y lo exporta a Excel y PDF", async ({ page }) => {
  await signIn(page, E2E.control.username);
  await page.goto(route("/reports"));
  await expect(page.getByText("Elige un reporte y consulta")).toBeVisible();
  await page.locator('select[name="report"]').selectOption("enrollments-by-group");
  await page.getByRole("button", { name: "Consultar" }).click();
  await expect(page.getByRole("heading", { name: "Inscripciones por grupo" }).or(page.getByText("Inscripciones por grupo").last())).toBeVisible();
  await expect(page.getByText(/\d+ registro\(s\)/).first()).toBeVisible();

  const xlsx = page.waitForEvent("download");
  await page.getByRole("button", { name: "Excel" }).click();
  expect((await xlsx).suggestedFilename()).toMatch(/^enrollments-by-group-.+\.xlsx$/);
  const pdf = page.waitForEvent("download");
  await page.getByRole("button", { name: "PDF" }).click();
  expect((await pdf).suggestedFilename()).toMatch(/^enrollments-by-group-.+\.pdf$/);
});

test("validación: rango invertido muestra el error de la API", async ({ page }) => {
  await signIn(page, E2E.control.username);
  await page.goto(route("/reports"));
  await page.locator('select[name="report"]').selectOption("payments-period");
  await page.locator('input[name="from"]').fill(typedDate("2026-02-10"));
  await page.locator('input[name="to"]').fill(typedDate("2026-01-01"));
  await page.getByRole("button", { name: "Consultar" }).click();
  await expect(page.getByText("La fecha inicial no puede ser posterior a la final")).toBeVisible();
});

test("el profesor ve el tablero sin montos y no tiene reportes de dinero", async ({ page }) => {
  await signIn(page, E2E.teacher.username);
  await page.goto(route("/"));
  const kpis = page.locator("[data-role=dashboard-kpis]");
  await expect(kpis.getByText("Alumnos inscritos")).toBeVisible();
  for (const label of ["Ingresos cobrados", "Gastos", "Adeudo vencido", "Morosidad"]) {
    await expect(page.getByText(label, { exact: true })).toHaveCount(0);
  }
  await page.goto(route("/reports"));
  const options = await page.locator('select[name="report"] option').allInnerTexts();
  expect(options.join("|")).not.toContain("Adeudos");
  expect(options.join("|")).toContain("Inscripciones por grupo");
});
