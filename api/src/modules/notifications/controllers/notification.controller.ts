import { Request, Response } from "express";
import { HttpError } from "@core/middlewares/error.middleware";
import { parseIdempotencyKey } from "@core/db/idempotency";
import { parseTableParams, paginatedTable } from "@core/utils/table";
import { MarkReadDto, PreferenceDto, SendDto, TemplateCreateDto, TemplateUpdateDto } from "../models/dto/notification.dto";
import type { NotificationService } from "../services/notification.service";

const actor = (req: Request) => {
  if (!req.user) throw new HttpError(401, "UNAUTHENTICATED");
  return req.user;
};

export class NotificationController {
  constructor(private readonly service: NotificationService) {}

  // --- plantillas ---
  templateTable = async (req: Request, res: Response) => {
    const params = parseTableParams(req.body);
    const { data, total } = await this.service.templateTable(params);
    res.json(paginatedTable(params, data, total));
  };
  getTemplate = async (req: Request, res: Response) => {
    res.json(await this.service.getTemplate(req.params.id));
  };
  createTemplate = async (req: Request, res: Response) => {
    res.status(201).json(await this.service.createTemplate(TemplateCreateDto.parse(req.body), actor(req)));
  };
  updateTemplate = async (req: Request, res: Response) => {
    res.json(await this.service.updateTemplate(req.params.id, TemplateUpdateDto.parse(req.body), actor(req)));
  };
  deactivateTemplate = async (req: Request, res: Response) => {
    res.json(await this.service.setTemplateActive(req.params.id, false, actor(req)));
  };
  reactivateTemplate = async (req: Request, res: Response) => {
    res.json(await this.service.setTemplateActive(req.params.id, true, actor(req)));
  };

  // --- envíos ---
  table = async (req: Request, res: Response) => {
    const params = parseTableParams(req.body);
    const { data, total } = await this.service.table(params);
    res.json(paginatedTable(params, data, total));
  };
  send = async (req: Request, res: Response) => {
    const key = parseIdempotencyKey(req.header("Idempotency-Key"));
    res.status(201).json(await this.service.send(SendDto.parse(req.body), key, actor(req)));
  };
  retry = async (req: Request, res: Response) => {
    res.json(await this.service.retry(req.params.id, actor(req)));
  };
  drain = async (_req: Request, res: Response) => {
    res.json(await this.service.drain());
  };

  // --- bandeja propia ---
  mine = async (req: Request, res: Response) => {
    const limit = Number(req.query.limit ?? 30);
    res.json(await this.service.mine(actor(req).id, Number.isFinite(limit) ? limit : 30));
  };
  markRead = async (req: Request, res: Response) => {
    res.json(await this.service.markRead(actor(req).id, MarkReadDto.parse(req.body)));
  };

  // --- preferencias ---
  preferenceTable = async (req: Request, res: Response) => {
    const params = parseTableParams(req.body);
    const { data, total } = await this.service.preferenceTable(params);
    res.json(paginatedTable(params, data, total));
  };
  setPreference = async (req: Request, res: Response) => {
    res.json(await this.service.setPreference(PreferenceDto.parse(req.body), actor(req)));
  };
}
