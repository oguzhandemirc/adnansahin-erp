// Fason tablosu (2026-11-19, kullanıcı: "sekmeleri kaldırıp filtre koy, data table yap, toplamlar en altta şerit") — SAF.
// Satır = fasonda topu olan AÇIK iş emri (`is-emri` listesi, TAM yüklenir: bütün sayfalar). Bugün fabrikanın gönderdiği
// en ince fason satırı budur; top satırı (top no) fason için buluta gelmez. Satırın top/metresi fabrikanın `asamaTop`
// "fason" satırıdır (iş emrinin fasondaki topları — firma firma ayrılmaz). Firma adları ve işlem türü (hizmet kategorisi)
// `fason-acik` anlığından eşlenir.
// Süzme/arama/sıralama İSTEMCİDE: küme tam (sayfasız hâle getirilir) — stok anlığıyla aynı yaklaşım; alan içinde VEYA,
// alanlar arası VE (çoklu seçim).
// Alt şerit (`altToplam`): süzgeçsizken fabrikanın toplamı (`fason-acik`); yalnız TEK firma ya da TEK işlem seçiliyken
// fabrikanın o firma/kategori toplamı; başka her süzgeçte satırların FABRİKA sayıları toplanır — ama iki firmaya bölünmüş
// iş emri firma/işlem süzgecindeyse satırın sayısı o firmaya ait değildir ⇒ toplam yazılmaz, yalnız satır adedi.
// Firma payı (2.13.1, `fasonFirmaPayi`): fabrika satırın fason top/metresini firma (+ kategori kodları) başına bölüp
// gönderdiyse firma/işlem süzgecinde satır yalnız seçime uyan payların toplamını gösterir ve şerit bunu toplar (bölünmüş
// satır da toplanır); alan gelmediyse (eski fabrika) yukarıdaki davranış aynen kalır. Telefon yine yalnız toplar.
import type { ProjectionRecord } from "../../api/wire";
import { formatDate, formatNumber } from "../../lib/format";
import { katla } from "../../ses/metin";
import { arr, num, obj, str } from "../pano/read";
import { fasonFirmCell, musteriMetni, orderCell, type Kayit } from "../is-emri/gorunum";
import type { Siralama, SutunTanimi, SuzgecGrubu, SuzgecSecenegi } from "../tablo/model";
import { gecerliDegerler } from "../tablo/model";

export interface FasonSatiri {
  readonly id: string;
  readonly isEmriNo: string;
  readonly musteri: string;
  readonly kumas: string | null;
  readonly renk: string | null;
  /** Topları şu an dışarıda olan firmalar (fabrikanın `fasonFirmaIdleri`). */
  readonly firmaIdleri: readonly string[];
  /** Hücre: en çok topu olan firma (+N). */
  readonly firma: string;
  /** İşlem türleri (hizmet kategorisi KODLARI; anlıkta karşılığı yoksa adı). */
  readonly islemler: readonly string[];
  readonly islem: string;
  readonly siparisler: readonly string[];
  readonly siparis: string;
  /** Fabrikanın fason top/metresi; gelmediyse null. Firma/işlem süzgecinde (pay varsa) seçime düşen pay. */
  readonly top: number | null;
  readonly metre: number | null;
  /** Fabrikanın firma payları (`fasonFirmaPayi`); alan yoksa ya da bozuksa null (eski fabrika). */
  readonly paylar: readonly FasonPayi[] | null;
  /** Gönderimden bu yana tam gün (termin/gecikme DEĞİL). */
  readonly gun: number | null;
  readonly gonderim: string | null;
}

/** Satırın fason top/metresinin bir firmaya düşen payı (fabrikanın sayısı). `firmaId` null: açık kalemi olmayan top. */
export interface FasonPayi {
  readonly firmaId: string | null;
  /** Firmanın hizmet kategori KODLARI (İşlem süzgecinin değerleri). */
  readonly islemler: readonly string[];
  readonly top: number;
  readonly metre: number;
}

