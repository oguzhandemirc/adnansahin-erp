// Okunmamış BİLDİRİM sayısı (D5): kaynak bulut (`GET /bildirimler` → `okunmamis`); okundu bilgisi kişi başına TEK
// kayıttır, cihazlar ve fabrika paneli arasında köprüyle eşitlenir. Burada yalnız sayı saklanır (modül düzeyi depo):
// Menü satırı, pano ☰ düğmesi ve liste aynı sayıyı görür. Öndeyken `YOKLAMA_MS`de bir küçük çekim (limit 1) — panelde
// okunan bildirim telefonda en geç bu aralık + fabrika köprü turu içinde okunmuş görünür. Sayı değişince liste etiketi
// (`bildirimler`) geçersizlenir, açık liste kendini yeniler. Eski bulut `okunmamis` göndermez → `null` (rozet yok).
import { useEffect, useSyncExternalStore } from "react";
import type { NotificationPage, NotificationReadResult } from "../api/wire";
import { changeBus } from "./changes";
import { useAppActive, useForeground } from "./useForeground";

export const BILDIRIM_ETIKETI = "bildirimler";
export const YOKLAMA_MS = 15_000;

interface OkunmamisApi {
  notificationHistory(p?: { imlec?: string; limit?: number }): Promise<NotificationPage>;
}

let sayi: number | null = null;
const dinleyiciler = new Set<() => void>();
const abone = (f: () => void) => {
  dinleyiciler.add(f);
  return () => {
    dinleyiciler.delete(f);
  };
};

/** Sunucunun bildirdiği sayıyı yazar; değiştiyse aboneler ve liste etiketi uyanır. `undefined` (eski bulut) → null. */
export function okunmamisAyarla(n: number | undefined | null, g: { listeyiTazele?: boolean } = {}): void {
  const yeni = typeof n === "number" && Number.isFinite(n) && n >= 0 ? n : null;
  if (yeni === sayi) return;
  const onceki = sayi;
  sayi = yeni;
  dinleyiciler.forEach((f) => f());
  if (g.listeyiTazele !== false && onceki !== null) changeBus.invalidate([BILDIRIM_ETIKETI]);
}

/** Okundu ucu yanıtı: sayı sunucudan gelir (hesap yok, tahmin yok). */
export function okunduSonucu(r: NotificationReadResult | null | undefined): void {
  if (r) okunmamisAyarla(r.okunmamis, { listeyiTazele: false });
}

export function useBildirimOkunmamis(): number | null {
  return useSyncExternalStore(abone, () => sayi, () => sayi);
}

export async function okunmamisTazele(api: OkunmamisApi): Promise<void> {
  try {
    const p = await api.notificationHistory({ limit: 1 });
    okunmamisAyarla(p.okunmamis);
  } catch {
    // Ağ yok / yetki: son sayı kalır (rozet sessizce bayatlar; bir sonraki turda düzelir).
  }
}

/** Oturum hazırken bir kez kurulur (`app/(app)/_layout.tsx`); `anahtar` (tesis:hesap) değişince sayı sıfırlanır. */
export function useBildirimYoklama(api: OkunmamisApi, anahtar: string | null): void {
  const aktif = useAppActive();
  useEffect(() => {
    okunmamisAyarla(null, { listeyiTazele: false });
    if (anahtar) void okunmamisTazele(api);
  }, [api, anahtar]);
  useForeground(() => {
    if (anahtar) void okunmamisTazele(api);
  });
  useEffect(() => {
    if (!anahtar || !aktif) return;
    const id = setInterval(() => void okunmamisTazele(api), YOKLAMA_MS);
    return () => clearInterval(id);
  }, [api, anahtar, aktif]);
}

/** 0/null → rozet yok; 10+ → "9+". */
export function bildirimRozetMetni(n: number | null): string | null {
  return n === null || n <= 0 ? null : n > 9 ? "9+" : String(n);
}
