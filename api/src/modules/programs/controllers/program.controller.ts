import { Request, Response } from "express";
import { parseIdempotencyKey } from "@core/db/idempotency";
import { HttpError } from "@core/middlewares/error.middleware";
import { paginatedTable, parseTableParams } from "@core/utils/table";
import { ProgramCreateDto, ProgramSubjectsDto, ProgramUpdateDto, PlanCreateDto } from "../models/dto/program.dto";
import type { ProgramService } from "../services/program.service";
import type { PlanService } from "../services/plan.service";

const actor = (req: Request) => {
  if (!req.user) throw new HttpError(401, "UNAUTHENTICATED");
  return req.user;
};

export class ProgramController {
  constructor(
    private readonly programs: ProgramService,
    private readonly plans: PlanService
  ) {}

  // --- programas ---
  table = async (req: Request, res: Response) => {
    const params = parseTableParams(req.body);
    const { data, total } = await this.programs.table(params);
    res.json(paginatedTable(params, data, total));
  };
  getById = async (req: Request, res: Response) => {
    res.json(await this.programs.getById(req.params.id));
  };
  create = async (req: Request, res: Response) => {
    res.status(201).json(await this.programs.create(ProgramCreateDto.parse(req.body), actor(req)));
  };
  update = async (req: Request, res: Response) => {
    res.json(await this.programs.update(req.params.id, ProgramUpdateDto.parse(req.body), actor(req)));
  };
  deactivate = async (req: Request, res: Response) => {
    res.json(await this.programs.setActive(req.params.id, false, actor(req)));
  };
  reactivate = async (req: Request, res: Response) => {
    res.json(await this.programs.setActive(req.params.id, true, actor(req)));
  };
  replaceSubjects = async (req: Request, res: Response) => {
    res.json(await this.programs.replaceSubjects(req.params.id, ProgramSubjectsDto.parse(req.body), actor(req)));
  };

  // --- planes ---
  planTable = async (req: Request, res: Response) => {
    const params = parseTableParams(req.body);
    const { data, total } = await this.plans.table(params);
    res.json(paginatedTable(params, data, total));
  };
  planGet = async (req: Request, res: Response) => {
    res.json(await this.plans.getById(req.params.id));
  };
  planCreate = async (req: Request, res: Response) => {
    const key = parseIdempotencyKey(req.headers["idempotency-key"]);
    res.status(201).json(await this.plans.create(PlanCreateDto.parse(req.body), actor(req), key));
  };
  planCancel = async (req: Request, res: Response) => {
    const reason = String((req.body as { reason?: string } | undefined)?.reason ?? "").trim();
    if (reason.length < 3) throw new HttpError(400, "REASON_REQUIRED");
    res.json(await this.plans.cancel(req.params.id, reason, actor(req)));
  };
}
