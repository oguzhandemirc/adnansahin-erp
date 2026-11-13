// KAPI ZİLİ (bulut → fabrika): ana üründe satıcının SSE kanalından giden "şimdi çek" işareti. Adnan'da satıcı
// yoktur ve bağlantıyı hep fabrika başlatır ⇒ zil fabrikaya GİDEMEZ; yalnız fabrikanın açık tuttuğu uzun yoklamayı
// (`/v1/rapor/al`, en çok `REPORT_CLAIM_HOLD_MS`) erken döndürür. Süreç içidir (sunucu tek süreç), içerik taşımaz.
// `ozet` zili (`/api/tazele`) bilerek kimseyi uyandırmaz: ekran odağı fabrikaya tur yaptırmaz; tur yalnız açık
// "Şimdi güncelle" işaretiyle (`esitleme`) ya da yeni rapor isteğiyle (`rapor`) öne çekilir.
import type { SnapshotRefresh } from "../wire/api";

export type DoorbellTopic = "gelen-kutusu" | "rapor" | "ozet" | "esitleme";

/** Uzun yoklamanın bekleyicisi: kaydı claim'den ÖNCE açılır ki claim ile bekleme arasındaki zil kaybolmasın. */
export interface DoorbellListener {
  /** Zil çaldıysa (ya da zaten çalmışsa) `true`; süre dolunca ya da `signal` iptal edince `false`. */
  wait(ms: number, signal?: AbortSignal): Promise<boolean>;
  close(): void;
}

export interface Doorbell {
  ring(tesisId: string, topic: DoorbellTopic): void;
  /** Uzun yoklama desteği; yoksa (kayıt kipi zilleri) bulut boş yanıtı bekletmez. Kapasite doluysa `null`. */
  listen?(tesisId: string, topics: readonly DoorbellTopic[]): DoorbellListener | null;
}

/** Tesis başına eşzamanlı bekleyici tavanı (yalnız imzalı fabrika istekleri bekler; tek fabrika ⇒ pratikte 1). */
export const MAX_LISTENERS_PER_FACILITY = 8;

interface Entry {
  readonly topics: ReadonlySet<DoorbellTopic>;
  rang: boolean;
  wake: (() => void) | null;
}

export class WaitingDoorbell implements Doorbell {
  private readonly entries = new Map<string, Set<Entry>>();

  ring(tesisId: string, topic: DoorbellTopic): void {
    for (const e of this.entries.get(tesisId) ?? []) {
      if (!e.topics.has(topic)) continue;
      e.rang = true;
      e.wake?.();
    }
  }

  listen(tesisId: string, topics: readonly DoorbellTopic[]): DoorbellListener | null {
    const set = this.entries.get(tesisId) ?? new Set<Entry>();
    if (set.size >= MAX_LISTENERS_PER_FACILITY) return null;
    const entry: Entry = { topics: new Set(topics), rang: false, wake: null };
    set.add(entry);
    this.entries.set(tesisId, set);
    const close = (): void => {
      entry.wake?.();
      set.delete(entry);
      if (set.size === 0 && this.entries.get(tesisId) === set) this.entries.delete(tesisId);
    };
    return {
      close,
      wait: (ms, signal) =>
        new Promise<boolean>((resolve) => {
          if (entry.rang) return resolve(true);
          if (signal?.aborted) return resolve(false);
          const done = (): void => {
            clearTimeout(timer);
            signal?.removeEventListener("abort", done);
            entry.wake = null;
            resolve(entry.rang && !signal?.aborted);
          };
          const timer = setTimeout(done, ms);
          timer.unref();
          signal?.addEventListener("abort", done, { once: true });
          entry.wake = done;
        }),
    };
  }

  /** Bekçi/teşhis: tesisin açık bekleyici sayısı. */
  listenerCount(tesisId: string): number {
    return this.entries.get(tesisId)?.size ?? 0;
  }
}

/** Kayıt kipi: zil kimseyi uyandırmaz, uzun yoklama yok (eski davranış). */
export class NoopDoorbell implements Doorbell {
  ring(): void {
    /* kayıt kipi: fabrika tur başına yoklar */
  }
}

export function createDoorbell(): Doorbell {
  return new WaitingDoorbell();
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
