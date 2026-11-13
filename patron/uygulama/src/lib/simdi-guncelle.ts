// "Şimdi güncelle" (2026-11-13): patron fabrikadan hemen eşitleme ister. Sunucu tesis başına tek işaret tutar; 60 sn
// içindeki istek yeni işaret açmaz. Bu dosya yalnız sunucu yanıtını kısa Türkçe geri bildirime çevirir (tek kaynak).
import { ApiError } from "../api/client";
import type { FacilityStatus, SyncNowResponse } from "../api/wire";

/** Bulutun penceresi (sunucuda `SYNC_NOW_MIN_GAP_MS`); yalnız örnek veri kipinin taklidi için. */
export const SYNC_NOW_GAP_MS = 60_000;
/** İstek kabul edilince fabrika damgasının yoklandığı anlar (ms): uzun yoklama ~1 sn + eşitleme turu birkaç sn. */
export const AFTER_SYNC_NOW_MS: readonly number[] = [3_000, 6_000, 10_000, 15_000, 25_000];

/** Eylem yalnız sunucu ucu beyan ettiyse görünür (eski sunucu: `simdiGuncelle` yok ⇒ gizli). */
export function syncNowAvailable(facility: Pick<FacilityStatus, "simdiGuncelle"> | null | undefined): boolean {
  return facility?.simdiGuncelle === true;
}

export interface SyncNowFeedback {
  readonly tone: "info" | "warning" | "error";
  readonly text: string;
  /** Fabrika damgası izlenmeli mi (yeni ya da bekleyen işaret). */
  readonly follow: boolean;
}

export function syncNowFeedback(r: SyncNowResponse, nowMs: number): SyncNowFeedback {
  if (r.durum === "BEKLIYOR") return { tone: "info", text: "İstek gönderildi, birkaç saniye içinde güncellenecek", follow: true };
  const kalan = Math.max(1, Math.ceil((Date.parse(r.sonrakiMumkun) - nowMs) / 1000));
  return { tone: "warning", text: `Az önce güncellendi, ${kalan} sn sonra tekrar deneyebilirsiniz`, follow: false };
}

export function syncNowErrorFeedback(err: unknown): SyncNowFeedback {
  if (err instanceof ApiError && err.status === 403) return { tone: "error", text: "Fabrika bağlantısı kapalı; güncelleme istenemedi", follow: false };
  return { tone: "error", text: "İstek gönderilemedi, bağlantınızı kontrol edin", follow: false };
}
