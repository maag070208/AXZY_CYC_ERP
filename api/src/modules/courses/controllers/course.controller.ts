import { Request, Response } from "express";
import { HttpError } from "@core/middlewares/error.middleware";
import { parseTableParams, paginatedTable } from "@core/utils/table";
import {
  ChangeGroupDto,
  CourseCreateDto,
  CourseUpdateDto,
  EnrollDto,
  EnrollmentDropDto,
  GroupCreateDto,
  GroupUpdateDto,
} from "../models/dto/course.dto";
import type { CourseService } from "../services/course.service";
import type { GroupService } from "../services/group.service";
import type { EnrollmentService } from "../services/enrollment.service";

const actor = (req: Request) => {
  if (!req.user) throw new HttpError(401, "UNAUTHENTICATED");
  return req.user;
};

const queryId = (value: unknown): string | undefined => (typeof value === "string" && value ? value : undefined);

export class CourseController {
  constructor(private readonly courses: CourseService) {}

  table = async (req: Request, res: Response) => {
    const params = parseTableParams(req.body);
    const { data, total } = await this.courses.table(params, actor(req));
    res.json(paginatedTable(params, data, total));
  };
  options = async (req: Request, res: Response) => {
    res.json(await this.courses.options(actor(req)));
  };
  getById = async (req: Request, res: Response) => {
    res.json(await this.courses.getById(req.params.id, actor(req)));
  };
  create = async (req: Request, res: Response) => {
    res.status(201).json(await this.courses.create(CourseCreateDto.parse(req.body), actor(req)));
  };
  update = async (req: Request, res: Response) => {
    res.json(await this.courses.update(req.params.id, CourseUpdateDto.parse(req.body), actor(req)));
  };
  deactivate = async (req: Request, res: Response) => {
    res.json(await this.courses.setActive(req.params.id, false, actor(req)));
  };
  reactivate = async (req: Request, res: Response) => {
    res.json(await this.courses.setActive(req.params.id, true, actor(req)));
  };
}

export class GroupController {
  constructor(
    private readonly groups: GroupService,
    private readonly enrollments: EnrollmentService
  ) {}

  table = async (req: Request, res: Response) => {
    const params = parseTableParams(req.body);
    const { data, total } = await this.groups.table(params, actor(req));
    res.json(paginatedTable(params, data, total));
  };
  options = async (req: Request, res: Response) => {
    res.json(
      await this.groups.options(actor(req), { termId: queryId(req.query.termId), courseId: queryId(req.query.courseId) })
    );
  };
  getById = async (req: Request, res: Response) => {
    res.json(await this.groups.getById(req.params.id, actor(req)));
  };
  create = async (req: Request, res: Response) => {
    res.status(201).json(await this.groups.create(GroupCreateDto.parse(req.body), actor(req)));
  };
  update = async (req: Request, res: Response) => {
    res.json(await this.groups.update(req.params.id, GroupUpdateDto.parse(req.body), actor(req)));
  };
  deactivate = async (req: Request, res: Response) => {
    res.json(await this.groups.setActive(req.params.id, false, actor(req)));
  };
  reactivate = async (req: Request, res: Response) => {
    res.json(await this.groups.setActive(req.params.id, true, actor(req)));
  };
  enroll = async (req: Request, res: Response) => {
    res.status(201).json(await this.enrollments.enroll(req.params.id, EnrollDto.parse(req.body), actor(req)));
  };
}

export class EnrollmentController {
  constructor(private readonly enrollments: EnrollmentService) {}

  table = async (req: Request, res: Response) => {
    const params = parseTableParams(req.body);
    const { data, total } = await this.enrollments.table(params, actor(req));
    res.json(paginatedTable(params, data, total));
  };
  drop = async (req: Request, res: Response) => {
    const { reason } = EnrollmentDropDto.parse(req.body ?? {});
    res.json(await this.enrollments.drop(req.params.id, actor(req), reason));
  };
  changeGroup = async (req: Request, res: Response) => {
    const { toGroupId } = ChangeGroupDto.parse(req.body);
    res.json(await this.enrollments.changeGroup(req.params.id, toGroupId, actor(req)));
  };
}
