// KAPI ZİLİ (bulut → fabrika): ana üründe satıcının SSE kanalından giden "şimdi çek" işareti. Adnan'da satıcı
// yoktur ⇒ zil SESSİZDİR; fabrika her eşitleme/gelen kutusu/rapor turunda zaten yoklar. Arayüz bekçilerin kayıtlı
// zili (`KayitliZil`) ve `/api/tazele` aralık sınırı için kalır.
import type { SnapshotRefresh } from "../wire/api";

export type DoorbellTopic = "gelen-kutusu" | "rapor" | "ozet";

export interface Doorbell {
  ring(tesisId: string, topic: DoorbellTopic): void;
}

export class NoopDoorbell implements Doorbell {
  ring(): void {
    /* kayıt kipi: fabrika tur başına yoklar */
  }
}

export function createDoorbell(): Doorbell {
  return new NoopDoorbell();
}

/** Tesis başına iki `ozet` zili arası en az (fabrika da 30 sn'de bir anlık tur yapar — §6.5). */
export const SNAPSHOT_RING_GAP_MS = 30_000;
const lastSnapshotRing = new Map<string, number>();

/**
 * Ekran açıkken tazeleme: hesabın isteği fabrikaya `ozet` zili olarak gider (içerik taşımaz). Tesis başına
 * 30 sn'de bir; aralık içindeki istek zil ÇALMAZ, kalan süreyi döner (sahte yağmur fabrikayı yormaz).
 */
export function requestSnapshotRefresh(doorbell: Doorbell, tesisId: string, nowMs: number): SnapshotRefresh {
  const last = lastSnapshotRing.get(tesisId) ?? 0;
  const wait = last + SNAPSHOT_RING_GAP_MS - nowMs;
  if (wait > 0) return { zil: false, sonrakiMs: wait };
  lastSnapshotRing.set(tesisId, nowMs);
  doorbell.ring(tesisId, "ozet");
  return { zil: true, sonrakiMs: SNAPSHOT_RING_GAP_MS };
}
