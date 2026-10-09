import { expect, test, type APIRequestContext, type Page } from "@playwright/test";
import { E2E, newRunId, route } from "./support/env";
import { apiAs, signIn } from "./support/api";

/**
 * Consola de acceso `/roles` (M02): roles dinámicos, matriz rol × permiso y
 * políticas ABAC, operadas desde el navegador.
 */
test.use({ storageState: { cookies: [], origins: [] } });

const RUN = newRunId();
const ROLE_KEY = `E2E_W${RUN}`;
const POLICY_KEY = `e2e_w_${RUN.toLowerCase()}`;

let admin: APIRequestContext;

test.beforeAll(async () => {
  admin = await apiAs(E2E.admin.username);
});

test.afterAll(async () => {
  // Si algo quedó a medias, la API recarga sus caches sin lo de prueba
  // (el teardown global borra las filas `E2E_`/`e2e_`).
  await admin.post("permissions/reload").catch(() => undefined);
  await admin.dispose();
});

async function openTab(page: Page, name: string): Promise<void> {
  await page.goto(route("/roles"));
  await page.getByRole("button", { name, exact: true }).click();
}

test.describe.serial("consola de acceso", () => {
  test("crear un rol copiando los permisos de otro", async ({ page }) => {
    await signIn(page, E2E.admin.username);
    await openTab(page, "Roles");
    await page.getByRole("button", { name: "Nuevo rol" }).click();

    const dialog = page.getByRole("dialog");
    await dialog.locator('input[name="roleKey"]').fill(ROLE_KEY.toLowerCase());
    await expect(dialog.locator('input[name="roleKey"]')).toHaveValue(ROLE_KEY);
    await dialog.locator('input[name="roleName"]').fill("E2E Rol Web");
    await dialog.locator('select[name="copyFrom"]').selectOption("SCHOOL_CONTROL");
    await dialog.getByRole("button", { name: "Guardar" }).click();

    await expect(page.getByText("Rol creado")).toBeVisible();
    await expect(page.locator(`[data-role="${ROLE_KEY}"]`)).toContainText("E2E Rol Web");
  });

  test("la matriz guarda el alcance de una celda y lo conserva al recargar", async ({ page }) => {
    await signIn(page, E2E.admin.username);
    await openTab(page, "Matriz");
    const cell = page.locator(`select[name="matrix:${ROLE_KEY}:audit.view"]`);
    await expect(cell).toHaveValue("NONE");
    await cell.selectOption("ALL");
    await expect(page.getByText("1 cambio(s) sin guardar")).toBeVisible();
    await page.getByRole("button", { name: "Guardar matriz" }).click();
    await expect(page.getByText("Matriz guardada (1 celda(s))")).toBeVisible();

    await page.reload();
    await page.getByRole("button", { name: "Matriz", exact: true }).click();
    await expect(page.locator(`select[name="matrix:${ROLE_KEY}:audit.view"]`)).toHaveValue("ALL");
  });

  test("quitar roles.manage a ADMIN desde la matriz lo impide el anti-lockout", async ({ page }) => {
    await signIn(page, E2E.admin.username);
    await openTab(page, "Matriz");
    await page.locator('select[name="matrix:ADMIN:roles.manage"]').selectOption("NONE");
    await page.getByRole("button", { name: "Guardar matriz" }).click();
    await expect(page.getByText(/No se puede dejar al sistema sin un rol activo/)).toBeVisible();
    await page.getByRole("button", { name: "Descartar" }).click();
    await expect(page.locator('select[name="matrix:ADMIN:roles.manage"]')).toHaveValue("ALL");
  });

  test("una política DENY creada en la consola bloquea la acción en la API", async ({ page }) => {
    await signIn(page, E2E.admin.username);
    await openTab(page, "Políticas");
    await page.getByRole("button", { name: "Nueva política" }).click();

    const dialog = page.getByRole("dialog");
    await dialog.locator('input[name="policyKey"]').fill(POLICY_KEY);
    await dialog.locator('input[name="policyName"]').fill("E2E No editar profesores");
    await dialog.locator('select[name="policyAction"]').selectOption("users.update");
    await dialog.locator('select[name="policyEffect"]').selectOption("DENY");
    await dialog.getByRole("button", { name: "Agregar condición" }).click();
    await dialog.locator('select[name="condition-field-0"]').selectOption("target.roles");
    await dialog.locator('select[name="condition-operator-0"]').selectOption("contains");
    await dialog.locator('input[name="condition-value-0"]').fill("TEACHER");
    await dialog.getByRole("button", { name: "Guardar" }).click();

    await expect(page.getByText("Política creada")).toBeVisible();
    const card = page.locator(`[data-policy="${POLICY_KEY}"]`);
    await expect(card).toContainText("users.update");
    await expect(card).toContainText("target.roles contiene");

    // La API la aplica de inmediato.
    const users = await (await admin.post("users/query", { data: { filters: { username: E2E.teacher.username } } })).json();
    const denied = await admin.patch(`users/${users.data[0].id}`, { data: { name: "Bloqueado" } });
    expect(denied.status()).toBe(403);
    expect((await denied.json()).code).toBe("POLICY_DENIED");

    await page.getByRole("button", { name: `Eliminar ${POLICY_KEY}` }).click();
    await page.getByRole("button", { name: "Eliminar", exact: true }).click();
    await expect(page.getByText("Política eliminada")).toBeVisible();
    await expect(card).toHaveCount(0);
    expect((await admin.patch(`users/${users.data[0].id}`, { data: { name: E2E.teacher.name } })).status()).toBe(200);
  });

  test("eliminar el rol de prueba (sin cuentas)", async ({ page }) => {
    await signIn(page, E2E.admin.username);
    await openTab(page, "Roles");
    await page.getByRole("button", { name: `Eliminar ${ROLE_KEY}` }).click();
    await page.getByRole("button", { name: "Eliminar", exact: true }).click();
    await expect(page.getByText("Rol eliminado")).toBeVisible();
    await expect(page.locator(`[data-role="${ROLE_KEY}"]`)).toHaveCount(0);
  });
});
