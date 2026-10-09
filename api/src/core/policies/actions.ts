/**
 * Acciones con políticas ABAC. Es la **frontera de seguridad**: una política
 * solo puede apuntar a una acción registrada aquí y sus condiciones solo pueden
 * leer los campos declarados. Cada servicio arma el contexto con esos campos y
 * llama a `enforcePolicy(action, actor, context)` después del RBAC.
 *
 * Al agregar una acción: registrarla aquí, armar su contexto en el servicio y
 * documentarla en `docs/seguridad/roles-permisos.md` §6.
 */
export interface PolicyActionField {
  /** Ruta dentro del contexto (`target.roles`). */
  path: string;
  type: "string" | "number" | "boolean" | "string[]";
  description: string;
}

export interface PolicyActionDef {
  key: string;
  module: string;
  description: string;
  fields: readonly PolicyActionField[];
}

export const POLICY_ACTIONS: readonly PolicyActionDef[] = [
  {
    key: "users.create",
    module: "Usuarios",
    description: "Alta de una cuenta",
    fields: [{ path: "roles", type: "string[]", description: "Roles iniciales de la cuenta" }],
  },
  {
    key: "users.update",
    module: "Usuarios",
    description: "Edición de una cuenta (datos y roles)",
    fields: [
      { path: "target.id", type: "string", description: "Id de la cuenta editada" },
      { path: "target.roles", type: "string[]", description: "Roles actuales de la cuenta" },
      { path: "roles", type: "string[]", description: "Roles nuevos (si cambian)" },
    ],
  },
  {
    key: "users.deactivate",
    module: "Usuarios",
    description: "Baja lógica de una cuenta",
    fields: [
      { path: "target.id", type: "string", description: "Id de la cuenta" },
      { path: "target.roles", type: "string[]", description: "Roles de la cuenta" },
    ],
  },
  {
    key: "users.reset_password",
    module: "Usuarios",
    description: "Contraseña temporal asignada por un administrador",
    fields: [
      { path: "target.id", type: "string", description: "Id de la cuenta" },
      { path: "target.roles", type: "string[]", description: "Roles de la cuenta" },
    ],
  },
  {
    key: "users.permissions.set",
    module: "Usuarios",
    description: "Roles o excepción de permiso de una persona",
    fields: [
      { path: "target.id", type: "string", description: "Id de la cuenta" },
      { path: "target.roles", type: "string[]", description: "Roles actuales de la cuenta" },
      { path: "roles", type: "string[]", description: "Roles nuevos (si cambian)" },
      { path: "permission", type: "string", description: "Permiso de la excepción" },
      { path: "scope", type: "string", description: "Alcance de la excepción" },
    ],
  },
  {
    key: "roles.matrix.update",
    module: "Roles",
    description: "Cambio de una celda de la matriz rol → permiso → alcance",
    fields: [
      { path: "roleKey", type: "string", description: "Rol" },
      { path: "permissionKey", type: "string", description: "Permiso" },
      { path: "scope", type: "string", description: "Alcance nuevo" },
    ],
  },
  {
    key: "charges.create",
    module: "Cobranza",
    description: "Alta de cargos (individual o masiva): permite topar descuentos",
    fields: [
      { path: "amount", type: "number", description: "Monto del cargo" },
      { path: "discount", type: "number", description: "Descuento aplicado" },
      { path: "discountPercent", type: "number", description: "Descuento como % del monto (0–100)" },
      { path: "conceptType", type: "string", description: "Tipo del concepto (INSCRIPCION, COLEGIATURA…)" },
      { path: "bulk", type: "boolean", description: "Generación masiva (grupo o ciclo)" },
    ],
  },
  {
    key: "payments.cancel",
    module: "Cobranza",
    description: "Cancelación de un pago registrado",
    fields: [
      { path: "amount", type: "number", description: "Monto del pago" },
      { path: "method", type: "string", description: "Método de pago" },
      { path: "daysSinceRegistered", type: "number", description: "Días desde que se registró el pago" },
    ],
  },
  {
    key: "settings.update",
    module: "Configuración",
    description: "Cambio de un parámetro general",
    fields: [{ path: "key", type: "string", description: "Clave del parámetro" }],
  },
];

const byKey = new Map(POLICY_ACTIONS.map((action) => [action.key, action]));

/** Definición de una acción registrada, o `undefined`. */
export const policyActionOf = (key: string): PolicyActionDef | undefined => byKey.get(key);

/** ¿El campo está declarado para la acción? */
export const isPolicyField = (action: string, path: string): boolean =>
  !!byKey.get(action)?.fields.some((field) => field.path === path);
