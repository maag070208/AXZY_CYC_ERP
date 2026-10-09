const fs = require("fs");
const P = "api/prisma/schema.prisma";
const original = fs.readFileSync(P, "utf8");

// --- field name renames (old -> new). All are scalar fields. -----------------
const fieldMap = {
  // Student
  matricula: "studentNumber",
  nombres: "firstNames",
  apellidoPaterno: "paternalSurname",
  apellidoMaterno: "maternalSurname",
  fechaNacimiento: "birthDate",
  genero: "gender",
  telefono: "phone",
  direccion: "address",
  fechaIngreso: "enrollmentDate",
  // Guardian
  parentesco: "relationship",
  esResponsablePago: "isPaymentResponsible",
  // Movement
  tipo: "type",
  motivo: "reason",
  fecha: "date",
  observaciones: "notes",
  // Teacher
  apellidos: "surnames",
  especialidad: "specialty",
  // Document
  notas: "notes",
  // Course / Group
  clave: "code",
  nombre: "name",
  descripcion: "description",
  cupo: "capacity",
  horario: "schedule",
  aula: "classroom",
  // Enrollment
  bajaAt: "withdrawnAt",
  bajaMotivo: "withdrawalReason",
  // Assessment / Grade
  ponderacion: "weight",
  // Finance
  monto: "amount",
  descuento: "discount",
  fechaVencimiento: "dueDate",
  metodo: "method",
  referencia: "reference",
  reciboFolio: "receiptNumber",
  // Questions
  tema: "topic",
  enunciado: "text",
  puntos: "points",
  dificultad: "difficulty",
  texto: "text",
  esCorrecta: "isCorrect",
  orden: "sortOrder",
  // Online exam
  titulo: "title",
  instrucciones: "instructions",
  duracionMin: "durationMin",
  intentosMax: "maxAttempts",
  fechaApertura: "opensAt",
  fechaCierre: "closesAt",
  aleatorizarPreguntas: "shuffleQuestions",
  aleatorizarOpciones: "shuffleOptions",
  mostrarResultado: "showResult",
  puntajeAprobatorio: "passingScore",
  criterioIntentos: "attemptCriterion",
  // Attempts
  numero: "number",
  respuesta: "answer",
  puntosObtenidos: "pointsEarned",
  comentario: "comment",
  // Attendance
  hora: "time",
  // Justification
  archivoKey: "fileKey",
  archivoNombre: "fileName",
  archivoMime: "fileMime",
  archivoSize: "fileSize",
  solicitadoPor: "requestedBy",
  resueltoPor: "resolvedBy",
  nota: "note",
  // Notifications
  canal: "channel",
  asunto: "subject",
  cuerpo: "body",
  obligatorio: "required",
  destinatario: "recipient",
  origen: "origin",
  // Migration
  entidad: "entity",
  archivo: "file",
};

