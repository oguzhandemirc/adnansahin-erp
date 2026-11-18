// "Şimdi güncelle" (2026-11-13): patron fabrikadan hemen eşitleme ister. Sunucu tesis başına tek işaret tutar; 60 sn
// içindeki istek yeni işaret açmaz. 2026-11-19'dan beri ayrı düğmesi yok: elle tam yenilemenin (aşağı çek, menüdeki
// "Son veri" simgesi) son adımıdır (`state/yenile.ts`). Başarı sessizdir; yalnız hatanın kısa cümlesi buradadır.
import { ApiError } from "../api/client";
import type { FacilityStatus } from "../api/wire";

/** Bulutun penceresi (sunucuda `SYNC_NOW_MIN_GAP_MS`); yanıt `sonrakiMumkun` taşımazsa istemci bu kadar bekler. */
export const SYNC_NOW_GAP_MS = 60_000;
/** İstek kabul edilince fabrika damgasının yoklandığı anlar (ms): uzun yoklama ~1 sn + eşitleme turu birkaç sn. */
export const AFTER_SYNC_NOW_MS: readonly number[] = [3_000, 6_000, 10_000, 15_000, 25_000];

/** Fabrika isteği yalnız sunucu ucu beyan ettiyse atılır (eski sunucu: `simdiGuncelle` yok ⇒ yalnız bulut okuması). */
export function syncNowAvailable(facility: Pick<FacilityStatus, "simdiGuncelle"> | null | undefined): boolean {
  return facility?.simdiGuncelle === true;
}

/** Elle yenilemede fabrika isteği düşerse kısa bildirim cümlesi (başarı sessizdir). */
export function yenileHataMetni(err: unknown): string {
  if (err instanceof ApiError && err.status === 403) return "Fabrika bağlantısı kapalı — güncelleme istenemedi";
  return "Bağlantı yok — tekrar deneyin";
}
