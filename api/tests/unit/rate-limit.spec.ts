import express from "express";
import type { Server } from "node:http";
import type { AddressInfo } from "node:net";
import { expect, test } from "@playwright/test";
import { errorMiddleware, HttpError } from "../../src/core/middlewares/error.middleware";
import { createRateLimit } from "../../src/core/middlewares/rate-limit.middleware";

/** Límite de peticiones por IP (M12): se prueba el middleware real sobre una app mínima. */

let server: Server;
let base: string;

test.beforeAll(async () => {
  const app = express();
  app.get("/all", createRateLimit({ limit: 3 }), (_req, res) => res.json({ ok: true }));
  // Como el login: solo cuentan las respuestas de error.
  app.get("/failed-only", createRateLimit({ limit: 2, skipSuccessfulRequests: true }), (req, res, next) =>
    req.query.fail ? next(new HttpError(401, "INVALID_CREDENTIALS")) : res.json({ ok: true })
  );
  app.use(errorMiddleware);
  server = await new Promise<Server>((resolve) => {
    const s = app.listen(0, "127.0.0.1", () => resolve(s));
  });
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

test.afterAll(async () => {
  await new Promise((resolve) => server.close(resolve));
});

test("al pasar el límite responde 429 RATE_LIMITED con el envelope estándar y Retry-After", async () => {
  for (let i = 0; i < 3; i++) expect((await fetch(`${base}/all`)).status).toBe(200);
  const blocked = await fetch(`${base}/all`, { headers: { "Accept-Language": "en" } });
  expect(blocked.status).toBe(429);
  expect(Number(blocked.headers.get("retry-after"))).toBeGreaterThan(0);
  expect(await blocked.json()).toMatchObject({ code: "RATE_LIMITED", message: "Too many requests. Try again later." });
});

test("con skipSuccessfulRequests solo cuentan los intentos fallidos", async () => {
  for (let i = 0; i < 5; i++) expect((await fetch(`${base}/failed-only`)).status).toBe(200);
  for (let i = 0; i < 2; i++) expect((await fetch(`${base}/failed-only?fail=1`)).status).toBe(401);
  expect((await fetch(`${base}/failed-only?fail=1`)).status).toBe(429);
  // Una vez bloqueada la IP, tampoco pasan las peticiones válidas hasta que venza la ventana.
  expect((await fetch(`${base}/failed-only`)).status).toBe(429);
});
