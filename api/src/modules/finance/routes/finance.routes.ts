import { Router } from "express";
import type { ZodTypeAny } from "zod";
import { authenticate, requiresPermission } from "@core/middlewares/auth.middleware";
import { asyncHandler } from "@core/utils/asyncHandler";
import { registerPath } from "@core/swagger/registry";
import { TableQuerySchema } from "@core/swagger/table.dto";
import {
  AccountStatementSchema,
  CancelDto,
  ChargeCreateDto,
  ChargeGenerateDto,
  ChargeSchema,
  ChargeTableResponseSchema,
  FeeConceptCreateDto,
  FeeConceptSchema,
  FeeConceptTableResponseSchema,
  FeeConceptUpdateDto,
  GenerationResultSchema,
  LateFeesDto,
  PaymentCreateDto,
  PaymentSchema,
  PaymentTableResponseSchema,
} from "../models/dto/finance.dto";
import type { FinanceController } from "../controllers/finance.controller";

const bearer = [{ bearerAuth: [] }];
const param = (name: string) => ({ in: "path" as const, name, required: true, schema: { type: "string" as const } });
const idempotencyHeader = {
  in: "header" as const,
  name: "Idempotency-Key",
  required: false,
  schema: { type: "string" as const, pattern: "^[A-Za-z0-9_-]{8,100}$" },
};
const json = (schema: ZodTypeAny) => ({ "application/json": { schema } });
type Extra = Omit<Parameters<typeof registerPath>[0], "method" | "path" | "summary" | "tags" | "security">;
const doc = (method: "get" | "post" | "patch" | "delete", path: string, summary: string, extra: Extra) =>
  registerPath({ method, path, tags: ["Finance"], summary, security: bearer, ...extra });

export const createFeeConceptRouter = (c: FinanceController): Router => {
  doc("post", "/fee-concepts/query", "Tabla de conceptos de cobro (charges.view)", {
    request: { body: { required: true, content: json(TableQuerySchema) } },
    responses: { 200: { description: "Página", content: json(FeeConceptTableResponseSchema) } },
  });
  doc("get", "/fee-concepts/options", "Conceptos activos capturables (sin LATE_FEE)", { responses: { 200: { description: "Lista" } } });
  doc("post", "/fee-concepts", "Alta de concepto (fee_concepts.manage)", {
    request: { body: { required: true, content: json(FeeConceptCreateDto) } },
    responses: { 201: { description: "Concepto", content: json(FeeConceptSchema) } },
  });
  doc("patch", "/fee-concepts/{id}", "Edición (fee_concepts.manage)", {
    parameters: [param("id")],
    request: { body: { required: true, content: json(FeeConceptUpdateDto) } },
    responses: { 200: { description: "Concepto", content: json(FeeConceptSchema) } },
  });
  doc("delete", "/fee-concepts/{id}", "Baja lógica (fee_concepts.manage)", {
    parameters: [param("id")],
    responses: { 200: { description: "Concepto inactivo", content: json(FeeConceptSchema) } },
  });
  doc("post", "/fee-concepts/{id}/reactivate", "Reactiva (fee_concepts.manage)", {
    parameters: [param("id")],
    responses: { 200: { description: "Concepto activo", content: json(FeeConceptSchema) } },
  });

  const router = Router();
  router.use(authenticate);
  router.post("/query", requiresPermission("charges.view"), asyncHandler(c.conceptsTable));
  router.get("/options", requiresPermission("charges.view"), asyncHandler(c.conceptOptions));
  router.post("/", requiresPermission("fee_concepts.manage"), asyncHandler(c.createConcept));
  router.patch("/:id", requiresPermission("fee_concepts.manage"), asyncHandler(c.updateConcept));
  router.delete("/:id", requiresPermission("fee_concepts.manage"), asyncHandler(c.deactivateConcept));
  router.post("/:id/reactivate", requiresPermission("fee_concepts.manage"), asyncHandler(c.reactivateConcept));
  return router;
};

