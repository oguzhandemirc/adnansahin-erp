// Sevkiyat içeriği (KAYIT `sevkiyat-icerigi`, fabrika `cloud-sync/shipment-content.ts`, 2026-11-19) — SAF okuma.
// Patronun sorusu: "bu sevkiyatta hangi çuvallar, çuvalda hangi toplar?". Panelin sevkiyat ayrıntısıyla AYNI veri:
// çuval sırası fabrikanın, içerik BRÜT (iade alınmış top eski çuvalında `iade: true` ile durur ve sayılır), hayalet
// top (`yok: true`: kayıtta var, fiziksel olarak çuvalda değil) süzülmez. Uygulama HESAP YAPMAZ: özet sayıları ve çuval
// başına top/metre fabrikadan gelir. Top biçimi çuval deposuyla aynı; tek okuyucu `topOku`.
import { formatNumber } from "./format";
import { topOku, type CuvalTopu } from "./cuval-deposu";
import { arr, num, obj, qty, str } from "../ui/pano/read";

export interface SevkTopu extends CuvalTopu {
  /** İade alınmış top (brüt kuralı: sevkiyatta sayılır ve görünür). */
  readonly iade: boolean;
  readonly iadeTarihi: string | null;
  readonly iadeSebebi: string | null;
  /** Hayalet top: çuval kaydında görünüyor, fiziksel olarak çuvalda değil. */
  readonly yok: boolean;
}

export interface SevkCuvali {
  readonly id: string;
  readonly cuvalNo: string;
  readonly sira: string | null;
  readonly kg: number | null;
  readonly top: number;
  readonly metre: number;
  readonly iadeTop: number;
  readonly toplar: readonly SevkTopu[];
  /** İçinde hayalet top var mı (fabrikanın top işaretlerinden; sayı değil). */
  readonly yokVar: boolean;
}

export interface SevkIcerigi {
  readonly durum: string | null;
  readonly ozet: {
    readonly cuval: number | null;
    readonly top: number | null;
    readonly metre: number | null;
    readonly kg: number | null;
    readonly tartiliCuval: number | null;
    readonly iadeTop: number | null;
  };
  readonly cuvallar: readonly SevkCuvali[];
  readonly cuvalsizToplar: readonly SevkTopu[];
}

function sevkTopuOku(v: unknown): SevkTopu {
  const t = obj(v);
  return { ...topOku(t), iade: t.iade === true, iadeTarihi: str(t.iadeTarihi), iadeSebebi: str(t.iadeSebebi), yok: t.yok === true && t.iade !== true };
}

/** Kaydı savunmalı okur; alan yoksa boş içerik (ekran çökmez). */
export function sevkIcerigi(kayit: unknown): SevkIcerigi {
  const v = obj(kayit);
  const o = obj(v.ozet);
  return {
    durum: str(v.durum),
    ozet: { cuval: num(o.cuval), top: num(o.top), metre: num(o.metre), kg: num(o.kg), tartiliCuval: num(o.tartiliCuval), iadeTop: num(o.iadeTop) },
    cuvallar: arr(v.cuvallar).map((c) => {
      const toplar = arr(c.toplar).map(sevkTopuOku);
      return {
        id: str(c.id) ?? "", cuvalNo: str(c.cuvalNo) ?? "—", sira: str(c.sira), kg: num(c.kg), top: num(c.top) ?? 0, metre: num(c.metre) ?? 0,
        iadeTop: num(c.iadeTop) ?? 0, toplar, yokVar: toplar.some((t) => t.yok),
      };
    }),
    cuvalsizToplar: arr(v.cuvalsizToplar).map(sevkTopuOku),
  };
}

/** İçerikte hiç çuval ve çuvalsız top yok mu (iptal edilen sevkiyatın çuvalları depoya döner → boş gelir). */
export const icerikBos = (d: SevkIcerigi): boolean => d.cuvallar.length === 0 && d.cuvalsizToplar.length === 0;

/**
 * Tek satırlık özet parçaları: "12 çuval · 142 top · 3.386 m · 680 kg · 9/12 tartılı · 2 iade top". Her sayı
 * fabrikanın; gelmeyen parça yazılmaz, kg yalnız sıfırdan büyükse (tartılmamış sevkiyat 0 gelir), iade yalnız varsa.
 */
export function icerikOzeti(d: SevkIcerigi): string[] {
  const o = d.ozet;
  const tam = (n: number) => formatNumber(n, 0);
  const out: string[] = [];
  if (o.cuval !== null) out.push(`${tam(o.cuval)} çuval`);
  if (o.top !== null) out.push(`${tam(o.top)} top`);
  if (o.metre !== null) out.push(`${qty(o.metre)} m`);
  if (o.kg !== null && o.kg > 0) out.push(`${qty(o.kg)} kg`);
  if (o.tartiliCuval !== null && o.cuval !== null && o.cuval > 0) out.push(`${tam(o.tartiliCuval)}/${tam(o.cuval)} tartılı`);
  if (o.iadeTop !== null && o.iadeTop > 0) out.push(`${tam(o.iadeTop)} iade top`);
  return out;
}
