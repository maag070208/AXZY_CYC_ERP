import { PrismaClient } from "@prisma/client";
import { hashPassword } from "../src/core/utils/security";
import { curpCheckDigit, isValidCurp } from "../src/core/utils/curp";

/**
 * Seed de DEMO (idempotente): usuarios del equipo + 50 alumnos con cuenta.
 * Reejecutar no duplica; restablece las contraseñas a las de demo.
 *
 *   admin   / admin123   (ADMIN)
 *   aamaro  / 123123     (CONTROL_ESCOLAR)
 *   marco   / 123123     (PROFESOR)
 *   martin  / 123123     (PROFESOR)
 *   alumno01…alumno50 / 123123 (ALUMNO, con expediente)
 *
 * Uso: npm run seed:demo
 */
const prisma = new PrismaClient();

const DEMO_PASSWORD = "123123";
const STUDENT_PASSWORD = "123123";
const STUDENTS = 50;

interface StaffSeed {
  username: string;
  password: string;
  name: string;
  roleKey: string;
  email: string;
  teacher?: { firstNames: string; surnames: string };
}

const STAFF: StaffSeed[] = [
  { username: "admin", password: "admin123", name: "Administrador", roleKey: "ADMIN", email: "admin@axzy.dev" },
  { username: "aamaro", password: DEMO_PASSWORD, name: "A. Amaro", roleKey: "CONTROL_ESCOLAR", email: "aamaro@axzy.dev" },
  { username: "marco", password: DEMO_PASSWORD, name: "Marco Demo", roleKey: "PROFESOR", email: "marco@axzy.dev", teacher: { firstNames: "Marco", surnames: "Demo" } },
  { username: "martin", password: DEMO_PASSWORD, name: "Martín Demo", roleKey: "PROFESOR", email: "martin@axzy.dev", teacher: { firstNames: "Martín", surnames: "Demo" } },
];

// --- utilidades CURP (deterministas y válidas) --------------------------------

const strip = (value: string): string =>
  value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/Ñ/g, "X").toUpperCase();

const firstVowel = (value: string): string => {
  const match = strip(value).slice(1).match(/[AEIOU]/);
  return match ? match[0] : "X";
};

const firstConsonant = (value: string): string => {
  const match = strip(value).replace(/[^A-Z]/g, "").slice(1).match(/[BCDFGHJKLMNPQRSTVWXYZ]/);
  return match ? match[0] : "X";
};

interface CurpParts {
  firstNames: string;
  paternalSurname: string;
  maternalSurname: string;
  date: string;
  sex: "H" | "M";
  state: string;
  homoclave: string;
}

const buildCurp = ({ firstNames, paternalSurname, maternalSurname, date, sex, state, homoclave }: CurpParts): string => {
  const initials = `${strip(paternalSurname)[0]}${firstVowel(paternalSurname)}${strip(maternalSurname)[0]}${strip(firstNames)[0]}`;
  const consonants = `${firstConsonant(paternalSurname)}${firstConsonant(maternalSurname)}${firstConsonant(firstNames)}`;
  const [year, month, day] = date.split("-");
  const first17 = `${initials}${year.slice(2)}${month}${day}${sex}${state}${consonants}${homoclave}`;
  return `${first17}${curpCheckDigit(first17)}`;
};

const NOMBRES = [
  "Ana", "Luis", "María", "Jorge", "Sofía", "Carlos", "Fernanda", "Diego", "Valeria", "Miguel",
  "Daniela", "Ricardo", "Camila", "Alejandro", "Regina", "Emilio", "Ximena", "Andrés", "Paola", "Javier",
  "Renata", "Bruno", "Natalia", "Iván", "Lucía", "Héctor", "Mariana", "Rodrigo", "Frida", "Santiago",
  "Isabela", "Óscar", "Gabriela", "Raúl", "Elena", "Tomás", "Carolina", "Alonso", "Adriana", "Pablo",
  "Victoria", "Mauricio", "Jimena", "Eduardo", "Alondra", "Fernando", "Montserrat", "Gerardo", "Perla", "Rubén",
];
const AP_PATERNO = [
  "García", "Hernández", "Martínez", "López", "González", "Pérez", "Rodríguez", "Sánchez", "Ramírez", "Torres",
  "Flores", "Gómez", "Díaz", "Cruz", "Morales", "Reyes", "Jiménez", "Mendoza", "Ortiz", "Castillo",
  "Aguilar", "Vargas", "Romero", "Navarro", "Ríos", "Salazar", "Iglesias", "Delgado", "Campos", "Fuentes",
];
const AP_MATERNO = [
  "Ramírez", "Flores", "Gómez", "Díaz", "Cruz", "Morales", "Reyes", "Jiménez", "Mendoza", "Ortiz",
  "Núñez", "Cortés", "Rojas", "Medina", "Vega", "Silva", "Padilla", "Carrillo", "Suárez", "Herrera",
  "Palacios", "Cordero", "Solís", "Galván", "Bautista", "Zamora", "Arias", "Ponce", "Valdez", "Espinoza",
];
const STATES = ["DF", "MC", "JC", "NL"];
const HOMOCLAVE = "ABCDEFGHJKLMNPQRSTUVWXYZ0123456789";
const pad = (n: number, size = 2) => String(n).padStart(size, "0");

