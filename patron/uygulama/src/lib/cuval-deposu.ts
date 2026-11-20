// Çuvallar (anlık `cuval-deposu`, fabrika `cloud-sync/snapshot-cuval-deposu.ts`, 2.12.4+) — SAF okuma, arama, süzme,
// sıralama. Sevk edilmemiş çuvallar (depoda + sevke atanmış); özet ve cari dökümü FABRİKADAN gelir, burada toplanan sayı
// yok. "Etiket farklı" da fabrikanın işaretidir (`etiketFarkli`: topun etiket müşterisi dolu, çuval carisi dolu, ikisi
// farklı). Belge tek parça istemcidedir ⇒ süzme/sıralama burada (stok kalem listesiyle aynı desen). Salt izleme:
// yazma eylemi yok.
import { arr, num, obj, str } from "../ui/pano/read";
import { eslesir } from "./stok-kalem";
import { secimDegerleri, type Siralama, type SuzgecGrubu } from "../ui/tablo/model";

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
  /** Üretim parti no (fabrika 2.13.2+; `Batch.batchNumber`, yalnız gösterim — benzersiz değil). Eski fabrikada null. */
  readonly parti: string | null;
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
  /** Sevk partisi (fabrika 2.13.2+): ad (operatörün ya da `P-n`), kalıcı kod, OPEN/CLOSED; partisizde ve eski fabrikada null. */
  readonly partiAdi: string | null;
  readonly partiKodu: string | null;
  readonly partiDurumu: string | null;
  /** Ambalaj no (partinin içindeki sıra; 2.13.2+). */
  readonly ambalajNo: number | null;
  /** Depo adı (2.13.2+). */
  readonly depo: string | null;
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
    metre: sayi(t.metre), kg: num(t.kg), etiketMusteri: str(t.etiketMusteri), etiketFarkli: t.etiketFarkli === true, parti: str(t.parti),
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
        partiAdi: str(c.partiAdi), partiKodu: str(c.partiKodu), partiDurumu: str(c.partiDurumu), ambalajNo: num(c.ambalajNo), depo: str(c.depo),
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

/** Partisiz çuvalların süzgeç değeri. */
export const PARTISIZ = "-partisiz";
/** Çuvalın parti anahtarı: kalıcı kod (ad yalnız açık partiler arasında tekil), yoksa ad; partisizde `PARTISIZ`. */
export const partiAnahtari = (c: { readonly partiKodu: string | null; readonly partiAdi: string | null }): string => c.partiKodu ?? c.partiAdi ?? PARTISIZ;

/**
 * Parti süzgecinin seçenekleri (yalnız veride parti varsa; eski fabrika → boş): ada göre sıralı, aynı adlı iki parti
 * kodla ayrılır; partisiz çuval varsa sonda "Partisiz". Çoklu seçim (istemcide süzülen tam belge).
 */
export function partiGrubu(cuvallar: readonly { readonly partiKodu: string | null; readonly partiAdi: string | null }[]): SuzgecGrubu | null {
  const ad = new Map<string, string>();
  let partisiz = false;
  for (const c of cuvallar) {
    const k = partiAnahtari(c);
    if (k === PARTISIZ) partisiz = true;
    else if (!ad.has(k)) ad.set(k, c.partiAdi ?? k);
  }
  if (ad.size === 0) return null;
  const adSayisi = new Map<string, number>();
  for (const a of ad.values()) adSayisi.set(a, (adSayisi.get(a) ?? 0) + 1);
  const secenekler = [...ad.entries()]
    .map(([deger, a]) => ({ deger, etiket: (adSayisi.get(a) ?? 0) > 1 && deger !== a ? `${a} · ${deger}` : a }))
    .sort((x, y) => x.etiket.localeCompare(y.etiket, "tr", { numeric: true }));
  if (partisiz) secenekler.push({ deger: PARTISIZ, etiket: "Partisiz" });
  return { anahtar: "parti", etiket: "Parti", secenekler, coklu: true };
}

