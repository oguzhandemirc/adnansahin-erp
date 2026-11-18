import apiClient from "@/services/apiClient";
import type { ApiResponse } from "@/types/api";
import type {
  DailySummaryTime,
  NotificationCatalog,
  NotificationTemplate,
  NotificationUser,
  TemplateAssignments,
  UserAssignments,
} from "./types";
import { dailySummaryTimePayloadSchema, kindsPayloadSchema } from "./schema";
import { NOTIFICATIONS_ENABLED_KEY } from "./notification-switch";

const BASE = "/api/bildirim-atamalari";

/** Gün sonu özeti saati sorgusu — saat alanı ve bildirim şalteri kartı aynı önbelleği okur. */
export const DAILY_SUMMARY_TIME_QK = ["bildirim-atamalari", "gun-sonu-saati"] as const;

/** Bildirim atama uçları (izin `bildirim:yonet`). Gövde şemadan geçer: yalnız `kinds` gider. */
export const notificationAssignmentService = {
  catalog: (): Promise<ApiResponse<NotificationCatalog>> =>
    apiClient.get<ApiResponse<NotificationCatalog>>("/api/bildirimler/katalog").then((r) => r.data),

  users: (): Promise<ApiResponse<{ items: NotificationUser[] }>> =>
    apiClient.get<ApiResponse<{ items: NotificationUser[] }>>(`${BASE}/kullanicilar`).then((r) => r.data),

  templates: (): Promise<ApiResponse<{ items: NotificationTemplate[] }>> =>
    apiClient.get<ApiResponse<{ items: NotificationTemplate[] }>>(`${BASE}/sablonlar`).then((r) => r.data),

  userAssignments: (userId: string): Promise<ApiResponse<UserAssignments>> =>
    apiClient.get<ApiResponse<UserAssignments>>(`${BASE}/kullanicilar/${userId}`).then((r) => r.data),

  setUserAssignments: (userId: string, kinds: string[]): Promise<ApiResponse<UserAssignments>> =>
    apiClient
      .put<ApiResponse<UserAssignments>>(`${BASE}/kullanicilar/${userId}`, kindsPayloadSchema.parse({ kinds }))
      .then((r) => r.data),

  templateAssignments: (templateId: string): Promise<ApiResponse<TemplateAssignments>> =>
    apiClient.get<ApiResponse<TemplateAssignments>>(`${BASE}/sablonlar/${templateId}`).then((r) => r.data),

  setTemplateAssignments: (templateId: string, kinds: string[]): Promise<ApiResponse<TemplateAssignments>> =>
    apiClient
      .put<ApiResponse<TemplateAssignments>>(`${BASE}/sablonlar/${templateId}`, kindsPayloadSchema.parse({ kinds }))
      .then((r) => r.data),

  dailySummaryTime: (): Promise<ApiResponse<DailySummaryTime>> =>
    apiClient.get<ApiResponse<DailySummaryTime>>(`${BASE}/gun-sonu-saati`).then((r) => r.data),

  setDailySummaryTime: (time: string): Promise<ApiResponse<DailySummaryTime>> =>
    apiClient
      .put<ApiResponse<DailySummaryTime>>(`${BASE}/gun-sonu-saati`, dailySummaryTimePayloadSchema.parse({ time }))
      .then((r) => r.data),

  /**
   * Bildirim ana şalteri — mevcut ham ayar ucu; backend YALNIZ sistem hesabına açar (403 `SUPERADMIN_ONLY`).
   * Genel toast bastırılır: hata cümlesini kart kendisi Türkçe ve kalıcı gösterir (`switchErrorMessage`).
   */
  setNotificationsEnabled: (on: boolean): Promise<unknown> =>
    apiClient
      .put(`/api/admin/settings/${NOTIFICATIONS_ENABLED_KEY}`, { value: on ? "true" : "false" }, { suppressErrorToast: true })
      .then((r) => r.data),
};
