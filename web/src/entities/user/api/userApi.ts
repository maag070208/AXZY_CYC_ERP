import { api } from "@shared/api/client";
import {
  tableRequest,
  type ITDataTableFetchParamsPost,
} from "@shared/api/table";
import type {
  CreateUserInput,
  LoginResponse,
  MeResponse,
  RefreshResponse,
  SetUserPermissionsInput,
  UpdateUserInput,
  User,
  UserPermissionsView,
} from "../model/types";

export const authApi = {
  login: (username: string, password: string) =>
    api.post<LoginResponse>(`/auth/login`, { username, password }),
  me: () => api.get<MeResponse>(`/auth/me`),
  refresh: (refreshToken: string) =>
    api.post<RefreshResponse>(`/auth/refresh`, { refreshToken }),
  /** Revoca el refresh de esta sesión (sin él, la API revoca todos los del usuario). */
  logout: (refreshToken?: string | null) =>
    api.post<void>(`/auth/logout`, refreshToken ? { refreshToken } : {}),
  /** Siempre responde `{ ok: true }` (no revela si la cuenta existe). */
  forgotPassword: (username: string) =>
    api.post<{ ok: boolean }>(`/auth/forgot-password`, { username }),
  resetPassword: (token: string, password: string) =>
    api.post<{ ok: boolean }>(`/auth/reset-password`, { token, password }),
  /** Cambio propio: revoca las sesiones y devuelve tokens nuevos. */
  changePassword: (currentPassword: string, newPassword: string) =>
    api.post<RefreshResponse>(`/auth/change-password`, { currentPassword, newPassword }),
};

export const usersApi = {
  /** Listado server-side (`{ page, limit, filters, sort }` → `{ data, total }`). */
  table: (params: ITDataTableFetchParamsPost) =>
    tableRequest<User>(`/users/query`, params),
  get: (id: string) => api.get<User>(`/users/${id}`),
  create: (data: CreateUserInput) => api.post<User>(`/users`, data),
  update: (id: string, data: UpdateUserInput) => api.patch<User>(`/users/${id}`, data),
  /** Baja lógica con motivo opcional (cierra las sesiones de la cuenta). */
  deactivate: (id: string, reason?: string) =>
    api.delete<User>(`/users/${id}`, { data: reason ? { reason } : {} }),
  reactivate: (id: string) => api.post<User>(`/users/${id}/reactivate`),
  unlock: (id: string) => api.post<User>(`/users/${id}/unlock`),
  /** Contraseña temporal: la persona la cambia en su siguiente acceso. */
  resetPassword: (id: string, password: string) =>
    api.post<User>(`/users/${id}/reset-password`, { password }),
  /** Roles, excepciones y permisos efectivos (`users.permissions`). */
  permissions: (id: string) => api.get<UserPermissionsView>(`/users/${id}/permissions`),
  setPermissions: (id: string, data: SetUserPermissionsInput) =>
    api.put<UserPermissionsView>(`/users/${id}/permissions`, data),
  removeException: (id: string, permission: string) =>
    api.delete<UserPermissionsView>(`/users/${id}/permissions/${encodeURIComponent(permission)}`),
};
