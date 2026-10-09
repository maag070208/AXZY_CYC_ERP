import { z, registry } from "@core/swagger/registry";
import { paginatedTableResponseSchema } from "@core/swagger/table.dto";
import { isRealDay } from "@core/utils/day";
import { isCents } from "../entity/money";

const day = z.string().refine(isRealDay, "INVALID_DATE");
const uuid = z.string().uuid();
const amount = z.number().refine(isCents, "INVALID_DECIMAL");
const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .transform((v) => v || null)
    .nullable()
    .optional();

export const FEE_CONCEPT_TYPES = ["INSCRIPCION", "COLEGIATURA", "MATERIAL", "RECARGO", "OTRO"] as const;
/** RECARGO lo administra el sistema (recargos por mora). */
export const EDITABLE_FEE_TYPES = ["INSCRIPCION", "COLEGIATURA", "MATERIAL", "OTRO"] as const;
export const CHARGE_STATUSES = ["PENDIENTE", "PARCIAL", "PAGADO", "CANCELADO"] as const;
export const PAYMENT_METHODS = ["EFECTIVO", "TRANSFERENCIA", "DEPOSITO", "TARJETA", "OTRO"] as const;

// --- Conceptos ----------------------------------------------------------------

const conceptFields = {
  nombre: z.string().trim().min(1, "NOMBRE_REQUIRED").max(120),
  descripcion: optionalText(500),
  monto: amount.pipe(z.number().min(0).max(9_999_999)),
  tipo: z.enum(EDITABLE_FEE_TYPES),
};

export const FeeConceptCreateDto = z.object(conceptFields).strict().openapi("FeeConceptCreateInput");
registry.register("FeeConceptCreateInput", FeeConceptCreateDto);
export type FeeConceptCreateInput = z.infer<typeof FeeConceptCreateDto>;

export const FeeConceptUpdateDto = z
  .object(conceptFields)
  .partial()
  .strict()
  .refine((v) => Object.keys(v).length > 0, { message: "REQUIRED_FIELD" })
  .openapi("FeeConceptUpdateInput");
registry.register("FeeConceptUpdateInput", FeeConceptUpdateDto);
export type FeeConceptUpdateInput = z.infer<typeof FeeConceptUpdateDto>;

export const FeeConceptSchema = z
  .object({
    id: z.string(),
    nombre: z.string(),
    descripcion: z.string().nullable(),
    monto: z.number(),
    tipo: z.enum(FEE_CONCEPT_TYPES),
    active: z.boolean(),
    createdAt: z.string(),
    updatedAt: z.string(),
  })
  .openapi("FeeConcept");
registry.register("FeeConcept", FeeConceptSchema);
export type FeeConceptView = z.infer<typeof FeeConceptSchema>;
export const FeeConceptTableResponseSchema = paginatedTableResponseSchema(FeeConceptSchema, "FeeConceptTableResponse");

// --- Cargos -------------------------------------------------------------------

export const ChargeCreateDto = z
  .object({
    studentId: uuid,
    conceptId: uuid,
    termId: uuid.nullable().optional(),
    descripcion: optionalText(200),
    /** Si se omite, el monto base del concepto. */
    monto: amount.pipe(z.number().gt(0).max(9_999_999)).optional(),
    descuento: amount.pipe(z.number().min(0)).optional(),
    fechaVencimiento: day,
  })
  .strict()
  .openapi("ChargeCreateInput");
registry.register("ChargeCreateInput", ChargeCreateDto);
export type ChargeCreateInput = z.infer<typeof ChargeCreateDto>;

export const ChargeGenerateDto = z
  .object({
    conceptId: uuid,
    scope: z.enum(["group", "term"]),
    groupId: uuid.optional(),
    termId: uuid.optional(),
    descripcion: optionalText(200),
    monto: amount.pipe(z.number().gt(0).max(9_999_999)).optional(),
    descuento: amount.pipe(z.number().min(0)).optional(),
    fechaVencimiento: day,
  })
  .strict()
  .openapi("ChargeGenerateInput");
registry.register("ChargeGenerateInput", ChargeGenerateDto);
export type ChargeGenerateInput = z.infer<typeof ChargeGenerateDto>;

export const LateFeesDto = z.object({ asOf: day.optional() }).strict().openapi("LateFeesInput");
registry.register("LateFeesInput", LateFeesDto);

