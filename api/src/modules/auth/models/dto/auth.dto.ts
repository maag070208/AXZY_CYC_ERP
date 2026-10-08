import { env } from "@core/config/env.config";
import { LANGUAGES } from "@core/i18n";
import { z, registry } from "@core/swagger/registry";

/** Alcance efectivo de un permiso. */
export const ScopeSchema = z.enum(["NONE", "OWN", "AREA", "ALL"]).openapi("PermissionScope");
registry.register("PermissionScope", ScopeSchema);

export const AuthUserSchema = z
  .object({
    id: z.string(),
    username: z.string(),
    name: z.string(),
    role: z.string(),
    roles: z.array(z.string()),
    permissions: z.record(z.string(), ScopeSchema),
  })
  .openapi("AuthUser");
registry.register("AuthUser", AuthUserSchema);
export type AuthUser = z.infer<typeof AuthUserSchema>;

export const LoginInputSchema = z
  .object({
    username: z.string().min(1),
    password: z.string().min(1),
  })
  .openapi("LoginInput");
registry.register("LoginInput", LoginInputSchema);
export type LoginInput = z.infer<typeof LoginInputSchema>;

export const LoginResponseSchema = z
  .object({
    token: z.string(),
    refreshToken: z.string(),
    user: AuthUserSchema,
  })
  .openapi("LoginResponse");
registry.register("LoginResponse", LoginResponseSchema);
export type LoginResponse = z.infer<typeof LoginResponseSchema>;

export const RefreshInputSchema = z
  .object({ refreshToken: z.string().min(1) })
  .openapi("RefreshInput");
registry.register("RefreshInput", RefreshInputSchema);
export type RefreshInput = z.infer<typeof RefreshInputSchema>;

export const RefreshResponseSchema = z
  .object({ token: z.string(), refreshToken: z.string() })
  .openapi("RefreshResponse");
registry.register("RefreshResponse", RefreshResponseSchema);
export type RefreshResponse = z.infer<typeof RefreshResponseSchema>;

export const AuthMeUserSchema = z
  .object({
    id: z.string(),
    username: z.string(),
    name: z.string(),
    role: z.string(),
  })
  .openapi("AuthMeUser");
registry.register("AuthMeUser", AuthMeUserSchema);

/** `GET /auth/me`: usuario + roles + mapa de permisos + idioma del sistema. */
export const AuthMeSchema = z
  .object({
    user: AuthMeUserSchema,
    roles: z.array(z.string()),
    permissions: z.record(z.string(), ScopeSchema),
    language: z.enum(LANGUAGES),
  })
  .openapi("AuthMe");
registry.register("AuthMe", AuthMeSchema);
export type AuthMe = z.infer<typeof AuthMeSchema>;

export const LogoutInputSchema = z
  .object({ refreshToken: z.string().min(1).optional() })
  .openapi("LogoutInput");
registry.register("LogoutInput", LogoutInputSchema);
export type LogoutInput = z.infer<typeof LogoutInputSchema>;

export const ForgotPasswordInputSchema = z
  .object({ username: z.string().min(1) })
  .openapi("ForgotPasswordInput");
registry.register("ForgotPasswordInput", ForgotPasswordInputSchema);
export type ForgotPasswordInput = z.infer<typeof ForgotPasswordInputSchema>;

export const ResetPasswordInputSchema = z
  .object({
    token: z.string().min(1),
    password: z
      .string()
      .min(env.PASSWORD_MIN_LENGTH, "PASSWORD_MIN_LENGTH")
      .max(200),
  })
  .openapi("ResetPasswordInput");
registry.register("ResetPasswordInput", ResetPasswordInputSchema);
export type ResetPasswordInput = z.infer<typeof ResetPasswordInputSchema>;

export const OkResponseSchema = z.object({ ok: z.boolean() }).openapi("OkResponse");
registry.register("OkResponse", OkResponseSchema);
