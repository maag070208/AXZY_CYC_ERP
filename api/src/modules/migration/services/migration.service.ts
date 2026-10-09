import { createHash } from "node:crypto";
import type { Prisma, PrismaClient } from "@prisma/client";
import { prismaClient } from "@core/config/database";
import { once } from "@core/db/idempotency";
import { paginatedQuery } from "@core/db/table";
import { HttpError } from "@core/middlewares/error.middleware";
import { orderByOf, type ITDataTableFetchParams, type ITDataTableResponse } from "@core/utils/table";
import { todayInBusinessZone } from "@core/utils/day";
import type { AuthenticatedUser } from "@core/utils/security";
import type { AuditLogger } from "@modules/audit";
import {
  MAX_BACKUP_AGE_HOURS,
  MAX_MIGRATION_ROWS,
  type MigrationEntity,
  type ParsedRecord,
  type RowRejection,
  missingColumns,
  planRows,
  readTable,
} from "../models/entity/migration-rules";
import type { MigrationBatchDetailView, MigrationBatchView, MigrationRejection, MigrationResultView } from "../models/dto/migration.dto";
import { applyStudent, applyTeacher } from "./migration.writers";

const BACKUP_SETTING = "MIGRATION_LAST_BACKUP_AT";
const REJECTED_IN_RESPONSE = 100;

type Client = PrismaClient | Prisma.TransactionClient;

interface BuiltPlan {
  checksum: string;
  read: number;
  accepted: ParsedRecord[];
  rejected: RowRejection[];
}

const toBatchView = (row: {
  id: string; entity: string; file: string; checksum: string; mode: string; status: string;
  totalsJson: Prisma.JsonValue; createdBy: string; executedAt: Date | null; createdAt: Date;
}): MigrationBatchView => ({
  id: row.id,
  entity: row.entity as MigrationEntity,
  file: row.file,
  checksum: row.checksum,
  mode: row.mode as MigrationBatchView["mode"],
  status: row.status as MigrationBatchView["status"],
  totals: (row.totalsJson ?? {}) as Record<string, number>,
  createdBy: row.createdBy,
  executedAt: row.executedAt ? row.executedAt.toISOString() : null,
  createdAt: row.createdAt.toISOString(),
});

const toRejection = (row: { rowNumber: number; naturalKey: string | null; reason: string | null; raw: Prisma.JsonValue }): MigrationRejection => ({
  row: row.rowNumber,
  naturalKey: row.naturalKey,
  reason: row.reason ?? "REJECTED",
  value: (row.raw as { value?: string | null } | null)?.value ?? null,
});

/** `RowRejection` (interno) → DTO de respuesta. */
const rejectionDto = (r: RowRejection): MigrationRejection => ({ row: r.rowNumber, naturalKey: r.naturalKey, reason: r.reason, value: r.value });

/**
 * M20 — migración de históricos. El `plan()` (dry-run y ejecución) comparte el
 * mismo cálculo: se lee y normaliza el archivo, se validan filas y se detectan
 * duplicados por clave natural; la ejecución real revalida el `checksum` y exige
 * un respaldo reciente antes de escribir.
 */
export class MigrationService {
  constructor(
    private readonly db: PrismaClient = prismaClient,
    private readonly audit?: AuditLogger
  ) {}

  /** `true` si hay respaldo registrado y reciente (gate de la ejecución real). */
  private async hasFreshBackup(): Promise<boolean> {
    const row = await this.db.setting.findUnique({ where: { key: BACKUP_SETTING }, select: { value: true } });
    const value = row?.value;
    if (typeof value !== "string" || value.trim() === "") return false;
    const at = Date.parse(value);
    if (Number.isNaN(at)) return false;
    const ageHours = (Date.now() - at) / 3_600_000;
    return ageHours >= 0 && ageHours <= MAX_BACKUP_AGE_HOURS;
  }

  /** Lee, normaliza y valida el origen; misma base para `preview` y `execute`. */
  private async buildPlan(entity: MigrationEntity, buffer: Buffer, client: Client): Promise<BuiltPlan> {
    const checksum = createHash("sha256").update(buffer).digest("hex");
    const table = readTable(buffer.toString("utf-8"));
    const missing = missingColumns(entity, table.header);
    if (missing.length) throw new HttpError(400, "CSV_INVALID", { reason: `MISSING_COLUMNS: ${missing.join(", ")}` }, { missing });
    if (table.rows.length === 0) throw new HttpError(400, "CSV_INVALID", { reason: "EMPTY_FILE" });
    if (table.rows.length > MAX_MIGRATION_ROWS) throw new HttpError(400, "CSV_INVALID", { reason: `TOO_MANY_ROWS (max ${MAX_MIGRATION_ROWS})` });

    const planned = planRows(entity, table, todayInBusinessZone());
    const accepted: ParsedRecord[] = [];
    const rejected: RowRejection[] = [];
    const seenStudentNumbers = new Set<string>();

    for (const row of planned) {
      if (row.record) {
        const studentNumber = row.record.data.studentNumber as string | null;
        if (entity === "Student" && studentNumber) {
          const taken = await client.student.findUnique({ where: { studentNumber }, select: { curp: true } });
          if (seenStudentNumbers.has(studentNumber) || (taken && taken.curp !== row.record.data.curp)) {
            rejected.push({ rowNumber: row.rowNumber, entity, naturalKey: row.naturalKey, reason: "DUPLICATE_STUDENT_NUMBER", value: studentNumber });
            continue;
          }
          seenStudentNumbers.add(studentNumber);
        }
        accepted.push(row.record);
      } else if (row.problem) {
        rejected.push({ rowNumber: row.rowNumber, entity, naturalKey: row.naturalKey, reason: row.problem.reason, value: row.problem.value });
      }
    }
    return { checksum, read: table.rows.length, accepted, rejected };
  }

