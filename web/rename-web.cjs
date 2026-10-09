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
const camelR = reOf(camel);
const singleR = reOf(single);
const enumR = reOf(enums);

function walk(dir, acc = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) {
      if (p.includes("shared/i18n/locales")) continue;
      walk(p, acc);
    } else if (e.name.endsWith(".tsx") || e.name.endsWith(".ts")) acc.push(p);
  }
  return acc;
}

const files = walk("src");
let changed = 0;
for (const f of files) {
  const lines = fs.readFileSync(f, "utf8").split("\n");
  let touched = false;
  const out = lines.map((line) => {
    if (/^\s*\/\//.test(line) || /^\s*\*/.test(line) || /^\s*\/\*/.test(line)) return line;
    // 1) pull out ${...} expressions (they hold data identifiers we DO rename)
    const exprs = [];
    let s = line.replace(/\$\{([^}]*)\}/g, (_, e) => {
      exprs.push(e);
      return `\u0001${exprs.length - 1}\u0001`;
    });
    // 2) mask literal i18n keys passed to t("...") / t('...') / t(`...`)
    const masks = [];
    s = s.replace(/\bt\(\s*(["'`])([^"'`]*)\1/g, (_, q, c) => {
      masks.push(c);
      return `t(${q}\u0002${masks.length - 1}\u0002${q}`;
    });
    // 3) rename data identifiers
    s = s.replace(camelR.re, (t) => camelR.map[t]);
    s = s.replace(singleR.re, (t) => singleR.map[t]);
    s = s.replace(enumR.re, (t) => enumR.map[t]);
    // 4) restore i18n keys, then ${...} expressions (renaming inside them)
    s = s.replace(/\u0002(\d+)\u0002/g, (_, i) => masks[Number(i)]);
    s = s.replace(/\u0001(\d+)\u0001/g, (_, i) => {
      let e = exprs[Number(i)];
      e = e.replace(camelR.re, (t) => camelR.map[t]);
      e = e.replace(singleR.re, (t) => singleR.map[t]);
      e = e.replace(enumR.re, (t) => enumR.map[t]);
      return "${" + e + "}";
    });
    if (s !== line) touched = true;
    return s;
  });
  if (touched) {
    fs.writeFileSync(f, out.join("\n"));
    changed++;
  }
}
console.log(`web files changed: ${changed} / ${files.length}`);
