import { expect, test, type Page } from "@playwright/test";
import { E2E, newRunId, route } from "./support/env";
import { issueResetToken, signIn } from "./support/api";

/**
 * Profesores (M04) en el navegador: alta con cuenta e invitación, primer
 * acceso con la invitación, edición, reenvío y baja/reactivación.
 */
test.use({ storageState: { cookies: [], origins: [] } });

const RUN = newRunId().toLowerCase();
const EMAIL = `e2e_tweb_${RUN}@e2e.local`;
const USERNAME = `e2e_tweb_${RUN}`;
const NAME = `E2E Docente ${RUN}`;

const row = (page: Page) => page.locator("tr", { hasText: EMAIL });

async function openTeachers(page: Page): Promise<void> {
  await page.goto(route("/teachers"));
  await page.getByPlaceholder("Buscar...").nth(1).fill(EMAIL);
  await expect(row(page)).toBeVisible();
}

test.describe.serial("profesores", () => {
  test("ADMIN da de alta un profesor: se crea su cuenta con invitación pendiente", async ({ page }) => {
    await signIn(page, E2E.admin.username);
    await page.goto(route("/teachers"));
    await page.getByRole("button", { name: "Nuevo profesor" }).click();
    const dialog = page.getByRole("dialog");
    await dialog.locator('input[name="firstNames"]').fill("E2E Docente");
    await dialog.locator('input[name="surnames"]').fill(RUN);
    await dialog.locator('input[name="email"]').fill(EMAIL);
    await dialog.locator('input[name="specialty"]').fill("Diagnóstico electrónico");
    await dialog.getByRole("button", { name: "Guardar" }).click();

    await expect(page.getByText(`Profesor creado: invitación enviada a ${EMAIL}`)).toBeVisible();
    await openTeachers(page);
    await expect(row(page)).toContainText(`@${USERNAME}`);
    await expect(row(page)).toContainText("Invitación pendiente");
  });

  test("con la invitación define su contraseña y entra; su perfil ya no está pendiente", async ({ page }) => {
    const token = issueResetToken(USERNAME);
    await page.goto(route(`/reset-password?token=${token}`));
    await page.locator('input[name="password"]').fill(`${E2E.password}-docente`);
    await page.locator('input[name="confirm"]').fill(`${E2E.password}-docente`);
    await page.getByRole("button", { name: "Guardar contraseña" }).click();
    await expect(page.getByText(/tu contraseña se cambió/i)).toBeVisible();

    await signIn(page, USERNAME, `${E2E.password}-docente`);
    await page.goto(route("/teachers"));
    await expect(row(page)).toContainText(NAME);
    await expect(row(page)).not.toContainText("Invitación pendiente");
    // Un profesor no da de alta ni de baja.
    await expect(page.getByRole("button", { name: "Nuevo profesor" })).toHaveCount(0);
    await expect(page.getByRole("button", { name: `Dar de baja ${EMAIL}` })).toHaveCount(0);
  });

  test("SCHOOL_CONTROL edita la especialidad y da de baja / reactiva", async ({ page }) => {
    await signIn(page, E2E.control.username);
    await openTeachers(page);
    await page.getByRole("button", { name: `Editar ${EMAIL}` }).click();
    const dialog = page.getByRole("dialog");
    await dialog.locator('input[name="specialty"]').fill("Suspensión y frenos");
    await dialog.getByRole("button", { name: "Guardar" }).click();
    await expect(page.getByText("Profesor actualizado")).toBeVisible();
    await expect(row(page)).toContainText("Suspensión y frenos");

    await page.getByRole("button", { name: `Dar de baja ${EMAIL}` }).click();
    await page.getByRole("dialog").locator('textarea[name="reason"]').fill("Fin de contrato");
    await page.getByRole("dialog").getByRole("button", { name: "Dar de baja" }).click();
    await expect(page.getByText("Profesor dado de baja")).toBeVisible();
    await expect(row(page)).toContainText("Inactivo");

    await page.getByRole("button", { name: `Reactivar ${EMAIL}` }).click();
    await page.getByRole("button", { name: "Reactivar", exact: true }).click();
    await expect(page.getByText("Profesor reactivado")).toBeVisible();
    await expect(row(page)).toContainText("Activo");
  });
});
