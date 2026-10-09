import { expect, test, type Page } from "@playwright/test";
import { E2E, newRunId, route } from "./support/env";
import { signIn } from "./support/api";
import { makeCurp, typedDate } from "./support/people";

/**
 * Alumnos (M03) y bajas/reingresos (M05) en el navegador: alta con tutor y
 * matrícula, validaciones, homónimo con confirmación, búsqueda, edición y el
 * ciclo baja → reingreso con historial.
 */
test.use({ storageState: { cookies: [], origins: [] } });

const RUN = newRunId();
const NOMBRES = `E2E Web ${RUN}`;
const BIRTH = "2011-04-20";
const CURP = makeCurp(BIRTH);

async function fillStudent(page: Page, curp: string): Promise<void> {
  await page.locator('input[name="firstNames"]').fill(NOMBRES);
  await page.locator('input[name="paternalSurname"]').fill("Navegador");
  await page.locator('input[name="maternalSurname"]').fill("Prueba");
  await page.locator('input[name="curp"]').fill(curp.toLowerCase());
  await page.locator('input[name="birthDate"]').fill(typedDate(BIRTH));
  await page.locator('select[name="gender"]').selectOption("F");
  await page.locator('input[name="email"]').fill(`web_${RUN.toLowerCase()}@e2e.local`);
}

async function addTutor(page: Page): Promise<void> {
  await page.getByRole("button", { name: "Agregar tutor" }).click();
  await page.locator('input[name="guardian-0-name"]').fill("E2E Tutora Web");
  await page.locator('input[name="guardian-0-relationship"]').fill("Madre");
  await page.locator('input[name="guardian-0-phone"]').fill("5512345678");
}

test.describe.serial("expediente de un alumno", () => {
  test("SCHOOL_CONTROL da de alta un alumno menor con tutor y recibe su matrícula", async ({ page }) => {
    await signIn(page, E2E.control.username);
    await page.goto(route("/students"));
    await page.getByRole("button", { name: "Nuevo alumno" }).click();
    await expect(page).toHaveURL(/#\/students\/new/);

    // CURP con dígito verificador incorrecto y menor sin tutor: no se envía.
    await fillStudent(page, `${CURP.slice(0, 17)}${(Number(CURP[17]) + 1) % 10}`);
    await page.getByRole("button", { name: "Guardar" }).click();
    await expect(page.getByText(/CURP inválida/)).toBeVisible();
    await expect(page.getByText("Un menor de edad necesita al menos un tutor")).toBeVisible();

    await page.locator('input[name="curp"]').fill(CURP);
    await addTutor(page);
    await page.getByRole("button", { name: "Guardar" }).click();

    await expect(page.getByText(/Alumno registrado con matrícula \d{4}-\d{4}/)).toBeVisible();
    await expect(page).toHaveURL(/#\/students\/[0-9a-f-]{36}$/);
    await expect(page.getByRole("heading", { name: `${NOMBRES} Navegador Prueba` })).toBeVisible();
    await expect(page.getByText("E2E Tutora Web")).toBeVisible();
    await expect(page.getByText("Responsable de pago")).toBeVisible();
  });

  test("un homónimo (mismo nombre y nacimiento) pide confirmación", async ({ page }) => {
    await signIn(page, E2E.control.username);
    await page.goto(route("/students/new"));
    await fillStudent(page, makeCurp(BIRTH, "M"));
    await addTutor(page);
    await page.getByRole("button", { name: "Guardar" }).click();

    await expect(page.getByText("¿Es otra persona?")).toBeVisible();
    await page.getByRole("button", { name: "Sí, es otra persona" }).click();
    await expect(page.getByText(/Alumno registrado con matrícula/)).toBeVisible();
  });

  test("la búsqueda por nombre encuentra al alumno y la edición cambia el teléfono", async ({ page }) => {
    await signIn(page, E2E.control.username);
    await page.goto(route("/students"));
    await page.getByPlaceholder("Buscar...").nth(1).fill(`${RUN} navegador`);
    const rows = page.locator("tbody tr", { hasText: NOMBRES });
    await expect(rows).toHaveCount(2);

    await page.locator("tbody tr", { hasText: CURP }).click();
    await page.getByRole("button", { name: "Editar" }).click();
    await expect(page.locator('input[name="curp"]')).toHaveValue(CURP);
    await page.locator('input[name="phone"]').fill("5587654321");
    await page.getByRole("button", { name: "Guardar" }).click();
    await expect(page.getByText("Alumno actualizado")).toBeVisible();
    await expect(page.getByText("5587654321")).toBeVisible();
  });

  test("baja con motivo del catálogo y reingreso; el historial lo muestra", async ({ page }) => {
    await signIn(page, E2E.control.username);
    await page.goto(route("/students"));
    await page.getByPlaceholder("Buscar...").nth(2).fill(CURP);
    await page.locator("tbody tr", { hasText: CURP }).click();

    await page.getByRole("button", { name: "Dar de baja" }).click();
    const withdraw = page.getByRole("dialog");
    await withdraw.locator('select[name="reasonId"]').selectOption({ label: "Cambio de domicilio" });
    await expect(withdraw.locator('input[name="reason"]')).toHaveValue("Cambio de domicilio");
    await withdraw.locator('textarea[name="notes"]').fill("Se muda a Puebla");
    await withdraw.getByRole("button", { name: "Dar de baja" }).click();
    await expect(page.getByText("Baja registrada")).toBeVisible();
    await expect(page.getByText("Baja", { exact: true }).first()).toBeVisible();

    await page.getByRole("button", { name: "Reingresar" }).click();
    const back = page.getByRole("dialog");
    await back.locator('input[name="reason"]').fill("Regresa a la ciudad");
    await back.getByRole("button", { name: "Reingresar" }).click();
    await expect(page.getByText("Reingreso registrado")).toBeVisible();

    await page.getByRole("button", { name: "Movimientos", exact: true }).click();
    const history = page.locator("tbody tr");
    await expect(history).toHaveCount(2);
    await expect(history.first()).toContainText("Reingreso");
    await expect(history.nth(1)).toContainText("Se muda a Puebla");
  });

  test("TEACHER no da de alta alumnos (ni por URL)", async ({ page }) => {
    await signIn(page, E2E.teacher.username);
    await page.goto(route("/students"));
    await expect(page.getByRole("button", { name: "Nuevo alumno" })).toHaveCount(0);
    await page.goto(route("/students/new"));
    await expect(page).toHaveURL(/#\/$/);
  });
});
