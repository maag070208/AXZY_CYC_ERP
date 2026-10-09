import { expect, test, type APIRequestContext } from "@playwright/test";
import { E2E, newRunId, route } from "./support/env";
import { apiAs, ensureActiveTerm, signIn } from "./support/api";

/**
 * Tablero de Inicio (M21 ampliado + M23) en el navegador: indicadores
 * académicos y financieros del ciclo, alertas, filtros y bloque de dinero solo
 * con alcance institucional. Los números los verifica el contrato de la API;
 * aquí se prueba la pantalla.
 */
test.use({ storageState: { cookies: [], origins: [] } });

const RUN = newRunId();
const TERM = `E2E Inicio ${RUN}`;
let admin: APIRequestContext;

test.beforeAll(async () => {
  admin = await apiAs(E2E.admin.username);
  await ensureActiveTerm(admin);
  const term = await admin.post("terms", { data: { name: TERM, startDate: "1991-01-01", endDate: "1991-06-30" } });
  expect(term.status(), await term.text()).toBe(201);
});

test.afterAll(async () => {
  await admin.dispose();
});

test("SCHOOL_CONTROL ve el tablero de Inicio con indicadores, alertas y filtros", async ({ page }) => {
  await signIn(page, E2E.control.username);
  await page.goto(route("/"));
  const board = page.locator("[data-role=dashboard]");
  const kpis = page.locator("[data-role=dashboard-kpis]");
  for (const label of ["Alumnos inscritos", "Ocupación de grupos", "Promedio general"]) {
    await expect(kpis.getByText(label, { exact: true })).toBeVisible();
  }
  // Con alcance institucional aparece el bloque financiero y el indicador de dinero.
  const finance = page.locator("[data-role=dashboard-finance]");
  await expect(finance.getByText("Ingresos vs. gastos")).toBeVisible();
  await expect(kpis.getByText("Adeudo vencido", { exact: true })).toBeVisible();
  // Los paneles están siempre; las gráficas pintan cuando el ciclo tiene datos.
  await expect(finance.getByText("Alumnos por nivel")).toBeVisible();
  await expect(board.getByText("Rendimiento académico por grupo")).toBeVisible();
  await expect(board.getByText("Alumnos con mayor riesgo")).toBeVisible();
  await expect(page.locator("[data-role=dashboard-alerts]")).toBeVisible();

  // Los filtros del tablero viven en Inicio.
  for (const name of ["termId", "levelId", "courseId", "groupId"]) {
    await expect(page.locator(`select[name="${name}"]`)).toBeVisible();
  }
  await page.locator('select[name="termId"]').selectOption({ label: TERM });
  await expect(board.getByText("Alumnos inscritos", { exact: true })).toBeVisible();
});

test("TEACHER ve sus indicadores académicos y ninguna cifra de dinero", async ({ page }) => {
  await signIn(page, E2E.teacher.username);
  await page.goto(route("/"));
  const board = page.locator("[data-role=dashboard]").or(page.getByText("No hay un ciclo activo"));
  await expect(board.first()).toBeVisible();
  for (const label of ["Ingresos cobrados", "Gastos", "Adeudo vencido", "Morosidad", "Cartera del ciclo", "Pagos recientes"]) {
    await expect(page.getByText(label, { exact: true })).toHaveCount(0);
  }
  // Su cuarto indicador es operativo (grupos en alerta), no de dinero.
  await expect(page.locator("[data-role=dashboard-kpis]").getByText("Grupos en alerta")).toBeVisible();
});

test("el tablero ejecutivo ya no es una pantalla aparte del menú", async ({ page }) => {
  await signIn(page, E2E.control.username);
  await page.goto(route("/"));
  await expect(page.getByRole("link", { name: "Tablero ejecutivo" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Tablero ejecutivo" })).toHaveCount(0);
});
