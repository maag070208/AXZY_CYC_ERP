import { test, expect, type APIRequestContext } from "@playwright/test";
import { E2E, E2E_PREFIX, assertSafeDatabase, newRunId } from "./support/env";
import { clearAuthE2E, clearTeachersE2E, createAuthUser, createResetToken, db, lastAudit } from "./support/db";
import { anon, login, loginAs } from "./support/http";

/**
 * Contrato de M04: alta transaccional (profesor + cuenta PROFESOR +
 * invitación), edición sincronizada con la cuenta, baja/reactivación, reenvío
 * de invitación y alcance OWN del profesor sobre su perfil. Los correos
 * llevan el prefijo `e2e_` para que sus cuentas se limpien solas.
 */
assertSafeDatabase();

const RUN = newRunId();
const ADMIN = { username: `${E2E_PREFIX}tadmin_${RUN}`, name: "E2E Admin Profes", roleKey: "ADMIN" };
const CONTROL = { username: `${E2E_PREFIX}tcontrol_${RUN}`, name: "E2E Control Profes", roleKey: "SCHOOL_CONTROL" };

let admin: APIRequestContext;
let control: APIRequestContext;
let adminId: string;

const teacher = (label: string, overrides: Record<string, unknown> = {}) => ({
  nombres: `E2E ${label}`,
  apellidos: `Docente ${RUN}`,
  email: `${E2E_PREFIX}t${label.toLowerCase()}_${RUN}@e2e.local`,
  telefono: "5512312312",
  especialidad: "Motores",
  ...overrides,
});

test.beforeAll(async () => {
  adminId = (await createAuthUser({ ...ADMIN, password: E2E.password })).id;
  await createAuthUser({ ...CONTROL, password: E2E.password });
  admin = (await loginAs(ADMIN.username)).api;
  control = (await loginAs(CONTROL.username)).api;
});

test.afterAll(async () => {
  await Promise.all([admin?.dispose(), control?.dispose()]);
  await clearTeachersE2E();
  await clearAuthE2E();
});

test("alta: crea profesor, su cuenta PROFESOR pendiente y la invitación, todo auditado", async () => {
  const input = teacher("Alta");
  const res = await admin.post("teachers", { data: { ...input, email: input.email.toUpperCase() } });
  expect(res.status()).toBe(201);
  const body = await res.json();
  expect(body).toMatchObject({
    email: input.email,
    status: "ACTIVO",
    invitationQueued: true,
    nombreCompleto: `${input.nombres} ${input.apellidos}`,
  });
  expect(body.account).toMatchObject({ active: true, pendingInvitation: true, username: input.email.split("@")[0] });

  const user = await db.user.findUnique({ where: { id: body.account.userId }, include: { roles: true } });
  expect(user?.roles.map((r) => r.roleKey)).toEqual(["TEACHER"]);
  expect(user?.mustChangePassword).toBe(true);
  expect(await db.passwordResetToken.count({ where: { userId: user!.id, usedAt: null } })).toBe(1);

  for (const action of ["USER_CREATED", "TEACHER_CREATED", "TEACHER_INVITATION_SENT"]) {
    expect((await lastAudit(action, adminId))?.action, action).toBe(action);
  }
});

test("la invitación permite definir la contraseña y entrar como PROFESOR", async () => {
  const created = await (await admin.post("teachers", { data: teacher("Invita") })).json();
  // El token real viaja por correo: se emite uno conocido para la misma cuenta.
  const token = `e2e-invite-${RUN}`;
  await createResetToken(created.account.userId, token, 72 * 3600 * 1000);
  const guest = await anon();
  expect((await guest.post("auth/reset-password", { data: { token, password: `${E2E.password}-prof` } })).status()).toBe(200);
  await guest.dispose();

  const session = await login(created.account.username, `${E2E.password}-prof`);
  expect(session.user.mustChangePassword).toBe(false);
});

test("correo repetido (profesor o cuenta) → 409; validaciones → 400", async () => {
  const input = teacher("Dup");
  expect((await admin.post("teachers", { data: input })).status()).toBe(201);
  const dup = await admin.post("teachers", { data: teacher("Dup2", { email: input.email }) });
  expect(dup.status()).toBe(409);
  expect((await dup.json()).code).toBe("TEACHER_EMAIL_TAKEN");

  const userEmail = await admin.post("teachers", { data: teacher("Dup3", { email: `${ADMIN.username}@e2e.local` }) });
  expect((await userEmail.json()).code).toBe("TEACHER_EMAIL_TAKEN");

  const invalid = await admin.post("teachers", { data: { nombres: "", apellidos: "X", email: "no-es" } });
  expect(invalid.status()).toBe(400);
  expect(Object.keys((await invalid.json()).details.fieldErrors).sort()).toEqual(["email", "nombres"]);
});

test("username derivado del correo: si está ocupado se numera", async () => {
  const a = await (await admin.post("teachers", { data: teacher("Mismo", { email: `${E2E_PREFIX}mismo_${RUN}@e2e.local` }) })).json();
  const b = await (await admin.post("teachers", { data: teacher("Mismo2", { email: `${E2E_PREFIX}mismo_${RUN}@otro.local` }) })).json();
  expect(a.account.username).toBe(`${E2E_PREFIX}mismo_${RUN}`.toLowerCase());
  expect(b.account.username).toBe(`${E2E_PREFIX}mismo_${RUN}2`.toLowerCase());
});

