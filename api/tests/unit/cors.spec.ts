import { expect, test } from "@playwright/test";
import { isOriginAllowed, parseCorsOrigins } from "../../src/core/config/cors";

/** Reglas puras de CORS (`WEB_ORIGIN`): lista separada por comas y comodines. */

test.describe("parseCorsOrigins", () => {
  test("`*` o vacío permiten cualquier origen", () => {
    expect(parseCorsOrigins("*")).toEqual({ allowAny: true, patterns: [] });
    expect(parseCorsOrigins("")).toEqual({ allowAny: true, patterns: [] });
    expect(parseCorsOrigins(undefined)).toEqual({ allowAny: true, patterns: [] });
    expect(parseCorsOrigins("https://a.dev, *")).toEqual({ allowAny: true, patterns: [] });
  });

  test("lista separada por comas, recortando espacios", () => {
    expect(parseCorsOrigins("https://cyc.axzy.dev, https://axzy.dev").patterns).toEqual([
      "https://cyc.axzy.dev",
      "https://axzy.dev",
    ]);
  });
});

test.describe("isOriginAllowed", () => {
  test("sin Origin (curl/mismo origen) siempre pasa", () => {
    expect(isOriginAllowed(undefined, parseCorsOrigins("https://cyc.axzy.dev"))).toBe(true);
  });

  test("coincidencia exacta", () => {
    const policy = parseCorsOrigins("https://cyc.axzy.dev,https://axzy.dev");
    expect(isOriginAllowed("https://cyc.axzy.dev", policy)).toBe(true);
    expect(isOriginAllowed("https://axzy.dev", policy)).toBe(true);
    expect(isOriginAllowed("https://otro.dev", policy)).toBe(false);
    expect(isOriginAllowed("http://cyc.axzy.dev", policy)).toBe(false);
  });

  test("comodín de subdominio `https://*.axzy.dev`", () => {
    const policy = parseCorsOrigins("https://*.axzy.dev");
    expect(isOriginAllowed("https://cyc.axzy.dev", policy)).toBe(true);
    expect(isOriginAllowed("https://www.axzy.dev", policy)).toBe(true);
    // El apex no tiene subdominio: no coincide con `https://*.axzy.dev`.
    expect(isOriginAllowed("https://axzy.dev", policy)).toBe(false);
    expect(isOriginAllowed("https://axzy.dev.evil.com", policy)).toBe(false);
    expect(isOriginAllowed("https://evil.com", policy)).toBe(false);
  });

  test("`*` permite cualquiera", () => {
    expect(isOriginAllowed("https://loquesea.com", parseCorsOrigins("*"))).toBe(true);
  });
});
