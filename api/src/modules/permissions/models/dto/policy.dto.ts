import { POLICY_OPERATORS } from "@core/policies";
import { z, registry } from "@core/swagger/registry";

/** Clave de política: `minusculas_guion_bajo` (estable, la referencia la bitácora). */
export const PolicyKey = /^[a-z][a-z0-9_]*$/;

const ConditionSchema = z.object({
  field: z.string().min(1).max(100),
  operator: z.enum(POLICY_OPERATORS),
  /** JSON libre: escalar, arreglo o `"@user.id"` / `"@user.roles"`. */
  value: z.union([z.string().max(200), z.number(), z.boolean(), z.null(), z.array(z.union([z.string().max(200), z.number()])).max(50)]),
});

export const PolicyCreateDto = z
  .object({
    key: z.string().min(3).max(60).regex(PolicyKey, "POLICY_KEY_FORMAT"),
    name: z.string().min(1, "NAME_REQUIRED").max(150),
    description: z.string().max(500).nullable().optional(),
    action: z.string().min(1).max(100),
    effect: z.enum(["ALLOW", "DENY"]),
    priority: z.number().int().min(0).max(10_000).optional(),
    active: z.boolean().optional(),
    roles: z.array(z.string().min(1).max(50)).max(50).optional(),
    conditions: z.array(ConditionSchema).max(20).optional(),
  })
  .strict()
  .openapi("PolicyCreateInput");
registry.register("PolicyCreateInput", PolicyCreateDto);
export type PolicyCreateInput = z.infer<typeof PolicyCreateDto>;

export const PolicyUpdateDto = PolicyCreateDto.omit({ key: true })
  .partial()
  .strict()
  .refine((value) => Object.keys(value).length > 0, { message: "REQUIRED_FIELD" })
  .openapi("PolicyUpdateInput");
registry.register("PolicyUpdateInput", PolicyUpdateDto);
export type PolicyUpdateInput = z.infer<typeof PolicyUpdateDto>;

export const PolicySchema = z
  .object({
    id: z.string(),
    key: z.string(),
    name: z.string(),
    description: z.string().nullable(),
    action: z.string(),
    effect: z.enum(["ALLOW", "DENY"]),
    priority: z.number().int(),
    active: z.boolean(),
    roles: z.array(z.string()),
    conditions: z.array(ConditionSchema),
    createdAt: z.string(),
    updatedAt: z.string(),
  })
  .openapi("Policy");
registry.register("Policy", PolicySchema);
export type PolicyView = z.infer<typeof PolicySchema>;

export const PolicyActionSchema = z
  .object({
    key: z.string(),
    module: z.string(),
    description: z.string(),
    fields: z.array(
      z.object({ path: z.string(), type: z.string(), description: z.string() })
    ),
  })
  .openapi("PolicyAction");
registry.register("PolicyAction", PolicyActionSchema);
