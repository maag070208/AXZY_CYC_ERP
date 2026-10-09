import { expect, test, type APIRequestContext } from "@playwright/test";
import { E2E, newRunId, route } from "./support/env";
import { apiAs, createUser, issueResetToken, signIn } from "./support/api";

/** Recuperación de contraseña (M02) de punta a punta en el navegador. */
test.use({ storageState: { cookies: [], origins: [] } });

const RUN = newRunId().toLowerCase();
const USERNAME = `e2e_wreset_${RUN}`;
const NEW_PASSWORD = `${E2E.password}-recuperada`;

let admin: APIRequestContext;

test.beforeAll(async () => {
  admin = await apiAs(E2E.admin.username);
  await createUser(admin, { username: USERNAME, name: "E2E Recupera Web", roles: ["STUDENT"] });
});

test.afterAll(async () => {
  await admin.dispose();
});

test("desde el login se pide el enlace y la respuesta no revela si la cuenta existe", async ({ page }) => {
  await page.goto(route("/login"));
  await page.getByRole("link", { name: /olvidaste tu contraseña/i }).click();
  await expect(page).toHaveURL(/#\/forgot-password/);

  await page.locator('input[name="identifier"]').fill(`${USERNAME}@e2e.local`);
  await page.getByRole("button", { name: "Enviar enlace" }).click();
  await expect(page.getByText(/si la cuenta existe, enviamos un enlace/i)).toBeVisible();

  // Misma respuesta para una cuenta que no existe.
  await page.getByRole("link", { name: /volver a iniciar sesión/i }).click();
  await page.getByRole("link", { name: /olvidaste tu contraseña/i }).click();
  await page.locator('input[name="identifier"]').fill(`e2e_no_existe_${RUN}`);
  await page.getByRole("button", { name: "Enviar enlace" }).click();
  await expect(page.getByText(/si la cuenta existe, enviamos un enlace/i)).toBeVisible();
});

test("el enlace sin token avisa que no es válido", async ({ page }) => {
  await page.goto(route("/reset-password"));
  await expect(page.getByText(/el enlace no es válido/i)).toBeVisible();
  await expect(page.getByRole("link", { name: /solicitar otro enlace/i })).toBeVisible();
});

test("restablecer con el enlace: valida, cambia la contraseña y el enlace es de un solo uso", async ({ page }) => {
  const token = issueResetToken(USERNAME);
  await page.goto(route(`/reset-password?token=${token}`));

  await page.locator('input[name="password"]').fill("corta");
  await page.locator('input[name="confirm"]').fill("corta");
  await page.getByRole("button", { name: "Guardar contraseña" }).click();
  await expect(page.getByText(/al menos 10 caracteres/i)).toBeVisible();

  await page.locator('input[name="password"]').fill(NEW_PASSWORD);
  await page.locator('input[name="confirm"]').fill(NEW_PASSWORD);
  await page.getByRole("button", { name: "Guardar contraseña" }).click();
  await expect(page.getByText(/tu contraseña se cambió/i)).toBeVisible();

  await signIn(page, USERNAME, NEW_PASSWORD);
  await page.evaluate(() => localStorage.clear());
  await page.reload();

  // Reusar el mismo enlace ya no sirve.
  await page.goto(route(`/reset-password?token=${token}`));
  await page.locator('input[name="password"]').fill(`${NEW_PASSWORD}-2`);
  await page.locator('input[name="confirm"]').fill(`${NEW_PASSWORD}-2`);
  await page.getByRole("button", { name: "Guardar contraseña" }).click();
  await expect(page.getByText(/venció o ya se usó/i)).toBeVisible();
});