// --- seed ---------------------------------------------------------------------

const upsertUser = async (seed: StaffSeed & { roleKey: string }): Promise<string> => {
  const passwordHash = await hashPassword(seed.password);
  const user = await prisma.user.upsert({
    where: { username: seed.username },
    create: {
      username: seed.username,
      email: seed.email,
      passwordHash,
      name: seed.name,
      mustChangePassword: false,
      roles: { create: [{ roleKey: seed.roleKey }] },
    },
    update: {
      email: seed.email,
      passwordHash,
      name: seed.name,
      active: true,
      mustChangePassword: false,
      deactivatedAt: null,
      deactivationReason: null,
      failedAttempts: 0,
      lockedUntil: null,
    },
    select: { id: true },
  });
  // Rol exacto (idempotente).
  await prisma.userRole.deleteMany({ where: { userId: user.id } });
  await prisma.userRole.create({ data: { userId: user.id, roleKey: seed.roleKey } });
  return user.id;
};

async function main(): Promise<void> {
  // 1) Equipo (staff).
  for (const seed of STAFF) {
    const userId = await upsertUser(seed);
    if (seed.teacher) {
      await prisma.teacher.upsert({
        where: { email: seed.email },
        create: { firstNames: seed.teacher.firstNames, surnames: seed.teacher.surnames, email: seed.email, userId },
        update: { firstNames: seed.teacher.firstNames, surnames: seed.teacher.surnames, userId, status: "ACTIVE" },
      });
    }
    console.log(`staff: ${seed.username} (${seed.roleKey})`);
  }

  // 2) 50 alumnos con cuenta ALUMNO.
  let created = 0;
  for (let i = 0; i < STUDENTS; i += 1) {
    const n = i + 1;
    const firstNames = NOMBRES[i % NOMBRES.length];
    const paternalSurname = AP_PATERNO[i % AP_PATERNO.length];
    const maternalSurname = AP_MATERNO[(i * 7 + 3) % AP_MATERNO.length];
    const year = 1998 + (i % 6);
    const month = (i % 12) + 1;
    const day = (i % 27) + 1;
    const date = `${year}-${pad(month)}-${pad(day)}`;
    const masculino = i % 2 === 0;
    const gender = masculino ? "M" : "F";
    const curp = buildCurp({
      firstNames,
      paternalSurname,
      maternalSurname,
      date,
      sex: masculino ? "H" : "M",
      state: STATES[i % STATES.length],
      homoclave: HOMOCLAVE[i % HOMOCLAVE.length],
    });
    if (!isValidCurp(curp)) throw new Error(`CURP inválida generada: ${curp}`);

    const username = `alumno${pad(n)}`;
    const email = `${username}@demo.axzy.dev`;
    const fullName = `${firstNames} ${paternalSurname} ${maternalSurname}`;
    const userId = await upsertUser({ username, password: STUDENT_PASSWORD, name: fullName, roleKey: "ALUMNO", email });
    const studentNumber = `2026-${pad(n, 4)}`;

    await prisma.student.upsert({
      where: { curp },
      create: {
        studentNumber,
        firstNames,
        paternalSurname,
        maternalSurname,
        curp,
        birthDate: new Date(`${date}T00:00:00.000Z`),
        gender,
        email,
        enrollmentDate: new Date("2026-08-01T00:00:00.000Z"),
        userId,
      },
      update: { firstNames, paternalSurname, maternalSurname, gender, email, userId },
    });
    created += 1;
  }
  console.log(`alumnos: ${created} (usuario ${usernameRange()})`);

  console.log("Seed demo listo. Contraseñas: admin=admin123 · resto=123123");
}

const usernameRange = (): string => `alumno01…alumno${pad(STUDENTS)}`;

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
