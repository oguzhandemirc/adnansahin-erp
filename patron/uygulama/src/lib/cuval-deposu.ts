// Çuvallar (anlık `cuval-deposu`, fabrika `cloud-sync/snapshot-cuval-deposu.ts`, 2.12.4+) — SAF okuma, arama, süzme,
// sıralama. Sevk edilmemiş çuvallar (depoda + sevke atanmış); özet ve cari dökümü FABRİKADAN gelir, burada toplanan sayı
// yok. "Etiket farklı" da fabrikanın işaretidir (`etiketFarkli`: topun etiket müşterisi dolu, çuval carisi dolu, ikisi
// farklı). Belge tek parça istemcidedir ⇒ süzme/sıralama burada (stok kalem listesiyle aynı desen). Salt izleme:
// yazma eylemi yok.
import { arr, num, obj, str } from "../ui/pano/read";
import { eslesir } from "./stok-kalem";
import type { Siralama, SuzgecGrubu } from "../ui/tablo/model";

export type CuvalDurum = "DEPODA" | "SEVKE_ATANDI";

export interface CuvalTopu {
  readonly id: string;
  readonly topNo: string | null;
  readonly urun: string;
  readonly renk: string | null;
  readonly en: number | null;
  readonly kat: string | null;
  readonly kalite: string | null;
  readonly metre: number;
  readonly kg: number | null;
  readonly etiketMusteri: string | null;
  readonly etiketFarkli: boolean;
}

export interface Cuval {
  readonly id: string;
  readonly cuvalNo: string;
  readonly cariKartId: string | null;
  readonly cari: string | null;
  readonly sube: string | null;
  readonly durum: CuvalDurum;
  readonly sevkiyatNo: string | null;
  readonly kg: number | null;
  readonly top: number;
  readonly metre: number;
  readonly olusturulma: string | null;
  readonly toplar: readonly CuvalTopu[];
  /** İçinde etiketi başka müşteriye basılmış top var mı (fabrikanın top işaretlerinden; sayı değil). */
  readonly farkVar: boolean;
}

export interface CariSatiri {
  /** `null` = müşterisiz çuvallar. */
  readonly cariKartId: string | null;
  readonly ad: string;
  readonly cuval: number;
  readonly top: number;
  readonly metre: number;
  readonly kg: number | null;
}

export interface CuvalDeposu {
  readonly ozet: { readonly cuval: number; readonly top: number; readonly metre: number; readonly kg: number | null; readonly tartiliCuval: number; readonly sevkeAtanan: number };
  readonly cariler: readonly CariSatiri[];
  readonly cuvallar: readonly Cuval[];
}

/** Müşterisiz çuvalların süzgeç değeri (cari kimliği yok). */
export const MUSTERISIZ = "musterisiz";
export const DURUM_ETIKETI: Readonly<Record<CuvalDurum, string>> = { DEPODA: "Depoda", SEVKE_ATANDI: "Sevke atandı" };

const sayi = (v: unknown): number => num(v) ?? 0;

/** Tek topu savunmalı okur (çuval deposu ve sevkiyat içeriği aynı top biçimini taşır; tek okuyucu). */
export function topOku(v: unknown): CuvalTopu {
  const t = obj(v);
  return {
    id: str(t.id) ?? "", topNo: str(t.topNo), urun: str(t.urun) ?? "—", renk: str(t.renk), en: num(t.en), kat: str(t.kat), kalite: str(t.kalite),
    metre: sayi(t.metre), kg: num(t.kg), etiketMusteri: str(t.etiketMusteri), etiketFarkli: t.etiketFarkli === true,
  };
}

