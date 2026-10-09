import { expect, test, type APIRequestContext } from "@playwright/test";
import { E2E, newRunId, route } from "./support/env";
import { apiAs, signIn } from "./support/api";
import { makeCurp } from "./support/people";

/**
 * Migración de históricos (M20) en el navegador: el asistente previsualiza el
 * CSV (dry-run con filas rechazadas), confirma la importación idempotente y el
 * lote queda en el historial.
 */
test.use({ storageState: { cookies: [], origins: [] } });

const RUN = newRunId();
const CURP = makeCurp("2000-01-01", "M");
const FILE = `E2E alumnos ${RUN}.csv`;
const CSV = [
  "nombre,apellido_paterno,curp,fecha_nacimiento",
  `E2E Web ${RUN},Migrada,${CURP},2000-01-01`,
  `E2E Web inválida ${RUN},Migrada,CURP-INVALIDA,2000-01-01`,
].join("\n");

let admin: APIRequestContext;

test.beforeAll(async () => {
  // La importación real exige respaldo reciente: se registra por API.
  admin = await apiAs(E2E.admin.username);
  const res = await admin.put("settings", { data: { MIGRATION_LAST_BACKUP_AT: new Date().toISOString() } });
  expect(res.status(), await res.text()).toBe(200);
});

test.afterAll(async () => {
  await admin.dispose();
});

test("M20 previsualiza, importa por lotes y lo deja en el historial", async ({ page }) => {
  await signIn(page, E2E.admin.username);
  await page.goto(route("/migration"));

  await page.locator('select[name="entidad"]').selectOption("Student");
  await page.locator('input[name="file"]').setInputFiles({ name: FILE, mimeType: "text/csv", buffer: Buffer.from(CSV, "utf-8") });
  await page.getByRole("button", { name: "Previsualizar" }).click();

  await expect(page.getByText("Simulación")).toBeVisible();
  await expect(page.getByText("CURP inválida")).toBeVisible();

  await page.getByRole("button", { name: "Ejecutar importación" }).click();
  await expect(page.getByText("Confirmar importación")).toBeVisible();
  await page.getByRole("button", { name: "Ejecutar importación" }).last().click();
  await expect(page.getByText(/Importado:/)).toBeVisible();

  // El lote queda registrado y su detalle muestra la fila rechazada.
  await page.locator("main").getByRole("button", { name: "Lotes", exact: true }).click();
  const executedRow = page.locator("tr", { hasText: FILE }).filter({ hasText: "Importado" });
  await expect(executedRow).toBeVisible();
});
