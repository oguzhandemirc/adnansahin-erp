// Pano yerleşimi — saf işlevler: varsayılan düzen, kayıtlı düzenin temizlenmesi, sıralama ve 12 sütunlu paketleme.
import type { PanoBoxDef, PanoBoxSize } from "./types";

export const defaultLayout = (catalog: readonly PanoBoxDef[]): string[] => catalog.filter((b) => b.varsayilan).map((b) => b.anahtar);

/** Kayıtlı düzen → geçerli anahtarlar (string dışı, tekrar ve katalogda olmayan anahtar sessizce düşer). */
export function cleanLayout(saved: unknown, known: ReadonlySet<string>): string[] | null {
  if (!Array.isArray(saved)) return null;
  const out: string[] = [];
  for (const k of saved) if (typeof k === "string" && known.has(k) && !out.includes(k)) out.push(k);
  return out;
}

/** `active` kutusunu `over`ın yerine taşır (sürükle-bırak sonucu). */
export function moveBox(order: readonly string[], active: string, over: string): string[] {
  const from = order.indexOf(active);
  const to = order.indexOf(over);
  if (from < 0 || to < 0 || from === to) return [...order];
  const next = [...order];
  next.splice(from, 1);
  next.splice(to, 0, active);
  return next;
}

/** Görünen alt kümeyi yeniden sıralar; görünmeyen (ör. bayrak bekleyen) anahtarlar yerinde kalır. */
export function applySubsetOrder(full: readonly string[], subsetOrdered: readonly string[]): string[] {
  const subset = new Set(subsetOrdered);
  let i = 0;
  return full.map((k) => (subset.has(k) ? subsetOrdered[i++]! : k));
}

export type SizeChoice = Exclude<PanoBoxSize, "kpi">;
export const SIZE_CHOICES: readonly SizeChoice[] = ["kucuk", "orta", "genis"];

/** Kayıtlı boyut tercihi → yalnız tanınan boyutlar. */
export function cleanSizes(saved: unknown): Record<string, SizeChoice> {
  if (!saved || typeof saved !== "object" || Array.isArray(saved)) return {};
  const out: Record<string, SizeChoice> = {};
  for (const [k, v] of Object.entries(saved)) if ((SIZE_CHOICES as readonly unknown[]).includes(v)) out[k] = v as SizeChoice;
  return out;
}

/** Geniş ekranda (12 sütun) temel genişlik. */
export const BASE_SPAN: Record<SizeChoice, number> = { kucuk: 3, orta: 4, genis: 8 };

export interface PlacedBox { key: string; span: number }

/**
 * Kutuları sırayla 12 sütunluk satırlara yerleştirir; sığmayan kutu yeni satıra geçer, satır artığı kutulara
 * temel genişlikleri oranında dağıtılır → boşluk kalmaz, kullanıcının sırası bozulmaz.
 */
export function packRows(items: ReadonlyArray<{ key: string; size: SizeChoice }>): PlacedBox[][] {
  const rows: Array<Array<{ key: string; base: number }>> = [];
  let cur: Array<{ key: string; base: number }> = [];
  let used = 0;
  for (const it of items) {
    const base = BASE_SPAN[it.size];
    if (used + base > 12 && cur.length > 0) {
      rows.push(cur);
      cur = [];
      used = 0;
    }
    cur.push({ key: it.key, base });
    used += base;
  }
  if (cur.length > 0) rows.push(cur);
  return rows.map(stretchRow);
}

function stretchRow(row: Array<{ key: string; base: number }>): PlacedBox[] {
  const sum = row.reduce((a, r) => a + r.base, 0);
  const spare = 12 - sum;
  const spans = row.map((r) => r.base + Math.floor((spare * r.base) / sum));
  let rest = 12 - spans.reduce((a, s) => a + s, 0);
  for (let i = spans.length - 1; rest > 0; i = (i - 1 + spans.length) % spans.length, rest--) spans[i]! += 1;
  return row.map((r, i) => ({ key: r.key, span: spans[i]! }));
}
