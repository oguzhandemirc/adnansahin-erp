// Ekran açılışı tazelemesi (§14 S47): pano/rapor ekranı açılınca bulut `ozet` zilini çalar; sunucu tesis
// başına aralık uygular (zil çalmazsa kalan süreyi döner). İstemci o süreye SAYGI gösterir: aralık dolmadan
// yeni istek atmaz, hata alınca geri çekilir. Saf durum makinesi — ağ çağrısı dışarıdan verilir.
import type { SnapshotRefresh } from "../api/wire";

/** Sunucu yanıtı yokken (ağ/5xx) tekrar denemeden önceki bekleme. */
export const REFRESH_FAIL_BACKOFF_MS = 30_000;
/** Sunucunun `sonrakiMs`i bundan kısa olsa da istemci en az bu kadar bekler (ardışık ekran geçişleri). */
export const REFRESH_MIN_GAP_MS = 5_000;

export interface RefreshGate {
  /** `nowMs` aralık dolduysa `call`ı bir kez çalıştırır; çalıştırdıysa true. Uçuştayken ikinci çağrı düşer. */
  request(nowMs: number, call: () => Promise<SnapshotRefresh>, clock?: () => number): Promise<boolean>;
}

export function createRefreshGate(): RefreshGate {
  let nextAt = 0;
  let inFlight = false;
  return {
    async request(nowMs, call, clock = Date.now) {
      if (inFlight || nowMs < nextAt) return false;
      inFlight = true;
      try {
        const r = await call();
        nextAt = clock() + Math.max(REFRESH_MIN_GAP_MS, Number.isFinite(r.sonrakiMs) ? r.sonrakiMs : REFRESH_FAIL_BACKOFF_MS);
      } catch {
        nextAt = clock() + REFRESH_FAIL_BACKOFF_MS;
      } finally {
        inFlight = false;
      }
      return true;
    },
  };
}

/** Uygulama genelinde TEK kapı: pano ve rapor ekranı aynı aralığı paylaşır (sunucu tesis başına sayar). */
export const openRefreshGate = createRefreshGate();

/**
 * Otomatik tazeleme bayatlık eşiği (2026-11-19): fabrikanın varsayılan eşitleme aralığı (5 dk;
 * `DEFAULT_PATRON_CLOUD_SYNC_INTERVAL_MINUTES`). Bundan sık bulut okuması yeni veri getirmez — buluttaki gerçek
 * değişiklik zaten değişim akışıyla (`changes.ts`, ön planda) etiketli kancaları anında geçersizleştirir; eşik yalnız
 * kaçan olaya karşı emniyettir. Eskiden 5 sn'ydi: her sekme geçişi aynı veriyi yeniden istiyordu (sunucu yükü).
 */
export const OTOMATIK_TAZELEME_ESIGI_MS = 5 * 60_000;

/**
 * Ekran odağı / öne gelme tazelemesi: son çekimden bu yana bayatlık eşiği dolduysa yeniden çek. Elle yenileme
 * (aşağı çek, menü simgesi) eşiğe bakmaz. Fabrikadan taze veri isteği otomatikte HİÇ atılmaz (`state/yenile.ts`).
 */
export function dueForRefetch(lastFetchMs: number, nowMs: number, gapMs: number = OTOMATIK_TAZELEME_ESIGI_MS): boolean {
  return nowMs - lastFetchMs >= gapMs;
}
