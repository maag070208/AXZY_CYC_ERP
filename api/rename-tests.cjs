const fs = require("fs");
const path = require("path");

const camel = {
  matricula: "studentNumber",
  nombres: "firstNames",
  apellidos: "surnames",
  apellidoPaterno: "paternalSurname",
  apellidoMaterno: "maternalSurname",
  fechaNacimiento: "birthDate",
  genero: "gender",
  direccion: "address",
  fechaIngreso: "enrollmentDate",
  parentesco: "relationship",
  esResponsablePago: "isPaymentResponsible",
  especialidad: "specialty",
  cupo: "capacity",
  horario: "schedule",
  aula: "classroom",
  ponderacion: "weight",
  descuento: "discount",
  fechaVencimiento: "dueDate",
  metodo: "method",
  referencia: "reference",
  reciboFolio: "receiptNumber",
  tema: "topic",
  enunciado: "text",
  dificultad: "difficulty",
  esCorrecta: "isCorrect",
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
  puntosObtenidos: "pointsEarned",
  comentario: "comment",
  archivoKey: "fileKey",
  archivoNombre: "fileName",
  archivoMime: "fileMime",
  archivoSize: "fileSize",
  solicitadoPor: "requestedBy",
  resueltoPor: "resolvedBy",
  destinatario: "recipient",
  origen: "origin",
  entidad: "entity",
  bajaAt: "withdrawnAt",
  bajaMotivo: "withdrawalReason",
  observaciones: "notes",
  obligatorio: "required",
  matriculaSequence: "studentNumberSequence",
  destinatario_canal: "recipient_channel",
  clave_canal: "code_channel",
};
const single = {
  nombre: "name",
  tipo: "type",
  fecha: "date",
  monto: "amount",
  clave: "code",
  descripcion: "description",
  notas: "notes",
  nota: "note",
  texto: "text",
  puntos: "points",
  orden: "sortOrder",
  canal: "channel",
  asunto: "subject",
  cuerpo: "body",
  archivo: "file",
  hora: "time",
  respuesta: "answer",
  numero: "number",
  motivo: "reason",
  telefono: "phone",
};
const enums = {
  ACTIVO: "ACTIVE",
  INACTIVO: "INACTIVE",
  REINGRESO: "REENTRY",
  INSCRITO: "ENROLLED",
  ACREDITADO: "PASSED",
  REPROBADO: "FAILED",
  TAREA: "HOMEWORK",
  OTRO: "OTHER",
  INSCRIPCION: "ENROLLMENT",
  COLEGIATURA: "TUITION",
  RECARGO: "LATE_FEE",
  EFECTIVO: "CASH",
  TRANSFERENCIA: "TRANSFER",
  DEPOSITO: "DEPOSIT",
  TARJETA: "CARD",
  PAGADO: "PAID",
  CANCELADO: "CANCELLED",
  PENDIENTE: "PENDING",
  VALIDADO: "VALIDATED",
  RECHAZADO: "REJECTED",
  OPCION_MULTIPLE: "MULTIPLE_CHOICE",
  VERDADERO_FALSO: "TRUE_FALSE",
  MULTIPLE_RESPUESTA: "MULTIPLE_ANSWER",
  ABIERTA: "OPEN",
  FACIL: "EASY",
  MEDIA: "MEDIUM",
  DIFICIL: "HARD",
  ACTIVA: "ACTIVE",
  INACTIVA: "INACTIVE",
  BORRADOR: "DRAFT",
  PUBLICADO: "PUBLISHED",
  CERRADO: "CLOSED",
  MEJOR: "BEST",
  ULTIMO: "LAST",
  EN_CURSO: "IN_PROGRESS",
  EXPIRADO: "EXPIRED",
  PRESENTE: "PRESENT",
  FALTA: "ABSENT",
  RETARDO: "LATE",
  JUSTIFICADA: "JUSTIFIED",
  APROBADA: "APPROVED",
  RECHAZADA: "REJECTED",
  EN_COLA: "QUEUED",
  FALLIDO: "FAILED",
  OMITIDO: "SKIPPED",
  EN_PROCESO: "IN_PROGRESS",
  COMPLETADO: "COMPLETED",
  ACEPTADA: "ACCEPTED",
  OMITIDA: "SKIPPED",
  INTERNO: "IN_APP",
  PARCIAL: "PARTIAL",
};
const reOf = (obj) => ({
  re: new RegExp(`\\b(${Object.keys(obj).sort((a, b) => b.length - a.length).join("|")})\\b`, "g"),
  map: obj,
});
const c = reOf(camel), s = reOf(single), e = reOf(enums);

function walk(dir, acc = []) {
  for (const de of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, de.name);
    if (de.isDirectory()) walk(p, acc);
    else if (de.name.endsWith(".ts")) acc.push(p);
  }
  return acc;
}
const files = walk("tests");
let changed = 0;
for (const f of files) {
  const lines = fs.readFileSync(f, "utf8").split("\n");
  let touched = false;
  const out = lines.map((line) => {
    if (/^\s*\/\//.test(line) || /^\s*\*/.test(line) || /^\s*\/\*/.test(line)) return line;
    const before = line;
    let l = line.replace(c.re, (t) => c.map[t]);
    l = l.replace(s.re, (t) => s.map[t]);
    l = l.replace(e.re, (t) => e.map[t]);
    if (l !== before) touched = true;
    return l;
  });
  if (touched) {
    fs.writeFileSync(f, out.join("\n"));
    changed++;
  }
}
console.log(`test files changed: ${changed} / ${files.length}`);
