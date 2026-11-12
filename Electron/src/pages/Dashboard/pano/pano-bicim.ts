// Pano metin biçimleri — sayı `lib/format` biçimi (binlik ayracı yok, ondalık virgül).
import { formatNumber } from "@/lib/format";
import type { PanoDonem, PanoKpi } from "./types";

export const DONEM_ETIKETI: Record<PanoDonem, string> = { bugun: "Bugün", hafta: "Hafta", ay: "Ay", yil: "Yıl" };

const KIYAS_ETIKETI: Record<PanoDonem, string> = {
  bugun: "düne göre",
  hafta: "önceki 7 güne göre",
  ay: "önceki 30 güne göre",
  yil: "önceki 365 güne göre",
};

export const formatCount = (n: number): string => formatNumber(n, 0);
/** Büyük metre tam sayı, küçük metre tek ondalık. */
export const metre = (n: number): string => `${formatNumber(n, Math.abs(n) >= 100 ? 0 : 1)} m`;
export const yuzde = (n: number | null): string => (n === null ? "—" : `%${formatNumber(n, 1)}`);

export interface DegisimRozeti {
  /** Tam ipucu ("%12,5 önceki 7 güne göre"). */
  metin: string;
  /** Renkli kısa parça ("%12,5") ve gri kıyas ("önceki döneme göre"). */
  yuzde: string;
  kiyas: string;
  trend: "up" | "down" | "neutral";
}

/** Önceki değer yok ya da 0 → rozet YOK (sonsuz yüzde basılmaz); sıfır değişim nötr. */
export function degisimRozeti(k: PanoKpi | null | undefined, donem: PanoDonem): DegisimRozeti | null {
  if (!k || k.onceki === null || k.onceki === 0) return null;
  const y = ((k.deger - k.onceki) * 100) / k.onceki;
  const trend = y > 0.05 ? "up" : y < -0.05 ? "down" : "neutral";
  const kisa = yuzde(Math.abs(y));
  return { metin: `${kisa} ${KIYAS_ETIKETI[donem]}`, yuzde: kisa, kiyas: donem === "bugun" ? "düne göre" : "önceki döneme göre", trend };
}

const AYLAR = ["Oca", "Şub", "Mar", "Nis", "May", "Haz", "Tem", "Ağu", "Eyl", "Eki", "Kas", "Ara"];

/** Eğilim ekseni etiketi: gün "11.11" · ay "Kas 26". */
export function kovaEtiketi(anahtar: string, kova: "gun" | "ay"): string {
  const [y, m, d] = anahtar.split("-");
  if (kova === "gun") return `${d}.${m}`;
  return `${AYLAR[Number(m) - 1] ?? m} ${y?.slice(2) ?? ""}`;
}

const pad = (n: number): string => String(n).padStart(2, "0");

/** Hareket zamanı: bugünse "14:05", değilse "10.11 14:05" (yerel saat). */
export function hareketZamani(iso: string, now: Date = new Date()): string {
  const d = new Date(iso);
  const saat = `${pad(d.getHours())}:${pad(d.getMinutes())}`;
  return d.toDateString() === now.toDateString() ? saat : `${pad(d.getDate())}.${pad(d.getMonth() + 1)} ${saat}`;
}