/** `fasonFirmaPayi` → paylar; alan yoksa ya da tek bir girdisi bozuksa null (yarım veriyle toplam yazılmaz). */
function paylarOku(v: unknown): FasonPayi[] | null {
  if (!Array.isArray(v)) return null;
  const out: FasonPayi[] = [];
  for (const x of v) {
    const p = obj(x);
    const top = num(p.top);
    const metre = num(p.metre);
    const firmaId = str(p.fasonFirmaId);
    if (top === null || metre === null || (firmaId === null && p.fasonFirmaId !== null)) return null;
    out.push({ firmaId, islemler: metinler(p.kategoriKodlari), top, metre });
  }
  return out;
}

/** Anlıktan firma ve kategori sözlükleri. */
interface Anlik {
  readonly firmalar: ReadonlyMap<string, { readonly ad: string; readonly kategoriler: readonly string[]; readonly top: number | null; readonly metre: number | null; readonly isEmri: number | null }>;
  /** kod → ad (anlığın sırası). */
  readonly kategoriler: ReadonlyMap<string, { readonly ad: string; readonly top: number | null; readonly metre: number | null }>;
  readonly top: number | null;
  readonly metre: number | null;
  readonly isEmri: number | null;
}

export function anlikOku(veri: unknown): Anlik {
  const d = obj(veri);
  const firmalar = new Map<string, { ad: string; kategoriler: string[]; top: number | null; metre: number | null; isEmri: number | null }>();
  for (const f of arr(d.firmalar)) {
    const id = str(f.fasonFirmaId);
    if (!id) continue;
    const kat = Array.isArray(f.kategoriler) ? f.kategoriler.filter((x): x is string => typeof x === "string" && x !== "") : [];
    firmalar.set(id, { ad: str(f.etiket) ?? "—", kategoriler: kat, top: num(f.acikTop), metre: num(f.kalanMiktar), isEmri: num(f.isEmriSayisi) });
  }
  const kategoriler = new Map<string, { ad: string; top: number | null; metre: number | null }>();
  for (const k of arr(d.kategoriler)) {
    const kod = str(k.kod);
    if (kod) kategoriler.set(kod, { ad: str(k.ad) ?? kod, top: num(k.acikTop), metre: num(k.kalanMiktar) });
  }
  return { firmalar, kategoriler, top: num(d.acikTop), metre: num(d.kalanMiktar), isEmri: num(d.isEmriSayisi) };
}

const metinler = (v: unknown): string[] => (Array.isArray(v) ? v.filter((x): x is string => typeof x === "string" && x !== "") : []);
const kayitOf = (r: ProjectionRecord): Kayit => (typeof r.kayit === "object" && r.kayit !== null ? (r.kayit as Kayit) : {});

function gunOf(iso: string | null, simdi: number): number | null {
  const ms = iso ? Date.parse(iso) : NaN;
  return Number.isFinite(ms) ? Math.max(0, Math.floor((simdi - ms) / 86_400_000)) : null;
}

