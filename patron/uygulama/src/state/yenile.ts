// TAM YENİLEME (2026-11-19, tek kaynak): aşağı çekme, menüdeki "Son veri" simgesi ve başka her elle yenileme bu
// boğazdan geçer. Adımlar: (1) ekranın kendi buluttan okuması (verilmezse bütün odaktaki veri kancaları), (2) `GET
// /oturum` (fabrika damgası), (3) bulut "Şimdi güncelle"yi beyan ettiyse fabrikadan taze veri isteği — tesis başına
// 60 sn pencerenin içindeyse İSTEK ATILMAZ (sessizce yalnız buluttan okunur). Kabul edilince (`BEKLIYOR`) fabrika
// damgası birkaç kez yoklanır, değişince bütün veri tazelenir. Başarı SESSİZDİR (yenileme göstergesinin kapanması
// yeter); yalnız fabrika isteği hata verirse kısa bildirim (toast) döner. Aynı anda TEK yenileme (uygulama geneli).
// Otomatik tazeleme (odak / öne gelme) bu boğazı KULLANMAZ: fabrikaya istek yalnız kullanıcının elle yenilemesidir.
import { useCallback, useSyncExternalStore } from "react";
import type { SyncNowResponse } from "../api/wire";
import { AFTER_SYNC_NOW_MS, SYNC_NOW_GAP_MS, syncNowAvailable, yenileHataMetni } from "../lib/simdi-guncelle";
import { ALL_TAGS, invalidate } from "./changes";
import { useSession } from "./session";
import { followDoorbell } from "./useOpenRefresh";

/** Hata bildiriminin ekranda kaldığı süre. */
export const YENILE_BILDIRIM_MS = 4_000;

export interface YenileDurumu {
  /** Bir yenileme sürüyor (fabrika isteğinin yanıtına kadar). */
  readonly yenileniyor: boolean;
  /** Kısa bildirim metni (yalnız hata); yoksa null. */
  readonly bildirim: string | null;
}

export interface YenileGirdisi {
  /** Ekranın kendi buluttan okuması (çağrılır, beklenmez). */
  readonly ekran: () => void;
  /** `GET /oturum` (beklenmez; hatası yutulur — çevrimdışı bandı oturumdan gelir). */
  readonly oturum: () => Promise<unknown>;
  /** Fabrikadan taze veri isteği; bulut beyan etmediyse null. */
  readonly fabrika: (() => Promise<SyncNowResponse>) | null;
  /** İstek kabul edildi: fabrika damgasını izle (dönen fonksiyon izlemeyi iptal eder). */
  readonly izle?: () => () => void;
}

export type YenileSonucu = "atlandi" | "tamam" | "hata";

export interface Yenileci {
  yenile(g: YenileGirdisi): Promise<YenileSonucu>;
  durum(): YenileDurumu;
  abone(dinleyici: () => void): () => void;
  /** Yalnız testler: pencereyi ve durumu sıfırlar. */
  sifirla(): void;
}

export function createYenileci(now: () => number = Date.now): Yenileci {
  let durum: YenileDurumu = { yenileniyor: false, bildirim: null };
  let fabrikaSonraki = 0;
  let bildirimZamani: ReturnType<typeof setTimeout> | null = null;
  let izlemeIptal: (() => void) | null = null;
  const dinleyiciler = new Set<() => void>();
  const yay = (d: Partial<YenileDurumu>) => {
    durum = { ...durum, ...d };
    dinleyiciler.forEach((l) => l());
  };
  const bildir = (metin: string | null) => {
    if (bildirimZamani) clearTimeout(bildirimZamani);
    bildirimZamani = null;
    yay({ bildirim: metin });
    if (metin) bildirimZamani = setTimeout(() => yay({ bildirim: null }), YENILE_BILDIRIM_MS);
  };
  return {
    async yenile(g) {
      if (durum.yenileniyor) return "atlandi";
      yay({ yenileniyor: true });
      if (durum.bildirim) bildir(null);
      try {
        g.ekran();
        void g.oturum().catch(() => undefined);
        if (!g.fabrika || now() < fabrikaSonraki) return "tamam";
        try {
          const r = await g.fabrika();
          const sonraki = Date.parse(r.sonrakiMumkun);
          fabrikaSonraki = Number.isFinite(sonraki) ? sonraki : now() + SYNC_NOW_GAP_MS;
          if (r.durum === "BEKLIYOR" && g.izle) {
            izlemeIptal?.();
            izlemeIptal = g.izle();
          }
          return "tamam";
        } catch (err) {
          bildir(yenileHataMetni(err));
          return "hata";
        }
      } finally {
        yay({ yenileniyor: false });
      }
    },
    durum: () => durum,
    abone(dinleyici) {
      dinleyiciler.add(dinleyici);
      return () => void dinleyiciler.delete(dinleyici);
    },
    sifirla() {
      if (bildirimZamani) clearTimeout(bildirimZamani);
      bildirimZamani = null;
      izlemeIptal?.();
      izlemeIptal = null;
      fabrikaSonraki = 0;
      durum = { yenileniyor: false, bildirim: null };
    },
  };
}

/** Uygulama genelinde TEK yenileyici (tekilleştirme + fabrika penceresi paylaşılır). */
export const yenileci = createYenileci();

export function useYenileDurumu(): YenileDurumu {
  return useSyncExternalStore(yenileci.abone, yenileci.durum, yenileci.durum);
}

/**
 * Elle tam yenileme. `ekran` verilmezse odaktaki bütün veri kancaları yeniden çeker (odakta olmayanlar bir sonraki
 * odakta) — menüdeki "Son veri" simgesi böyle çağırır.
 */
export function useYenile(ekran?: () => void): YenileDurumu & { readonly yenile: () => void } {
  const { api, facility, refresh, factoryStamp } = useSession();
  const durum = useYenileDurumu();
  const beyan = syncNowAvailable(facility);
  const yenile = useCallback(() => {
    const onceki = factoryStamp;
    void yenileci.yenile({
      ekran: ekran ?? (() => invalidate([ALL_TAGS])),
      oturum: () => refresh(),
      fabrika: beyan ? () => api.syncNow() : null,
      izle: () => followDoorbell(onceki, async () => (await refresh())?.esitleme?.ufuk ?? null, () => invalidate([ALL_TAGS]), AFTER_SYNC_NOW_MS),
    });
  }, [api, beyan, ekran, factoryStamp, refresh]);
  return { ...durum, yenile };
}
