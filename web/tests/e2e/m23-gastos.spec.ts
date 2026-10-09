import { expect, test, type APIRequestContext } from "@playwright/test";
import { E2E, newRunId, route } from "./support/env";
import { apiAs, ensureActiveTerm, signIn } from "./support/api";
import { typedDate } from "./support/people";

/**
 * Gastos institucionales (M23) en el navegador: la pantalla `/expenses` con sus
 * totales y su tabla, el alta desde el diálogo, la cancelación con motivo y el
 * bloque de dinero del tablero de Inicio. Los números los verifica el contrato
 * de la API (`api/tests/e2e/m23-gastos.spec.ts`); aquí se prueba la pantalla.
 */
test.use({ storageState: { cookies: [], origins: [] } });

const RUN = newRunId();
const CONCEPT = `Renta E2E ${RUN}`;
let admin: APIRequestContext;
let expenseId: string;

test.beforeAll(async () => {
  admin = await apiAs(E2E.admin.username);
  // El tablero de Inicio (cuarta prueba) necesita un ciclo activo.
  await ensureActiveTerm(admin);
  const res = await admin.post("expenses", {
    data: { date: "2026-10-05", concept: CONCEPT, type: "SERVICES", vendor: "Inmobiliaria E2E", amount: 12345.5, status: "PAID" },
  });
  expect(res.status(), await res.text()).toBe(201);
  expenseId = (await res.json()).id;
});

test.afterAll(async () => {
  await admin.delete(`expenses/${expenseId}`, { data: { reason: "Limpieza de la suite" } }).catch(() => undefined);
  await admin.dispose();
});

test("ADMIN ve la pantalla de gastos con totales, tabla y filtros", async ({ page }) => {
  await signIn(page, E2E.admin.username);
  await page.goto(route("/expenses"));
  await expect(page.getByRole("heading", { name: "Gastos" })).toBeVisible();

  // Totales del ciclo y la tabla con el gasto de la corrida (se acota al renglón).
  await expect(page.getByText("TOTAL DEL CICLO")).toBeVisible();
  const row = page.locator("tr", { hasText: CONCEPT });
  await expect(row).toHaveCount(1);
  await expect(row.getByText("Inmobiliaria E2E")).toBeVisible();

  // Filtros propios de la tabla y el selector de ciclo del encabezado.
  await expect(page.locator('select[name="termId"]')).toBeVisible();
  await expect(page.getByText("Servicios").first()).toBeVisible();
});

test("ADMIN registra un gasto desde el diálogo y luego lo cancela con motivo", async ({ page }) => {
  const concept = `Servicio nuevo ${RUN}`;
  await signIn(page, E2E.admin.username);
  await page.goto(route("/expenses"));
  await page.getByRole("button", { name: "Nuevo gasto" }).click();

  const dialog = page.getByRole("dialog", { name: "Nuevo gasto" });
  await expect(dialog).toBeVisible();
  await dialog.locator('input[name="concept"]').fill(concept);
  await dialog.locator('input[name="amount"]').fill("4500.25");
  // El tipo es obligatorio y la fecha se teclea en el formato del componente.
  await dialog.locator('select[name="type"]').selectOption("SERVICES");
  await dialog.locator('input[name="date"]').fill(typedDate("2026-10-08"));
  await dialog.getByRole("button", { name: "Guardar" }).click();
  await expect(dialog).toBeHidden();
  await expect(page.getByText(concept)).toBeVisible();

  // Cancelación lógica: el gasto queda con estatus Cancelado, no desaparece.
  await page.getByRole("button", { name: `Cancelar gasto ${concept}` }).click();
  const reason = page.getByRole("dialog");
  await expect(reason).toBeVisible();
  await reason.locator('textarea[name="reason"]').fill("Prueba de la suite");
  await reason.getByRole("button", { name: "Cancelar gasto" }).click();
  await expect(reason).toBeHidden();
  await expect(page.getByText("Cancelado").first()).toBeVisible();
});

test("TEACHER no tiene acceso a gastos", async ({ page }) => {
  await signIn(page, E2E.teacher.username);
  await page.goto(route("/"));
  await expect(page.getByRole("link", { name: "Gastos" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Gastos" })).toHaveCount(0);
  // Sin permiso, la ruta no monta la pantalla del módulo.
  await page.goto(route("/expenses"));
  await expect(page.getByText("Gastos institucionales del ciclo: servicios, insumos, nómina y mantenimiento")).toHaveCount(0);
});

test("el tablero de Inicio muestra ingresos contra gastos con datos reales", async ({ page }) => {
  await signIn(page, E2E.control.username);
  await page.goto(route("/"));
  const board = page.locator("[data-role=dashboard]");
  // La gráfica y su leyenda: ahí viven los rótulos de dinero.
  const finance = page.locator("[data-role=dashboard-finance]");
  await expect(finance.getByText("Ingresos cobrados", { exact: true })).toBeVisible();
  await expect(finance.getByText("Gastos", { exact: true })).toBeVisible();
  await expect(board.getByRole("img", { name: "Ingresos vs. gastos" })).toBeVisible();
  await expect(board.getByText("Gastos por tipo")).toBeVisible();
  await expect(board.getByRole("button", { name: "Ver todo" }).first()).toBeVisible();
});
