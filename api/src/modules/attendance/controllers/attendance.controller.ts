import { Request, Response } from "express";
import { HttpError } from "@core/middlewares/error.middleware";
import { parseTableParams, paginatedTable } from "@core/utils/table";
import { AnnulDto, JustificationFieldsDto, ResolveDto, RollCallDto, SessionCreateDto } from "../models/dto/attendance.dto";
import type { AttendanceService } from "../services/attendance.service";
import type { JustificationService, UploadedFile } from "../services/justification.service";

const actor = (req: Request) => {
  if (!req.user) throw new HttpError(401, "UNAUTHENTICATED");
  return req.user;
};

export class AttendanceController {
  constructor(
    private readonly attendance: AttendanceService,
    private readonly justifications: JustificationService
  ) {}

  listSessions = async (req: Request, res: Response) => {
    res.json(await this.attendance.listSessions(req.params.groupId, actor(req)));
  };
  createSession = async (req: Request, res: Response) => {
    res.status(201).json(await this.attendance.createSession(req.params.groupId, SessionCreateDto.parse(req.body), actor(req)));
  };
  groupSummary = async (req: Request, res: Response) => {
    res.json(await this.attendance.groupSummary(req.params.groupId, actor(req)));
  };
  getRoll = async (req: Request, res: Response) => {
    res.json(await this.attendance.getRoll(req.params.id, actor(req)));
  };
  saveRoll = async (req: Request, res: Response) => {
    res.json(await this.attendance.saveRoll(req.params.id, RollCallDto.parse(req.body), actor(req)));
  };
  annul = async (req: Request, res: Response) => {
    const { motivo } = AnnulDto.parse(req.body ?? {});
    res.json(await this.attendance.annul(req.params.id, motivo, actor(req)));
  };
  studentSummary = async (req: Request, res: Response) => {
    res.json(await this.attendance.studentSummary(req.params.studentId, actor(req)));
  };

  createJustification = async (req: Request, res: Response) => {
    const fields = JustificationFieldsDto.parse(req.body ?? {});
    const file = (req as Request & { file?: UploadedFile }).file;
    res.status(201).json(await this.justifications.create(fields, file, actor(req)));
  };
  justificationsTable = async (req: Request, res: Response) => {
    const params = parseTableParams(req.body);
    const { data, total } = await this.justifications.table(params, actor(req));
    res.json(paginatedTable(params, data, total));
  };
  resolve = async (req: Request, res: Response) => {
    res.json(await this.justifications.resolve(req.params.id, ResolveDto.parse(req.body), actor(req)));
  };
  file = async (req: Request, res: Response) => {
    const file = await this.justifications.file(req.params.id, actor(req));
    res.setHeader("Content-Type", file.mimeType);
    res.setHeader("Content-Length", String(file.buffer.length));
    res.setHeader("Content-Disposition", `attachment; filename*=UTF-8''${encodeURIComponent(file.filename)}`);
    res.setHeader("Cache-Control", "private, no-store");
    res.send(file.buffer);
  };
}
