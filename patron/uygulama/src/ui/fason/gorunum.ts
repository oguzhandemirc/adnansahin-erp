// Fason ekranlarının görünümü — `fason-acik` anlığını SAVUNMALI okur ve günlük dile çevirir. Sayıları, kırılımları ve
// sıralarını FABRİKA verir (kategoriler 0'lılar dahil, firma içi müşteri/kumaş top azalan); burada toplama yok.
// "X gündür" yalnız bilgidir (en eski gönderimden bu yana), termin/gecikme değildir; renk ve uyarı taşımaz.
import { formatNumber } from "../../lib/format";

type Obj = Readonly<Record<string, unknown>>;
const obj = (v: unknown): Obj | null => (typeof v === "object" && v !== null && !Array.isArray(v) ? (v as Obj) : null);
const list = (v: unknown): Obj[] => (Array.isArray(v) ? v.map(obj).filter((x): x is Obj => x !== null) : []);
const text = (v: unknown): string | null => (typeof v === "string" && v !== "" ? v : null);
const isNum = (v: unknown): boolean => (typeof v === "number" && Number.isFinite(v)) || (typeof v === "string" && /^-?\d+(\.\d+)?$/.test(v));
const adet = (v: unknown): string => (isNum(v) ? formatNumber(v, 0) : "—");
const metre = (v: unknown): string => (isNum(v) ? formatNumber(v, 0) : "—");
const sifir = (v: unknown): boolean => isNum(v) && Number(v) === 0;

/** En eski gönderimden bu yana tam gün; tarih yoksa null. */
export function gundur(iso: unknown, simdi: number = Date.now()): string | null {
  const t = text(iso);
  const ms = t ? Date.parse(t) : NaN;
  if (!Number.isFinite(ms)) return null;
  const gun = Math.max(0, Math.floor((simdi - ms) / 86_400_000));
  return gun === 0 ? "bugün gitti" : `${formatNumber(gun, 0)} gündür`;
}

export interface Satir {
  readonly key: string;
  readonly ad: string;
  readonly top: string;
  readonly metre: string;
  /** Sıfır satır soluk çizilir (kategori listesinde 0'lılar da görünür). */
  readonly bos: boolean;
}

export interface FirmaSatiri extends Satir {
  readonly gundur: string | null;
  readonly isEmri: string | null;
}

export interface FasonGorunumu {
  readonly top: string;
  readonly metre: string;
  /** "12 iş emri · 5 müşteri" — eski fabrika alanları göndermezse null. */
  readonly kimler: string | null;
  readonly kategoriler: readonly Satir[];
  readonly firmalar: readonly FirmaSatiri[];
}

export function fasonGorunumu(veri: unknown): FasonGorunumu | null {
  const d = obj(veri);
  if (!d || !isNum(d.acikTop)) return null;
  const kimler = isNum(d.isEmriSayisi) && isNum(d.musteriSayisi) ? `${adet(d.isEmriSayisi)} iş emri · ${adet(d.musteriSayisi)} müşteri` : null;
  return {
    top: adet(d.acikTop),
    metre: metre(d.kalanMiktar),
    kimler,
    kategoriler: list(d.kategoriler).map((k, i) => ({ key: text(k.kod) ?? String(i), ad: text(k.ad) ?? "—", top: adet(k.acikTop), metre: metre(k.kalanMiktar), bos: sifir(k.acikTop) })),
    firmalar: list(d.firmalar).map((f, i) => ({
      key: text(f.fasonFirmaId) ?? String(i),
      ad: text(f.etiket) ?? "—",
      top: adet(f.acikTop),
      metre: metre(f.kalanMiktar),
      bos: sifir(f.acikTop),
      gundur: gundur(f.enEskiGonderim),
      isEmri: isNum(f.isEmriSayisi) ? `${adet(f.isEmriSayisi)} iş emri` : null,
    })),
  };
}

export interface FirmaGorunumu {
  readonly ad: string;
  readonly top: string;
  readonly metre: string;
  readonly gundur: string | null;
  readonly isEmri: string | null;
  readonly kategoriler: string;
  /** Eski fabrika kırılımı göndermezse null ("fabrika güncellenince gelir"). */
  readonly musteriler: readonly Satir[] | null;
  readonly kumaslar: readonly Satir[] | null;
}

export function firmaGorunumu(veri: unknown, firmaId: string): FirmaGorunumu | null {
  const f = list(obj(veri)?.firmalar).find((x) => text(x.fasonFirmaId) === firmaId);
  if (!f) return null;
  const satir = (key: string, ad: string, x: Obj): Satir => ({ key, ad, top: adet(x.top), metre: metre(x.metre), bos: sifir(x.top) });
  return {
    ad: text(f.etiket) ?? "—",
    top: adet(f.acikTop),
    metre: metre(f.kalanMiktar),
    gundur: gundur(f.enEskiGonderim),
    isEmri: isNum(f.isEmriSayisi) ? `${adet(f.isEmriSayisi)} iş emri` : null,
    kategoriler: (Array.isArray(f.kategoriler) ? f.kategoriler.filter((x): x is string => typeof x === "string") : []).join(", "),
    musteriler: Array.isArray(f.musteriler) ? list(f.musteriler).map((m, i) => satir(text(m.cariKartId) ?? `yok-${i}`, text(m.ad) ?? "Müşterisiz", m)) : null,
    kumaslar: Array.isArray(f.urunler)
      ? list(f.urunler).map((u, i) => satir(`${text(u.urunId) ?? "-"}:${text(u.renkId) ?? "-"}:${i}`, [text(u.urunAdi) ?? "Kumaş yok", text(u.renkAdi)].filter(Boolean).join(" · "), u))
      : null,
  };
}
