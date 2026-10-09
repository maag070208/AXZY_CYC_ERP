const fs = require("fs");
const path = require("path");

const base = {
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

function walk(dir, acc = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, acc);
    else if (e.name.endsWith(".json")) acc.push(p);
  }
  return acc;
}
const files = walk("src/shared/i18n/locales");
let changed = 0;
for (const f of files) {
  const map = { ...base };
  if (f.endsWith("/movements.json")) map.BAJA = "WITHDRAWAL";
  else map.BAJA = "WITHDRAWN";
  if (f.endsWith("/exams.json")) map.ENVIADO = "SUBMITTED";
  else if (f.endsWith("/notifications.json")) map.ENVIADO = "SENT";
  else map.ENVIADO = "SENT";

  const lines = fs.readFileSync(f, "utf8").split("\n");
  let touched = false;
  const out = lines.map((line) => {
    const m = line.match(/^(\s*)"([A-Z_]+)":(.*)$/);
    if (m && map[m[2]]) {
      touched = true;
      return `${m[1]}"${map[m[2]]}":${m[3]}`;
    }
    return line;
  });
  if (touched) {
    fs.writeFileSync(f, out.join("\n"));
    changed++;
  }
}
console.log(`i18n json changed: ${changed} / ${files.length}`);
