import { Request, Response } from "express";
import type { PrismaClient } from "@prisma/client";
import { prismaClient } from "@core/config/database";
import { HttpError } from "@core/middlewares/error.middleware";
import { scopeOf } from "@core/permissions";
import type { AuditLogger } from "@modules/audit";
import type { ReportService } from "../services/report.service";
import { toPdf, toXlsx } from "../services/report-export";

const FORMATS = ["json", "xlsx", "pdf"] as const;

const actor = (req: Request) => {
  if (!req.user) throw new HttpError(401, "UNAUTHENTICATED");
  return req.user;
};

export class ReportController {
  constructor(
    private readonly reports: ReportService,
    private readonly audit?: AuditLogger,
    private readonly db: PrismaClient = prismaClient
  ) {}

  catalog = async (req: Request, res: Response) => {
    res.json(this.reports.catalog(actor(req)));
  };

  run = async (req: Request, res: Response) => {
    const user = actor(req);
    const format = (req.query.format ?? "json") as string;
    if (!(FORMATS as readonly string[]).includes(format)) throw new HttpError(400, "REPORT_FORMAT_INVALID");
    // Exportar exige además `reports.export` (M10 §4.10).
    if (format !== "json" && scopeOf(user, "reports.export") === "NONE") throw new HttpError(403, "INSUFFICIENT_PERMISSIONS");
    const { format: _ignored, ...query } = req.query as Record<string, unknown>;
    const result = await this.reports.run(req.params.tipo, this.reports.parseFilters(query), user);
    if (format === "json") {
      res.json(result);
      return;
    }
    await this.audit?.({
      action: "REPORT_EXPORTED",
      entityType: "Report",
      entityId: result.report,
      userId: user.id,
      userName: user.username,
      metadata: { tipo: result.report, format, filters: JSON.parse(JSON.stringify(result.filters)), rows: result.rows.length },
    });
    const filename = `${result.report}-${new Date().toISOString().slice(0, 10)}.${format}`;
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
    if (format === "xlsx") {
      res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
      res.send(toXlsx(result));
      return;
    }
    const school = await this.db.setting.findUnique({ where: { key: "SCHOOL_NAME" } });
    res.setHeader("Content-Type", "application/pdf");
    res.send(await toPdf(result, String(school?.value ?? "CYC")));
  };

  dashboard = async (req: Request, res: Response) => {
    res.json(await this.reports.dashboard(actor(req)));
  };
}
