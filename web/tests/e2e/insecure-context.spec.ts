import { expect, test } from "@playwright/test";
import { E2E, route } from "./support/env";

/**
 * EL CLIENTE ENTRA POR `http://IP:8080`, NO POR localhost.
 *
 * El navegador solo expone `crypto.randomUUID` en **contexto seguro** (https o
 * localhost). En la red local por http esa función NO existe, así que ningún
 * código de la app puede depender de ella: `newId()` (`@shared/lib/newId`) cae a
 * `crypto.getRandomValues`. Estas pruebas reproducen el navegador del cliente
 * (borran la función ANTES de cargar la página) para que la regresión no vuelva.
 */
test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    // Igual que en http://IP: la función no existe.
    Object.defineProperty(window.crypto, "randomUUID", {
      value: undefined,
      configurable: true,
    });
  });
});

/** Solo errores DE LA APP: la ausencia de API no es un error de la pantalla. */
const isAppError = (message: string): boolean =>
  !/failed to fetch|networkerror|load failed|connection closed|websocket/i.test(message);

test("la pantalla de acceso carga sin contexto seguro", async ({ page }) => {
  const failures: string[] = [];
  page.on("pageerror", (error) => {
    if (isAppError(error.message)) failures.push(error.message);
  });

  await page.goto(route("/login"));
  await expect(page.locator('input[name="username"]')).toBeVisible();
  await expect(page.getByRole("button", { name: /entrar/i })).toBeVisible();

  expect(failures, `errores sin contexto seguro:\n${failures.join("\n")}`).toEqual([]);
});

test("las rutas privadas redirigen al login sin contexto seguro", async ({ page }) => {
  const failures: string[] = [];
  page.on("pageerror", (error) => {
    if (isAppError(error.message)) failures.push(error.message);
  });

  for (const path of ["/", "/users", "/roles"]) {
    await page.goto(route(path));
    await expect(page).toHaveURL(/#\/login/);
  }

  expect(failures, `errores sin contexto seguro:\n${failures.join("\n")}`).toEqual([]);
});

test("el login persiste la sesión sin contexto seguro", async ({ page }) => {
  const failures: string[] = [];
  page.on("pageerror", (error) => {
    if (isAppError(error.message)) failures.push(error.message);
  });

  await page.goto(route("/login"));
  await page.locator('input[name="username"]').fill(E2E.admin.username);
  await page.locator('input[name="password"]').fill(E2E.password);
  await page.getByRole("button", { name: /entrar/i }).click();

  await expect(page).not.toHaveURL(/#\/login/);
  expect(failures, `errores sin contexto seguro:\n${failures.join("\n")}`).toEqual([]);
});
