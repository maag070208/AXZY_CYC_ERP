import { api } from "@shared/api/client";
import { tableRequest, type ITDataTableFetchParamsPost } from "@shared/api/table";
import type {
  DrainResult,
  MyNotifications,
  NotificationItem,
  NotificationPreference,
  NotificationPreferenceInput,
  NotificationSendInput,
  NotificationTemplate,
  NotificationTemplateInput,
} from "../model/types";

export const templateApi = {
  table: (params: ITDataTableFetchParamsPost) => tableRequest<NotificationTemplate>("/notification-templates/query", params),
  get: (id: string) => api.get<NotificationTemplate>(`/notification-templates/${id}`),
  create: (data: NotificationTemplateInput) => api.post<NotificationTemplate>("/notification-templates", data),
  update: (id: string, data: NotificationTemplateInput) => api.patch<NotificationTemplate>(`/notification-templates/${id}`, data),
  deactivate: (id: string) => api.delete<NotificationTemplate>(`/notification-templates/${id}`),
  reactivate: (id: string) => api.post<NotificationTemplate>(`/notification-templates/${id}/reactivate`),
};

export const notificationApi = {
  table: (params: ITDataTableFetchParamsPost) => tableRequest<NotificationItem>("/notifications/query", params),
  send: (data: NotificationSendInput) => api.post<NotificationItem>("/notifications/send", data),
  retry: (id: string) => api.post<NotificationItem>(`/notifications/${id}/retry`),
  drain: () => api.post<DrainResult>("/notifications/drain"),
  mine: (limit = 30) => api.get<MyNotifications>("/notifications/mine", { params: { limit } }),
  markRead: (input: { ids?: string[]; all?: boolean }) => api.post<{ updated: number }>("/notifications/mine/read", input),
};

export const preferenceApi = {
  table: (params: ITDataTableFetchParamsPost) => tableRequest<NotificationPreference>("/notification-preferences/query", params),
  set: (data: NotificationPreferenceInput) => api.put<NotificationPreference>("/notification-preferences", data),
};
