import { expect, test, type APIRequestContext, type Page } from "@playwright/test";
import { E2E, newRunId, route } from "./support/env";
import { apiAs, signIn } from "./support/api";
import { makeCurp } from "./support/people";

/**
 * Expediente documental y kardex (M06) en el navegador: subida, validación,
 * rechazo, baja lógica, faltantes y exportación del kardex a PDF.
 */
test.use({ storageState: { cookies: [], origins: [] } });

const RUN = newRunId();
const PDF = Buffer.from("%PDF-1.4\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF\n");
const PNG = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(64, 1)]);

let control: APIRequestContext;
let studentId: string;

test.beforeAll(async () => {
  control = await apiAs(E2E.control.username);
  const res = await control.post("students", {
    data: { nombres: `E2E Expediente ${RUN}`, apellidoPaterno: "Web", curp: makeCurp("2000-01-15"), fechaNacimiento: "2000-01-15" },
  });
  expect(res.status()).toBe(201);
  studentId = (await res.json()).id;
});

test.afterAll(async () => {
  await control.dispose();
});

async function openTab(page: Page, tab: string): Promise<void> {
  await page.goto(route(`/students/${studentId}`));
  await page.getByRole("button", { name: tab, exact: true }).click();
}

async function uploadFile(page: Page, type: string, name: string, buffer: Buffer, mimeType: string): Promise<void> {
  await page.locator('select[name="documentTypeId"]').selectOption({ label: type });
  await page.locator('input[type="file"]').setInputFiles({ name, mimeType, buffer });
  await page.getByRole("button", { name: /Confirmar/ }).click();
  await expect(page.getByText("Documento subido")).toBeVisible();
  await expect(page.locator("tr", { hasText: name })).toBeVisible();
}

test.describe.serial("expediente", () => {
  test("sube CURP y acta; los faltantes se actualizan al validar", async ({ page }) => {
    await signIn(page, E2E.control.username);
    await openTab(page, "Expediente");
    await expect(page.getByText(/Faltan: .*CURP/)).toBeVisible();

    await uploadFile(page, "CURP *", "curp-e2e.pdf", PDF, "application/pdf");
    await uploadFile(page, "Acta de nacimiento *", "acta-e2e.png", PNG, "image/png");
    await expect(page.locator("tr", { hasText: "curp-e2e.pdf" })).toContainText("Pendiente");

    await page.getByRole("button", { name: "Validar curp-e2e.pdf" }).click();
    await page.getByRole("dialog").getByRole("button", { name: "Validar" }).click();
    await expect(page.getByText("Documento validado")).toBeVisible();
    await expect(page.locator("tr", { hasText: "curp-e2e.pdf" })).toContainText("Validado");
    await expect(page.getByText(/Faltan: /)).not.toContainText("CURP");
  });

  test("rechaza con notas y el documento rechazado muestra el motivo; eliminar lo saca", async ({ page }) => {
    await signIn(page, E2E.control.username);
    await openTab(page, "Expediente");
    await page.getByRole("button", { name: "Rechazar acta-e2e.png" }).click();
    const dialog = page.getByRole("dialog");
    await dialog.locator('textarea[name="reviewNotas"]').fill("Foto borrosa");
    await dialog.getByRole("button", { name: "Rechazar" }).click();
    await expect(page.getByText("Documento rechazado")).toBeVisible();
    await expect(page.locator("tr", { hasText: "acta-e2e.png" })).toContainText("Foto borrosa");

    await page.getByRole("button", { name: "Eliminar acta-e2e.png" }).click();
    await page.getByRole("button", { name: "Eliminar", exact: true }).click();
    await expect(page.getByText("Documento eliminado")).toBeVisible();
    await expect(page.locator("tr", { hasText: "acta-e2e.png" })).toHaveCount(0);
  });

  test("un archivo que no es PDF/JPG/PNG se rechaza", async ({ page }) => {
    await signIn(page, E2E.control.username);
    await openTab(page, "Expediente");
    await page.locator('select[name="documentTypeId"]').selectOption({ label: "Otro" });
    await page.locator('input[type="file"]').setInputFiles({ name: "virus.pdf", mimeType: "application/pdf", buffer: Buffer.from("MZ....") });
    await page.getByRole("button", { name: /Confirmar/ }).click();
    await expect(page.getByText(/Tipo de archivo no permitido/)).toBeVisible();
  });

  test("el kardex muestra faltantes y se exporta a PDF", async ({ page }) => {
    await signIn(page, E2E.control.username);
    await openTab(page, "Kardex");
    await expect(page.getByText(/Aún no hay cursos/)).toBeVisible();
    await expect(page.locator("[data-kardex-missing]")).toContainText("Acta de nacimiento");

    const download = page.waitForEvent("download");
    await page.getByRole("button", { name: "Exportar PDF" }).click();
    const file = await download;
    expect(file.suggestedFilename()).toMatch(/^kardex-\d{4}-\d{4}\.pdf$/);
    const path = await file.path();
    const head = (await import("node:fs")).readFileSync(path!).subarray(0, 5).toString();
    expect(head).toBe("%PDF-");
  });

  test("la descarga entrega el archivo original", async ({ page }) => {
    await signIn(page, E2E.control.username);
    await openTab(page, "Expediente");
    const download = page.waitForEvent("download");
    await page.getByRole("button", { name: "Descargar curp-e2e.pdf" }).click();
    expect((await download).suggestedFilename()).toBe("curp-e2e.pdf");
  });
});
