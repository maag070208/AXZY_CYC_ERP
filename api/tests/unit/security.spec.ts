import { test, expect } from "@playwright/test";
import "./env";
import {
  comparePassword,
  hashPassword,
  isRefreshToken,
  refreshTokenExpiresAt,
  signRefreshToken,
  signToken,
  verifyRefreshToken,
  verifyToken,
} from "../../src/core/utils/security";

/**
 * Pruebas puras de la capa de seguridad. `playwright.unit.config.ts` provee
 * JWT_SECRET/DATABASE_URL/PORT descartables antes de cargar `env.config.ts`.
 */

test.describe("contraseñas (bcryptjs)", () => {
  test("hash y compare redondean correctamente", async () => {
    const hash = await hashPassword("S3cret-Pass!");
    expect(hash).not.toBe("S3cret-Pass!");
    expect(await comparePassword("S3cret-Pass!", hash)).toBe(true);
    expect(await comparePassword("otra-cosa", hash)).toBe(false);
  });

  test("dos hashes del mismo texto son distintos (sal aleatoria)", async () => {
    const [a, b] = await Promise.all([hashPassword("misma"), hashPassword("misma")]);
    expect(a).not.toBe(b);
  });
});

test.describe("access token", () => {
  test("firma y verifica el payload", () => {
    const token = signToken({ id: "u1", username: "ana", role: "ADMIN", roles: ["ADMIN"] });
    const payload = verifyToken(token);
    expect(payload).toMatchObject({ id: "u1", username: "ana", role: "ADMIN", roles: ["ADMIN"] });
    expect(isRefreshToken(payload)).toBe(false);
  });

  test("un token alterado no verifica", () => {
    const token = signToken({ id: "u1", username: "ana", role: "ADMIN" });
    expect(() => verifyToken(`${token}x`)).toThrow();
  });
});

test.describe("refresh token", () => {
  test("lleva type refresh y se distingue del access", () => {
    const refresh = signRefreshToken({ id: "u1", username: "ana" });
    const payload = verifyRefreshToken(refresh);
    expect(payload).toMatchObject({ id: "u1", username: "ana", type: "refresh" });
    expect(isRefreshToken(payload)).toBe(true);
  });

  test("un access token NO verifica como refresh", () => {
    const access = signToken({ id: "u1", username: "ana", role: "ADMIN" });
    expect(() => verifyRefreshToken(access)).toThrow();
  });

  test("la expiración del refresh queda en el futuro", () => {
    expect(refreshTokenExpiresAt().getTime()).toBeGreaterThan(Date.now());
  });
});
