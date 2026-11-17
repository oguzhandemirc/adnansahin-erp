import apiClient from "@/services/apiClient";
import type { ApiResponse } from "@/types/api";
import type { InboxPage, MyPreferences } from "./types";

const BASE = "/api/bildirimler";
export const INBOX_PAGE_SIZE = 20;

/** Kişinin kendi bildirimleri (yalnız oturum ister). */
export const notificationInboxService = {
  /**
   * ⚠️ Yoklama 15 sn'de bir koşar: hata toast'ı BASTIRILIR — eski backend (uç yok, 404) ya da
   * kısa kopukluk her 15 sn'de bir toast yağdırırdı. Hata durumunu zil kendisi gösterir.
   */
  list: (cursor?: string | null): Promise<ApiResponse<InboxPage>> =>
    apiClient
      .get<ApiResponse<InboxPage>>(BASE, {
        params: { limit: INBOX_PAGE_SIZE, ...(cursor ? { cursor } : {}) },
        suppressErrorToast: true,
      })
      .then((r) => r.data),

  markRead: (id: string): Promise<ApiResponse<{ id: string; readAt: string; unreadCount: number }>> =>
    apiClient.post<ApiResponse<{ id: string; readAt: string; unreadCount: number }>>(`${BASE}/${id}/okundu`).then((r) => r.data),

  markAllRead: (): Promise<ApiResponse<{ updated: number; unreadCount: number }>> =>
    apiClient.post<ApiResponse<{ updated: number; unreadCount: number }>>(`${BASE}/tumu/okundu`).then((r) => r.data),

  preferences: (): Promise<ApiResponse<MyPreferences>> =>
    apiClient.get<ApiResponse<MyPreferences>>(`${BASE}/tercihler`).then((r) => r.data),

  /** `bildirim:tercih` ister; gövde yalnız `{ items: [{ kind, muted }] }`. */
  setPreferences: (items: Array<{ kind: string; muted: boolean }>): Promise<ApiResponse<MyPreferences>> =>
    apiClient
      .put<ApiResponse<MyPreferences>>(`${BASE}/tercihler`, { items: items.map((i) => ({ kind: i.kind, muted: i.muted })) })
      .then((r) => r.data),
};