/** Fasonda topu olan açık iş emirleri → tablo satırları (sıra: listenin sırası). */
export function fasonSatirlari(items: readonly ProjectionRecord[], anlikVeri: unknown, simdi: number = Date.now()): FasonSatiri[] {
  const a = anlikOku(anlikVeri);
  const adToKod = new Map([...a.kategoriler.entries()].map(([kod, k]) => [k.ad, kod] as const));
  return items.flatMap((r): FasonSatiri[] => {
    const k = kayitOf(r);
    if (k.acik === false) return [];
    const fs = arr(k.asamaTop).find((x) => x.anahtar === "fason");
    const top = fs ? num(fs.top) : null;
    const firmaIdleri = metinler(k.fasonFirmaIdleri);
    if (!((top ?? 0) > 0 || firmaIdleri.length > 0)) return [];
    // İşlem türü: topların bulunduğu HER firmanın kategorileri (anlıktan); anlıkta yoksa iş emrinin kendi kategori adları.
    const adlar = new Set<string>();
    for (const id of firmaIdleri) for (const ad of a.firmalar.get(id)?.kategoriler ?? []) adlar.add(ad);
    if (adlar.size === 0) for (const ad of metinler(k.fasonKategoriler)) adlar.add(ad);
    const islemAdlari = [...adlar].sort((x, y) => x.localeCompare(y, "tr"));
    const gonderim = str(k.fasonGonderim);
    return [{
      id: r.id,
      isEmriNo: str(k.isEmriNo) ?? "—",
      musteri: musteriMetni(k),
      kumas: str(k.urunAdi),
      renk: str(k.renkAdi),
      firmaIdleri,
      firma: fasonFirmCell(k) === "—" && firmaIdleri.length > 0 ? (a.firmalar.get(firmaIdleri[0]!)?.ad ?? "—") : fasonFirmCell(k),
      islemler: islemAdlari.map((ad) => adToKod.get(ad) ?? ad),
      islem: islemAdlari.join(", ") || "—",
      siparisler: metinler(k.siparisNolari),
      siparis: orderCell(k),
      top: fs ? top : null,
      metre: fs ? num(fs.metre) : null,
      paylar: paylarOku(k.fasonFirmaPayi),
      gun: gunOf(gonderim, simdi),
      gonderim,
    }];
  });
}

// ── Sütunlar ────────────────────────────────────────────────────────────────────────────────────────────────────
const sayiHucre = (v: number | null) => (v === null ? "—" : formatNumber(v, 0));
const kumasRenk = (r: FasonSatiri) => [r.kumas, r.renk].filter(Boolean).join(" · ") || "—";

export const FASON_SUTUNLARI: readonly SutunTanimi<FasonSatiri>[] = [
  { key: "firma", baslik: "Fasoncu", ad: "Fasoncu firma", agirlik: 1.3, sirala: "firma", hucre: (r) => r.firma },
  { key: "musteri", baslik: "Müşteri", agirlik: 1.4, sirala: "musteri", hucre: (r) => r.musteri },
  { key: "kumas", baslik: "Kumaş / renk", agirlik: 1.5, satir: 2, sirala: "kumas", hucre: kumasRenk },
  { key: "top", baslik: "Top", agirlik: 0.5, sayi: true, sirala: "top", hucre: (r) => sayiHucre(r.top) },
  { key: "metre", baslik: "Metre", agirlik: 0.75, sayi: true, sirala: "metre", hucre: (r) => sayiHucre(r.metre) },
  { key: "gun", baslik: "Gün", ad: "Fasonda (gün)", agirlik: 0.5, sayi: true, sirala: "gun", hucre: (r) => sayiHucre(r.gun) },
  { key: "isEmri", baslik: "İş emri", ad: "İş emri no", agirlik: 1.2, kirpilmaz: 12, sirala: "isEmri", hucre: (r) => r.isEmriNo },
  { key: "islem", baslik: "İşlem", ad: "İşlem türü", agirlik: 1, sirala: "islem", hucre: (r) => r.islem },
  { key: "siparis", baslik: "Sipariş", ad: "Sipariş no", agirlik: 1.3, kirpilmaz: 13, hucre: (r) => r.siparis },
  { key: "gonderim", baslik: "Gönderim", ad: "Gönderim tarihi", agirlik: 0.9, sirala: "gun", hucre: (r) => (r.gonderim ? formatDate(r.gonderim) : "—") },
];
export const FASON_VARSAYILAN_SUTUN: readonly string[] = ["firma", "musteri", "kumas", "top", "metre", "gun"];
export const FASON_SIRALANABILIR: readonly string[] = ["firma", "musteri", "kumas", "top", "metre", "gun", "isEmri", "islem"];

// ── Süzgeç ──────────────────────────────────────────────────────────────────────────────────────────────────────
export const SUZGEC_ALANLARI = ["islem", "firma", "musteri", "kumas", "renk", "isEmri", "siparis"] as const;
export type SuzgecAlani = (typeof SUZGEC_ALANLARI)[number];

