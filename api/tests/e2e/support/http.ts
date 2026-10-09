import { expect, request as playwrightRequest, type APIRequestContext } from "@playwright/test";
import { E2E } from "./env";

/** Contexto HTTP sin sesión. */
export const anon = (): Promise<APIRequestContext> =>
  playwrightRequest.newContext({ baseURL: E2E.baseURL });

/** Contexto HTTP con `Authorization: Bearer`. */
export const bearer = (token: string): Promise<APIRequestContext> =>
  playwrightRequest.newContext({
    baseURL: E2E.baseURL,
    extraHTTPHeaders: { Authorization: `Bearer ${token}` },
  });

export interface Session {
  token: string;
  refreshToken: string;
  user: { id: string; username: string; mustChangePassword: boolean };
}

/** Login real; falla el test si no responde 200. */
export const login = async (username: string, password = E2E.password): Promise<Session> => {
  const ctx = await anon();
  const res = await ctx.post("auth/login", { data: { username, password } });
  expect(res.status(), `login de ${username}`).toBe(200);
  const body = (await res.json()) as Session;
  await ctx.dispose();
  return body;
};

/** Login + contexto autenticado listo para usar. */
export const loginAs = async (
  username: string,
  password = E2E.password
): Promise<{ api: APIRequestContext; session: Session }> => {
  const session = await login(username, password);
  return { api: await bearer(session.token), session };
};
