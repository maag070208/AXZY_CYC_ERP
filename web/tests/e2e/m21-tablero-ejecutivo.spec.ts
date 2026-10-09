import { expect, test, type APIRequestContext } from "@playwright/test";
import { E2E, newRunId, route } from "./support/env";
import { apiAs, signIn } from "./support/api";

/**
 * Tablero ejecutivo (M21) en el navegador: indicadores del ciclo elegido,
 * bloque de cobranza solo con alcance institucional y acceso desde el menú.
 * Los números los verifica el contrato de la API; aquí se prueba la pantalla.
 */
test.use({ storageState: { cookies: [], origins: [] } });

const RUN = newRunId();
const TERM = `E2E Ejecutivo ${RUN}`;
let admin: APIRequestContext;

test.beforeAll(async () => {
  admin = await apiAs(E2E.admin.username);
  const term = await admin.post("terms", { data: { name: TERM, startDate: "1991-01-01", endDate: "1991-06-30" } });
  expect(term.status(), await term.text()).toBe(201);
});

test.afterAll(async () => {
  await admin.dispose();
});

test("SCHOOL_CONTROL abre el tablero ejecutivo desde el menú y ve indicadores académicos y de cobranza", async ({ page }) => {
  await signIn(page, E2E.control.username);
  await page.goto(route("/"));
  await page.getByRole("link", { name: "Tablero ejecutivo" }).or(page.getByRole("button", { name: "Tablero ejecutivo" })).first().click();
  await expect(page).toHaveURL(/#\/executive$/);
  await expect(page.getByRole("navigation", { name: "Breadcrumb" })).toContainText("Tablero ejecutivo");

  await page.locator('select[name="termId"]').selectOption({ label: TERM });
  const board = page.locator("[data-role=executive-dashboard]");
  for (const label of ["Matrícula", "Deserción", "Aprobación", "Promedio general", "Ocupación"]) {
    await expect(board.getByText(label, { exact: true })).toBeVisible();
  }
  const finance = board.locator("[data-role=executive-finance]");
  await expect(finance.getByText("Morosidad", { exact: true })).toBeVisible();
  await expect(finance.getByText("Adeudo vencido", { exact: true })).toBeVisible();
  await expect(board.getByRole("img", { name: "Tendencia de inscripciones" })).toBeVisible();

  await page.getByRole("button", { name: "Ver reportes de detalle" }).click();
  await expect(page).toHaveURL(/#\/reports$/);
  await expect(page.locator('select[name="report"] option', { hasText: "Deserción por grupo" })).toHaveCount(1);
});

test("TEACHER ve sus indicadores académicos, sin cobranza", async ({ page }) => {
  await signIn(page, E2E.teacher.username);
  await page.goto(route("/executive"));
  const board = page.locator("[data-role=executive-dashboard]").or(page.getByText("No hay un ciclo activo"));
  await expect(board.first()).toBeVisible();
  await expect(page.locator("[data-role=executive-finance]")).toHaveCount(0);
  await expect(page.locator('select[name="report"]')).toHaveCount(0);
});
