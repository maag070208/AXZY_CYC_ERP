import { test, expect, type APIRequestContext } from "@playwright/test";
import { E2E, E2E_PREFIX, assertSafeDatabase, newRunId } from "./support/env";
import { clearAuthE2E, clearStudentsE2E, createAuthUser, db, lastAudit } from "./support/db";
import { loginAs } from "./support/http";
import { makeCurp, yearsAgo } from "./support/people";
import { EXE, JPG, PDF, PNG, TOO_BIG } from "./support/files";

/**
 * Contrato de M06: subida multipart validada por contenido, almacenamiento
 * privado con descarga autorizada, validación/rechazo, reemplazo, baja lógica,
 * documentos faltantes y kardex calculado.
 */
assertSafeDatabase();

const RUN = newRunId();
const CONTROL = { username: `${E2E_PREFIX}dcontrol_${RUN}`, name: "E2E Control Docs", roleKey: "SCHOOL_CONTROL" };
const PUPIL = { username: `${E2E_PREFIX}dpupil_${RUN}`, name: "E2E Alumno Docs", roleKey: "STUDENT" };
const TEACHER = { username: `${E2E_PREFIX}dprof_${RUN}`, name: "E2E Profesor Docs", roleKey: "TEACHER" };

let control: APIRequestContext;
let pupilUserId: string;
let curpType: { id: string; nombre: string };
let actaType: { id: string; nombre: string };

const newStudent = async (label: string, userId?: string) => {
  const birth = yearsAgo(19);
  const res = await control.post("students", {
    data: {
      nombres: `E2E Docs ${label} ${RUN}`,
      apellidoPaterno: "Expediente",
      curp: makeCurp(birth),
      fechaNacimiento: birth,
      ...(userId ? { userId } : {}),
    },
  });
  expect(res.status()).toBe(201);
  return (await res.json()) as { id: string; matricula: string };
};

const upload = (studentId: string, buffer: Buffer, name: string, documentTypeId: string, mimeType = "application/pdf") =>
  control.post(`students/${studentId}/documents`, {
    multipart: { file: { name, mimeType, buffer }, documentTypeId },
  });

test.beforeAll(async () => {
  await createAuthUser({ ...CONTROL, password: E2E.password });
  pupilUserId = (await createAuthUser({ ...PUPIL, password: E2E.password })).id;
  await createAuthUser({ ...TEACHER, password: E2E.password });
  control = (await loginAs(CONTROL.username)).api;
  curpType = (await db.documentType.findUnique({ where: { nombre: "CURP" } }))!;
  actaType = (await db.documentType.findUnique({ where: { nombre: "Acta de nacimiento" } }))!;
});

test.afterAll(async () => {
  await control?.dispose();
  await clearStudentsE2E();
  await clearAuthE2E();
});

test("sube un PDF: queda PENDIENTE con nombre aleatorio privado y se descarga idéntico", async () => {
  const student = await newStudent("Sube");
  const res = await upload(student.id, PDF, "curp alumno.pdf", curpType.id);
  expect(res.status()).toBe(201);
  const doc = await res.json();
  expect(doc).toMatchObject({ status: "PENDIENTE", mimeType: "application/pdf", size: PDF.length, documentType: "CURP" });

  const row = await db.document.findUnique({ where: { id: doc.id } });
  expect(row?.filePath).toMatch(new RegExp(`^students/${student.id}/[0-9a-f-]{36}\\.pdf$`));
  expect(row?.filePath).not.toContain("curp alumno");

  const download = await control.get(`documents/${doc.id}/download`);
  expect(download.status()).toBe(200);
  expect(download.headers()["content-type"]).toBe("application/pdf");
  expect(download.headers()["cache-control"]).toContain("no-store");
  expect(Buffer.compare(await download.body(), PDF)).toBe(0);

  const log = await lastAudit("DOCUMENT_UPLOADED");
  expect(log?.entityId).toBe(doc.id);
  expect(JSON.stringify(log)).not.toContain(PDF.toString("base64"));
});

test("el tipo se decide por el contenido: PNG/JPG sí; un .exe disfrazado de PDF no", async () => {
  const student = await newStudent("Firmas");
  expect((await (await upload(student.id, PNG, "foto.png", actaType.id, "image/png")).json()).mimeType).toBe("image/png");
  // Declarado como PNG pero es JPG: manda el contenido.
  expect((await (await upload(student.id, JPG, "x.png", actaType.id, "image/png")).json()).mimeType).toBe("image/jpeg");

  const fake = await upload(student.id, EXE, "acta.pdf", actaType.id, "application/pdf");
  expect(fake.status()).toBe(400);
  expect((await fake.json()).code).toBe("FILE_TYPE_NOT_ALLOWED");
});

test("más de 5 MB → 400 FILE_TOO_LARGE; sin archivo o sin tipo → 400", async () => {
  const student = await newStudent("Limites");
  const big = await upload(student.id, TOO_BIG, "grande.pdf", curpType.id);
  expect(big.status()).toBe(400);
  expect((await big.json()).code).toBe("FILE_TOO_LARGE");

  const noFile = await control.post(`students/${student.id}/documents`, { multipart: { documentTypeId: curpType.id } });
  expect((await noFile.json()).code).toBe("FILE_REQUIRED");
  const noType = await control.post(`students/${student.id}/documents`, {
    multipart: { file: { name: "a.pdf", mimeType: "application/pdf", buffer: PDF } },
  });
  expect((await noType.json()).code).toBe("VALIDATION_ERROR");
});

