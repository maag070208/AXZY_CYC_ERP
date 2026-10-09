import { expect, test, type APIRequestContext } from "@playwright/test";
import { E2E, newRunId, route } from "./support/env";
import { apiAs, signIn } from "./support/api";
import { makeCurp } from "./support/people";

/**
 * Programas y planes de pago (M22) en el navegador: alta de carrera, plan de
 * estudios por periodo, y asignación del plan al alumno (genera los cargos).
 */
test.use({ storageState: { cookies: [], origins: [] } });

const RUN = newRunId();
const CODE = `E2E-M22-${RUN}`.toUpperCase().slice(0, 30);
const COURSE = `E2E Curso M22 ${RUN}`;
const PROGRAM = `Mecánico Diésel ${RUN}`;

let admin: APIRequestContext;
let studentId: string;
let studentName: string;

test.beforeAll(async () => {
  admin = await apiAs(E2E.admin.username);
  const course = await admin.post("courses", { data: { code: `E2E-M22C-${RUN}`.toUpperCase().slice(0, 30), name: COURSE } });
  expect(course.status(), await course.text()).toBe(201);
  const birth = "2000-06-06";
  const student = await admin.post("students", {
    data: { firstNames: `E2E M22 ${RUN}`, paternalSurname: "Pago", curp: makeCurp(birth, "M"), birthDate: birth },
  });
  expect(student.status(), await student.text()).toBe(201);
  const s = await student.json();
  studentId = s.id;
  studentName = s.fullName;
});

test.afterAll(async () => {
  await admin.dispose();
});

test("M22 crea la carrera, arma el plan de estudios y genera el plan de pagos", async ({ page }) => {
  await signIn(page, E2E.admin.username);

  // 1) Carrera.
  await page.goto(route("/programs"));
  await page.getByRole("button", { name: "Nueva carrera" }).click();
  const form = page.getByRole("dialog", { name: "Nueva carrera" });
  await form.locator('input[name="code"]').fill(CODE);
  await form.locator('input[name="name"]').fill(PROGRAM);
  await form.locator('select[name="periodType"]').selectOption("QUADRIMESTER");
  await form.locator('input[name="periodCount"]').fill("3");
  await form.locator('input[name="monthlyFee"]').fill("1500");
  await form.locator('input[name="enrollmentFee"]').fill("1000");
  await form.getByRole("button", { name: "Guardar" }).click();
  await expect(page.getByText("Carrera creada")).toBeVisible();
  await expect(page).toHaveURL(/#\/programs\/[0-9a-f-]{36}$/);

  // 2) Plan de estudios: materia en el periodo 1.
  await page.locator('select[name="course-1"]').selectOption({ label: `${`E2E-M22C-${RUN}`.toUpperCase().slice(0, 30)} · ${COURSE}` });
  await page.getByRole("button", { name: "Agregar" }).first().click();
  await page.getByRole("button", { name: "Guardar plan" }).click();
  await expect(page.getByText("Plan de estudios guardado")).toBeVisible();

  // 3) Asignar el plan al alumno.
  await page.goto(route(`/students/${studentId}`));
  await page.locator("main").getByRole("button", { name: "Plan de pagos", exact: true }).click();
  await page.getByRole("button", { name: "Asignar plan" }).click();
  const assign = page.getByRole("dialog", { name: /Asignar plan/ });
  await assign.locator('select[name="programId"]').selectOption({ label: `${CODE} · ${PROGRAM}` });
  await assign.getByRole("button", { name: "Generar plan" }).click();
  await expect(page.getByText(/Plan generado/)).toBeVisible();

  // El plan aparece con sus 15 cargos (3 reinscripciones + 12 mensualidades).
  const row = page.locator("tr", { hasText: PROGRAM });
  await expect(row).toContainText("15 cargos");
  await expect(row).toContainText("Activo");
});
