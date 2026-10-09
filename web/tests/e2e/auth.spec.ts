import { expect, test, type Page } from "@playwright/test";
import { E2E, apiBase, route } from "./support/env";

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

test.describe("Cierre de sesión y renovación", () => {
  test("cerrar sesión limpia la sesión y revoca el refresh", async ({ page, request }) => {
    await goToLogin(page);
    await enter(page, E2E.admin.username);
    await expect(page).not.toHaveURL(/#\/login/);
    const before = await savedSession(page);
    const refreshToken = (before as { refreshToken?: string } | null)?.refreshToken;
    expect(refreshToken).toBeTruthy();

    await page.getByText(E2E.admin.name).first().click();
    await page.getByText(/cerrar sesión/i).first().click();

    await expect(page).toHaveURL(/#\/login/);
    expect((await savedSession(page))?.token ?? null).toBeNull();

    // El refresh de la sesión cerrada ya no sirve en la API.
    const reused = await request.post(`${apiBase}auth/refresh`, { data: { refreshToken } });
    expect(reused.status()).toBe(401);
  });

  test("un access vencido se renueva solo con el refresh", async ({ page }) => {
    await goToLogin(page);
    await enter(page, E2E.admin.username);
    await expect(page).not.toHaveURL(/#\/login/);

    // Se corrompe el access persistido: la app debe renovarlo y seguir dentro.
    await page.evaluate((key) => {
      const session = JSON.parse(localStorage.getItem(key) ?? "{}");
      session.token = "access-vencido";
      localStorage.setItem(key, JSON.stringify(session));
    }, E2E.storageKey);
    await page.reload();

    await expect(page.getByText(E2E.admin.name).first()).toBeVisible();
    await expect(page).not.toHaveURL(/#\/login/);
    const session = await savedSession(page);
    expect(session?.token).toBeTruthy();
    expect(session?.token).not.toBe("access-vencido");
  });
});

test.describe("Menú y rutas por permiso", () => {
  test("ADMIN entra por URL a /users y /roles", async ({ page }) => {
    await goToLogin(page);
    await enter(page, E2E.admin.username);
    await expect(page).not.toHaveURL(/#\/login/);
    await page.goto(route("/users"));
    await expect(page).toHaveURL(/#\/users/);
    await page.goto(route("/roles"));
    await expect(page).toHaveURL(/#\/roles/);
  });

  test("TEACHER no entra por URL a /users ni /roles", async ({ page }) => {
    await goToLogin(page);
    await enter(page, E2E.teacher.username);
    await expect(page).not.toHaveURL(/#\/login/);

    await page.goto(route("/users"));
    await expect(page).toHaveURL(/#\/$/);
    await page.goto(route("/roles"));
    await expect(page).toHaveURL(/#\/$/);
  });
});