const enumMap = {
  StudentStatus: { ACTIVO: "ACTIVE", BAJA: "WITHDRAWN" },
  MovementType: { BAJA: "WITHDRAWAL", REINGRESO: "REENTRY" },
  TeacherStatus: { ACTIVO: "ACTIVE", INACTIVO: "INACTIVE" },
  DocumentStatus: { PENDIENTE: "PENDING", VALIDADO: "VALIDATED", RECHAZADO: "REJECTED" },
  EnrollmentStatus: { INSCRITO: "ENROLLED", BAJA: "WITHDRAWN", ACREDITADO: "PASSED", REPROBADO: "FAILED" },
  AssessmentType: { PARCIAL: "PARTIAL", FINAL: "FINAL", TAREA: "HOMEWORK", OTRO: "OTHER" },
  FeeConceptType: { INSCRIPCION: "ENROLLMENT", COLEGIATURA: "TUITION", MATERIAL: "MATERIAL", RECARGO: "LATE_FEE", OTRO: "OTHER" },
  ChargeStatus: { PENDIENTE: "PENDING", PARCIAL: "PARTIAL", PAGADO: "PAID", CANCELADO: "CANCELLED" },
  PaymentMethod: { EFECTIVO: "CASH", TRANSFERENCIA: "TRANSFER", DEPOSITO: "DEPOSIT", TARJETA: "CARD", OTRO: "OTHER" },
  QuestionType: { OPCION_MULTIPLE: "MULTIPLE_CHOICE", VERDADERO_FALSO: "TRUE_FALSE", MULTIPLE_RESPUESTA: "MULTIPLE_ANSWER", ABIERTA: "OPEN" },
  QuestionDifficulty: { FACIL: "EASY", MEDIA: "MEDIUM", DIFICIL: "HARD" },
  QuestionStatus: { ACTIVA: "ACTIVE", INACTIVA: "INACTIVE" },
  OnlineExamStatus: { BORRADOR: "DRAFT", PUBLICADO: "PUBLISHED", CERRADO: "CLOSED" },
  AttemptCriterion: { MEJOR: "BEST", ULTIMO: "LAST" },
  AttemptStatus: { EN_CURSO: "IN_PROGRESS", ENVIADO: "SUBMITTED", EXPIRADO: "EXPIRED" },
  AttendanceStatus: { PRESENTE: "PRESENT", FALTA: "ABSENT", RETARDO: "LATE", JUSTIFICADA: "JUSTIFIED" },
  JustificationStatus: { PENDIENTE: "PENDING", APROBADA: "APPROVED", RECHAZADA: "REJECTED" },
  NotificationChannel: { INTERNO: "IN_APP" },
  NotificationStatus: { EN_COLA: "QUEUED", ENVIADO: "SENT", FALLIDO: "FAILED", OMITIDO: "SKIPPED" },
  MigrationBatchStatus: { EN_PROCESO: "IN_PROGRESS", COMPLETADO: "COMPLETED", FALLIDO: "FAILED", CANCELADO: "CANCELLED" },
  MigrationRowStatus: { ACEPTADA: "ACCEPTED", RECHAZADA: "REJECTED", OMITIDA: "SKIPPED" },
};

const modelRename = { MatriculaSequence: "StudentNumberSequence" };
const tableRename = { matricula_sequences: "student_number_sequences" };

const snake = (s) => s.replace(/([a-z0-9])([A-Z])/g, "$1_$2").toLowerCase();
const multiword = (s) => /[A-Z]/.test(s);

// Ambiguous enum values (present in >1 enum with different targets): rename per block.
const ambiguous = new Set(["BAJA", "ENVIADO"]);
const globalEnum = {};
for (const [en, m] of Object.entries(enumMap))
  for (const [old, nw] of Object.entries(m)) {
    if (ambiguous.has(old)) continue;
    globalEnum[old] = nw;
  }

const fieldKeys = Object.keys(fieldMap);
const globalFieldRe = new RegExp(`\\b(${fieldKeys.join("|")})\\b`, "g");
const globalEnumRe = new RegExp(`\\b(${Object.keys(globalEnum).join("|")})\\b`, "g");

