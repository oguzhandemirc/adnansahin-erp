// Dönem → rapor penceresi (saf). Pencere bugünün sonunda biter; önceki dönemi rapor ucu `compare=prev` ile aynı
// uzunlukta geri kaydırarak kendisi hesaplar (istemcide ikinci bir kıyas hesabı yok).
import { PANO_DONEMLERI, type PanoDonem, type PanoPencere } from "./types";

/** Tercih yok / tanınmayan kayıt → "hafta" ("bugün" vardiya başında boş panoyla açılır). */
export function validPeriod(v: unknown): PanoDonem {
  return (PANO_DONEMLERI as readonly unknown[]).includes(v) ? (v as PanoDonem) : "hafta";
}

const GERI_GUN: Record<PanoDonem, number> = { bugun: 0, hafta: 6, ay: 29, yil: 364 };

const pad = (n: number): string => String(n).padStart(2, "0");
const dayKey = (d: Date): string => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

export function donemPenceresi(donem: PanoDonem, now: Date = new Date()): PanoPencere {
  const from = new Date(now.getFullYear(), now.getMonth(), now.getDate() - GERI_GUN[donem], 0, 0, 0, 0);
  const to = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);
  const kova = donem === "yil" ? "ay" : "gun";
  const kovalar: string[] = [];
  if (kova === "gun") {
    for (let d = new Date(from); d <= to; d = new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1)) kovalar.push(dayKey(d));
  } else {
    for (let d = new Date(from.getFullYear(), from.getMonth(), 1); d <= to; d = new Date(d.getFullYear(), d.getMonth() + 1, 1)) {
      kovalar.push(dayKey(d).slice(0, 7));
    }
  }
  return { donem, dateFrom: from.toISOString(), dateTo: to.toISOString(), kova, kovalar };
}

/** Günlük seriyi pencere kovalarına toplar; kaydı olmayan gün 0'dır (rapor ucu yalnız kayıtlı günü yollar). */
export function kovala(pencere: Pick<PanoPencere, "kova" | "kovalar">, gunluk: ReadonlyArray<{ day: string; qty: number }>): number[] {
  const totals = new Map<string, number>(pencere.kovalar.map((k) => [k, 0]));
  for (const g of gunluk) {
    const k = pencere.kova === "ay" ? g.day.slice(0, 7) : g.day.slice(0, 10);
    if (totals.has(k)) totals.set(k, totals.get(k)! + g.qty);
  }
  return pencere.kovalar.map((k) => totals.get(k)!);
}