const trSirali = (xs: Iterable<string>): SuzgecSecenegi[] =>
  [...new Set(xs)].filter((x) => x !== "" && !x.includes("\n")).sort((a, b) => a.localeCompare(b, "tr")).map((x) => ({ deger: x, etiket: x }));

/** Satırın bir alandaki değerleri (üyelik: biri seçiliyse satır uyar). */
function degerleri(r: FasonSatiri, alan: SuzgecAlani): readonly string[] {
  switch (alan) {
    case "islem": return r.islemler;
    case "firma": return r.firmaIdleri;
    case "musteri": return [r.musteri];
    case "kumas": return r.kumas ? [r.kumas] : [];
    case "renk": return r.renk ? [r.renk] : [];
    case "isEmri": return [r.isEmriNo];
    case "siparis": return r.siparisler;
  }
}

/**
 * Süzgeç alanları (veride ne varsa): İşlem (anlığın kategori sırası; topu olan + seçili olan) · Fasoncu (anlığın firma
 * sırası + satırlarda olup anlıkta olmayan) · Müşteri · Kumaş · Renk · İş emri · Sipariş (satırlardan, Türkçe sıralı).
 * `secim`deki değer seçeneklerde yoksa yine eklenir (rota ile gelen ön seçim, veri yüklenmeden de çip olarak görünsün).
 */
export function fasonGruplari(satirlar: readonly FasonSatiri[], anlikVeri: unknown, secim: Readonly<Record<string, string>> = {}): SuzgecGrubu[] {
  const a = anlikOku(anlikVeri);
  const satirIslem = new Set(satirlar.flatMap((r) => r.islemler));
  const islem: SuzgecSecenegi[] = [...a.kategoriler.entries()]
    .filter(([kod, k]) => (k.top ?? 0) > 0 || satirIslem.has(kod) || (secim.islem ?? "").split("\n").includes(kod))
    .map(([kod, k]) => ({ deger: kod, etiket: k.ad }));
  for (const kod of satirIslem) if (!a.kategoriler.has(kod)) islem.push({ deger: kod, etiket: kod });
  const firma: SuzgecSecenegi[] = [...a.firmalar.entries()].map(([id, f]) => ({ deger: id, etiket: f.ad }));
  for (const r of satirlar) for (const id of r.firmaIdleri) if (!firma.some((o) => o.deger === id)) firma.push({ deger: id, etiket: r.firmaIdleri[0] === id ? r.firma.replace(/ \+\d+$/, "") : "—" });
  const gs: SuzgecGrubu[] = [
    { anahtar: "islem", etiket: "İşlem", coklu: true, secenekler: islem },
    { anahtar: "firma", etiket: "Fasoncu", coklu: true, secenekler: firma },
    { anahtar: "musteri", etiket: "Müşteri", coklu: true, secenekler: trSirali(satirlar.map((r) => r.musteri)) },
    { anahtar: "kumas", etiket: "Kumaş", coklu: true, secenekler: trSirali(satirlar.flatMap((r) => (r.kumas ? [r.kumas] : []))) },
    { anahtar: "renk", etiket: "Renk", coklu: true, secenekler: trSirali(satirlar.flatMap((r) => (r.renk ? [r.renk] : []))) },
    { anahtar: "isEmri", etiket: "İş emri", coklu: true, secenekler: trSirali(satirlar.map((r) => r.isEmriNo).filter((x) => x !== "—")) },
    { anahtar: "siparis", etiket: "Sipariş", coklu: true, secenekler: trSirali(satirlar.flatMap((r) => r.siparisler)) },
  ];
  // Ön seçim (rota) seçeneklerde yoksa etiketiyle eklenir; veri gelince gerçek etiket gelir.
  return gs
    .map((g) => {
      const eksik = (secim[g.anahtar] ?? "").split("\n").filter((v) => v !== "" && !g.secenekler.some((o) => o.deger === v));
      return eksik.length === 0 ? g : { ...g, secenekler: [...g.secenekler, ...eksik.map((v) => ({ deger: v, etiket: v }))] };
    })
    .filter((g) => g.secenekler.length > 0);
}

