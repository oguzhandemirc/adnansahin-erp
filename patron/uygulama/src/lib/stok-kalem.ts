// Stok kalem listesi (anlık `stok-kalem`, fabrika `cloud-sync/snapshot-stok-kalem.ts`) — SAF okuma, arama, süzme, sıralama.
// Belge tek parça istemcidedir (sayfasız) ⇒ süzme/sıralama burada; sayıları fabrika hesaplar (kalem top/metre/kg ve
// yaş), burada toplanan bir şey yok. Yaş kovası sınırları fabrikanın stok karnesi kovalarıyla aynıdır (7 · 30 · 90 gün).
import { arr, num, obj, str } from "../ui/pano/read";
import type { SuzgecGrubu, Siralama } from "../ui/tablo/model";

export type Bolum = "ham" | "bitmis";
export type Gorunum = "kalem" | "top";

export interface Kalem {
  readonly anahtar: string;
  readonly urun: string;
  readonly en: number | null;
  readonly renk: string | null;
  readonly kat: string | null;
  readonly top: number;
  readonly metre: number;
  readonly kg: number | null;
  readonly enEskiGun: number | null;
  /** Ekrandaki ad: "PANOS 330 · BEYAZ · 4 Kat" (ham: yalnız ürün). */
  readonly etiket: string;
}

export interface Top {
  readonly id: string;
  readonly topNo: string | null;
  readonly kalem: string;
  readonly kalemEtiket: string;
  readonly metre: number;
  readonly kg: number | null;
  readonly parti: string | null;
  readonly depo: string | null;
  readonly gun: number | null;
}

export interface StokBolumu {
  readonly toplamTop: number;
  readonly toplamMetre: number;
  readonly kalemler: readonly Kalem[];
  readonly toplar: readonly Top[];
}

/** Ölçü sayısını gereksiz ondalıksız yazar (330 → "330", 152,5 → "152,5"). */
function enYazi(en: number): string {
  return Number.isInteger(en) ? String(en) : String(en).replace(".", ",");
}

export function kalemEtiketi(k: { urun: string; en: number | null; renk: string | null; kat: string | null }): string {
  const bas = k.en === null ? k.urun : `${k.urun} ${enYazi(k.en)}`;
  return [bas, k.renk, k.kat].filter((x): x is string => !!x).join(" · ");
}

/** Anlığın bir bölümünü savunmalı okur; eksik alan boş/null olur, ekran çökmez. */
export function stokBolumu(veri: unknown, bolum: Bolum): StokBolumu {
  const b = obj(obj(veri)[bolum]);
  const kalemler = arr(b.kalemler).map((r): Kalem => {
    const base = { urun: str(r.urun) ?? "—", en: num(r.en), renk: str(r.renk), kat: str(r.kat) };
    return {
      ...base, anahtar: String(r.anahtar ?? ""), top: num(r.top) ?? 0, metre: num(r.metre) ?? 0, kg: num(r.kg),
      enEskiGun: num(r.enEskiGun), etiket: kalemEtiketi(base),
    };
  });
  const ad = new Map(kalemler.map((k) => [k.anahtar, k.etiket]));
  const toplar = arr(b.toplar).map((r): Top => ({
    id: String(r.id ?? ""), topNo: str(r.topNo), kalem: String(r.kalem ?? ""), kalemEtiket: ad.get(String(r.kalem ?? "")) ?? "—",
    metre: num(r.metre) ?? 0, kg: num(r.kg), parti: str(r.parti), depo: str(r.depo), gun: num(r.gun),
  }));
  return { toplamTop: num(b.toplamTop) ?? 0, toplamMetre: num(b.toplamMetre) ?? 0, kalemler, toplar };
}

/** Bu bölümde hiç tartılı top var mı (kg sütunu yalnız o zaman anlamlı). */
export const kgVar = (b: StokBolumu): boolean => b.kalemler.some((k) => k.kg !== null);

// ── Arama: Türkçe harf katlama (elle; `toLocale*` yasak) ──────────────────────────────────────────────────────────
const KATLA: Readonly<Record<string, string>> = { ı: "i", İ: "i", I: "i", ş: "s", Ş: "s", ğ: "g", Ğ: "g", ü: "u", Ü: "u", ö: "o", Ö: "o", ç: "c", Ç: "c" };
/** Aramada "panos" = "PANOS", "ipek" = "İPEK", "kirmizi" = "KIRMIZI". */
export function aramaKatla(s: string): string {
  return s.replace(/[ıİIşŞğĞüÜöÖçÇ]/g, (h) => KATLA[h] ?? h).toLowerCase().replace(/\s+/g, " ").trim();
}

/** Sorgunun her kelimesi metinde geçiyorsa eşleşir (sıra serbest). */
export function eslesir(metin: string, sorgu: string): boolean {
  const q = aramaKatla(sorgu);
  if (!q) return true;
  const m = aramaKatla(metin);
  return q.split(" ").every((w) => m.includes(w));
}

// ── Süzgeç ───────────────────────────────────────────────────────────────────────────────────────────────────────
export const YAS_KOVALARI = [
  { deger: "0-7", etiket: "0–7 gün", ust: 7 },
  { deger: "8-30", etiket: "8–30 gün", ust: 30 },
  { deger: "31-90", etiket: "31–90 gün", ust: 90 },
  { deger: "90+", etiket: "90 günden eski", ust: Infinity },
] as const;
const YAS_BILINMIYOR = { deger: "yok", etiket: "Yaşı bilinmiyor" } as const;