export const CancelDto = z
  .object({ motivo: z.string().trim().min(3, "REASON_MIN_LENGTH").max(500) })
  .strict()
  .openapi("CancelInput");
registry.register("CancelInput", CancelDto);

export const ChargeSchema = z
  .object({
    id: z.string(),
    studentId: z.string(),
    matricula: z.string(),
    studentNombre: z.string(),
    conceptId: z.string(),
    conceptNombre: z.string(),
    conceptTipo: z.enum(FEE_CONCEPT_TYPES),
    termId: z.string().nullable(),
    termNombre: z.string().nullable(),
    descripcion: z.string().nullable(),
    monto: z.number(),
    descuento: z.number(),
    total: z.number(),
    pagado: z.number(),
    saldo: z.number(),
    fechaVencimiento: z.string(),
    /** Con saldo y vencimiento anterior a hoy. */
    vencido: z.boolean(),
    status: z.enum(CHARGE_STATUSES),
    parentChargeId: z.string().nullable(),
    cancelledAt: z.string().nullable(),
    cancelReason: z.string().nullable(),
    createdAt: z.string(),
  })
  .openapi("Charge");
registry.register("Charge", ChargeSchema);
export type ChargeView = z.infer<typeof ChargeSchema>;
export const ChargeTableResponseSchema = paginatedTableResponseSchema(ChargeSchema, "ChargeTableResponse");

export const GenerationResultSchema = z
  .object({ created: z.number().int(), skipped: z.number().int(), charges: z.array(z.object({ id: z.string() })) })
  .openapi("ChargeGenerationResult");
registry.register("ChargeGenerationResult", GenerationResultSchema);
export type GenerationResult = z.infer<typeof GenerationResultSchema>;

// --- Pagos --------------------------------------------------------------------

export const PaymentCreateDto = z
  .object({
    chargeId: uuid,
    monto: amount.pipe(z.number().gt(0)),
    fecha: day.optional(),
    metodo: z.enum(PAYMENT_METHODS),
    referencia: optionalText(120),
  })
  .strict()
  .openapi("PaymentCreateInput");
registry.register("PaymentCreateInput", PaymentCreateDto);
export type PaymentCreateInput = z.infer<typeof PaymentCreateDto>;

export const PaymentSchema = z
  .object({
    id: z.string(),
    chargeId: z.string(),
    studentId: z.string(),
    matricula: z.string(),
    studentNombre: z.string(),
    conceptNombre: z.string(),
    chargeDescripcion: z.string().nullable(),
    monto: z.number(),
    fecha: z.string(),
    metodo: z.enum(PAYMENT_METHODS),
    referencia: z.string().nullable(),
    reciboFolio: z.string(),
    registeredBy: z.string(),
    registeredByName: z.string(),
    cancelledAt: z.string().nullable(),
    cancelReason: z.string().nullable(),
    createdAt: z.string(),
    /** Estado del cargo después de este movimiento. */
    chargeStatus: z.enum(CHARGE_STATUSES),
    chargeSaldo: z.number(),
  })
  .openapi("Payment");
registry.register("Payment", PaymentSchema);
export type PaymentView = z.infer<typeof PaymentSchema>;
export const PaymentTableResponseSchema = paginatedTableResponseSchema(PaymentSchema, "PaymentTableResponse");

// --- Estado de cuenta ---------------------------------------------------------

export const AccountStatementSchema = z
  .object({
    student: z.object({ id: z.string(), matricula: z.string(), nombre: z.string(), status: z.enum(["ACTIVO", "BAJA"]) }),
    escuela: z.object({ nombre: z.string(), direccion: z.string(), telefono: z.string(), email: z.string() }),
    charges: z.array(
      ChargeSchema.extend({
        payments: z.array(
          z.object({ id: z.string(), reciboFolio: z.string(), fecha: z.string(), monto: z.number(), metodo: z.enum(PAYMENT_METHODS) })
        ),
      })
    ),
    totals: z.object({ cargos: z.number(), descuentos: z.number(), pagado: z.number(), saldo: z.number(), vencido: z.number() }),
    generadoEn: z.string(),
  })
  .openapi("AccountStatement");
registry.register("AccountStatement", AccountStatementSchema);
export type AccountStatement = z.infer<typeof AccountStatementSchema>;