/** Etkin seçim: yalnız gruplarda geçerli değerler. */
function etkinSecim(gs: readonly SuzgecGrubu[], secim: Readonly<Record<string, string>>): Map<SuzgecAlani, string[]> {
  const out = new Map<SuzgecAlani, string[]>();
  for (const g of gs) {
    const xs = gecerliDegerler(g, secim[g.anahtar]);
    if (xs.length > 0) out.set(g.anahtar as SuzgecAlani, xs);
  }
  return out;
}

/** Payın firma/işlem süzgecindeki değerleri. */
const payDegerleri = (p: FasonPayi, alan: "firma" | "islem"): readonly string[] => (alan === "firma" ? (p.firmaId ? [p.firmaId] : []) : p.islemler);

/**
 * Süzgeç (alan içinde VEYA, alanlar arası VE) + arama (her kelime satırın metninde; Türkçe katlamalı). Satırın firma
 * payları varsa firma/işlem süzgeci PAY düzeyinde uygulanır: satır seçime uyan en az bir payı varsa kalır ve Top/Metre'si
 * o payların toplamıdır (fabrikanın sayıları; metre binde bir tamsayıyla toplanır).
 */
export function fasonSuz(satirlar: readonly FasonSatiri[], gs: readonly SuzgecGrubu[], secim: Readonly<Record<string, string>>, ara: string): FasonSatiri[] {
  const e = etkinSecim(gs, secim);
  const payAlanlari = (["firma", "islem"] as const).filter((a) => e.has(a));
  const kelimeler = katla(ara).replace(/\s+/g, " ").trim().split(" ").filter(Boolean);
  return satirlar.flatMap((r): FasonSatiri[] => {
    const payli = r.paylar !== null && payAlanlari.length > 0;
    for (const [alan, xs] of e) {
      if (payli && (alan === "firma" || alan === "islem")) continue;
      if (!degerleri(r, alan).some((v) => xs.includes(v))) return [];
    }
    if (kelimeler.length > 0) {
      const metin = katla([r.isEmriNo, r.musteri, r.kumas, r.renk, r.firma, r.islem, ...r.siparisler].filter(Boolean).join(" "));
      if (!kelimeler.every((w) => metin.includes(w))) return [];
    }
    if (!payli) return [r];
    const uyan = r.paylar!.filter((p) => payAlanlari.every((a) => payDegerleri(p, a).some((v) => e.get(a)!.includes(v))));
    if (uyan.length === 0) return [];
    const mm = uyan.reduce((n, p) => n + Math.round(p.metre * 1000), 0);
    return [{ ...r, top: uyan.reduce((n, p) => n + p.top, 0), metre: mm / 1000 }];
  });
}

const SIRA_DEGERI: Readonly<Record<string, (r: FasonSatiri) => string | number | null>> = {
  firma: (r) => r.firma, musteri: (r) => r.musteri, kumas: (r) => kumasRenk(r), islem: (r) => r.islem, isEmri: (r) => r.isEmriNo,
  top: (r) => r.top, metre: (r) => r.metre, gun: (r) => r.gun,
};

/** Sıralama; seçim yoksa fasonda en uzun bekleyen önce (gün azalan), eşitlikte iş emri no. Boş değer hep sonda. */
export function fasonSirala(satirlar: readonly FasonSatiri[], s: Siralama | null): FasonSatiri[] {
  const alan = s && SIRA_DEGERI[s.alan] ? s.alan : "gun";
  const yon = s && SIRA_DEGERI[s.alan] ? (s.yon === "artan" ? 1 : -1) : -1;
  const f = SIRA_DEGERI[alan]!;
  return [...satirlar].sort((a, b) => {
    const x = f(a);
    const y = f(b);
    if (x === null || x === "—" || y === null || y === "—") {
      const xb = x === null || x === "—";
      const yb = y === null || y === "—";
      if (xb !== yb) return xb ? 1 : -1;
    } else {
      const c = typeof x === "number" && typeof y === "number" ? x - y : String(x).localeCompare(String(y), "tr");
      if (c !== 0) return c * yon;
    }
    return a.isEmriNo.localeCompare(b.isEmriNo, "tr");
  });
}