export function yasKovasi(gun: number | null): string {
  if (gun === null) return YAS_BILINMIYOR.deger;
  return YAS_KOVALARI.find((k) => gun <= k.ust)?.deger ?? "90+";
}

const benzersiz = <T,>(xs: readonly T[]): T[] => [...new Set(xs)];
const trSirala = (a: string, b: string) => a.localeCompare(b, "tr");

/** Veriden süzgeç grupları (ürün · renk · en · yaş); seçeneği olmayan grup çizilmez (ham bölümde en/renk yok). */
export function stokSuzgecGruplari(b: StokBolumu): SuzgecGrubu[] {
  const urun = benzersiz(b.kalemler.map((k) => k.urun)).sort(trSirala);
  const renk = benzersiz(b.kalemler.flatMap((k) => (k.renk ? [k.renk] : []))).sort(trSirala);
  const en = benzersiz(b.kalemler.flatMap((k) => (k.en === null ? [] : [k.en]))).sort((x, y) => x - y);
  const yaslar = new Set(b.kalemler.map((k) => yasKovasi(k.enEskiGun)));
  const yas = [...YAS_KOVALARI, YAS_BILINMIYOR].filter((k) => yaslar.has(k.deger)).map((k) => ({ deger: k.deger, etiket: k.etiket }));
  const gruplar: SuzgecGrubu[] = [
    { anahtar: "urun", etiket: "Ürün", secenekler: urun.map((u) => ({ deger: u, etiket: u })) },
    { anahtar: "renk", etiket: "Renk", secenekler: renk.map((r) => ({ deger: r, etiket: r })) },
    { anahtar: "en", etiket: "En (cm)", secenekler: en.map((e) => ({ deger: String(e), etiket: enYazi(e) })) },
    { anahtar: "yas", etiket: "En eski top yaşı", secenekler: yas },
  ];
  return gruplar.filter((g) => g.secenekler.length > 0);
}

/** Kalem süzgeçten geçiyor mu (bilinmeyen/boş seçim süzmez). */
export function kalemGecer(k: Kalem, suzgec: Readonly<Record<string, string>>): boolean {
  if (suzgec.urun && k.urun !== suzgec.urun) return false;
  if (suzgec.renk && k.renk !== suzgec.renk) return false;
  if (suzgec.en && (k.en === null || String(k.en) !== suzgec.en)) return false;
  if (suzgec.yas && yasKovasi(k.enEskiGun) !== suzgec.yas) return false;
  return true;
}

// ── Sıralama ─────────────────────────────────────────────────────────────────────────────────────────────────────
type Deger = string | number | null;
/** Boş değer her iki yönde sonda (bulutun liste sıralamasıyla aynı kural). */
function karsilastir(a: Deger, b: Deger, yon: 1 | -1): number {
  if (a === null || b === null) return a === b ? 0 : a === null ? 1 : -1;
  if (typeof a === "number" && typeof b === "number") return (a - b) * yon;
  return String(a).localeCompare(String(b), "tr") * yon;
}

export function sirala<R>(rows: readonly R[], s: Siralama | null, alanlar: Readonly<Record<string, (r: R) => Deger>>): readonly R[] {
  const f = s ? alanlar[s.alan] : undefined;
  if (!s || !f) return rows;
  const yon = s.yon === "artan" ? 1 : -1;
  return rows.map((r, i) => ({ r, i })).sort((x, y) => karsilastir(f(x.r), f(y.r), yon) || x.i - y.i).map((x) => x.r);
}

export const KALEM_SIRALAMA: Readonly<Record<string, (k: Kalem) => Deger>> = {
  kalem: (k) => k.etiket, top: (k) => k.top, metre: (k) => k.metre, gun: (k) => k.enEskiGun, kg: (k) => k.kg,
};
export const TOP_SIRALAMA: Readonly<Record<string, (t: Top) => Deger>> = {
  topNo: (t) => t.topNo, kalem: (t) => t.kalemEtiket, metre: (t) => t.metre, gun: (t) => t.gun, kg: (t) => t.kg, parti: (t) => t.parti, depo: (t) => t.depo,
};

/** Arama + süzgeç + sıralama → görünen kalemler. */
export function gorunenKalemler(b: StokBolumu, ara: string, suzgec: Readonly<Record<string, string>>, s: Siralama | null): readonly Kalem[] {
  return sirala(b.kalemler.filter((k) => kalemGecer(k, suzgec) && eslesir(k.etiket, ara)), s, KALEM_SIRALAMA);
}

/** Top görünümü: kalemi süzgeçten geçen toplar; arama top no, parti ve kalem adında. */
export function gorunenToplar(b: StokBolumu, ara: string, suzgec: Readonly<Record<string, string>>, s: Siralama | null): readonly Top[] {
  const gecen = new Set(b.kalemler.filter((k) => kalemGecer(k, suzgec)).map((k) => k.anahtar));
  const rows = b.toplar.filter((t) => gecen.has(t.kalem) && eslesir(`${t.topNo ?? ""} ${t.parti ?? ""} ${t.kalemEtiket}`, ara));
  return sirala(rows, s, TOP_SIRALAMA);
}

export const kaleminToplari = (b: StokBolumu, anahtar: string): readonly Top[] => b.toplar.filter((t) => t.kalem === anahtar);
