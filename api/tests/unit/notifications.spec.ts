import { test, expect } from "@playwright/test";
import {
  BACKOFF_BASE_MS,
  BACKOFF_CAP_MS,
  afterFailure,
  backoffMs,
  missingVariables,
  normalizeRecipient,
  render,
  requiredVariables,
  toHtml,
  variablesIn,
} from "../../src/modules/notifications/models/entity/notification-rules";

/** M19 §4.2–4.5: render, variables, destinatarios y backoff (sin BD). */

test.describe("plantillas", () => {
  test("variablesIn detecta {{var}} sin repetir y tolera espacios", () => {
    expect(variablesIn("Hola {{nombre}}", "{{ monto }} de {{nombre}} el {{fecha}}")).toEqual(["nombre", "monto", "fecha"]);
    expect(variablesIn(null, "sin variables")).toEqual([]);
  });

  test("requiredVariables une declaradas y usadas; missingVariables marca las faltantes", () => {
    const required = requiredVariables(["nombre"], "Pago {{folio}}", "Hola {{nombre}}, {{monto}}");
    expect(required).toEqual(["nombre", "folio", "monto"]);
    expect(missingVariables(required, { nombre: "Ana", monto: 10 })).toEqual(["folio"]);
    expect(missingVariables(required, { nombre: "Ana", monto: 0, folio: "REC-1" })).toEqual([]);
  });

  test("render sustituye, convierte números y deja vacías las no provistas", () => {
    expect(render("Hola {{nombre}}, debes {{monto}} {{extra}}", { nombre: "Ana", monto: 1500 })).toBe("Hola Ana, debes 1500");
  });

  test("toHtml escapa el texto del usuario", () => {
    expect(toHtml("<b>Hola</b>\nAdiós & bye")).toBe("<p>&lt;b&gt;Hola&lt;/b&gt;<br>Adiós &amp; bye</p>");
  });
});

test.describe("destinatarios", () => {
  test("correo válido en minúsculas; inválido → null", () => {
    expect(normalizeRecipient("EMAIL", " Ana@Escuela.MX ")).toBe("ana@escuela.mx");
    expect(normalizeRecipient("EMAIL", "ana@")).toBeNull();
    expect(normalizeRecipient("EMAIL", null)).toBeNull();
  });

  test("teléfono para SMS/WhatsApp sin separadores (10 a 15 dígitos)", () => {
    expect(normalizeRecipient("SMS", "(55) 1234-5678")).toBe("5512345678");
    expect(normalizeRecipient("WHATSAPP", "+52 55 1234 5678")).toBe("+525512345678");
    expect(normalizeRecipient("SMS", "12345")).toBeNull();
  });

  test("bandeja interna solo con user:<uuid>", () => {
    expect(normalizeRecipient("INTERNO", "user:3f2b8c1e-1d2a-4b5c-9d8e-0f1a2b3c4d5e")).toBe("user:3f2b8c1e-1d2a-4b5c-9d8e-0f1a2b3c4d5e");
    expect(normalizeRecipient("INTERNO", "ana@escuela.mx")).toBeNull();
  });
});

test.describe("reintentos con backoff", () => {
  test("crece exponencialmente con ±10 % y tope de 1 h", () => {
    expect(backoffMs(1, 0.5)).toBe(BACKOFF_BASE_MS);
    expect(backoffMs(2, 0.5)).toBe(BACKOFF_BASE_MS * 2);
    expect(backoffMs(4, 0.5)).toBe(BACKOFF_BASE_MS * 8);
    expect(backoffMs(1, 0)).toBe(BACKOFF_BASE_MS * 0.9);
    expect(backoffMs(1, 0.9999)).toBeLessThanOrEqual(BACKOFF_BASE_MS * 1.1);
    expect(backoffMs(30, 0.5)).toBe(BACKOFF_CAP_MS);
  });

  test("afterFailure reintenta hasta maxAttempts y luego FALLIDO", () => {
    const now = new Date("2026-10-09T12:00:00Z");
    const retry = afterFailure(2, 5, now, 0.5);
    expect(retry).toEqual({ status: "EN_COLA", nextRetryAt: new Date(now.getTime() + BACKOFF_BASE_MS * 2) });
    expect(afterFailure(5, 5, now)).toEqual({ status: "FALLIDO" });
  });
});
