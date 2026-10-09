import { Request, Response } from "express";
import type { ZodTypeAny } from "zod";
import { HttpError } from "@core/middlewares/error.middleware";
import { parseTableParams, paginatedTable } from "@core/utils/table";
import { TermCreateDto, TermUpdateDto } from "../models/dto/catalog.dto";
import type { CatalogService } from "../services/catalog.service";
import type { SettingsService } from "../services/settings.service";
import type { TermService } from "../services/term.service";

export class SettingsController {
  constructor(private readonly service: SettingsService) {}

  list = async (_req: Request, res: Response) => {
    res.json(await this.service.list());
  };

  update = async (req: Request, res: Response) => {
    if (!req.user) throw new HttpError(401, "UNAUTHENTICATED");
    res.json(await this.service.update(req.body, req.user));
  };
}

/** Controller de un catálogo simple; cada uno trae sus esquemas de alta/edición. */
export class CatalogController {
  constructor(
    private readonly service: CatalogService,
    private readonly createSchema: ZodTypeAny,
    private readonly updateSchema: ZodTypeAny
  ) {}

  table = async (req: Request, res: Response) => {
    const params = parseTableParams(req.body);
    const { data, total } = await this.service.table(params);
    res.json(paginatedTable(params, data, total));
  };

  options = async (req: Request, res: Response) => {
    res.json(await this.service.options(req.query.all === "true"));
  };

  getById = async (req: Request, res: Response) => {
    res.json(await this.service.getById(req.params.id));
  };

  create = async (req: Request, res: Response) => {
    if (!req.user) throw new HttpError(401, "UNAUTHENTICATED");
    const data = this.createSchema.parse(req.body) as Record<string, unknown>;
    res.status(201).json(await this.service.create(data, req.user));
  };

  update = async (req: Request, res: Response) => {
    if (!req.user) throw new HttpError(401, "UNAUTHENTICATED");
    const data = this.updateSchema.parse(req.body) as Record<string, unknown>;
    res.json(await this.service.update(req.params.id, data, req.user));
  };

  deactivate = async (req: Request, res: Response) => {
    if (!req.user) throw new HttpError(401, "UNAUTHENTICATED");
    res.json(await this.service.deactivate(req.params.id, req.user));
  };
}

export class TermController {
  constructor(private readonly service: TermService) {}

  table = async (req: Request, res: Response) => {
    const params = parseTableParams(req.body);
    const { data, total } = await this.service.table(params);
    res.json(paginatedTable(params, data, total));
  };

  options = async (_req: Request, res: Response) => {
    res.json(await this.service.options());
  };

  active = async (_req: Request, res: Response) => {
    res.json(await this.service.active());
  };

  create = async (req: Request, res: Response) => {
    if (!req.user) throw new HttpError(401, "UNAUTHENTICATED");
    res.status(201).json(await this.service.create(TermCreateDto.parse(req.body), req.user));
  };

  update = async (req: Request, res: Response) => {
    if (!req.user) throw new HttpError(401, "UNAUTHENTICATED");
    res.json(await this.service.update(req.params.id, TermUpdateDto.parse(req.body), req.user));
  };

  activate = async (req: Request, res: Response) => {
    if (!req.user) throw new HttpError(401, "UNAUTHENTICATED");
    res.json(await this.service.activate(req.params.id, req.user));
  };
}
