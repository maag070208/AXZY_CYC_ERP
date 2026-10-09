import { expect, test, type APIRequestContext, type Page } from "@playwright/test";
import { E2E, newRunId, route } from "./support/env";
import { apiAs, signIn } from "./support/api";
import { makeCurp } from "./support/people";

/**
 * Cursos, grupos e inscripciones (M07) en el navegador: alta de curso y de
 * grupo con horario, inscripción buscando al alumno, cupo lleno, cambio de
 * grupo, baja de la inscripción y el historial en el expediente del alumno.
 */
test.use({ storageState: { cookies: [], origins: [] } });

const RUN = newRunId();
const CLAVE = `E2E-W${RUN}`.slice(0, 30);
const COURSE = `E2E Electricidad ${RUN}`;
const TERM = `E2E Ciclo Web ${RUN}`;

let admin: APIRequestContext;
let control: APIRequestContext;
let termId: string;
const students: Array<{ id: string; nombre: string }> = [];
let groupUrl = "";

const student = async (label: string) => {
  const birth = "2001-03-10";
  const nombres = `E2E ${label} ${RUN}`;
  const res = await control.post("students", {
    data: { nombres, apellidoPaterno: "Inscrito", curp: makeCurp(birth), fechaNacimiento: birth },
  });
  expect(res.status(), await res.text()).toBe(201);
  const body = await res.json();
  return { id: body.id as string, nombre: body.nombreCompleto as string };
};

test.beforeAll(async () => {
  admin = await apiAs(E2E.admin.username);
  control = await apiAs(E2E.control.username);
  const term = await admin.post("terms", { data: { nombre: TERM, fechaInicio: "2026-08-01", fechaFin: "2026-12-15" } });
  expect(term.status()).toBe(201);
  termId = (await term.json()).id;
  students.push(await student("Uno"), await student("Dos"), await student("Tres"));
});

test.afterAll(async () => {
  await admin.dispose();
  await control.dispose();
});

const roster = (page: Page) => page.locator("tr", { hasText: RUN });
const rowOf = (page: Page, name: string) => page.locator("tr", { hasText: name });

async function enrollByName(page: Page, name: string): Promise<void> {
  await page.getByRole("button", { name: "Inscribir alumno" }).click();
  const dialog = page.getByRole("dialog");
  await dialog.locator('input[name="studentSearch"]').fill(name);
  await dialog.getByRole("button", { name: `Inscribir ${name}` }).click();
  await expect(page.getByText(`${name} quedó inscrito`)).toBeVisible();
}

