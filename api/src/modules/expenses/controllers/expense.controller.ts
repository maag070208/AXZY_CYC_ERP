import { Request, Response } from "express";
import { HttpError } from "@core/middlewares/error.middleware";
import { parseTableParams, paginatedTable } from "@core/utils/table";
import { CancelDto } from "@modules/finance/models/dto/finance.dto";
import { ExpenseCreateDto, ExpenseUpdateDto } from "../models/dto/expense.dto";
import type { ExpenseService } from "../services/expense.service";

const actor = (req: Request) => {
  if (!req.user) throw new HttpError(401, "UNAUTHENTICATED");
  return req.user;
};

/** El ciclo del resumen: el de la query o `all` para no acotar. */
const termOf = (req: Request): string | null => {
  const termId = req.query.termId;
  if (typeof termId !== "string" || !termId || termId === "all") return null;
  return termId;
};

export class ExpenseController {
  constructor(private readonly expenses: ExpenseService) {}

  table = async (req: Request, res: Response) => {
    const params = parseTableParams(req.body);
    const { data, total } = await this.expenses.table(params);
    res.json(paginatedTable(params, data, total));
  };

  get = async (req: Request, res: Response) => {
    res.json(await this.expenses.getById(req.params.id));
  };

  summary = async (req: Request, res: Response) => {
    res.json(await this.expenses.summary(termOf(req)));
  };

  create = async (req: Request, res: Response) => {
    res.status(201).json(await this.expenses.create(ExpenseCreateDto.parse(req.body), actor(req)));
  };

  update = async (req: Request, res: Response) => {
    res.json(await this.expenses.update(req.params.id, ExpenseUpdateDto.parse(req.body), actor(req)));
  };

  cancel = async (req: Request, res: Response) => {
    const { reason } = CancelDto.parse(req.body);
    res.json(await this.expenses.cancel(req.params.id, reason, actor(req)));
  };
}
