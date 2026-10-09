import { Request, Response } from "express";
import { HttpError } from "@core/middlewares/error.middleware";
import { parseTableParams, paginatedTable } from "@core/utils/table";
import { AssessmentCreateDto, AssessmentUpdateDto, GradeCaptureDto } from "../models/dto/grade.dto";
import type { AssessmentService } from "../services/assessment.service";
import type { GradeService } from "../services/grade.service";

const actor = (req: Request) => {
  if (!req.user) throw new HttpError(401, "UNAUTHENTICATED");
  return req.user;
};

export class AssessmentController {
  constructor(
    private readonly assessments: AssessmentService,
    private readonly grades: GradeService
  ) {}

  table = async (req: Request, res: Response) => {
    const params = parseTableParams(req.body);
    const { data, total } = await this.assessments.table(params, actor(req));
    res.json(paginatedTable(params, data, total));
  };
  getById = async (req: Request, res: Response) => {
    res.json(await this.assessments.getById(req.params.id, actor(req)));
  };
  create = async (req: Request, res: Response) => {
    res.status(201).json(await this.assessments.create(AssessmentCreateDto.parse(req.body), actor(req)));
  };
  update = async (req: Request, res: Response) => {
    res.json(await this.assessments.update(req.params.id, AssessmentUpdateDto.parse(req.body), actor(req)));
  };
  deactivate = async (req: Request, res: Response) => {
    res.json(await this.assessments.deactivate(req.params.id, actor(req)));
  };
  capture = async (req: Request, res: Response) => {
    res.json(await this.grades.capture(req.params.id, GradeCaptureDto.parse(req.body), actor(req)));
  };
}

export class GradeController {
  constructor(private readonly grades: GradeService) {}

  table = async (req: Request, res: Response) => {
    const params = parseTableParams(req.body);
    const { data, total } = await this.grades.table(params, actor(req));
    res.json(paginatedTable(params, data, total));
  };
  export = async (req: Request, res: Response) => {
    const groupId = typeof req.query.groupId === "string" ? req.query.groupId : undefined;
    const { buffer, filename } = await this.grades.export(groupId, actor(req));
    res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
    res.send(buffer);
  };
  gradebook = async (req: Request, res: Response) => {
    res.json(await this.grades.gradebook(req.params.groupId, actor(req)));
  };
  close = async (req: Request, res: Response) => {
    res.json(await this.grades.close(req.params.groupId, actor(req)));
  };
}
