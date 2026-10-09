import { execFileSync } from "node:child_process";
import { expect, request, type APIRequestContext, type Page } from "@playwright/test";
import { API_ROOT, E2E, apiBase, route } from "./env";

/**
 * Atajos para preparar escenarios por API (no por la pantalla que se prueba) y
 * para entrar a la app como una persona.
 */

/** Contexto HTTP autenticado contra la API real. */
export const apiAs = async (username: string, password: string = E2E.password): Promise<APIRequestContext> => {
  const anon = await request.newContext({ baseURL: apiBase });
  const res = await anon.post("auth/login", { data: { username, password } });
  expect(res.status(), `login API de ${username}`).toBe(200);
  const { token } = await res.json();
  await anon.dispose();
  return request.newContext({ baseURL: apiBase, extraHTTPHeaders: { Authorization: `Bearer ${token}` } });
};

/** Alta de una cuenta de prueba por API (prefijo `e2e_`, se borra en el teardown). */
export const createUser = async (
  admin: APIRequestContext,
  input: { username: string; name: string; roles: string[]; password?: string }
): Promise<{ id: string }> => {
  const res = await admin.post("users", {
    data: {
      username: input.username,
      name: input.name,
      email: `${input.username}@e2e.local`,
      password: input.password ?? E2E.password,
      roles: input.roles,
    },
  });
  expect(res.status(), `alta de ${input.username}`).toBe(201);
  return res.json();
};

/** Token de recuperación conocido (lo emite el paquete `api/`, dueño de la base). */
export const issueResetToken = (username: string): string =>
  execFileSync("npm", ["run", "--silent", "test:e2e:reset-token", "--", username], {
    cwd: API_ROOT,
    encoding: "utf-8",
  }).trim();

/** Entra a la app por la pantalla de login. */
export const signIn = async (page: Page, username: string, password: string = E2E.password): Promise<void> => {
  await page.goto(route("/login"));
  await page.locator('input[name="username"]').fill(username);
  await page.locator('input[name="password"]').fill(password);
  await page.getByRole("button", { name: /entrar/i }).click();
  await expect(page).not.toHaveURL(/#\/login/);
};
