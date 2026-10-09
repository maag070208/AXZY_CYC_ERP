import { expect, test, type Page } from "@playwright/test";
import { E2E, newRunId, route } from "./support/env";
import { signIn } from "./support/api";

/**
 * Usuarios (M02) en el navegador: alta con multi-rol, edición, baja con
 * motivo, reactivación y el primer acceso con contraseña temporal.
 */
test.use({ storageState: { cookies: [], origins: [] } });

const RUN = newRunId().toLowerCase();
const USERNAME = `e2e_wuser_${RUN}`;
const INITIAL = `${E2E.password}-ini`;

const row = (page: Page, username: string) => page.locator("tr", { hasText: `@${username}` });

async function filterByUsername(page: Page, username: string): Promise<void> {
  await page.getByPlaceholder("Buscar...").first().fill(username);
  await expect(row(page, username)).toBeVisible();
}

test.describe.serial("ciclo de vida de una cuenta", () => {
  test("ADMIN da de alta una cuenta con dos roles", async ({ page }) => {
    await signIn(page, E2E.admin.username);
    await page.goto(route("/users"));
    await page.getByRole("button", { name: /nuevo usuario/i }).click();

    const dialog = page.getByRole("dialog");
    await dialog.locator('input[name="username"]').fill(USERNAME);
    await dialog.locator('input[name="name"]').fill("E2E Web Usuario");
    await dialog.locator('input[name="email"]').fill(`${USERNAME}@e2e.local`);
    await dialog.locator('input[name="password"]').fill(INITIAL);

    // Sin roles no deja guardar.
    await dialog.getByRole("button", { name: "Guardar" }).click();
    await expect(dialog.getByText("Elige al menos un rol")).toBeVisible();

    await dialog.getByText("PROFESOR", { exact: true }).click();
    await dialog.getByText("CONTROL ESCOLAR", { exact: true }).click();
    await dialog.getByRole("button", { name: "Guardar" }).click();

    await expect(page.getByText("Usuario creado")).toBeVisible();
    await filterByUsername(page, USERNAME);
    await expect(row(page, USERNAME)).toContainText("PROFESOR");
    await expect(row(page, USERNAME)).toContainText("CONTROL ESCOLAR");
  });

  test("ADMIN edita el nombre y deja un solo rol", async ({ page }) => {
    await signIn(page, E2E.admin.username);
    await page.goto(route("/users"));
    await filterByUsername(page, USERNAME);
    await page.getByRole("button", { name: `Editar ${USERNAME}` }).click();

    const dialog = page.getByRole("dialog");
    await expect(dialog.locator('input[name="username"]')).toBeDisabled();
    await dialog.locator('input[name="name"]').fill("E2E Web Editado");
    await dialog.getByText("CONTROL ESCOLAR", { exact: true }).click();
    await dialog.getByRole("button", { name: "Guardar" }).click();

    await expect(page.getByText("Usuario guardado correctamente")).toBeVisible();
    await expect(row(page, USERNAME)).toContainText("E2E Web Editado");
    await expect(row(page, USERNAME)).not.toContainText("CONTROL ESCOLAR");
  });

  test("ADMIN da de baja con motivo y reactiva", async ({ page }) => {
    await signIn(page, E2E.admin.username);
    await page.goto(route("/users"));
    await filterByUsername(page, USERNAME);

    await page.getByRole("button", { name: `Dar de baja ${USERNAME}` }).click();
    const dialog = page.getByRole("dialog");
    await dialog.locator('textarea[name="reason"]').fill("Cambio de plantel");
    await dialog.getByRole("button", { name: "Dar de baja" }).click();
    await expect(page.getByText("Cuenta dada de baja")).toBeVisible();
    await expect(row(page, USERNAME)).toContainText("Inactivo");

    await page.getByRole("button", { name: `Reactivar ${USERNAME}` }).click();
    await page.getByRole("button", { name: "Reactivar", exact: true }).click();
    await expect(page.getByText("Cuenta reactivada")).toBeVisible();
    await expect(row(page, USERNAME)).toContainText("Activo");
  });

  test("ADMIN no se ofrece darse de baja a sí mismo", async ({ page }) => {
    await signIn(page, E2E.admin.username);
    await page.goto(route("/users"));
    await filterByUsername(page, E2E.admin.username);
    await expect(page.getByRole("button", { name: `Editar ${E2E.admin.username}` })).toBeVisible();
    await expect(page.getByRole("button", { name: `Dar de baja ${E2E.admin.username}` })).toHaveCount(0);
  });

  test("primer acceso: la contraseña inicial obliga a cambiarla antes de seguir", async ({ page }) => {
    await signIn(page, USERNAME, INITIAL);
    await expect(page).toHaveURL(/#\/change-password/);
    await expect(page.getByText(/tu contraseña es temporal/i)).toBeVisible();

    // No deja escaparse a otra ruta.
    await page.goto(route("/"));
    await expect(page).toHaveURL(/#\/change-password/);

    await page.locator('input[name="currentPassword"]').fill(INITIAL);
    await page.locator('input[name="newPassword"]').fill(`${E2E.password}-nueva`);
    await page.locator('input[name="confirmPassword"]').fill(`${E2E.password}-otra`);
    await page.locator("form").getByRole("button", { name: "Cambiar contraseña" }).click();
    await expect(page.getByText("Las contraseñas no coinciden")).toBeVisible();

    await page.locator('input[name="confirmPassword"]').fill(`${E2E.password}-nueva`);
    await page.locator("form").getByRole("button", { name: "Cambiar contraseña" }).click();
    await expect(page).toHaveURL(/#\/$/);
    await expect(page.getByText("Contraseña actualizada")).toBeVisible();

    // La nueva contraseña ya es la buena.
    await page.evaluate(() => localStorage.clear());
    await page.reload();
    await signIn(page, USERNAME, `${E2E.password}-nueva`);
    await expect(page).toHaveURL(/#\/$/);
  });
});