/** Teli savunmalı okur; alan yoksa boş belge (ekran çökmez). */
export function cuvalDeposu(veri: unknown): CuvalDeposu {
  const v = obj(veri);
  const o = obj(v.ozet);
  return {
    ozet: { cuval: sayi(o.cuval), top: sayi(o.top), metre: sayi(o.metre), kg: num(o.kg), tartiliCuval: sayi(o.tartiliCuval), sevkeAtanan: sayi(o.sevkeAtanan) },
    cariler: arr(v.cariler).map((c) => ({
      cariKartId: str(c.cariKartId), ad: str(c.ad) ?? "—", cuval: sayi(c.cuval), top: sayi(c.top), metre: sayi(c.metre), kg: num(c.kg),
    })),
    cuvallar: arr(v.cuvallar).map((c) => {
      const toplar = arr(c.toplar).map(topOku);
      return {
        id: str(c.id) ?? "", cuvalNo: str(c.cuvalNo) ?? "—", cariKartId: str(c.cariKartId), cari: str(c.cari), sube: str(c.sube),
        durum: c.durum === "SEVKE_ATANDI" ? "SEVKE_ATANDI" : "DEPODA", sevkiyatNo: str(c.sevkiyatNo), kg: num(c.kg),
        top: sayi(c.top), metre: sayi(c.metre), olusturulma: str(c.olusturulma), toplar, farkVar: toplar.some((t) => t.etiketFarkli),
      };
    }),
  };
}

/** Çuvalın cari anahtarı (süzgeç değeri). */
export const cariAnahtari = (c: { readonly cariKartId: string | null }): string => c.cariKartId ?? MUSTERISIZ;

/** Topun görünen kalemi: "ÜRÜN · 280 cm · KREM · 2 Kat". */
export function topKalemi(t: CuvalTopu): string {
  return [t.urun, t.en === null ? null : `${Number.isInteger(t.en) ? t.en : t.en.toFixed(1)} cm`, t.renk, t.kat].filter(Boolean).join(" · ");
}

/** Süzgeç grupları: cari (döküm sırasıyla) · durum · etiket farkı (yalnız farklı top varsa). */
export function cuvalSuzgecGruplari(d: CuvalDeposu): SuzgecGrubu[] {
  const out: SuzgecGrubu[] = [];
  if (d.cariler.length > 0) out.push({ anahtar: "cari", etiket: "Cari", secenekler: d.cariler.map((c) => ({ deger: cariAnahtari(c), etiket: c.ad })) });
  out.push({ anahtar: "durum", etiket: "Durum", secenekler: [{ deger: "DEPODA", etiket: DURUM_ETIKETI.DEPODA }, { deger: "SEVKE_ATANDI", etiket: DURUM_ETIKETI.SEVKE_ATANDI }] });
  if (d.cuvallar.some((c) => c.farkVar)) out.push({ anahtar: "fark", etiket: "Etiket", secenekler: [{ deger: "evet", etiket: "Etiketi başka müşteriye basılmış top var" }] });
  return out;
}

function aranacak(c: Cuval): string {
  return [c.cuvalNo, c.cari, c.sube, c.sevkiyatNo, ...c.toplar.flatMap((t) => [t.topNo, t.urun, t.renk, t.etiketMusteri])].filter(Boolean).join(" ");
}

const SIRA_ALANI: Readonly<Record<string, (c: Cuval) => string | number | null>> = {
  cuval: (c) => c.cuvalNo, cari: (c) => c.cari, top: (c) => c.top, metre: (c) => c.metre, kg: (c) => c.kg, durum: (c) => c.durum,
  sube: (c) => c.sube, tarih: (c) => c.olusturulma,
};
export const CUVAL_SIRALANABILIR = Object.keys(SIRA_ALANI);

/** Arama (Türkçe katlamalı, her kelime) + süzgeç + sıralama; sıralama yoksa fabrikanın sırası (yeni çuval önce). */
export function gorunenCuvallar(d: CuvalDeposu, ara: string, suzgec: Readonly<Record<string, string>>, siralama: Siralama | null): Cuval[] {
  let out = d.cuvallar.filter((c) => {
    if (suzgec.cari && cariAnahtari(c) !== suzgec.cari) return false;
    if (suzgec.durum && c.durum !== suzgec.durum) return false;
    if (suzgec.fark === "evet" && !c.farkVar) return false;
    return eslesir(aranacak(c), ara);
  });
  const al = siralama ? SIRA_ALANI[siralama.alan] : undefined;
  if (siralama && al) {
    const yon = siralama.yon === "artan" ? 1 : -1;
    out = [...out].sort((a, b) => {
      const x = al(a);
      const y = al(b);
      if (x === null || y === null) return x === y ? 0 : x === null ? 1 : -1;
      return (typeof x === "number" && typeof y === "number" ? x - y : String(x).localeCompare(String(y), "tr")) * yon;
    });
  }
  return out;
}
