import { expect, test, type APIRequestContext, type Browser, type Page } from "@playwright/test";
import { E2E, newRunId, route } from "./support/env";
import { apiAs, createUser, signIn } from "./support/api";
import { makeCurp, typedDate } from "./support/people";

/**
 * Examen en línea de punta a punta (M14–M17) en el navegador: el profesor da
 * de alta reactivos (forma y CSV con vista previa), arma y publica el examen;
 * el alumno lo presenta con temporizador del servidor, autoguardado y
 * reanudación; el profesor revisa la pregunta abierta y la calificación llega
 * al libro de M08.
 */
test.use({ storageState: { cookies: [], origins: [] } });

const RUN = newRunId();
const CLAVE = `E2E-X${RUN}`.slice(0, 30);
const COURSE = `E2E Química ${RUN}`;
const EXAM = `E2E Parcial en línea ${RUN}`;
const PUPIL = `e2e_alumno_x_${RUN}`.toLowerCase();
// Las altas por ADMIN nacen con contraseña temporal: el alumno la cambia antes de entrar.
const PUPIL_PASSWORD = `${E2E.password}Ex9`;
const Q = {
  om: `E2E ¿Símbolo del sodio? ${RUN}`,
  vf: `E2E El agua hierve a 100 °C al nivel del mar ${RUN}`,
  open: `E2E Explica la ley de Boyle ${RUN}`,
};

let admin: APIRequestContext;
let control: APIRequestContext;
let prof: APIRequestContext;
let groupId: string;
let termName: string;
let examId: string;
let pupilName: string;

/** Día del calendario en la zona de la app, desplazado `offset` días. */
const dayFrom = (offset: number): string =>
  new Intl.DateTimeFormat("en-CA", { timeZone: "America/Mexico_City", year: "numeric", month: "2-digit", day: "2-digit" })
    .format(new Date(Date.now() + offset * 86_400_000));

test.beforeAll(async () => {
  admin = await apiAs(E2E.admin.username);
  control = await apiAs(E2E.control.username);
  prof = await apiAs(E2E.teacher.username);
  termName = `E2E Ciclo Línea ${RUN}`;
  const term = await (await admin.post("terms", { data: { name: termName, startDate: "2026-08-01", endDate: "2026-12-15" } })).json();
  const course = await (await admin.post("courses", { data: { code: CLAVE, name: COURSE } })).json();
  const teachers = await (
    await control.post("teachers/query", { data: { page: 1, limit: 5, filters: { email: "e2e_profesor@e2e.local" } } })
  ).json();
  const group = await control.post("groups", {
    data: { courseId: course.id, termId: term.id, teacherId: teachers.data[0].id, name: "Línea", capacity: 10, schedule: [{ day: "THURSDAY", startTime: "10:00", endTime: "12:00" }] },
  });
  expect(group.status(), await group.text()).toBe(201);
  groupId = (await group.json()).id;

  const user = await createUser(admin, { username: PUPIL, name: `E2E Alumna Línea ${RUN}`, roles: ["STUDENT"] });
  const pupil = await apiAs(PUPIL);
  const changed = await pupil.post("auth/change-password", { data: { currentPassword: E2E.password, newPassword: PUPIL_PASSWORD } });
  expect(changed.status(), await changed.text()).toBe(200);
  await pupil.dispose();
  const birth = "2004-03-03";
  const student = await control.post("students", {
    data: { firstNames: `E2E Línea ${RUN}`, paternalSurname: "Examen", curp: makeCurp(birth, "M"), birthDate: birth, userId: user.id },
  });
  expect(student.status(), await student.text()).toBe(201);
  const s = await student.json();
  pupilName = s.fullName;
  expect((await control.post(`groups/${groupId}/enroll`, { data: { studentId: s.id } })).status()).toBe(201);
  const assessment = await prof.post("assessments", { data: { groupId, name: "Parcial en línea", type: "PARTIAL", weight: 100, maxScore: 10 } });
  expect(assessment.status(), await assessment.text()).toBe(201);
});

test.afterAll(async () => {
  await admin.dispose();
  await control.dispose();
  await prof.dispose();
});

const pupilPage = async (browser: Browser): Promise<Page> => {
  const context = await browser.newContext({ storageState: { cookies: [], origins: [] }, locale: "es-MX", timezoneId: "America/Mexico_City" });
  const page = await context.newPage();
  await signIn(page, PUPIL, PUPIL_PASSWORD);
  return page;
};

