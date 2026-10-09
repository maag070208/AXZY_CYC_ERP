// API pública del slice "notification" (M19: plantillas, outbox y preferencias).
export { notificationApi, preferenceApi, templateApi } from "./api/notificationApi";
export { NOTIFICATION_CHANNELS } from "./model/types";
export type {
  DrainResult,
  MyNotifications,
  NotificationChannel,
  NotificationItem,
  NotificationPreference,
  NotificationPreferenceInput,
  NotificationSendInput,
  NotificationStatus,
  NotificationTemplate,
  NotificationTemplateInput,
} from "./model/types";