test.describe.serial("cursos y grupos", () => {
  test("ADMIN da de alta un curso; la clave se normaliza a mayúsculas", async ({ page }) => {
    await signIn(page, E2E.admin.username);
    await page.goto(route("/courses"));
    await page.getByRole("button", { name: "Nuevo curso" }).click();
    const dialog = page.getByRole("dialog");
    await dialog.locator('input[name="clave"]').fill(CLAVE.toLowerCase());
    await dialog.locator('input[name="nombre"]').fill(COURSE);
    await dialog.getByRole("button", { name: "Guardar" }).click();
    await expect(page.getByText("Curso creado")).toBeVisible();
    await page.getByPlaceholder("Buscar...").nth(1).fill(CLAVE);
    await expect(page.locator("tr", { hasText: COURSE })).toContainText(CLAVE);
  });

  test("CONTROL_ESCOLAR abre un grupo con horario; un empalme interno se rechaza en pantalla", async ({ page }) => {
    await signIn(page, E2E.control.username);
    await page.goto(route("/groups"));
    await page.getByRole("button", { name: "Nuevo grupo" }).click();
    const dialog = page.getByRole("dialog");
    await dialog.locator('select[name="courseId"]').selectOption({ label: `${CLAVE} · ${COURSE}` });
    await dialog.locator('select[name="termId"]').selectOption({ label: TERM });
    await dialog.locator('input[name="nombre"]').fill("A");
    await dialog.locator('input[name="cupo"]').fill("2");
    await dialog.locator('select[name="teacherId"]').selectOption({ label: "E2E Profesor" });
    await dialog.locator('select[name="dia-0"]').selectOption("MARTES");
    await dialog.locator('select[name="inicio-0"]').selectOption("07:00");
    await dialog.locator('select[name="fin-0"]').selectOption("09:00");
    // Segundo bloque que se empalma con el primero.
    await dialog.getByRole("button", { name: "Agregar horario" }).click();
    await dialog.locator('select[name="dia-1"]').selectOption("MARTES");
    await dialog.locator('select[name="inicio-1"]').selectOption("08:00");
    await dialog.locator('select[name="fin-1"]').selectOption("10:00");
    await dialog.getByRole("button", { name: "Guardar" }).click();
    await expect(dialog.getByText("Los horarios se empalman entre sí")).toBeVisible();

    await dialog.locator('select[name="dia-1"]').selectOption("JUEVES");
    await dialog.getByRole("button", { name: "Guardar" }).click();
    await expect(page.getByText("Grupo creado")).toBeVisible();
    await expect(page).toHaveURL(/#\/groups\/[0-9a-f-]{36}$/);
    groupUrl = new URL(page.url()).hash.slice(1);
    await expect(page.getByText(`${COURSE} · Grupo A`)).toBeVisible();
    await expect(page.getByText("Ma 07:00–09:00 · Ju 08:00–10:00")).toBeVisible();
    await expect(page.getByText("E2E Profesor").first()).toBeVisible();
  });

  test("inscribe buscando al alumno; con el cupo lleno ya no se puede inscribir", async ({ page }) => {
    await signIn(page, E2E.control.username);
    await page.goto(route(groupUrl));
    await enrollByName(page, students[0].nombre);
    await enrollByName(page, students[1].nombre);
    await expect(roster(page)).toHaveCount(2);
    await expect(rowOf(page, students[0].nombre)).toContainText("Inscrito");
    await expect(page.getByRole("button", { name: "Inscribir alumno" })).toBeDisabled();
    await expect(page.getByText("Lleno")).toBeVisible();
  });

  test("cambio de grupo al grupo B del mismo curso y ciclo; baja de la inscripción", async ({ page }) => {
    const groupId = groupUrl.split("/").pop() as string;
    const original = await (await control.get(`groups/${groupId}`)).json();
    const b = await control.post("groups", {
      data: { courseId: original.courseId, termId, nombre: "B", cupo: 10, horario: [{ dia: "VIERNES", horaInicio: "07:00", horaFin: "08:00" }] },
    });
    expect(b.status()).toBe(201);

    await signIn(page, E2E.control.username);
    await page.goto(route(groupUrl));
    await page.getByRole("button", { name: `Cambiar de grupo ${students[0].nombre}` }).click();
    const dialog = page.getByRole("dialog");
    await dialog.locator('select[name="toGroupId"]').selectOption({ index: 1 });
    await dialog.getByRole("button", { name: "Cambiar de grupo" }).click();
    await expect(page.getByText("Cambio de grupo realizado")).toBeVisible();
    await expect(rowOf(page, students[0].nombre)).toContainText("Baja");

    await page.getByRole("button", { name: `Dar de baja ${students[1].nombre}` }).click();
    const drop = page.getByRole("dialog");
    await drop.locator('textarea[name="motivo"]').fill("Cambio de horario laboral");
    await drop.getByRole("button", { name: "Dar de baja" }).click();
    await expect(page.getByText("Inscripción dada de baja")).toBeVisible();
    await expect(rowOf(page, students[1].nombre)).toContainText("Baja");
    // Liberó lugares: se vuelve a poder inscribir.
    await expect(page.getByRole("button", { name: "Inscribir alumno" })).toBeEnabled();
  });

  test("el expediente del alumno muestra su historial de inscripciones", async ({ page }) => {
    await signIn(page, E2E.control.username);
    await page.goto(route(`/students/${students[0].id}`));
    await page.getByRole("button", { name: "Inscripciones", exact: true }).click();
    const rows = page.locator("tr", { hasText: COURSE });
    await expect(rows).toHaveCount(2);
    await expect(rows.filter({ hasText: "Inscrito" })).toContainText(`${COURSE}B`);
    await expect(rows.filter({ hasText: "Baja" })).toContainText(`${COURSE}A`);
  });

  test("el profesor ve su grupo pero no administra grupos ni inscripciones", async ({ page }) => {
    await signIn(page, E2E.teacher.username);
    await page.goto(route(groupUrl));
    await expect(page.getByText(`${COURSE} · Grupo A`)).toBeVisible();
    await expect(page.getByRole("button", { name: "Inscribir alumno" })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Editar" })).toHaveCount(0);
    await page.goto(route("/groups"));
    await expect(page.getByRole("button", { name: "Nuevo grupo" })).toHaveCount(0);
  });
});
