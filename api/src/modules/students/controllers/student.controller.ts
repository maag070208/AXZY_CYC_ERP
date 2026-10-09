import { Request, Response } from "express";
import { HttpError } from "@core/middlewares/error.middleware";
import { parseTableParams, paginatedTable } from "@core/utils/table";
import { MovementInputDto, StudentCreateDto, StudentUpdateDto } from "../models/dto/student.dto";
import type { StudentService } from "../services/student.service";
import type { MovementService } from "../services/movement.service";

export class StudentController {
  constructor(
    private readonly students: StudentService,
    private readonly movements: MovementService
  ) {}

  private actor(req: Request) {
    if (!req.user) throw new HttpError(401, "UNAUTHENTICATED");
    return req.user;
  }

  table = async (req: Request, res: Response) => {
    const params = parseTableParams(req.body);
    const { data, total } = await this.students.table(params, this.actor(req));
    res.json(paginatedTable(params, data, total));
  };

  summary = async (req: Request, res: Response) => {
    res.json(await this.students.summary(this.actor(req)));
  };

  getById = async (req: Request, res: Response) => {
    res.json(await this.students.getById(req.params.id, this.actor(req)));
  };

  create = async (req: Request, res: Response) => {
    res.status(201).json(await this.students.create(StudentCreateDto.parse(req.body), this.actor(req)));
  };

  update = async (req: Request, res: Response) => {
    res.json(await this.students.update(req.params.id, StudentUpdateDto.parse(req.body), this.actor(req)));
  };

  export = async (req: Request, res: Response) => {
    const params = parseTableParams(req.body);
    const buffer = await this.students.export(params.filters, params.sort, this.actor(req));
    res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    res.setHeader("Content-Disposition", `attachment; filename="alumnos.xlsx"`);
    res.send(buffer);
  };

  /** `DELETE /students/:id`: baja lógica (M03) = movimiento de baja con motivo (M05). */
  remove = async (req: Request, res: Response) => {
    const input = MovementInputDto.parse(req.body ?? {});
    res.json(await this.movements.withdraw(req.params.id, input, this.actor(req), "students.delete"));
  };

  withdraw = async (req: Request, res: Response) => {
    res.json(await this.movements.withdraw(req.params.id, MovementInputDto.parse(req.body ?? {}), this.actor(req)));
  };

  reenter = async (req: Request, res: Response) => {
    res.json(await this.movements.reenter(req.params.id, MovementInputDto.parse(req.body ?? {}), this.actor(req)));
  };

  listMovements = async (req: Request, res: Response) => {
    res.json(await this.movements.list(req.params.id, this.actor(req)));
  };
}