test("edición: actualiza el profesor y sincroniza nombre/correo de su cuenta", async () => {
  const created = await (await admin.post("teachers", { data: teacher("Edita") })).json();
  const email = `${E2E_PREFIX}teditado_${RUN}@e2e.local`;
  const res = await control.patch(`teachers/${created.id}`, { data: { apellidos: "Nuevo Apellido", email } });
  expect(res.status()).toBe(200);
  const user = await db.user.findUnique({ where: { id: created.account.userId } });
  expect(user).toMatchObject({ email, name: "E2E Edita Nuevo Apellido" });
  const log = await db.auditLog.findFirst({ where: { action: "TEACHER_UPDATED", entityId: created.id } });
  expect(log?.newState).toMatchObject({ email, apellidos: "Nuevo Apellido" });
});

test("baja: profesor INACTIVO, cuenta sin acceso y sesiones cerradas; reactivar lo devuelve", async () => {
  const created = await (await admin.post("teachers", { data: teacher("Baja") })).json();
  await db.user.update({
    where: { id: created.account.userId },
    data: { mustChangePassword: false, passwordHash: (await db.user.findUnique({ where: { username: ADMIN.username } }))!.passwordHash },
  });
  const session = await login(created.account.username);

  const off = await control.post(`teachers/${created.id}/deactivate`, { data: { reason: "Fin de contrato" } });
  expect(off.status()).toBe(200);
  expect(await off.json()).toMatchObject({ status: "INACTIVO", account: { active: false } });
  const guest = await anon();
  expect((await guest.post("auth/refresh", { data: { refreshToken: session.refreshToken } })).status()).toBe(401);
  const denied = await guest.post("auth/login", { data: { username: created.account.username, password: E2E.password } });
  expect((await denied.json()).code).toBe("ACCOUNT_DEACTIVATED");
  expect((await control.post(`teachers/${created.id}/deactivate`)).status()).toBe(409);

  const on = await control.post(`teachers/${created.id}/reactivate`);
  expect(await on.json()).toMatchObject({ status: "ACTIVO", account: { active: true } });
  expect((await guest.post("auth/login", { data: { username: created.account.username, password: E2E.password } })).status()).toBe(200);
  await guest.dispose();
  expect((await lastAudit("TEACHER_REACTIVATED"))?.entityId).toBe(created.id);
});

test("reenviar invitación invalida la anterior; si ya definió contraseña → 409", async () => {
  const created = await (await admin.post("teachers", { data: teacher("Reenvio") })).json();
  const userId = created.account.userId;
  expect((await control.post(`teachers/${created.id}/resend-invitation`)).status()).toBe(200);
  expect(await db.passwordResetToken.count({ where: { userId, usedAt: null } })).toBe(1);
  expect(await db.passwordResetToken.count({ where: { userId } })).toBe(2);
  expect((await lastAudit("TEACHER_INVITATION_RESENT"))?.entityId).toBe(created.id);

  await db.user.update({ where: { id: userId }, data: { mustChangePassword: false } });
  const again = await control.post(`teachers/${created.id}/resend-invitation`);
  expect((await again.json()).code).toBe("INVITATION_NOT_PENDING");
});

test("PROFESOR (OWN) ve y edita solo su perfil; no da de alta ni de baja", async () => {
  const mine = await (await admin.post("teachers", { data: teacher("Propio") })).json();
  const other = await (await admin.post("teachers", { data: teacher("Otro") })).json();
  const token = `e2e-own-${RUN}`;
  await createResetToken(mine.account.userId, token);
  const guest = await anon();
  await guest.post("auth/reset-password", { data: { token, password: `${E2E.password}-own` } });
  await guest.dispose();
  const { api: prof } = await loginAs(mine.account.username, `${E2E.password}-own`);

  const list = await (await prof.post("teachers/query", { data: {} })).json();
  expect(list.data.map((t: { id: string }) => t.id)).toEqual([mine.id]);
  expect((await prof.get(`teachers/${other.id}`)).status()).toBe(404);
  expect((await prof.patch(`teachers/${mine.id}`, { data: { especialidad: "Transmisiones" } })).status()).toBe(200);
  expect((await prof.patch(`teachers/${other.id}`, { data: { especialidad: "X" } })).status()).toBe(404);
  expect((await prof.post("teachers", { data: teacher("NoPuede") })).status()).toBe(403);
  expect((await prof.post(`teachers/${mine.id}/deactivate`)).status()).toBe(403);
  await prof.dispose();
});

test("CONTROL_ESCOLAR no da de alta profesores (sin teachers.create) → 403", async () => {
  expect((await control.post("teachers", { data: teacher("SinPermiso") })).status()).toBe(403);
});

test("/teachers/query filtra por nombre, especialidad y estatus", async () => {
  await admin.post("teachers", { data: teacher("Filtro", { especialidad: "Electricidad automotriz" }) });
  const res = await admin.post("teachers/query", {
    data: { filters: { nombre: `filtro docente ${RUN}`, especialidad: "electricidad", status: "ACTIVO" } },
  });
  expect((await res.json()).total).toBe(1);
});