// ── Alt şerit ───────────────────────────────────────────────────────────────────────────────────────────────────
export interface AltToplam {
  /** "Fasonda" (süzgeçsiz) ya da "Süzülen". */
  readonly etiket: "Fasonda" | "Süzülen";
  /** null ⇒ bu kümede top/metre yazılmaz (yalnız iş emri adedi). */
  readonly top: number | null;
  readonly metre: number | null;
  readonly isEmri: number | null;
}

/**
 * Alt şeridin sayıları. `tam`: iş emri listesinin bütün sayfaları geldi mi (gelmediyse satır sayısı/toplamı yazılmaz).
 * Hesap yok: fabrikanın toplamı ya da satırların fabrika sayılarının toplamı (bkz. dosya başı).
 */
export function altToplam(p: {
  readonly anlik: unknown;
  readonly gruplar: readonly SuzgecGrubu[];
  readonly secim: Readonly<Record<string, string>>;
  readonly ara: string;
  readonly suzulen: readonly FasonSatiri[];
  readonly tam: boolean;
}): AltToplam | null {
  const a = anlikOku(p.anlik);
  const e = etkinSecim(p.gruplar, p.secim);
  const aramaVar = p.ara.trim() !== "";
  if (e.size === 0 && !aramaVar) {
    if (a.top === null) return p.tam ? { etiket: "Fasonda", top: null, metre: null, isEmri: p.suzulen.length } : null;
    return { etiket: "Fasonda", top: a.top, metre: a.metre, isEmri: a.isEmri };
  }
  const tek = e.size === 1 && !aramaVar ? [...e.entries()][0]! : null;
  if (tek && tek[1].length === 1) {
    const [alan, [deger]] = tek as [SuzgecAlani, [string]];
    if (alan === "firma" && a.firmalar.has(deger)) {
      const f = a.firmalar.get(deger)!;
      return { etiket: "Süzülen", top: f.top, metre: f.metre, isEmri: f.isEmri ?? (p.tam ? p.suzulen.length : null) };
    }
    if (alan === "islem" && a.kategoriler.has(deger)) {
      const k = a.kategoriler.get(deger)!;
      return { etiket: "Süzülen", top: k.top, metre: k.metre, isEmri: p.tam ? p.suzulen.length : null };
    }
  }
  if (!p.tam) return null;
  const firmaSuzgeci = e.has("firma") || e.has("islem");
  // Bölünmüş satır yalnız payı YOKSA engeldir (paylı satırın sayısı `fasonSuz`da seçime düşen paydır).
  const toplanir = p.suzulen.every((r) => r.top !== null && r.metre !== null) && !(firmaSuzgeci && p.suzulen.some((r) => r.firmaIdleri.length > 1 && r.paylar === null));
  if (!toplanir) return { etiket: "Süzülen", top: null, metre: null, isEmri: p.suzulen.length };
  return {
    etiket: "Süzülen",
    top: p.suzulen.reduce((n, r) => n + (r.top ?? 0), 0),
    metre: p.suzulen.reduce((n, r) => n + (r.metre ?? 0), 0),
    isEmri: p.suzulen.length,
  };
}

/** Rota parametrelerinden ön seçim (`/fason?firma=<id>` · `/fason?islem=<kod>`). */
export function rotaSecimi(p: { readonly firma?: string | string[]; readonly islem?: string | string[] }): Record<string, string> {
  const tek = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) || undefined;
  const firma = tek(p.firma);
  const islem = tek(p.islem);
  return { ...(firma ? { firma } : {}), ...(islem ? { islem } : {}) };
}
