import { expect, test, type APIRequestContext, type Page } from "@playwright/test";
import { E2E, newRunId, route } from "./support/env";
import { apiAs, signIn } from "./support/api";
import { makeCurp } from "./support/people";

/**
 * Asistencia y notificaciones (M18–M19) en el navegador: el profesor crea la
 * sesión y pasa lista (una falta), el porcentaje baja del umbral y marca alerta;
 * solicita el justificante desde el expediente del alumno y lo aprueba en la
 * bandeja; la falta pasa a justificada y la alerta se limpia. En el centro de
 * notificaciones se da de alta una plantilla y se encola/envía un aviso.
 */
test.use({ storageState: { cookies: [], origins: [] } });

const RUN = newRunId();
const CLAVE = `E2E-A${RUN}`.slice(0, 30);
const COURSE = `E2E Asistencia ${RUN}`;
const TERM = `E2E Ciclo Asistencia ${RUN}`;
const GROUP = "A";
const TEMPLATE = `E2E_AVISO_${RUN}`.replace(/[^A-Z0-9_]/g, "").slice(0, 60);
const DEST = `e2e_dest_${RUN.toLowerCase()}@e2e.local`;

let admin: APIRequestContext;
let control: APIRequestContext;
let groupId: string;
let pupilId: string;
let pupilName: string;

test.beforeAll(async () => {
  admin = await apiAs(E2E.admin.username);
  control = await apiAs(E2E.control.username);
  const term = await (await admin.post("terms", { data: { name: TERM, startDate: "2026-08-01", endDate: "2026-12-15" } })).json();
  const course = await (await admin.post("courses", { data: { code: CLAVE, name: COURSE } })).json();
  const teachers = await (await control.post("teachers/query", { data: { page: 1, limit: 5, filters: { email: "e2e_profesor@e2e.local" } } })).json();
  const group = await control.post("groups", {
    data: { courseId: course.id, termId: term.id, teacherId: teachers.data[0].id, name: GROUP, capacity: 10, schedule: [{ day: "MONDAY", startTime: "09:00", endTime: "11:00" }] },
  });
  expect(group.status(), await group.text()).toBe(201);
  groupId = (await group.json()).id;

  const birth = "2004-05-05";
  const student = await control.post("students", {
    data: { firstNames: `E2E Asistencia ${RUN}`, paternalSurname: "Pase", curp: makeCurp(birth, "M"), birthDate: birth },
  });
  expect(student.status(), await student.text()).toBe(201);
  const s = await student.json();
  pupilId = s.id;
  pupilName = s.fullName;
  expect((await control.post(`groups/${groupId}/enroll`, { data: { studentId: s.id } })).status()).toBe(201);
});

test.afterAll(async () => {
  await admin.dispose();
  await control.dispose();
});

async function openTab(page: Page, tab: string): Promise<void> {
  // Los títulos de pestaña pueden coincidir con el menú lateral (p. ej.
  // «Asistencia»); el contenido de la página vive dentro de <main>.
  await page.locator("main").getByRole("button", { name: tab, exact: true }).click();
}

test.describe.serial("asistencia y notificaciones", () => {
  test("M18 el profesor pasa lista, se dispara la alerta y el justificante la limpia", async ({ page }) => {
    await signIn(page, E2E.teacher.username);

    // Pase de lista: una sesión con una falta.
    await page.goto(route(`/groups/${groupId}`));
    await openTab(page, "Asistencia");
    await page.getByRole("button", { name: "Nueva sesión" }).click();
    const session = page.getByRole("dialog", { name: "Nueva sesión" });
    await session.getByRole("button", { name: "Guardar" }).click();
    const roll = page.getByRole("dialog", { name: /Pase de lista/ });
    await roll.getByRole("button", { name: `${pupilName} Falta` }).click();
    await roll.getByRole("button", { name: "Guardar pase" }).click();
    await expect(page.getByText(/Pase guardado/)).toBeVisible();

    // El porcentaje cae a 0 % y el alumno queda en alerta.
    const summaryRow = page.locator("tr", { hasText: pupilName });
    await expect(summaryRow).toContainText("0%");
    await expect(summaryRow).toContainText("En alerta");

    // El profesor solicita el justificante desde el expediente del alumno.
    await page.goto(route(`/students/${pupilId}`));
    await openTab(page, "Asistencia");
    await page.locator("main").locator("tr", { hasText: "Falta" }).getByRole("button", { name: "Justificar" }).click();
    const request = page.getByRole("dialog", { name: /Justificar falta/ });
    await request.locator('textarea[name="reason"]').fill("Certificado médico E2E");
    await request.getByRole("button", { name: "Justificar" }).click();
    await expect(page.getByText("Justificante solicitado")).toBeVisible();

    // La bandeja del profesor: aprueba el justificante y la falta pasa a justificada.
    await page.goto(route("/attendance"));
    await page.locator("tr", { hasText: pupilName }).getByRole("button", { name: `Aprobar ${pupilName}` }).click();
    const resolve = page.getByRole("dialog", { name: /Aprobar justificante de/ });
    await resolve.locator('textarea[name="note"]').fill("Comprobante válido");
    await resolve.getByRole("button", { name: "Aprobar" }).click();
    await expect(page.getByText("Justificante aprobado")).toBeVisible();

    // La alerta se limpia: asistencia al 100 %.
    await page.goto(route(`/groups/${groupId}`));
    await openTab(page, "Asistencia");
    const clean = page.locator("tr", { hasText: pupilName });
    await expect(clean).toContainText("100%");
    await expect(clean).not.toContainText("En alerta");
  });

  test("M19 se administra una plantilla y se encola/envía un aviso", async ({ page }) => {
    await signIn(page, E2E.admin.username);
    await page.goto(route("/notifications"));

    await openTab(page, "Plantillas");
    await page.getByRole("button", { name: "Nueva plantilla" }).click();
    const form = page.getByRole("dialog", { name: "Nueva plantilla" });
    await form.locator('input[name="code"]').fill(TEMPLATE);
    await form.locator('input[name="name"]').fill(`Aviso E2E ${RUN}`);
    await form.locator('input[name="subject"]').fill("Aviso {{name}}");
    await form.locator('textarea[name="body"]').fill("Hola {{name}}, esto es una prueba E2E.");
    await form.getByRole("button", { name: "Guardar" }).click();
    await expect(page.getByText("Plantilla creada")).toBeVisible();

    await openTab(page, "Envíos");
    await page.getByRole("button", { name: "Enviar" }).click();
    const send = page.getByRole("dialog", { name: "Enviar notificación" });
    await send.locator('input[name="recipient"]').fill(DEST);
    await send.locator('input[name="subject"]').fill("Aviso de prueba");
    await send.locator('textarea[name="body"]').fill("Cuerpo de prueba E2E");
    await send.getByRole("button", { name: "Enviar" }).click();
    await expect(page.getByText("Notificación encolada")).toBeVisible();

    await page.getByRole("button", { name: "Procesar cola" }).click();
    await expect(page.getByText(/Cola:/)).toBeVisible();

    const outboxRow = page.locator("tr", { hasText: DEST });
    await expect(outboxRow).toContainText("Enviado", { timeout: 20_000 });
  });
});
