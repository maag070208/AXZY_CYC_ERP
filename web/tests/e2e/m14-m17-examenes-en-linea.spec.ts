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
const Q = {
  om: `E2E ¿Símbolo del sodio? ${RUN}`,
  vf: `E2E El agua hierve a 100 °C al nivel del mar ${RUN}`,
  open: `E2E Explica la ley de Boyle ${RUN}`,
};

let admin: APIRequestContext;
let control: APIRequestContext;
let prof: APIRequestContext;
let groupId: string;
let termNombre: string;
let examId: string;
let pupilNombre: string;

/** Día del calendario en la zona de la app, desplazado `offset` días. */
const dayFrom = (offset: number): string =>
  new Intl.DateTimeFormat("en-CA", { timeZone: "America/Mexico_City", year: "numeric", month: "2-digit", day: "2-digit" })
    .format(new Date(Date.now() + offset * 86_400_000));

test.beforeAll(async () => {
  admin = await apiAs(E2E.admin.username);
  control = await apiAs(E2E.control.username);
  prof = await apiAs(E2E.teacher.username);
  termNombre = `E2E Ciclo Línea ${RUN}`;
  const term = await (await admin.post("terms", { data: { nombre: termNombre, fechaInicio: "2026-08-01", fechaFin: "2026-12-15" } })).json();
  const course = await (await admin.post("courses", { data: { clave: CLAVE, nombre: COURSE } })).json();
  const teachers = await (
    await control.post("teachers/query", { data: { page: 1, limit: 5, filters: { email: "e2e_profesor@e2e.local" } } })
  ).json();
  const group = await control.post("groups", {
    data: { courseId: course.id, termId: term.id, teacherId: teachers.data[0].id, nombre: "Línea", cupo: 10, horario: [{ dia: "JUEVES", horaInicio: "10:00", horaFin: "12:00" }] },
  });
  expect(group.status(), await group.text()).toBe(201);
  groupId = (await group.json()).id;

  const user = await createUser(admin, { username: PUPIL, name: `E2E Alumna Línea ${RUN}`, roles: ["ALUMNO"] });
  const birth = "2004-03-03";
  const student = await control.post("students", {
    data: { nombres: `E2E Línea ${RUN}`, apellidoPaterno: "Examen", curp: makeCurp(birth, "M"), fechaNacimiento: birth, userId: user.id },
  });
  expect(student.status(), await student.text()).toBe(201);
  const s = await student.json();
  pupilNombre = s.nombreCompleto;
  expect((await control.post(`groups/${groupId}/enroll`, { data: { studentId: s.id } })).status()).toBe(201);
  const assessment = await prof.post("assessments", { data: { groupId, nombre: "Parcial en línea", tipo: "PARCIAL", ponderacion: 100, maxScore: 10 } });
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
  await signIn(page, PUPIL);
  return page;
};

test.describe.serial("examen en línea", () => {
  test("M14 el profesor da de alta un reactivo y carga otros por CSV con vista previa", async ({ page }) => {
    await signIn(page, E2E.teacher.username);
    await page.goto(route("/questions"));
    await page.getByRole("button", { name: "Nuevo reactivo" }).click();
    const form = page.getByRole("dialog", { name: "Nuevo reactivo" });
    await form.locator('select[name="courseId"]').selectOption({ label: `${CLAVE} · ${COURSE}` });
    await form.locator('textarea[name="enunciado"]').fill(Q.om);
    await form.locator('input[name="puntos"]').fill("2");
    await form.locator('input[name="opcion-0"]').fill("Na");
    await form.locator('input[name="opcion-1"]').fill("So");
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
    await form.locator('select[name="groupId"]').selectOption({ label: `${CLAVE} · Línea (${termNombre})` });
    await form.locator('input[name="titulo"]').fill(EXAM);
    await form.locator('input[name="fechaApertura"]').fill(typedDate(dayFrom(-1)));
    await form.locator('select[name="fechaApertura-hora"]').selectOption("00:00");
    await form.locator('input[name="fechaCierre"]').fill(typedDate(dayFrom(7)));
    await form.locator('select[name="fechaCierre-hora"]').selectOption("23:45");
    await form.locator('input[name="duracionMin"]').fill("30");
    await form.locator('input[name="puntajeAprobatorio"]').fill("3");
    await form.locator('select[name="assessmentId"]').selectOption({ label: "Parcial en línea (100% · /10)" });
    await form.getByRole("button", { name: "Guardar" }).click();
    await expect(page.getByText("Examen creado")).toBeVisible();
    await expect(page).toHaveURL(/#\/exams\/[0-9a-f-]{36}$/);
    examId = page.url().split("/").pop() as string;

    await page.getByRole("button", { name: "Reactivos (0)", exact: true }).click();
    for (const enunciado of [Q.om, Q.vf, Q.open]) await page.getByRole("button", { name: `Agregar ${enunciado}` }).click();
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
    const row = page.locator("[data-role=exam-results] tr", { hasText: pupilNombre });
    await expect(row.getByText("Por revisar")).toBeVisible();
    await row.getByRole("button", { name: `Revisar 1 ${pupilNombre}` }).click();

    const dialog = page.getByRole("dialog", { name: `Intento 1 · ${pupilNombre}` });
    await expect(dialog.getByText("Puntaje: 3 de 5")).toBeVisible();
    await dialog.locator('input[name="review-puntos-3"]').fill("1.5");
    await dialog.locator('textarea[name="review-comentario-3"]').fill("Falta el ejemplo.");
    await dialog.getByRole("button", { name: "Calificar" }).click();
    await expect(page.getByText("Respuesta calificada")).toBeVisible();
    await expect(dialog.getByText("Puntaje: 4.5 de 5")).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(row.getByText("Aprobado")).toBeVisible();
    await expect(row.getByText("4.5 / 5")).toBeVisible();

    // 4.5 de 5 → 9 sobre la escala 10 del instrumento vinculado.
    const book = await (await prof.get(`groups/${groupId}/gradebook`)).json();
    const assessment = book.assessments.find((a: { nombre: string }) => a.nombre === "Parcial en línea");
    expect(book.students[0].scores[assessment.id]).toBe(9);
    await page.goto(route(`/groups/${groupId}`));
    await page.getByRole("button", { name: "Calificaciones", exact: true }).click();
    await expect(page.getByLabel(`${pupilNombre} · Parcial en línea`)).toHaveValue("9");
  });
});
