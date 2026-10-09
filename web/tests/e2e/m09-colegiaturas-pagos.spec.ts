import { expect, test, type APIRequestContext, type Page } from "@playwright/test";
import { E2E, newRunId, route } from "./support/env";
import { apiAs, signIn } from "./support/api";
import { makeCurp, typedDate } from "./support/people";

/**
 * Colegiaturas y pagos (M09) en el navegador: concepto, cargo individual,
 * cobro parcial con recibo en PDF, liquidación, cancelación de pago con motivo
 * y estado de cuenta del alumno con su PDF.
 */
test.use({ storageState: { cookies: [], origins: [] } });

const RUN = newRunId();
const CONCEPT = `E2E Colegiatura Web ${RUN}`;
let control: APIRequestContext;
let student: { id: string; name: string };

test.beforeAll(async () => {
  control = await apiAs(E2E.control.username);
  const res = await control.post("students", {
    data: { firstNames: `E2E Pago ${RUN}`, paternalSurname: "Caja", curp: makeCurp("2000-04-04"), birthDate: "2000-04-04" },
  });
  expect(res.status()).toBe(201);
  const body = await res.json();
  student = { id: body.id, name: body.fullName };
});

test.afterAll(async () => {
  await control.dispose();
});

const statementRow = (page: Page, text: string) => page.locator("[data-role=statement] tbody tr", { hasText: text });

async function openStatement(page: Page): Promise<void> {
  await page.goto(route(`/students/${student.id}`));
  await page.getByRole("button", { name: "Estado de cuenta", exact: true }).click();
}

test.describe.serial("cobranza", () => {
  test("SCHOOL_CONTROL da de alta un concepto de cobro", async ({ page }) => {
    await signIn(page, E2E.control.username);
    await page.goto(route("/finance"));
    await page.getByRole("button", { name: "Conceptos", exact: true }).click();
    await page.getByRole("button", { name: "Nuevo concepto" }).click();
    const dialog = page.getByRole("dialog");
    await dialog.locator('input[name="name"]').fill(CONCEPT);
    await dialog.locator('input[name="amount"]').fill("3000");
    await dialog.locator('select[name="type"]').selectOption("TUITION");
    await dialog.getByRole("button", { name: "Guardar" }).click();
    await expect(page.getByText("Concepto creado")).toBeVisible();
  });

  test("cargo desde el estado de cuenta con descuento y monto base del concepto", async ({ page }) => {
    await signIn(page, E2E.control.username);
    await openStatement(page);
    await expect(page.getByText("Sin cargos vigentes")).toBeVisible();
    await page.getByRole("button", { name: "Nuevo cargo" }).click();
    const dialog = page.getByRole("dialog");
    await expect(dialog.getByText(student.name)).toBeVisible();
    await dialog.locator('select[name="conceptId"]').selectOption({ label: `${CONCEPT} · $3,000.00` });
    await dialog.locator('input[name="description"]').fill("Colegiatura septiembre");
    await dialog.locator('input[name="discount"]').fill("500");
    await dialog.locator('input[name="dueDate"]').fill(typedDate("2026-12-10"));
    await dialog.getByRole("button", { name: "Guardar" }).click();
    await expect(page.getByText("Cargo creado")).toBeVisible();
    await expect(statementRow(page, "Colegiatura septiembre")).toContainText("$2,500.00");
    await expect(page.locator("[data-role=total-balance]")).toHaveText("$2,500.00");
  });

  test("cobro parcial: no deja exceder el saldo, emite folio y descarga el recibo", async ({ page }) => {
    await signIn(page, E2E.control.username);
    await openStatement(page);
    await page.getByRole("button", { name: "Cobrar Colegiatura septiembre" }).click();
    const dialog = page.getByRole("dialog");
    await expect(dialog.locator("[data-role=balance]")).toHaveText("$2,500.00");
    await dialog.locator('input[name="amount"]').fill("3000");
    await dialog.getByRole("button", { name: "Registrar pago" }).click();
    await expect(dialog.getByText("No puede exceder el saldo ($2,500.00)")).toBeVisible();

    await dialog.locator('input[name="amount"]').fill("1000");
    await dialog.locator('select[name="method"]').selectOption("TRANSFER");
    await dialog.locator('input[name="reference"]').fill("SPEI 123");
    const download = page.waitForEvent("download");
    await dialog.getByRole("button", { name: "Registrar pago" }).click();
    await expect(page.getByText(/Pago registrado · folio REC-\d{4}-\d{6}/)).toBeVisible();
    expect((await download).suggestedFilename()).toMatch(/^recibo-REC-\d{4}-\d{6}\.pdf$/);
    await expect(statementRow(page, "Colegiatura septiembre")).toContainText("Parcial");
    await expect(page.locator("[data-role=total-balance]")).toHaveText("$1,500.00");
  });

  test("liquida el saldo; el pago aparece en Cobranza y se cancela con motivo", async ({ page }) => {
    await signIn(page, E2E.control.username);
    await openStatement(page);
    await page.getByRole("button", { name: "Cobrar Colegiatura septiembre" }).click();
    await page.getByRole("dialog").getByRole("button", { name: "Registrar pago" }).click();
    await expect(statementRow(page, "Colegiatura septiembre")).toContainText("Pagado");
    await expect(page.getByRole("button", { name: "Cobrar Colegiatura septiembre" })).toHaveCount(0);

    await page.goto(route("/finance"));
    await page.getByRole("button", { name: "Pagos", exact: true }).click();
    await page.getByPlaceholder("Buscar...").nth(1).fill(RUN);
    const rows = page.locator("tr", { hasText: student.name });
    await expect(rows).toHaveCount(2);
    const receiptNumber = (await rows.first().locator("td").first().innerText()).trim();
    await page.getByRole("button", { name: `Cancelar pago ${receiptNumber}` }).click();
    const dialog = page.getByRole("dialog");
    await dialog.getByRole("button", { name: "Cancelar pago" }).click();
    await expect(dialog.getByText("Escribe un motivo (mínimo 3 caracteres)")).toBeVisible();
    await dialog.locator('textarea[name="reason"]').fill("Transferencia rechazada");
    await dialog.getByRole("button", { name: "Cancelar pago" }).click();
    await expect(page.getByText("Pago cancelado")).toBeVisible();
    await expect(page.locator("tr", { hasText: receiptNumber })).toContainText("Cancelado");

    await openStatement(page);
    await expect(statementRow(page, "Colegiatura septiembre")).toContainText("Parcial");
  });

  test("estado de cuenta en PDF", async ({ page }) => {
    await signIn(page, E2E.control.username);
    await openStatement(page);
    const download = page.waitForEvent("download");
    await page.getByRole("button", { name: "Descargar PDF" }).click();
    expect((await download).suggestedFilename()).toMatch(/^estado-de-cuenta-.+\.pdf$/);
  });

  test("el profesor no ve Cobranza", async ({ page }) => {
    await signIn(page, E2E.teacher.username);
    await page.goto(route("/finance"));
    await expect(page).toHaveURL(/#\/$/);
  });
});