test("validar y rechazar; un documento revisado no se revisa dos veces; rechazado se reemplaza", async () => {
  const student = await newStudent("Revisa");
  const curp = await (await upload(student.id, PDF, "curp.pdf", curpType.id)).json();
  const acta = await (await upload(student.id, PDF, "acta.pdf", actaType.id)).json();

  const ok = await control.patch(`documents/${curp.id}/validate`, { data: { status: "VALIDADO" } });
  expect(await ok.json()).toMatchObject({ status: "VALIDADO", validatedByName: CONTROL.name });
  expect((await lastAudit("DOCUMENT_VALIDATED"))?.entityId).toBe(curp.id);

  const no = await control.patch(`documents/${acta.id}/validate`, { data: { status: "RECHAZADO", notas: "Ilegible" } });
  expect(await no.json()).toMatchObject({ status: "RECHAZADO", notas: "Ilegible" });
  expect((await lastAudit("DOCUMENT_REJECTED"))?.entityId).toBe(acta.id);

  const twice = await control.patch(`documents/${curp.id}/validate`, { data: { status: "RECHAZADO" } });
  expect((await twice.json()).code).toBe("DOCUMENT_ALREADY_REVIEWED");

  // Subir otra acta reemplaza la rechazada (baja lógica, trazable).
  const replacement = await (await upload(student.id, PDF, "acta-nueva.pdf", actaType.id)).json();
  const list = await (await control.get(`students/${student.id}/documents`)).json();
  expect(list.documents.map((d: { id: string }) => d.id).sort()).toEqual([curp.id, replacement.id].sort());
  expect((await db.document.findUnique({ where: { id: acta.id } }))?.deletedAt).not.toBeNull();
});

test("documentos faltantes: obligatorios activos sin uno VALIDADO; el kardex los reporta", async () => {
  const student = await newStudent("Faltan");
  const required = await db.documentType.findMany({ where: { active: true, obligatorio: true } });
  let list = await (await control.get(`students/${student.id}/documents`)).json();
  expect(list.requiredCount).toBe(required.length);
  expect(list.missing.map((m: { nombre: string }) => m.nombre)).toContain("CURP");

  const doc = await (await upload(student.id, PDF, "curp.pdf", curpType.id)).json();
  list = await (await control.get(`students/${student.id}/documents`)).json();
  expect(list.missing.map((m: { nombre: string }) => m.nombre)).toContain("CURP"); // PENDIENTE no cuenta
  await control.patch(`documents/${doc.id}/validate`, { data: { status: "VALIDADO" } });
  list = await (await control.get(`students/${student.id}/documents`)).json();
  expect(list.missing.map((m: { nombre: string }) => m.nombre)).not.toContain("CURP");

  const kardex = await (await control.get(`students/${student.id}/kardex`)).json();
  expect(kardex).toMatchObject({ studentId: student.id, matricula: student.matricula, entries: [], promedioGeneral: null });
  expect(kardex.documentosFaltantes).not.toContain("CURP");
  expect(kardex.minPassingGrade).toEqual(expect.any(Number));
});

test("baja lógica del documento: desaparece del expediente y ya no se descarga", async () => {
  const student = await newStudent("Borra");
  const doc = await (await upload(student.id, PDF, "otro.pdf", curpType.id)).json();
  expect((await control.delete(`documents/${doc.id}`)).status()).toBe(204);
  expect((await lastAudit("DOCUMENT_DELETED"))?.entityId).toBe(doc.id);
  expect((await (await control.get(`students/${student.id}/documents`)).json()).documents).toHaveLength(0);
  expect((await control.get(`documents/${doc.id}/download`)).status()).toBe(404);
  expect(await db.document.count({ where: { id: doc.id } })).toBe(1); // nunca se borra físicamente
});

test("alumno en BAJA: expediente de solo lectura (no sube, no valida, no borra)", async () => {
  const student = await newStudent("EnBaja");
  const doc = await (await upload(student.id, PDF, "curp.pdf", curpType.id)).json();
  await control.post(`students/${student.id}/baja`, { data: { motivo: "Prueba de solo lectura" } });
  expect((await (await upload(student.id, PDF, "otro.pdf", curpType.id)).json()).code).toBe("STUDENT_INACTIVE");
  expect((await (await control.patch(`documents/${doc.id}/validate`, { data: { status: "VALIDADO" } })).json()).code).toBe("STUDENT_INACTIVE");
  expect((await control.get(`documents/${doc.id}/download`)).status()).toBe(200);
});

test("alcance: el ALUMNO ve y descarga lo suyo, no lo ajeno; no sube; el PROFESOR sin grupos no ve nada", async () => {
  const mine = await newStudent("Mio", pupilUserId);
  const other = await newStudent("Ajeno");
  const myDoc = await (await upload(mine.id, PDF, "mio.pdf", curpType.id)).json();
  const otherDoc = await (await upload(other.id, PDF, "ajeno.pdf", curpType.id)).json();

  const { api: pupil } = await loginAs(PUPIL.username);
  expect((await pupil.get(`students/${mine.id}/documents`)).status()).toBe(200);
  expect((await pupil.get(`documents/${myDoc.id}/download`)).status()).toBe(200);
  expect((await pupil.get(`students/${other.id}/documents`)).status()).toBe(404);
  expect((await pupil.get(`documents/${otherDoc.id}/download`)).status()).toBe(404);
  expect((await pupil.get(`students/${mine.id}/kardex`)).status()).toBe(200);
  const denied = await pupil.post(`students/${mine.id}/documents`, {
    multipart: { file: { name: "a.pdf", mimeType: "application/pdf", buffer: PDF }, documentTypeId: curpType.id },
  });
  expect(denied.status()).toBe(403);
  await pupil.dispose();

  const { api: teacher } = await loginAs(TEACHER.username);
  expect((await teacher.get(`students/${mine.id}/documents`)).status()).toBe(404);
  expect((await teacher.get(`students/${mine.id}/kardex`)).status()).toBe(404);
  await teacher.dispose();
});
