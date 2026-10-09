import { expect, test, type APIRequestContext, type Page } from "@playwright/test";
import { E2E, newRunId, route } from "./support/env";
import { apiAs, signIn } from "./support/api";

/**
 * M11 en el navegador: edición de parámetros generales y CRUD de un catálogo
 * (motivos de baja), más la vista de solo lectura de CONTROL_ESCOLAR.
 */
test.use({ storageState: { cookies: [], origins: [] } });

const RUN = newRunId();
const REASON = `E2E Motivo ${RUN}`;

let admin: APIRequestContext;
let original: Record<string, unknown>;

test.beforeAll(async () => {
  admin = await apiAs(E2E.admin.username);
  const settings: Array<{ key: string; value: unknown }> = await (await admin.get("settings")).json();
  original = Object.fromEntries(settings.map((s) => [s.key, s.value]));
});

test.afterAll(async () => {
  await admin.put("settings", {
    data: {
      SCHOOL_NAME: original.SCHOOL_NAME,
      MIN_PASSING_GRADE: original.MIN_PASSING_GRADE,
      LATE_FEE: original.LATE_FEE,
    },
  });
  await admin.dispose();
});

const row = (page: Page, text: string) => page.locator("tr", { hasText: text });

test("ADMIN edita parámetros generales y persisten", async ({ page }) => {
  await signIn(page, E2E.admin.username);
  await page.goto(route("/settings"));

  const name = page.locator('input[name="SCHOOL_NAME"]');
  await expect(name).toHaveValue(String(original.SCHOOL_NAME));
  await name.fill(`CYC E2E ${RUN}`);
  await page.locator('input[name="MIN_PASSING_GRADE"]').fill("65");
  await page.getByText("Aplicar recargos por mora").click();
  await page.getByRole("button", { name: "Guardar" }).click();
  await expect(page.getByText("Configuración guardada")).toBeVisible();

  await page.reload();
  await expect(page.locator('input[name="SCHOOL_NAME"]')).toHaveValue(`CYC E2E ${RUN}`);
  await expect(page.locator('input[name="MIN_PASSING_GRADE"]')).toHaveValue("65");

  const settings: Array<{ key: string; value: unknown }> = await (await admin.get("settings")).json();
  const lateFee = settings.find((s) => s.key === "LATE_FEE")?.value as { enabled: boolean };
  expect(lateFee.enabled).toBe(!(original.LATE_FEE as { enabled: boolean }).enabled);
});

test("ADMIN da de alta, edita y desactiva un motivo de baja", async ({ page }) => {
  await signIn(page, E2E.admin.username);
  await page.goto(route("/catalogs"));
  await page.getByRole("button", { name: "Motivos de baja", exact: true }).click();

  await page.getByRole("button", { name: "Nuevo", exact: true }).click();
  let dialog = page.getByRole("dialog");
  await dialog.getByRole("button", { name: "Guardar" }).click();
  await expect(dialog.getByText("El nombre es obligatorio")).toBeVisible();
  await dialog.locator('input[name="nombre"]').fill(REASON);
  await dialog.getByRole("button", { name: "Guardar" }).click();
  await expect(page.getByText("Registro creado")).toBeVisible();

  await page.getByPlaceholder("Buscar...").first().fill(RUN);
  await expect(row(page, REASON)).toBeVisible();

  await page.getByRole("button", { name: `Editar ${REASON}` }).click();
  dialog = page.getByRole("dialog");
  await dialog.locator('input[name="nombre"]').fill(`${REASON} editado`);
  await dialog.getByRole("button", { name: "Guardar" }).click();
  await expect(page.getByText("Registro guardado")).toBeVisible();
  await expect(row(page, `${REASON} editado`)).toBeVisible();

  await page.getByRole("button", { name: `Desactivar ${REASON} editado` }).click();
  await page.getByRole("button", { name: "Desactivar", exact: true }).click();
  await expect(page.getByText("Registro desactivado")).toBeVisible();
  await expect(row(page, `${REASON} editado`)).toContainText("inactivo");

  // Desactivado: ya no se ofrece en los selects.
  const options: Array<{ nombre: string }> = await (await admin.get("cancellation-reasons")).json();
  expect(options.some((o) => o.nombre.startsWith(REASON))).toBe(false);
});

test("un nombre duplicado muestra el error de la API", async ({ page }) => {
  await signIn(page, E2E.admin.username);
  await page.goto(route("/catalogs"));
  await page.getByRole("button", { name: "Tipos de documento", exact: true }).click();
  await page.getByRole("button", { name: "Nuevo", exact: true }).click();
  const dialog = page.getByRole("dialog");
  await dialog.locator('input[name="nombre"]').fill("CURP");
  await dialog.getByRole("button", { name: "Guardar" }).click();
  await expect(dialog.getByText(/duplicado/i)).toBeVisible();
});

test("CONTROL_ESCOLAR ve configuración y catálogos en solo lectura", async ({ page }) => {
  await signIn(page, E2E.control.username);
  await page.goto(route("/settings"));
  await expect(page.getByText(/solo lectura/i)).toBeVisible();
  await expect(page.locator('input[name="SCHOOL_NAME"]')).toBeDisabled();
  await expect(page.getByRole("button", { name: "Guardar" })).toHaveCount(0);

  await page.goto(route("/catalogs"));
  await expect(page.getByRole("button", { name: "Niveles", exact: true })).toBeVisible();
  await expect(page.getByText("Solo lectura").first()).toBeVisible();
  await expect(page.getByRole("button", { name: "Nuevo", exact: true })).toHaveCount(0);
});

test("PROFESOR no entra a configuración ni catálogos", async ({ page }) => {
  await signIn(page, E2E.teacher.username);
  await page.goto(route("/settings"));
  await expect(page).toHaveURL(/#\/$/);
  await page.goto(route("/catalogs"));
  await expect(page).toHaveURL(/#\/$/);
});