// pre-scan model -> table (@@map) so fields can resolve their table name.
const modelTable = {};
{
  let cur = null;
  for (const line of original.split("\n")) {
    const mm = line.match(/^model (\w+) \{/);
    if (mm) {
      cur = mm[1];
      continue;
    }
    if (cur) {
      const mp = line.match(/^\s*@@map\("([^"]+)"\)/);
      if (mp) {
        modelTable[cur] = tableRename[mp[1]] ?? mp[1];
        cur = null;
      }
    }
  }
}

const lines = original.split("\n");
const out = [];
const colRenames = [];
const enumRenames = [];

let currentEnum = null;
let currentModel = null;
let currentTable = null;

for (const line of lines) {
  const mEnum = line.match(/^enum (\w+) \{/);
  const mModel = line.match(/^model (\w+) \{/);
  if (mEnum) {
    currentEnum = mEnum[1];
    currentModel = null;
    currentTable = null;
    out.push(line);
    continue;
  }
  if (mModel) {
    currentEnum = null;
    currentModel = mModel[1];
    currentTable = null;
    out.push(line.replace(`model ${currentModel} `, `model ${modelRename[currentModel] ?? currentModel} `));
    continue;
  }
  if (line === "}") {
    currentEnum = null;
    currentModel = null;
    currentTable = null;
    out.push(line);
    continue;
  }
  if (currentEnum) {
    const mv = line.match(/^(\s+)([A-Z0-9_]+)(\s*)$/);
    if (mv && enumMap[currentEnum] && enumMap[currentEnum][mv[2]]) {
      const nw = enumMap[currentEnum][mv[2]];
      enumRenames.push({ enum: currentEnum, old: mv[2], nu: nw });
      out.push(`${mv[1]}${nw}${mv[3]}`);
    } else {
      out.push(line);
    }
    continue;
  }
  if (currentModel) {
    const mapLine = line.match(/^(\s*)@@map\("([^"]+)"\)/);
    if (mapLine) {
      let tb = mapLine[2];
      if (tableRename[tb]) tb = tableRename[tb];
      currentTable = tb;
      out.push(line.replace(`"${mapLine[2]}"`, `"${tb}"`));
      continue;
    }
    if (line.trimStart().startsWith("//")) {
      out.push(line);
      continue;
    }
    const fd = line.match(/^(\s+)([A-Za-z_]\w*)(\s+)(.+)$/);
    if (fd) {
      let name = fd[2];
      let newName = fieldMap[name];
      if (currentModel === "StudentMovement" && name === "reason") newName = "cancellationReason";
      if (newName && newName !== name) {
        let rest = fd[4];
        const hadMap = /@map\("([^"]+)"\)/.exec(rest);
        const isRelation = fd[4].startsWith("CancellationReason");
        if (!isRelation) {
          if (hadMap) {
            rest = rest.replace(/@map\("([^"]+)"\)/, `@map("${snake(newName)}")`);
          } else if (multiword(newName)) {
            rest = `${rest} @map("${snake(newName)}")`;
          }
          const oldCol = hadMap ? hadMap[1] : name;
          const newCol = multiword(newName) ? snake(newName) : newName;
          const tbl = modelTable[currentModel];
          if (tbl && oldCol !== newCol) colRenames.push({ table: tbl, old: oldCol, nu: newCol });
        } else if (newName === "cancellationReason") {
          rest = rest.replace(/^reason/, "");
        }
        // apply enum defaults inside rest
        rest = rest.replace(globalEnumRe, (t) => globalEnum[t]);
        out.push(`${fd[1]}${newName}${fd[3]}${rest}`);
        continue;
      }
    }
    // non-field lines (indices, relations): update field references + enum defaults
    let l = line.replace(globalFieldRe, (t) => fieldMap[t]);
    l = l.replace(globalEnumRe, (t) => globalEnum[t]);
    out.push(l);
    continue;
  }
  out.push(line);
}

// enum defaults inside field lines already applied; ensure model enum tokens done.
// Also handle the detached relation line replacement artifact.
const newSchema = out.join("\n").replace(/^(\s*)CancellationReason\? @relation/m, "$1cancellationReason CancellationReason? @relation");

fs.writeFileSync(P, newSchema);

// --- migration SQL -----------------------------------------------------------
const sql = [];
sql.push("-- Refactor a inglés (D-046): esquema completo a inglés.");
sql.push("-- Renombrados sin pérdida de datos (RENAME COLUMN / RENAME VALUE / RENAME TABLE).");
if (tableRename.matricula_sequences)
  sql.push(`ALTER TABLE "matricula_sequences" RENAME TO "student_number_sequences";`);
for (const r of colRenames) sql.push(`ALTER TABLE "${r.table}" RENAME COLUMN "${r.old}" TO "${r.nu}";`);
for (const r of enumRenames) sql.push(`ALTER TYPE "${r.enum}" RENAME VALUE '${r.old}' TO '${r.nu}';`);

fs.writeFileSync("/tmp/schema-migration.sql", sql.join("\n") + "\n");
console.log(`columns: ${colRenames.length}, enums: ${enumRenames.length}`);
console.log(colRenames.map((r) => `${r.table}.${r.old}->${r.nu}`).join("\n"));
