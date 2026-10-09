import { Request, Response } from "express";
import { HttpError } from "@core/middlewares/error.middleware";
import { parseIdempotencyKey } from "@core/db/idempotency";
import { parseTableParams, paginatedTable } from "@core/utils/table";
import { QuestionCreateDto, QuestionUpdateDto } from "../models/dto/question.dto";
import type { QuestionService } from "../services/question.service";

const actor = (req: Request) => {
  if (!req.user) throw new HttpError(401, "UNAUTHENTICATED");
  return req.user;
};

export class QuestionController {
  constructor(private readonly questions: QuestionService) {}

  table = async (req: Request, res: Response) => {
    const params = parseTableParams(req.body);
    const { data, total } = await this.questions.table(params, actor(req));
    res.json(paginatedTable(params, data, total));
  };
  getById = async (req: Request, res: Response) => {
    res.json(await this.questions.getById(req.params.id, actor(req)));
  };
  create = async (req: Request, res: Response) => {
    res.status(201).json(await this.questions.create(QuestionCreateDto.parse(req.body), actor(req)));
  };
  update = async (req: Request, res: Response) => {
    res.json(await this.questions.update(req.params.id, QuestionUpdateDto.parse(req.body), actor(req)));
  };
  deactivate = async (req: Request, res: Response) => {
    res.json(await this.questions.setStatus(req.params.id, false, actor(req)));
  };
  reactivate = async (req: Request, res: Response) => {
    res.json(await this.questions.setStatus(req.params.id, true, actor(req)));
  };
  import = async (req: Request, res: Response) => {
    if (!req.file) throw new HttpError(400, "FILE_REQUIRED");
    const preview = req.query.preview === "true";
    const idempotencyKey = preview ? undefined : parseIdempotencyKey(req.headers["idempotency-key"]);
    const result = await this.questions.import(req.file.buffer.toString("utf-8"), actor(req), { preview, idempotencyKey });
    res.status(preview ? 200 : 201).json(result);
  };
}
