import { Request, Response } from "express";
import { HttpError } from "@core/middlewares/error.middleware";
import { parseTableParams, paginatedTable } from "@core/utils/table";
import { TeacherCreateDto, TeacherDeactivateDto, TeacherUpdateDto } from "../models/dto/teacher.dto";
import type { TeacherService } from "../services/teacher.service";

export class TeacherController {
  constructor(private readonly teachers: TeacherService) {}

  private actor(req: Request) {
    if (!req.user) throw new HttpError(401, "UNAUTHENTICATED");
    return req.user;
  }

  table = async (req: Request, res: Response) => {
    const params = parseTableParams(req.body);
    const { data, total } = await this.teachers.table(params, this.actor(req));
    res.json(paginatedTable(params, data, total));
  };

  getById = async (req: Request, res: Response) => {
    res.json(await this.teachers.getById(req.params.id, this.actor(req)));
  };

  create = async (req: Request, res: Response) => {
    res.status(201).json(await this.teachers.create(TeacherCreateDto.parse(req.body), this.actor(req)));
  };

  update = async (req: Request, res: Response) => {
    res.json(await this.teachers.update(req.params.id, TeacherUpdateDto.parse(req.body), this.actor(req)));
  };

  deactivate = async (req: Request, res: Response) => {
    const { reason } = TeacherDeactivateDto.parse(req.body ?? {});
    res.json(await this.teachers.deactivate(req.params.id, this.actor(req), reason));
  };

  reactivate = async (req: Request, res: Response) => {
    res.json(await this.teachers.reactivate(req.params.id, this.actor(req)));
  };

  resendInvitation = async (req: Request, res: Response) => {
    res.json(await this.teachers.resendInvitation(req.params.id, this.actor(req)));
  };
}
