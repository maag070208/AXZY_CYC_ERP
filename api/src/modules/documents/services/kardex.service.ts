import type { PrismaClient } from "@prisma/client";
import { prismaClient } from "@core/config/database";
import { fromDbDay } from "@core/utils/day";
import type { AuthenticatedUser } from "@core/utils/security";
import type { StudentService } from "@modules/students";
import { fullName } from "@modules/students/services/student.service";
import type { Kardex, KardexEntry } from "../models/dto/document.dto";
import type { KardexSource } from "../models/entity/document.entity";

/** Sin cursos ni calificaciones todavía (M07/M08). */
const noAcademicHistory: KardexSource = async () => [];

/** Promedio de las calificaciones finales de cursos cerrados. **Pura.** */
export const averageOf = (entries: KardexEntry[]): number | null => {
  const finals = entries
    .filter((e) => e.estatus === "PASSED" || e.estatus === "FAILED")
    .map((e) => e.calificacionFinal)
    .filter((v): v is number => v !== null);
  if (finals.length === 0) return null;
  return Math.round((finals.reduce((a, b) => a + b, 0) / finals.length) * 100) / 100;
};

/**
 * Kardex (M06): vista **calculada al vuelo**, nunca persistida. Junta los
 * renglones académicos (M07/M08 por puerto), los documentos obligatorios
 * faltantes y los parámetros de M11.
 */
export class KardexService {
  private source: KardexSource = noAcademicHistory;

  constructor(
    private readonly students: StudentService,
    private readonly db: PrismaClient = prismaClient
  ) {}

  /** M08 conecta aquí la fuente académica. */
  setSource(source: KardexSource): void {
    this.source = source;
  }

  async get(studentId: string, actor: AuthenticatedUser, permission = "kardex.view"): Promise<Kardex> {
    const student = await this.students.loadScoped(studentId, actor, permission);
    const [entries, required, validated, settings] = await Promise.all([
      this.source(studentId),
      this.db.documentType.findMany({ where: { active: true, required: true }, orderBy: { name: "asc" } }),
      this.db.document.findMany({
        where: { studentId, status: "VALIDATED", deletedAt: null },
        select: { documentTypeId: true },
      }),
      this.db.setting.findMany({ where: { key: { in: ["MIN_PASSING_GRADE", "SCHOOL_NAME"] } } }),
    ]);
    const has = new Set(validated.map((d) => d.documentTypeId));
    const setting = new Map(settings.map((s) => [s.key, s.value]));
    return {
      studentId: student.id,
      studentNumber: student.studentNumber,
      name: fullName(student),
      status: student.status,
      enrollmentDate: fromDbDay(student.enrollmentDate),
      entries,
      promedioGeneral: averageOf(entries),
      creditosAcreditados: entries.filter((e) => e.estatus === "PASSED").length,
      documentosFaltantes: required.filter((t) => !has.has(t.id)).map((t) => t.name),
      minPassingGrade: Number(setting.get("MIN_PASSING_GRADE") ?? 70),
      escuela: String(setting.get("SCHOOL_NAME") ?? "CYC"),
      generadoEn: new Date().toISOString(),
    };
  }
}
