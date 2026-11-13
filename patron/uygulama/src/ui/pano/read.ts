// Anlık okuyucular (saf): fabrikanın tel şekli (`Teks-Erp/src/cloud-sync/snapshots.ts`) savunmalı okunur — eksik alan
// "—" olur, ekran çökmez. Uygulama ARİTMETİK YAPMAZ: toplam/yüzde fabrikadan gelir; burada yalnız seçme, sıralama
// ve "sıfırdan büyük mü" karşılaştırması var.
import { formatNumber } from "../../lib/format";
import { FREE_STOCK_LABEL, PERIOD_LABEL, UNIT, type PeriodKey } from "../../lib/labels/uretim";

export type Obj = Readonly<Record<string, unknown>>;

export function obj(v: unknown): Obj {
  return v !== null && typeof v === "object" && !Array.isArray(v) ? (v as Obj) : {};
}

export function arr(v: unknown): readonly Obj[] {
  return Array.isArray(v) ? v.map(obj) : [];
}

export function num(v: unknown): number | null {
  const n = typeof v === "number" ? v : typeof v === "string" && v.trim() !== "" ? Number(v) : NaN;
  return Number.isFinite(n) ? n : null;
}

export function str(v: unknown): string | null {
  return typeof v === "string" && v !== "" ? v : null;
}

/** Sayı biçimi: tam sayı ya da binin üstü ondalıksız, değilse bir hane (metre). */
export function qty(v: unknown): string {
  const n = num(v);
  if (n === null) return "—";
  // Binin üstünde ondalık okunmaz (61.240,5 → 61.241); küçük metrajda bir hane kalır.
  return formatNumber(n, Number.isInteger(n) || Math.abs(n) >= 1000 ? 0 : 1);
}

export function pct(v: unknown): string {
  const n = num(v);
  return n === null ? "—" : `%${formatNumber(n, 1)}`;
}

/** Dönemli bölümden tek dönem (`ozet.sevkiyat` / `ozet.fason`). */
export function period(section: unknown, key: PeriodKey): Obj {
  return obj(obj(section)[key]);
}

/** Akış kolonu (`kolonlar[]`): etiket fabrikadan. */
export function column(data: unknown, key: string): { label: string; count: number | null } | null {
  const c = arr(obj(data).kolonlar).find((k) => k.anahtar === key);
  return c ? { label: str(c.etiket) ?? key, count: num(c.adet) } : null;
}

// ---------------------------------------------------------------- alan kartı özetleri (tek satır)

/** Pano alan satırının alt metni: projeksiyon başına en çok iki fabrika sayısı. */
export function areaSummary(projection: string, data: unknown): string {
  const d = obj(data);
  switch (projection) {
    case "ozet.siparis":
      return `${qty(d.acikKalem)} açık kalem · ${pct(d.karsilanmaYuzde)} karşılandı`;
    case "ozet.sevkiyat": {
      const m = period(d, "buAy");
      // Termin türevi göndermeyen fabrikada "— zamanında" basılmaz: alan yoksa parça hiç çizilmez.
      const onTime = num(m.zamanindaYuzde) === null ? "" : ` · ${pct(m.zamanindaYuzde)} zamanında`;
      return `${PERIOD_LABEL.buAy} ${qty(m.sevkMiktari)} ${UNIT.metre}${onTime}`;
    }
    case "ozet.uretim":
      return `Bugün ${qty(d.bugunTamamlananToplam)} ${UNIT.top} tamamlandı`;
    case "ozet.stok": {
      return `${FREE_STOCK_LABEL} ${qty(d.bitmisMiktar)} ${UNIT.metre} · ölü ${qty(d.oluMiktar)} ${UNIT.metre}`;
    }
    case "ozet.fason": {
      const m = period(d, "buAy");
      return `Açıkta ${qty(m.acikMiktar)} ${UNIT.metre} · fire ${pct(m.fireYuzde)}`;
    }
    default:
      return "";
  }
}
