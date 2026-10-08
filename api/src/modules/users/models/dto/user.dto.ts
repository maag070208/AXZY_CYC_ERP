import { env } from "@core/config/env.config";
import { z, registry } from "@core/swagger/registry";
import { paginatedTableResponseSchema } from "@core/swagger/table.dto";

// El rol es dinámico (tabla `roles`): la web manda la clave y el servicio valida
// que exista y esté activo.
const RoleKeySchema = z.string().min(1).max(50);

export const UserSchema = z
  .object({
    id: z.string(),
    username: z.string(),
    email: z.string(),
    name: z.string(),
    phone: z.string().nullable(),
    active: z.boolean(),
    role: z.string(),
    roles: z.array(z.string()),
    lastLoginAt: z.string().nullable(),
    deactivatedAt: z.string().nullable(),
    deactivationReason: z.string().nullable(),
    mustChangePassword: z.boolean(),
    createdAt: z.string(),
  })
  .openapi("User");
registry.register("User", UserSchema);
export type User = z.infer<typeof UserSchema>;

export const UserCreateDto = z
  .object({
    username: z.string().min(3, "USERNAME_MIN_LENGTH").max(60),
    email: z.string().email("INVALID_EMAIL"),
    password: z.string().min(env.PASSWORD_MIN_LENGTH, "PASSWORD_MIN_LENGTH").max(200),
    name: z.string().min(1, "NAME_REQUIRED").max(150),
    phone: z.string().max(30).optional(),
    /** Roles iniciales (al menos uno). */
    roles: z.array(RoleKeySchema).min(1),
  })
  .openapi("UserCreateInput");
registry.register("UserCreateInput", UserCreateDto);
export type UserCreateInput = z.infer<typeof UserCreateDto>;

export const UserUpdateDto = z
  .object({
    email: z.string().email("INVALID_EMAIL").optional(),
    name: z.string().min(1, "NAME_REQUIRED").max(150).optional(),
    phone: z.string().max(30).nullable().optional(),
    /** Si viene, reemplaza por completo los roles del usuario. */
    roles: z.array(RoleKeySchema).min(1).optional(),
  })
  .openapi("UserUpdateInput");
registry.register("UserUpdateInput", UserUpdateDto);
export type UserUpdateInput = z.infer<typeof UserUpdateDto>;

export const DeactivateUserDto = z
  .object({
    reason: z.string().min(3, "REASON_MIN_LENGTH").max(500).optional(),
  })
  .openapi("UserDeactivateInput");
registry.register("UserDeactivateInput", DeactivateUserDto);
export type DeactivateUserInput = z.infer<typeof DeactivateUserDto>;

export const SetUserPermissionsDto = z
  .object({
    /** Reemplaza los roles del usuario (opcional). */
    roles: z.array(RoleKeySchema).min(1).optional(),
    /** Alta/actualización de una excepción de permiso (opcional). */
    exception: z
      .object({
        permission: z.string().min(1).max(100),
        scope: z.enum(["NONE", "OWN", "AREA", "ALL"]),
        reason: z.string().max(300).optional(),
        expiresAt: z.string().datetime().nullable().optional(),
      })
      .optional(),
  })
  .refine((value) => value.roles !== undefined || value.exception !== undefined, {
    message: "REQUIRED_FIELD",
  })
  .openapi("SetUserPermissionsInput");
registry.register("SetUserPermissionsInput", SetUserPermissionsDto);
export type SetUserPermissionsInput = z.infer<typeof SetUserPermissionsDto>;

export const UserPermissionViewSchema = z
  .object({
    permission: z.string(),
    module: z.string(),
    name: z.string(),
    scopes: z.array(z.enum(["NONE", "OWN", "AREA", "ALL"])),
    sensitive: z.boolean(),
    roleScope: z.enum(["NONE", "OWN", "AREA", "ALL"]),
    effective: z.enum(["NONE", "OWN", "AREA", "ALL"]),
    exception: z
      .object({
        scope: z.enum(["NONE", "OWN", "AREA", "ALL"]),
        reason: z.string().nullable(),
        expiresAt: z.string().nullable(),
        grantedById: z.string().nullable(),
      })
      .nullable(),
  })
  .openapi("UserPermissionView");
registry.register("UserPermissionView", UserPermissionViewSchema);

export const UserPermissionsViewSchema = z
  .object({
    roles: z.array(z.string()),
    permissions: z.array(UserPermissionViewSchema),
  })
  .openapi("UserPermissionsView");
registry.register("UserPermissionsView", UserPermissionsViewSchema);

export const UserTableResponseSchema = paginatedTableResponseSchema(UserSchema, "UserTableResponse");