/** Süzgeç grupları: parti (veride varsa) · cari (döküm sırasıyla) · depo (birden çoksa) · durum · etiket farkı (yalnız farklı top varsa). */
export function cuvalSuzgecGruplari(d: CuvalDeposu): SuzgecGrubu[] {
  const out: SuzgecGrubu[] = [];
  const parti = partiGrubu(d.cuvallar);
  if (parti) out.push(parti);
  if (d.cariler.length > 0) out.push({ anahtar: "cari", etiket: "Cari", secenekler: d.cariler.map((c) => ({ deger: cariAnahtari(c), etiket: c.ad })) });
  const depolar = [...new Set(d.cuvallar.map((c) => c.depo).filter((x): x is string => !!x))].sort((a, b) => a.localeCompare(b, "tr"));
  if (depolar.length > 1) out.push({ anahtar: "depo", etiket: "Depo", secenekler: depolar.map((x) => ({ deger: x, etiket: x })), coklu: true });
  out.push({ anahtar: "durum", etiket: "Durum", secenekler: [{ deger: "DEPODA", etiket: DURUM_ETIKETI.DEPODA }, { deger: "SEVKE_ATANDI", etiket: DURUM_ETIKETI.SEVKE_ATANDI }] });
  if (d.cuvallar.some((c) => c.farkVar)) out.push({ anahtar: "fark", etiket: "Etiket", secenekler: [{ deger: "evet", etiket: "Etiketi başka müşteriye basılmış top var" }] });
  return out;
}

function aranacak(c: Cuval): string {
  return [c.cuvalNo, c.partiAdi, c.partiKodu, c.ambalajNo === null ? null : String(c.ambalajNo), c.cari, c.sube, c.sevkiyatNo, ...c.toplar.flatMap((t) => [t.topNo, t.urun, t.renk, t.parti, t.etiketMusteri])].filter(Boolean).join(" ");
}

const SIRA_ALANI: Readonly<Record<string, (c: Cuval) => string | number | null>> = {
  cuval: (c) => c.cuvalNo, cari: (c) => c.cari, top: (c) => c.top, metre: (c) => c.metre, kg: (c) => c.kg, durum: (c) => c.durum,
  sube: (c) => c.sube, tarih: (c) => c.olusturulma, parti: (c) => c.partiAdi, partiKodu: (c) => c.partiKodu, ambalaj: (c) => c.ambalajNo, depo: (c) => c.depo,
};
export const CUVAL_SIRALANABILIR = Object.keys(SIRA_ALANI);

/** Arama (Türkçe katlamalı, her kelime) + süzgeç + sıralama; sıralama yoksa fabrikanın sırası (yeni çuval önce). */
export function gorunenCuvallar(d: CuvalDeposu, ara: string, suzgec: Readonly<Record<string, string>>, siralama: Siralama | null): Cuval[] {
  let out = d.cuvallar.filter((c) => {
    const partiler = secimDegerleri(suzgec.parti);
    if (partiler.length > 0 && !partiler.includes(partiAnahtari(c))) return false;
    const depolar = secimDegerleri(suzgec.depo);
    if (depolar.length > 0 && !depolar.includes(c.depo ?? "")) return false;
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
      return (typeof x === "number" && typeof y === "number" ? x - y : String(x).localeCompare(String(y), "tr", { numeric: true })) * yon;
    });
  }
  return out;
}

/**
 * Alt şeridin toplamı: görünen (süzülen) çuval satırlarının FABRİKA sayılarının toplamı — türev yok, yalnız satır sayıları
 * toplanır (metre binde bir tamsayıyla, kayan nokta artığı olmasın). Kg yalnız tartılı çuvallardan; hiç yoksa null.
 */
export function cuvalToplami(satirlar: readonly Cuval[]): { readonly cuval: number; readonly top: number; readonly metre: number; readonly kg: number | null } {
  let top = 0;
  let metreBinde = 0;
  let kgBinde = 0;
  let tartili = 0;
  for (const c of satirlar) {
    top += c.top;
    metreBinde += Math.round(c.metre * 1000);
    if (c.kg !== null) { tartili += 1; kgBinde += Math.round(c.kg * 1000); }
  }
  return { cuval: satirlar.length, top, metre: metreBinde / 1000, kg: tartili > 0 ? kgBinde / 1000 : null };
}
