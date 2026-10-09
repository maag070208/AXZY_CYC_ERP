import { Request, Response } from "express";
import { HttpError } from "@core/middlewares/error.middleware";
import { parseTableParams, paginatedTable } from "@core/utils/table";
import {
  AttemptEventDto,
  ExamCreateDto,
  ExamQuestionsDto,
  ExamUpdateDto,
  ReviewDto,
  SaveAnswersDto,
  SubmitAttemptDto,
} from "../models/dto/exam.dto";
import type { ExamService } from "../services/exam.service";
import type { AttemptService } from "../services/attempt.service";

const actor = (req: Request) => {
  if (!req.user) throw new HttpError(401, "UNAUTHENTICATED");
  return req.user;
};

export class ExamController {
  constructor(
    private readonly exams: ExamService,
    private readonly attempts: AttemptService
  ) {}

  // --- M15 ---
  table = async (req: Request, res: Response) => {
    const params = parseTableParams(req.body);
    const { data, total } = await this.exams.table(params, actor(req));
    res.json(paginatedTable(params, data, total));
  };
  getById = async (req: Request, res: Response) => {
    res.json(await this.exams.getById(req.params.id, actor(req)));
  };
  create = async (req: Request, res: Response) => {
    res.status(201).json(await this.exams.create(ExamCreateDto.parse(req.body), actor(req)));
  };
  update = async (req: Request, res: Response) => {
    res.json(await this.exams.update(req.params.id, ExamUpdateDto.parse(req.body), actor(req)));
  };
  remove = async (req: Request, res: Response) => {
    await this.exams.remove(req.params.id, actor(req));
    res.status(204).end();
  };
  setQuestions = async (req: Request, res: Response) => {
    res.json(await this.exams.setQuestions(req.params.id, ExamQuestionsDto.parse(req.body), actor(req)));
  };
  removeQuestion = async (req: Request, res: Response) => {
    res.json(await this.exams.removeQuestion(req.params.id, req.params.questionId, actor(req)));
  };
  publish = async (req: Request, res: Response) => {
    res.json(await this.exams.publish(req.params.id, actor(req)));
  };
  close = async (req: Request, res: Response) => {
    res.json(await this.attempts.closeExam(req.params.id, actor(req)));
  };

  // --- M16 (alumno) ---
  available = async (req: Request, res: Response) => {
    res.json(await this.attempts.available(actor(req)));
  };
  start = async (req: Request, res: Response) => {
    const { attempt, resumed } = await this.attempts.start(req.params.id, actor(req));
    res.status(resumed ? 200 : 201).json(attempt);
  };
  getAttempt = async (req: Request, res: Response) => {
    res.json(await this.attempts.get(req.params.id, actor(req)));
  };
  saveAnswers = async (req: Request, res: Response) => {
    res.json(await this.attempts.saveAnswers(req.params.id, SaveAnswersDto.parse(req.body), actor(req)));
  };
  submit = async (req: Request, res: Response) => {
    const { answers } = SubmitAttemptDto.parse(req.body ?? {});
    res.json(await this.attempts.submit(req.params.id, answers, actor(req)));
  };
  event = async (req: Request, res: Response) => {
    const { type } = AttemptEventDto.parse(req.body);
    res.json(await this.attempts.event(req.params.id, type, actor(req)));
  };

  // --- M17 (personal) ---
  results = async (req: Request, res: Response) => {
    res.json(await this.attempts.results(req.params.id, actor(req)));
  };
  review = async (req: Request, res: Response) => {
    res.json(await this.attempts.review(req.params.id, ReviewDto.parse(req.body), actor(req)));
  };
  regrade = async (req: Request, res: Response) => {
    res.json(await this.attempts.regrade(req.params.id, actor(req)));
  };
}
