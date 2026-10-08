import { expect, test, type Page } from "@playwright/test";
import { E2E, route } from "./support/env";

/**
 * Acceso al sistema (M02). Corre sin sesión guardada: aquí justamente se prueba
 * la puerta de entrada, el guard de rutas y la persistencia de la sesión.
 */
test.use({ storageState: { cookies: [], origins: [] } });

/** Sesión que la app persiste en localStorage (store `cyc_auth_v1`). */
async function savedSession(
  page: Page
): Promise<{ token: string | null; user: { username: string } | null } | null> {
  return page.evaluate((key) => {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : null;
  }, E2E.storageKey);
}

async function goToLogin(page: Page): Promise<void> {
  await page.goto(route("/login"));
}

async function enter(page: Page, user: string, password = E2E.password): Promise<void> {
  await page.locator('input[name="username"]').fill(user);
  await page.locator('input[name="password"]').fill(password);
  await page.getByRole("button", { name: /entrar/i }).click();
}

test.describe("Sesión", () => {
  test("entra con credenciales válidas y guarda la sesión", async ({ page }) => {
    await goToLogin(page);
    await enter(page, E2E.admin.username);

    await expect(page).not.toHaveURL(/#\/login/);
    const session = await savedSession(page);
    expect(session?.token).toBeTruthy();
    expect(session?.user?.username).toBe(E2E.admin.username);
  });

  test("rechaza credenciales inválidas y no deja pasar", async ({ page }) => {
    await goToLogin(page);
    await enter(page, E2E.admin.username, "contraseña-que-no-es");

    await expect(page.getByText(/Credenciales inválidas/i).first()).toBeVisible({
      timeout: 15_000,
    });
    await expect(page).toHaveURL(/#\/login/);
    expect((await savedSession(page))?.token ?? null).toBeNull();
  });

  test("una ruta privada manda al login cuando no hay sesión", async ({ page }) => {
    await page.goto(route("/users"));
    await expect(page).toHaveURL(/#\/login/);
  });

  test("el botón de entrar se habilita hasta que hay usuario y contraseña", async ({ page }) => {
    await goToLogin(page);
    const enterBtn = page.getByRole("button", { name: /entrar/i });
    await expect(enterBtn).toBeDisabled();

    await page.locator('input[name="username"]').fill(E2E.admin.username);
    await expect(enterBtn).toBeDisabled();

    await page.locator('input[name="password"]').fill(E2E.password);
    await expect(enterBtn).toBeEnabled();
  });

  test("al recargar la sesión sigue activa", async ({ page }) => {
    await goToLogin(page);
    await enter(page, E2E.admin.username);
    await expect(page).not.toHaveURL(/#\/login/);

    await page.reload();
    await expect(page).not.toHaveURL(/#\/login/);
    expect((await savedSession(page))?.token).toBeTruthy();
  });
});
