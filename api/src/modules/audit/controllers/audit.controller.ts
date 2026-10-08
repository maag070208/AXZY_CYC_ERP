import { Request, Response } from "express";
import { parseTableParams, paginatedTable } from "@core/utils/table";
import { AuditService } from "../services/audit.service";

export class AuditController {
  constructor(private readonly service: AuditService) {}

  /** POST /audit/query — contrato ITDataTable. */
  query = async (req: Request, res: Response) => {
    const params = parseTableParams(req.body);
    const { data, total } = await this.service.query(params);
    res.json(paginatedTable(params, data, total));
  };

  /** GET /audit — filtros por query params. */
  list = async (req: Request, res: Response) => {
    const str = (v: unknown): string | undefined => (typeof v === "string" ? v : undefined);
    const num = (v: unknown): number | undefined =>
      typeof v === "string" && !Number.isNaN(Number(v)) ? Number(v) : undefined;
    const data = await this.service.list({
      action: str(req.query.action),
      entityType: str(req.query.entityType),
      entityId: str(req.query.entityId),
      userId: str(req.query.userId),
      from: str(req.query.from),
      to: str(req.query.to),
      page: num(req.query.page),
      limit: num(req.query.limit),
    });
    res.json(data);
  };

  getOne = async (req: Request, res: Response) => {
    res.json(await this.service.getById(req.params.id));
  };
}