  /** Simulación: registra el lote y las filas rechazadas, sin tocar el dataset. */
  async preview(entity: MigrationEntity, file: string, buffer: Buffer, actor: AuthenticatedUser): Promise<MigrationResultView> {
    const plan = await this.buildPlan(entity, buffer, this.db);
    const totals = { read: plan.read, valid: plan.accepted.length, rejected: plan.rejected.length };
    const batch = await this.db.$transaction(async (tx) => {
      const row = await tx.migrationBatch.create({
        data: {
          entity,
          file,
          checksum: plan.checksum,
          mode: "DRY_RUN",
          status: "COMPLETED",
          totalsJson: totals,
          createdBy: actor.id,
          executedAt: new Date(),
          rows: { create: plan.rejected.map((r) => this.rejectionRow(r)) },
        },
      });
      await this.audit?.(
        { action: "MIGRATION_BATCH_PREVIEWED", entityType: "MigrationBatch", entityId: row.id, userId: actor.id, userName: actor.username,
          metadata: { entity, mode: "DRY_RUN", totals } },
        tx
      );
      return row;
    });
    return { batchId: batch.id, entity, mode: "DRY_RUN", status: "COMPLETED", checksum: plan.checksum, totals, rejected: plan.rejected.slice(0, REJECTED_IN_RESPONSE).map(rejectionDto) };
  }

  /**
   * Importación real en un lote transaccional, idempotente por `Idempotency-Key`.
   * Revalida el `checksum` del archivo y exige respaldo reciente.
   */
  async execute(
    entity: MigrationEntity,
    file: string,
    buffer: Buffer,
    actor: AuthenticatedUser,
    idempotencyKey: string | undefined,
    expectedChecksum?: string
  ): Promise<MigrationResultView & { replayed: boolean }> {
    if (!idempotencyKey) throw new HttpError(400, "INVALID_IDEMPOTENCY_KEY");
    if (!(await this.hasFreshBackup())) throw new HttpError(409, "BACKUP_REQUIRED", { maxHours: MAX_BACKUP_AGE_HOURS });

    const plan = await this.buildPlan(entity, buffer, this.db);
    if (expectedChecksum && expectedChecksum !== plan.checksum) throw new HttpError(409, "CHECKSUM_MISMATCH");

    const { result, replayed } = await this.db.$transaction((tx) =>
      once(tx, idempotencyKey, { userId: actor.id, scope: "migration.execute" }, async () => {
        let inserted = 0;
        let updated = 0;
        for (const record of plan.accepted) {
          const outcome = entity === "Student" ? await applyStudent(tx, record.data) : await applyTeacher(tx, record.data);
          if (outcome === "inserted") inserted++;
          else updated++;
        }
        const totals = { read: plan.read, inserted, updated, rejected: plan.rejected.length };
        const row = await tx.migrationBatch.create({
          data: {
            entity,
            file,
            checksum: plan.checksum,
            mode: "EXECUTE",
            status: "COMPLETED",
            idempotencyKey,
            totalsJson: totals,
            createdBy: actor.id,
            executedAt: new Date(),
            rows: { create: plan.rejected.map((r) => this.rejectionRow(r)) },
          },
        });
        await this.audit?.(
          { action: "MIGRATION_BATCH_EXECUTED", entityType: "MigrationBatch", entityId: row.id, userId: actor.id, userName: actor.username,
            metadata: { entity, mode: "EXECUTE", totals } },
          tx
        );
        return {
          batchId: row.id,
          entity,
          mode: "EXECUTE" as const,
          status: "COMPLETED" as const,
          checksum: plan.checksum,
          totals,
          rejected: plan.rejected.slice(0, REJECTED_IN_RESPONSE).map(rejectionDto),
        } satisfies MigrationResultView;
      })
    );
    return { ...result, replayed };
  }

  private rejectionRow(r: RowRejection) {
    return { rowNumber: r.rowNumber, entity: r.entity, naturalKey: r.naturalKey, status: "REJECTED" as const, reason: r.reason, raw: { value: r.value } };
  }

  async table(params: ITDataTableFetchParams): Promise<ITDataTableResponse<MigrationBatchView>> {
    const orderBy = orderByOf(
      params.sort,
      { entity: "entity", status: "status", mode: "mode", createdAt: "createdAt" },
      [{ createdAt: "desc" }]
    ).flat();
    const result = await paginatedQuery<Parameters<typeof toBatchView>[0]>({
      model: this.db.migrationBatch,
      orderBy,
      page: params.page,
      limit: params.limit,
    });
    return { data: result.data.map(toBatchView), total: result.total };
  }

  async getBatch(id: string): Promise<MigrationBatchDetailView> {
    const row = await this.db.migrationBatch.findUnique({ where: { id }, include: { rows: { orderBy: { rowNumber: "asc" } } } });
    if (!row) throw new HttpError(404, "MIGRATION_BATCH_NOT_FOUND");
    return { ...toBatchView(row), rows: row.rows.map(toRejection) };
  }
}
