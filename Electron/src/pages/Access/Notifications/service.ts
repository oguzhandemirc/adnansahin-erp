import apiClient from "@/services/apiClient";
import type { ApiResponse } from "@/types/api";
import type {
  NotificationCatalog,
  NotificationTemplate,
  NotificationUser,
  TemplateAssignments,
  UserAssignments,
} from "./types";
import { kindsPayloadSchema } from "./schema";

const BASE = "/api/bildirim-atamalari";

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
};