test.describe.serial("examen en línea", () => {
  test("M14 el profesor da de alta un reactivo y carga otros por CSV con vista previa", async ({ page }) => {
    await signIn(page, E2E.teacher.username);
    await page.goto(route("/questions"));
    await page.getByRole("button", { name: "Nuevo reactivo" }).click();
    const form = page.getByRole("dialog", { name: "Nuevo reactivo" });
    await form.locator('select[name="courseId"]').selectOption({ label: `${CLAVE} · ${COURSE}` });
    await form.locator('textarea[name="text"]').fill(Q.om);
    await form.locator('input[name="points"]').fill("2");
    await form.locator('input[name="option-0"]').fill("Na");
    await form.locator('input[name="option-1"]').fill("So");
    await form.getByRole("button", { name: "Guardar" }).click();
    await expect(page.getByText("Reactivo creado")).toBeVisible();

    await page.getByRole("button", { name: "Importar CSV" }).click();
    const dialog = page.getByRole("dialog", { name: "Importar reactivos desde CSV" });
    const csv = [
      "curso,tema,tipo,enunciado,puntos,dificultad,opciones,correctas",
      `${CLAVE},Estados,VERDADERO_FALSO,${Q.vf},1,FACIL,,1`,
      `${CLAVE},Gases,ABIERTA,${Q.open},2,MEDIA,,`,
      `NO-EXISTE,,ABIERTA,Fila con curso inexistente,1,,,`,
    ].join("\n");
    await dialog.locator('input[name="csv"]').setInputFiles({ name: "reactivos.csv", mimeType: "text/csv", buffer: Buffer.from(csv, "utf-8") });
    await dialog.getByRole("button", { name: "Vista previa" }).click();
    await expect(dialog.getByText("2 de 3 fila(s) válidas")).toBeVisible();
    await expect(dialog.getByText(/Fila \d+: .*COURSE_NOT_FOUND/)).toBeVisible();
    await dialog.getByRole("button", { name: "Importar 2 reactivo(s)" }).click();
    await expect(page.getByText("2 reactivo(s) importados")).toBeVisible();
    await expect(page.getByText(Q.vf)).toBeVisible();
  });

  test("M15 el profesor configura el examen, arma los reactivos y lo publica", async ({ page }) => {
    await signIn(page, E2E.teacher.username);
    await page.goto(route("/exams"));
    await page.getByRole("button", { name: "Nuevo examen" }).click();
    const form = page.getByRole("dialog", { name: "Nuevo examen" });
    await form.locator('select[name="groupId"]').selectOption({ label: `${CLAVE} · Línea (${termName})` });
    await form.locator('input[name="title"]').fill(EXAM);
    await form.locator('input[name="opensAt"]').fill(typedDate(dayFrom(-1)));
    await form.locator('select[name="opensAt-time"]').selectOption("00:00");
    await form.locator('input[name="closesAt"]').fill(typedDate(dayFrom(7)));
    await form.locator('select[name="closesAt-time"]').selectOption("23:45");
    await form.locator('input[name="durationMin"]').fill("30");
    await form.locator('input[name="passingScore"]').fill("3");
    await form.locator('select[name="assessmentId"]').selectOption({ label: "Parcial en línea (100% · /10)" });
    await form.getByRole("button", { name: "Guardar" }).click();
    await expect(page.getByText("Examen creado")).toBeVisible();
    await expect(page).toHaveURL(/#\/exams\/[0-9a-f-]{36}$/);
    examId = page.url().split("/").pop() as string;

    await page.getByRole("button", { name: "Reactivos (0)", exact: true }).click();
    for (const text of [Q.om, Q.vf, Q.open]) await page.getByRole("button", { name: `Agregar ${text}` }).click();
    await expect(page.getByText("Total: 5 puntos")).toBeVisible();
    await page.getByRole("button", { name: "Guardar preguntas" }).click();
    await expect(page.getByText("Preguntas guardadas")).toBeVisible();
    await expect(page.getByRole("button", { name: "Reactivos (3)" })).toBeVisible();

    await page.getByRole("button", { name: "Publicar", exact: true }).click();
    await page.getByRole("button", { name: "Publicar", exact: true }).last().click();
    await expect(page.getByText("Examen publicado")).toBeVisible();
    await expect(page.getByText("Publicado", { exact: true })).toBeVisible();
  });

  test("M16 el alumno presenta: temporizador, autoguardado, reanudación y envío", async ({ browser }) => {
    const page = await pupilPage(browser);
    // El alumno ve su portal, no la administración de exámenes.
    await expect(page.getByRole("button", { name: "Mis exámenes" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Exámenes en línea" })).toHaveCount(0);
    await page.goto(route("/exams"));
    await expect(page).not.toHaveURL(/#\/exams/);

    await page.goto(route("/my-exams"));
    const card = page.getByRole("article", { name: EXAM });
    await expect(card.getByText("Abierto")).toBeVisible();
    await expect(card.getByText("Intentos: 0 de 1")).toBeVisible();
    await card.getByRole("button", { name: "Iniciar" }).click();
    await expect(page).toHaveURL(/#\/exam\/[0-9a-f-]{36}$/);
    await expect(page.locator("[data-role=exam-timer]")).toHaveText(/(29|30):\d\d/);

    await page.getByRole("radiogroup", { name: "Pregunta 1" }).getByLabel("Na").check();
    await page.getByRole("radiogroup", { name: "Pregunta 2" }).getByLabel("Verdadero").check();
    await expect(page.locator("[data-role=save-state]")).toHaveText(/Guardado/);
    await expect(page.getByText("2 de 3 respondidas")).toBeVisible();

    // Reanudar: al recargar, las respuestas siguen ahí y el tiempo no se reinicia.
    await page.reload();
    await expect(page.getByRole("radiogroup", { name: "Pregunta 1" }).getByLabel("Na")).toBeChecked();
    await expect(page.getByRole("radiogroup", { name: "Pregunta 2" }).getByLabel("Verdadero")).toBeChecked();

    await page.locator('textarea[name="q-3"]').fill("A temperatura constante, la presión es inversamente proporcional al volumen.");
    await page.getByRole("button", { name: "Enviar examen" }).click();
    await page.getByRole("button", { name: "Enviar examen" }).last().click();
    await expect(page.getByText("Examen enviado")).toBeVisible();
    await expect(page.locator("[data-role=attempt-score]")).toHaveText(/3\s*\/ 5/);
    await expect(page.getByText("Tu profesor revisará las preguntas abiertas.")).toBeVisible();

    await page.getByRole("button", { name: "Volver a mis exámenes" }).click();
    await expect(page.getByRole("article", { name: EXAM }).getByText("Sin intentos disponibles")).toBeVisible();
    await page.context().close();
  });

  test("M17 el profesor revisa la abierta y la calificación llega al libro", async ({ page }) => {
    await signIn(page, E2E.teacher.username);
    await page.goto(route(`/exams/${examId}`));
    await page.getByRole("button", { name: "Resultados", exact: true }).click();
    const row = page.locator("[data-role=exam-results] tr", { hasText: pupilName });
    await expect(row.getByText("Por revisar")).toBeVisible();
    await row.getByRole("button", { name: `Revisar 1 ${pupilName}` }).click();

    const dialog = page.getByRole("dialog", { name: `Intento 1 · ${pupilName}` });
    await expect(dialog.getByText("Puntaje: 3 de 5")).toBeVisible();
    await dialog.locator('input[name="review-points-3"]').fill("1.5");
    await dialog.locator('textarea[name="review-comment-3"]').fill("Falta el ejemplo.");
    await dialog.getByRole("button", { name: "Calificar", exact: true }).click();
    await expect(page.getByText("Respuesta calificada")).toBeVisible();
    await expect(dialog.getByText("Puntaje: 4.5 de 5")).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(row.getByText("Aprobado")).toBeVisible();
    await expect(row.getByText("4.5 / 5")).toBeVisible();

    // 4.5 de 5 → 9 sobre la escala 10 del instrumento vinculado.
    const book = await (await prof.get(`groups/${groupId}/gradebook`)).json();
    const assessment = book.assessments.find((a: { name: string }) => a.name === "Parcial en línea");
    expect(book.students[0].scores[assessment.id]).toBe(9);
    await page.goto(route(`/groups/${groupId}`));
    await page.getByRole("button", { name: "Calificaciones", exact: true }).click();
    await expect(page.getByLabel(`${pupilName} · Parcial en línea`)).toHaveValue("9");
  });
});
