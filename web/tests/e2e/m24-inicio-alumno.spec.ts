import { expect, test, type APIRequestContext } from "@playwright/test";
import { E2E, newRunId, route } from "./support/env";
import { apiAs, createUser, signIn } from "./support/api";
import { makeCurp } from "./support/people";

/**
 * Inicio del alumno (M21) en el navegador: entra y ve **su** ciclo —saldo,
 * materias y horario— en lugar del tablero institucional; y sigue sin acceso a
 * las pantallas de dinero o de gestión.
 */
test.use({ storageState: { cookies: [], origins: [] } });

const RUN = newRunId();
const PUPIL = `e2e_inicio_${RUN}`.toLowerCase().slice(0, 40);
const PUPIL_PASSWORD = `${E2E.password}In7`;
const COURSE = `E2E Materia Inicio ${RUN}`;
const CHARGE = `Colegiatura de prueba ${RUN}`;
// El encabezado y el menú muestran el nombre de la **cuenta**, no el del expediente.
const PUPIL_NAME = `E2E Alumna Inicio ${RUN}`;

let admin: APIRequestContext;
let control: APIRequestContext;
let studentId = "";
let studentName = "";

test.beforeAll(async () => {
  admin = await apiAs(E2E.admin.username);
  control = await apiAs(E2E.control.username);

  const term = await (await admin.post("terms", { data: { name: `E2E Inicio ${RUN}`, startDate: "2026-08-01", endDate: "2026-12-15" } })).json();
  const course = await (await admin.post("courses", { data: { code: `E2EIN${RUN}`.slice(0, 20).toUpperCase(), name: COURSE } })).json();
  const group = await control.post("groups", {
    data: {
      courseId: course.id,
      termId: term.id,
      name: "Inicio",
      capacity: 30,
      schedule: [{ day: "MONDAY", startTime: "08:00", endTime: "10:00" }],
    },
  });
  expect(group.status(), await group.text()).toBe(201);
  const groupId = (await group.json()).id;

  // Cuenta de alumno (nace con contraseña temporal) y su expediente vinculado.
  const user = await createUser(admin, { username: PUPIL, name: PUPIL_NAME, roles: ["STUDENT"] });
  const pupilApi = await apiAs(PUPIL);
  expect((await pupilApi.post("auth/change-password", { data: { currentPassword: E2E.password, newPassword: PUPIL_PASSWORD } })).status()).toBe(200);
  await pupilApi.dispose();

  const birth = "2004-05-05";
  const student = await control.post("students", {
    data: { firstNames: `E2E Inicio ${RUN}`, paternalSurname: "Tablero", curp: makeCurp(birth, "M"), birthDate: birth, userId: user.id },
  });
  expect(student.status(), await student.text()).toBe(201);
  const created = await student.json();
  studentId = created.id;
  studentName = PUPIL_NAME;
  expect((await control.post(`groups/${groupId}/enroll`, { data: { studentId } })).status()).toBe(201);

  // Un cargo vencido: el alumno debe ver su saldo y la mora.
  const concept = await (
    await admin.post("fee-concepts", { data: { name: `E2E Concepto Inicio ${RUN}`, amount: 1200, type: "TUITION" } })
  ).json();
  const charge = await control.post("charges", {
    data: { studentId, conceptId: concept.id, termId: term.id, description: CHARGE, amount: 1200, dueDate: "2026-09-05" },
  });
  expect(charge.status(), await charge.text()).toBe(201);
});

test.afterAll(async () => {
  await admin.dispose();
  await control.dispose();
});

test("el alumno ve su Inicio con saldo, materias y horario", async ({ page }) => {
  await signIn(page, PUPIL, PUPIL_PASSWORD);
  await page.goto(route("/"));

  const board = page.locator("[data-role=student-dashboard]");
  await expect(board).toBeVisible();

  const kpis = page.locator("[data-role=student-kpis]");
  for (const label of ["Exámenes por presentar", "Saldo pendiente", "Promedio general"]) {
    await expect(kpis.getByText(label, { exact: true })).toBeVisible();
  }
  // Su saldo y el cargo vencido, con su nombre de alumna en el encabezado.
  await expect(board.getByText("$1,200.00").first()).toBeVisible();
  await expect(board.getByText(CHARGE)).toBeVisible();
  await expect(page.getByText(studentName, { exact: false }).first()).toBeVisible();

  // Materias y horario del grupo.
  await expect(board.getByText(COURSE).first()).toBeVisible();
  await expect(board.getByText("Lunes")).toBeVisible();

  // No ve el tablero institucional ni bloques de dinero de gestión.
  await expect(page.locator("[data-role=dashboard-kpis]")).toHaveCount(0);
  await expect(page.locator("[data-role=dashboard-finance]")).toHaveCount(0);
});

test("el alumno no entra a pantallas de dinero ni de gestión", async ({ page }) => {
  await signIn(page, PUPIL, PUPIL_PASSWORD);
  for (const path of ["/finance", "/reports", "/users", "/expenses"]) {
    await page.goto(route(path));
    await expect(page).not.toHaveURL(new RegExp(`#${path}`));
  }
});
