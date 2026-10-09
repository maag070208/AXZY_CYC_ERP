import { Request, Response } from "express";
import { parseIdempotencyKey } from "@core/db/idempotency";
import { HttpError } from "@core/middlewares/error.middleware";
import { paginatedTable, parseTableParams } from "@core/utils/table";
import { isMigrationEntity, type MigrationEntity } from "../models/entity/migration-rules";
import type { MigrationService } from "../services/migration.service";

const actor = (req: Request) => {
  if (!req.user) throw new HttpError(401, "UNAUTHENTICATED");
  return req.user;
};

const entityOf = (body: unknown): MigrationEntity => {
  const value = String((body as { entity?: unknown } | undefined)?.entity ?? "");
  if (!isMigrationEntity(value)) throw new HttpError(400, "MIGRATION_ENTITY_INVALID", { field: "entity" });
  return value;
};

export class MigrationController {
  constructor(private readonly service: MigrationService) {}

  preview = async (req: Request, res: Response) => {
    if (!req.file) throw new HttpError(400, "FILE_REQUIRED");
    const entity = entityOf(req.body);
    res.json(await this.service.preview(entity, req.file.originalname, req.file.buffer, actor(req)));
  };

  execute = async (req: Request, res: Response) => {
    if (!req.file) throw new HttpError(400, "FILE_REQUIRED");
    const entity = entityOf(req.body);
    const key = parseIdempotencyKey(req.headers["idempotency-key"]);
    const checksum = (req.body as { checksum?: string } | undefined)?.checksum;
    res.status(201).json(await this.service.execute(entity, req.file.originalname, req.file.buffer, actor(req), key, checksum || undefined));
  };

  table = async (req: Request, res: Response) => {
    const params = parseTableParams(req.body);
    const { data, total } = await this.service.table(params);
    res.json(paginatedTable(params, data, total));
  };

  getBatch = async (req: Request, res: Response) => {
    res.json(await this.service.getBatch(req.params.id));
  };
}
