import { expect, test, type APIRequestContext, type Page } from "@playwright/test";
import { E2E, newRunId, route } from "./support/env";
import { apiAs, signIn } from "./support/api";
import { makeCurp } from "./support/people";

/**
 * Exámenes y calificaciones (M08) en el navegador: el profesor arma sus
 * instrumentos, captura en el libro (con validación de rango), ve la
 * proyección de la final y cierra el grupo; la final aparece en el kardex.
 */
test.use({ storageState: { cookies: [], origins: [] } });

const RUN = newRunId();
const COURSE = `E2E Motores ${RUN}`;

let admin: APIRequestContext;
let control: APIRequestContext;
let groupId: string;
const students: Array<{ id: string; nombre: string }> = [];

test.beforeAll(async () => {
  admin = await apiAs(E2E.admin.username);
  control = await apiAs(E2E.control.username);
  const term = await (
    await admin.post("terms", { data: { nombre: `E2E Ciclo Calif ${RUN}`, fechaInicio: "2026-08-01", fechaFin: "2026-12-15" } })
  ).json();
  const course = await (await admin.post("courses", { data: { clave: `E2E-M${RUN}`.slice(0, 30), nombre: COURSE } })).json();
  const teachers = await (
    await control.post("teachers/query", { data: { page: 1, limit: 5, filters: { email: "e2e_profesor@e2e.local" } } })
  ).json();
  const group = await control.post("groups", {
    data: {
      courseId: course.id,
      termId: term.id,
      teacherId: teachers.data[0].id,
      nombre: "Único",
      cupo: 10,
      horario: [{ dia: "LUNES", horaInicio: "16:00", horaFin: "18:00" }],
    },
  });
  expect(group.status(), await group.text()).toBe(201);
  groupId = (await group.json()).id;
  for (const label of ["Alta", "Baja"]) {
    const birth = "2000-05-20";
    const res = await control.post("students", {
      data: { nombres: `E2E Nota${label} ${RUN}`, apellidoPaterno: "Calif", curp: makeCurp(birth), fechaNacimiento: birth },
    });
    const s = await res.json();
    students.push({ id: s.id, nombre: s.nombreCompleto });
    expect((await control.post(`groups/${groupId}/enroll`, { data: { studentId: s.id } })).status()).toBe(201);
  }
});

test.afterAll(async () => {
  await admin.dispose();
  await control.dispose();
});

const cell = (page: Page, student: string, assessment: string) => page.getByLabel(`${student} · ${assessment}`);
const bookRow = (page: Page, student: string) => page.locator("[data-role=gradebook] tr", { hasText: student });

async function openGrades(page: Page): Promise<void> {
  await page.goto(route(`/groups/${groupId}`));
  await page.getByRole("button", { name: "Calificaciones", exact: true }).click();
}

async function addAssessment(page: Page, nombre: string, tipo: string, ponderacion: string): Promise<void> {
  await page.getByRole("button", { name: "Nuevo instrumento" }).click();
  const dialog = page.getByRole("dialog");
  await dialog.locator('input[name="nombre"]').fill(nombre);
  await dialog.locator('select[name="tipo"]').selectOption({ label: tipo });
  await dialog.locator('input[name="ponderacion"]').fill(ponderacion);
  await dialog.getByRole("button", { name: "Guardar" }).click();
  await expect(page.getByText("Instrumento creado")).toBeVisible();
}

test.describe.serial("calificaciones", () => {
  test("el profesor ve solo su grupo y arma los instrumentos hasta el 100 %", async ({ page }) => {
    await signIn(page, E2E.teacher.username);
    await page.goto(route("/groups"));
    await expect(page.locator("tr", { hasText: COURSE })).toBeVisible();

    await openGrades(page);
    await expect(page.getByText("Aún no hay instrumentos de evaluación")).toBeVisible();
    await addAssessment(page, "Parcial 1", "Parcial", "60");
    await expect(page.getByText("Ponderaciones: 60% de 100%")).toBeVisible();
    // El 40 % restante se sugiere solo.
    await page.getByRole("button", { name: "Nuevo instrumento" }).click();
    await expect(page.getByRole("dialog").locator('input[name="ponderacion"]')).toHaveValue("40");
    await page.getByRole("dialog").getByRole("button", { name: "Cancelar" }).click();
    await addAssessment(page, "Examen final", "Final", "40");
    await expect(page.getByText("Ponderaciones completas (100%)")).toBeVisible();
  });

  test("captura en el libro: rango validado, guardado en lote y proyección de la final", async ({ page }) => {
    await signIn(page, E2E.teacher.username);
    await openGrades(page);
    const [alta, baja] = students.map((s) => s.nombre);

    await cell(page, alta, "Parcial 1").fill("120");
    await expect(cell(page, alta, "Parcial 1")).toHaveAttribute("title", "Entre 0 y 100");
    await expect(page.getByRole("button", { name: "Guardar calificaciones" })).toBeDisabled();

    await cell(page, alta, "Parcial 1").fill("90");
    await cell(page, alta, "Examen final").fill("80");
    await cell(page, baja, "Parcial 1").fill("50");
    await cell(page, baja, "Examen final").fill("60.5");
    await page.getByRole("button", { name: "Guardar calificaciones" }).click();
    await expect(page.getByText("4 calificación(es) guardada(s)")).toBeVisible();

    // 90·0.6 + 80·0.4 = 86 · 50·0.6 + 60.5·0.4 = 54.2
    await expect(bookRow(page, alta).locator("[data-role=final]")).toHaveText("86");
    await expect(bookRow(page, alta)).toContainText("Acreditado");
    await expect(bookRow(page, baja).locator("[data-role=final]")).toHaveText("54.2");
    await expect(bookRow(page, baja)).toContainText("Reprobado");
  });

  test("cierra el grupo: las calificaciones quedan fijas y la final llega al kardex", async ({ page, browser }) => {
    await signIn(page, E2E.teacher.username);
    await openGrades(page);
    await page.getByRole("button", { name: "Cerrar grupo" }).click();
    await page.getByRole("button", { name: "Cerrar grupo" }).last().click();
    await expect(page.getByText("Grupo cerrado: finales enviadas al kardex")).toBeVisible();
    await expect(page.getByText(/Grupo cerrado el/)).toBeVisible();
    await expect(cell(page, students[0].nombre, "Parcial 1")).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Nuevo instrumento" })).toHaveCount(0);

    // Control Escolar, en otra sesión, ve la final en el kardex del alumno.
    const context = await browser.newContext({ storageState: { cookies: [], origins: [] } });
    const other = await context.newPage();
    await signIn(other, E2E.control.username);
    await other.goto(route(`/students/${students[0].id}`));
    await other.getByRole("button", { name: "Kardex", exact: true }).click();
    const entry = other.locator("tr", { hasText: COURSE });
    await expect(entry).toContainText("86");
    await expect(entry).toContainText(/Acreditado/i);
    await context.close();
  });
});
