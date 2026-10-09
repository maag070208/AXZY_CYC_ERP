import { Request, Response } from "express";
import { HttpError } from "@core/middlewares/error.middleware";
import { parseIdempotencyKey } from "@core/db/idempotency";
import { parseTableParams, paginatedTable } from "@core/utils/table";
import {
  CancelDto,
  ChargeCreateDto,
  ChargeGenerateDto,
  FeeConceptCreateDto,
  FeeConceptUpdateDto,
  LateFeesDto,
  PaymentCreateDto,
} from "../models/dto/finance.dto";
import type { FeeConceptService } from "../services/fee-concept.service";
import type { ChargeService } from "../services/charge.service";
import type { PaymentService } from "../services/payment.service";

const actor = (req: Request) => {
  if (!req.user) throw new HttpError(401, "UNAUTHENTICATED");
  return req.user;
};

export class FinanceController {
  constructor(
    private readonly concepts: FeeConceptService,
    private readonly charges: ChargeService,
    private readonly payments: PaymentService
  ) {}

  // --- conceptos ---
  conceptsTable = async (req: Request, res: Response) => {
    const params = parseTableParams(req.body);
    const { data, total } = await this.concepts.table(params);
    res.json(paginatedTable(params, data, total));
  };
  conceptOptions = async (_req: Request, res: Response) => {
    res.json(await this.concepts.options());
  };
  createConcept = async (req: Request, res: Response) => {
    res.status(201).json(await this.concepts.create(FeeConceptCreateDto.parse(req.body), actor(req)));
  };
  updateConcept = async (req: Request, res: Response) => {
    res.json(await this.concepts.update(req.params.id, FeeConceptUpdateDto.parse(req.body), actor(req)));
  };
  deactivateConcept = async (req: Request, res: Response) => {
    res.json(await this.concepts.setActive(req.params.id, false, actor(req)));
  };
  reactivateConcept = async (req: Request, res: Response) => {
    res.json(await this.concepts.setActive(req.params.id, true, actor(req)));
  };

  // --- cargos ---
  chargesTable = async (req: Request, res: Response) => {
    const params = parseTableParams(req.body);
    const { data, total } = await this.charges.table(params, actor(req));
    res.json(paginatedTable(params, data, total));
  };
  getCharge = async (req: Request, res: Response) => {
    res.json(await this.charges.getById(req.params.id, actor(req)));
  };
  createCharge = async (req: Request, res: Response) => {
    res.status(201).json(await this.charges.create(ChargeCreateDto.parse(req.body), actor(req)));
  };
  generate = async (req: Request, res: Response) => {
    const key = parseIdempotencyKey(req.headers["idempotency-key"]);
    const { replayed, ...result } = await this.charges.generate(ChargeGenerateDto.parse(req.body), actor(req), key);
    if (replayed) res.setHeader("Idempotent-Replayed", "true");
    res.status(replayed ? 200 : 201).json(result);
  };
  lateFees = async (req: Request, res: Response) => {
    const { asOf } = LateFeesDto.parse(req.body ?? {});
    res.json(await this.charges.applyLateFees(asOf, actor(req)));
  };
  reminders = async (req: Request, res: Response) => {
    const days = Number(req.body?.days ?? 3);
    if (!Number.isInteger(days) || days < 0 || days > 30) throw new HttpError(400, "VALIDATION_ERROR", {}, { days: ["INVALID_FORMAT"] });
    res.json(await this.charges.remindUpcoming(days));
  };
  cancelCharge = async (req: Request, res: Response) => {
    const { motivo } = CancelDto.parse(req.body ?? {});
    res.json(await this.charges.cancel(req.params.id, motivo, actor(req)));
  };
  statement = async (req: Request, res: Response) => {
    res.json(await this.charges.statement(req.params.studentId, actor(req)));
  };

  // --- pagos ---
  paymentsTable = async (req: Request, res: Response) => {
    const params = parseTableParams(req.body);
    const { data, total } = await this.payments.table(params, actor(req));
    res.json(paginatedTable(params, data, total));
  };
  getPayment = async (req: Request, res: Response) => {
    res.json(await this.payments.getById(req.params.id, actor(req)));
  };
  registerPayment = async (req: Request, res: Response) => {
    const key = parseIdempotencyKey(req.headers["idempotency-key"]);
    const { payment, replayed } = await this.payments.register(PaymentCreateDto.parse(req.body), actor(req), key);
    if (replayed) res.setHeader("Idempotent-Replayed", "true");
    res.status(replayed ? 200 : 201).json(payment);
  };
  cancelPayment = async (req: Request, res: Response) => {
    const { motivo } = CancelDto.parse(req.body ?? {});
    res.json(await this.payments.cancel(req.params.id, motivo, actor(req)));
  };
}