export const createChargeRouter = (c: FinanceController): Router => {
  doc("post", "/charges/query", "Tabla de cargos (charges.view; OWN = sus cargos)", {
    request: { body: { required: true, content: json(TableQuerySchema) } },
    responses: { 200: { description: "Página", content: json(ChargeTableResponseSchema) } },
  });
  doc("post", "/charges", "Cargo individual (charges.create)", {
    request: { body: { required: true, content: json(ChargeCreateDto) } },
    responses: { 201: { description: "Cargo", content: json(ChargeSchema) }, 400: { description: "DISCOUNT_EXCEEDS_AMOUNT" } },
  });
  doc("post", "/charges/generate", "Generación masiva por grupo o ciclo, idempotente (charges.generate)", {
    parameters: [idempotencyHeader],
    request: { body: { required: true, content: json(ChargeGenerateDto) } },
    responses: {
      201: { description: "Cargos generados", content: json(GenerationResultSchema) },
      200: { description: "Repetición de la misma Idempotency-Key (Idempotent-Replayed: true)" },
      409: { description: "IDEMPOTENCY_KEY_REUSED" },
    },
  });
  doc("post", "/charges/late-fees", "Aplica recargos por mora según LATE_FEE (charges.generate)", {
    request: { body: { required: false, content: json(LateFeesDto) } },
    responses: { 200: { description: "{ asOf, created, updated, skipped }" }, 409: { description: "LATE_FEES_DISABLED" } },
  });
  doc("post", "/charges/reminders", "Encola avisos «pago por vencer» de los próximos `days` días (charges.generate; idempotente por cargo)", { responses: { 200: { description: "{ charges, queued }" } } });
  doc("get", "/charges/{id}", "Detalle (charges.view)", {
    parameters: [param("id")],
    responses: { 200: { description: "Cargo", content: json(ChargeSchema) } },
  });
  doc("delete", "/charges/{id}", "Cancela el cargo con reason (charges.cancel)", {
    parameters: [param("id")],
    request: { body: { required: true, content: json(CancelDto) } },
    responses: { 200: { description: "Cargo cancelado", content: json(ChargeSchema) }, 409: { description: "CHARGE_HAS_PAYMENTS" } },
  });

  const router = Router();
  router.use(authenticate);
  router.post("/query", requiresPermission("charges.view"), asyncHandler(c.chargesTable));
  router.post("/generate", requiresPermission("charges.generate"), asyncHandler(c.generate));
  router.post("/late-fees", requiresPermission("charges.generate"), asyncHandler(c.lateFees));
  router.post("/reminders", requiresPermission("charges.generate"), asyncHandler(c.reminders));
  router.post("/", requiresPermission("charges.create"), asyncHandler(c.createCharge));
  router.get("/:id", requiresPermission("charges.view"), asyncHandler(c.getCharge));
  router.delete("/:id", requiresPermission("charges.cancel"), asyncHandler(c.cancelCharge));
  return router;
};

export const createPaymentRouter = (c: FinanceController): Router => {
  doc("post", "/payments/query", "Tabla de pagos (charges.view; OWN = sus pagos)", {
    request: { body: { required: true, content: json(TableQuerySchema) } },
    responses: { 200: { description: "Página", content: json(PaymentTableResponseSchema) } },
  });
  doc("post", "/payments", "Registra un pago manual con folio consecutivo (payments.register)", {
    parameters: [idempotencyHeader],
    request: { body: { required: true, content: json(PaymentCreateDto) } },
    responses: {
      201: { description: "Pago", content: json(PaymentSchema) },
      400: { description: "PAYMENT_EXCEEDS_BALANCE" },
      409: { description: "CHARGE_ALREADY_PAID · IDEMPOTENCY_KEY_REUSED" },
    },
  });
  doc("get", "/payments/{id}", "Detalle / datos del recibo (charges.view)", {
    parameters: [param("id")],
    responses: { 200: { description: "Pago", content: json(PaymentSchema) } },
  });
  doc("delete", "/payments/{id}", "Cancela el pago con reason (payments.cancel)", {
    parameters: [param("id")],
    request: { body: { required: true, content: json(CancelDto) } },
    responses: { 200: { description: "Pago cancelado", content: json(PaymentSchema) } },
  });

  const router = Router();
  router.use(authenticate);
  router.post("/query", requiresPermission("charges.view"), asyncHandler(c.paymentsTable));
  router.post("/", requiresPermission("payments.register"), asyncHandler(c.registerPayment));
  router.get("/:id", requiresPermission("charges.view"), asyncHandler(c.getPayment));
  router.delete("/:id", requiresPermission("payments.cancel"), asyncHandler(c.cancelPayment));
  return router;
};

/** Montado en `/students/:studentId` antes del router de alumnos (auth por ruta). */
export const createStudentFinanceRouter = (c: FinanceController): Router => {
  doc("get", "/students/{studentId}/account-statement", "Estado de cuenta del alumno (charges.view; OWN)", {
    parameters: [param("studentId")],
    responses: { 200: { description: "Estado de cuenta", content: json(AccountStatementSchema) } },
  });
  const router = Router({ mergeParams: true });
  router.get("/account-statement", authenticate, requiresPermission("charges.view"), asyncHandler(c.statement));
  return router;
};
