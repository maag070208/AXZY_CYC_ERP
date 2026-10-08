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
};

export const usersApi = {
  /** Listado server-side (`{ page, limit, filters, sort }` → `{ data, total }`). */
  table: (params: ITDataTableFetchParamsPost) =>
    tableRequest<User>(`/users/query`, params),
  create: (data: CreateUserInput) => api.post<User>(`/users`, data),
  update: (id: string, data: UpdateUserInput) => api.patch<User>(`/users/${id}`, data),
  remove: (id: string) => api.delete<void>(`/users/${id}`),
  /** Roles y excepciones de permiso por persona (`users.permissions`). */
  permissions: (id: string, data: SetUserPermissionsInput) =>
    api.put<User>(`/users/${id}/permissions`, data),
};
