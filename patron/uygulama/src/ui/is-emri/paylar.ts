// İş emri ↔ sipariş kalemi PAYLAŞTIRMA gösterimi (2026-11-20; fabrika 2.13.2 `is-emri.siparisPaylari` ·
// `siparis-kalemi.isEmriPaylari`). SAF okuyucular: metreler FABRİKANIN verdiğidir (`gosterilenMetre` tablet Tambur
// kuralının sunucu ikizi; `paylastirilanMetre` panelde girilen plan, girilmemişse null). Telefon türev sayı üretmez.
// Alan dizi değilse (eski fabrika) null döner → ekran bugünkü görünümünü çizer.
import { formatNumber } from "../../lib/format";
import type { Kayit } from "./gorunum";

export interface SiparisPayi {
  readonly siparisId: string | null;
  readonly siparisNo: string;
  readonly siparisKalemiId: string | null;
  readonly urunAdi: string | null;
  readonly renkAdi: string | null;
  readonly siparisMetre: number | null;
  readonly paylastirilanMetre: number | null;
  readonly gosterilenMetre: number | null;
}

export interface IsEmriPayi {
  readonly isEmriId: string | null;
  readonly isEmriNo: string;
  readonly paylastirilanMetre: number | null;
  readonly gosterilenMetre: number | null;
}

const metin = (v: unknown): string | null => (typeof v === "string" && v.trim() !== "" ? v : null);
const sayi = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : typeof v === "string" && /^-?\d+(\.\d+)?$/.test(v) ? Number(v) : null);
const nesne = (v: unknown): Kayit => (typeof v === "object" && v !== null && !Array.isArray(v) ? (v as Kayit) : {});
const metre = (v: number | null): string | null => (v === null ? null : `${formatNumber(v, 0)} m`);

/** `is-emri.siparisPaylari`; alan yoksa (eski fabrika) null. */
export function siparisPaylari(k: Kayit): SiparisPayi[] | null {
  if (!Array.isArray(k.siparisPaylari)) return null;
  return k.siparisPaylari.map(nesne).map((x) => ({
    siparisId: metin(x.siparisId), siparisNo: metin(x.siparisNo) ?? "—", siparisKalemiId: metin(x.siparisKalemiId),
    urunAdi: metin(x.urunAdi), renkAdi: metin(x.renkAdi),
    siparisMetre: sayi(x.siparisMetre), paylastirilanMetre: sayi(x.paylastirilanMetre), gosterilenMetre: sayi(x.gosterilenMetre),
  }));
}

/** `siparis-kalemi.isEmriPaylari`; alan yoksa (eski fabrika) null. */
export function isEmriPaylari(k: Kayit): IsEmriPayi[] | null {
  if (!Array.isArray(k.isEmriPaylari)) return null;
  return k.isEmriPaylari.map(nesne).map((x) => ({
    isEmriId: metin(x.isEmriId), isEmriNo: metin(x.isEmriNo) ?? "—",
    paylastirilanMetre: sayi(x.paylastirilanMetre), gosterilenMetre: sayi(x.gosterilenMetre),
  }));
}

/**
 * İş emri ayrıntısındaki sipariş satırı: değer = gösterilen metre; paylaştırma girilmişse alt satır
 * "Paylaştırılan · siparişin 1.000 m'sinden". Aynı siparişin birden çok kalemi bağlıysa kumaş/renk ayırt eder.
 */
export function siparisPayiSatiri(p: SiparisPayi, kalemiAyir: boolean): { deger: string | undefined; ikincil: string | undefined } {
  const kumas = kalemiAyir ? [p.urunAdi, p.renkAdi].filter(Boolean).join(" ") || null : null;
  const pay = p.paylastirilanMetre !== null
    ? (p.siparisMetre !== null ? `Paylaştırılan · siparişin ${formatNumber(p.siparisMetre, 0)} m'sinden` : "Paylaştırılan")
    : null;
  return { deger: metre(p.gosterilenMetre) ?? undefined, ikincil: [kumas, pay].filter(Boolean).join(" · ") || undefined };
}

/** Sipariş kaleminin altındaki satır: "IE-2026-0311: bu iş emrinden 300 m" (metre yoksa yalnız no). */
export function isEmriPayiMetni(p: IsEmriPayi): string {
  const m = metre(p.gosterilenMetre);
  return m ? `${p.isEmriNo}: bu iş emrinden ${m}` : p.isEmriNo;
}
