// Sesli sipariş — Türkçe sayı okuma (SAF). Rakam ("500", "1.250", "2,5", "2 bin") ve sözcük ("bin iki yüz elli",
// "iki buçuk bin", "beşyüz") biçimleri; ardından gelen birim ("metre", "m", "mt", "kilo", "kg") ayrıca okunur.
import { govdeler, type Sozcuk } from "./metin";

const BIRLER: Readonly<Record<string, number>> = {
  sifir: 0, bir: 1, iki: 2, uc: 3, dort: 4, bes: 5, alti: 6, yedi: 7, sekiz: 8, dokuz: 9,
  on: 10, yirmi: 20, otuz: 30, kirk: 40, elli: 50, altmis: 60, yetmis: 70, seksen: 80, doksan: 90,
};
const CARPAN: Readonly<Record<string, number>> = { yuz: 100, bin: 1000, milyon: 1_000_000 };
const TUM = [...Object.keys(BIRLER), ...Object.keys(CARPAN)].sort((a, b) => b.length - a.length);
/** Sayı sözcüğüne yapışan ekler ("yirmisi", "beşi", "dokuzu", "bine", "yüzer"). */
const SAYI_EKLERI = ["sinde", "sine", "si", "su", "er", "ar", "ye", "ya", "e", "a", "i", "u"] as const;

interface Atom { readonly carpan: boolean; readonly deger: number }

function bak(x: string): Atom | null {
  if (Object.prototype.hasOwnProperty.call(BIRLER, x)) return { carpan: false, deger: BIRLER[x]! };
  if (Object.prototype.hasOwnProperty.call(CARPAN, x)) return { carpan: true, deger: CARPAN[x]! };
  return null;
}

/** Tek sayı sözcüğü (ekli olabilir) → atom ya da null. */
export function sayiSozcugu(k: string): Atom | null {
  const d = bak(k);
  if (d) return d;
  for (const ek of SAYI_EKLERI) {
    if (k.length > ek.length + 1 && k.endsWith(ek)) {
      const g = bak(k.slice(0, -ek.length));
      if (g) return g;
    }
  }
  return null;
}

/** Sözcüğün sayı atomları: tek sözcük ya da bitişik yazım ("besyuz", "binikiyuzelli"); sayı değilse null. */
function atomlar(k: string): Atom[] | null {
  const tek = sayiSozcugu(k);
  if (tek) return [tek];
  if (k.length < 5) return null;
  const out: Atom[] = [];
  let i = 0;
  while (i < k.length) {
    const w = TUM.find((t) => k.startsWith(t, i));
    if (!w) return null;
    out.push(bak(w)!);
    i += w.length;
  }
  return out.length >= 2 ? out : null;
}

/** Rakamlı sözcük → sayı: "1.250" binlik, "2,5" ondalık, "1.250,5" ikisi; "2.5" ondalık. */
export function rakamOku(k: string): number | null {
  if (!/^\d+(?:[.,]\d+)*$/.test(k)) return null;
  let t = k;
  if (/^\d{1,3}(\.\d{3})+(,\d+)?$/.test(t)) t = t.replace(/\./g, "").replace(",", ".");
  else if (/^\d+,\d+$/.test(t)) t = t.replace(",", ".");
  else if (!/^\d+(\.\d+)?$/.test(t)) return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
}

interface Durum { toplam: number; simdiki: number; olcek: number }

/** Atomu duruma uygular; sıra bozuksa ("beş beş", "yirmi otuz") null — yeni sayı başlar. */
function uygula(d: Durum, a: Atom): Durum | null {
  if (!a.carpan) {
    if (d.simdiki !== 0 && a.deger < 10 && d.simdiki % 10 !== 0) return null;
    if (d.simdiki !== 0 && a.deger >= 10 && d.simdiki % 100 !== 0) return null;
    return { ...d, simdiki: d.simdiki + a.deger, olcek: 1 };
  }
  if (a.deger === 100) {
    if (d.simdiki >= 100) return null;
    return { ...d, simdiki: (d.simdiki || 1) * 100, olcek: 100 };
  }
  if (d.olcek >= a.deger && d.simdiki === 0 && d.toplam !== 0) return null;
  return { toplam: d.toplam + (d.simdiki || 1) * a.deger, simdiki: 0, olcek: a.deger };
}

export interface SayiSonucu {
  readonly deger: number;
  /** Sayının bittiği sözcük dizini (hariç). */
  readonly son: number;
}

/**
 * `i`'den başlayan sayıyı okur. Yalnız "bir" sayı sayılmaz ("bir de lacivert"); arkasından sayı sözcüğü, "buçuk" ya
 * da birim gelirse sayıdır. Rakamdan sonra yalnız çarpan ya da "buçuk" gelir ("2 bin", "2,5 bin"; "500 iki" iki sayı).
 */
export function sayiOku(s: readonly Sozcuk[], i: number): SayiSonucu | null {
  const ilk = s[i];
  if (!ilk || ilk.sinir) return null;
  let d: Durum = { toplam: 0, simdiki: 0, olcek: 1 };
  let j = i;
  const rakam = rakamOku(ilk.k);
  if (rakam !== null) {
    d = { toplam: 0, simdiki: rakam, olcek: 1 };
    j = i + 1;
  }
  for (; j < s.length; j++) {
    const w = s[j]!;
    if (w.sinir) break;
    if (w.k === "bucuk" && j > i) {
      d = d.olcek >= 1000 ? { ...d, toplam: d.toplam + d.olcek / 2 } : { ...d, simdiki: d.simdiki + (d.olcek >= 100 ? 50 : 0.5) };
      continue;
    }
    const at = atomlar(w.k);
    if (!at) break;
    if (rakam !== null && at.some((a) => !a.carpan || a.deger === 100)) break;
    let yeni: Durum | null = d;
    for (const a of at) yeni = yeni ? uygula(yeni, a) : null;
    if (!yeni) break;
    d = yeni;
  }
  if (j === i) return null;
  // Tek başına "bir": arkasında birim yoksa sözcük ("bir de …") sayılır.
  if (rakam === null && j === i + 1 && ilk.k === "bir" && !birimOku(s, j)) return null;
  return { deger: Math.round((d.toplam + d.simdiki) * 1e6) / 1e6, son: j };
}

export type Birim = "metre" | "kg";
const BIRIMLER: Readonly<Record<string, Birim>> = {
  metre: "metre", metr: "metre", mt: "metre", m: "metre", mtr: "metre", metrelik: "metre",
  kilo: "kg", kg: "kg", kilogram: "kg", kiloluk: "kg",
};

/** `i`'deki sözcük birim mi ("metre", "metrelik", "metreden", "m", "kilo") → birim + bitiş. */
export function birimOku(s: readonly Sozcuk[], i: number): { birim: Birim; son: number } | null {
  const w = s[i];
  if (!w || w.sinir) return null;
  for (const g of govdeler(w.k)) if (Object.prototype.hasOwnProperty.call(BIRIMLER, g)) return { birim: BIRIMLER[g]!, son: i + 1 };
  return null;
}

/** Sayı → forma yazılacak metin ("1250", "2,5"). */
export function miktarMetni(n: number): string {
  return Number.isInteger(n) ? String(n) : String(Math.round(n * 1e6) / 1e6).replace(".", ",");
}
