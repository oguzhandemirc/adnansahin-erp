// Yerel (istemci) veri tablosu modeli — SAF (React yok). Kullanıcı kuralı 2026-11-20: "datatable olan her yerde tablo
// özelleştirilebilmeli ve arama ve filtre özelliği olmalı ve sütunlardan sıralama yapılabilmeli." Veri zaten telefonda
// TAM küme olan tablolar (anlık belge, kayıt içeriği, tamamı yüklenmiş liste, ekranın tanımlı penceresi) bu modelle
// süzülür/sıralanır. Sunucu sayfalı listeler BURAYA GİRMEZ (yarım kümeyi sıralamak yanlış sonuç verir): onlar
// `useVeriTablosu` ile sunucuya gider.
// Sıralama yalnız GÖSTERİM sırasıdır: sayı türetmez, toplama girmez. Sayı ve tarih metin olarak değil değer olarak
// karşılaştırılır; metin Türkçe (`localeCompare("tr")`, sayı duyarlı: "T2" < "T10"); boş değer ("—") her yönde SONDA.
import { katla } from "../../ses/metin";
import { gecerliDegerler, type Siralama, type SutunTanimi, type SuzgecGrubu, type SuzgecSecenegi } from "./model";

export type SiraDegeri = string | number | null;

export interface YerelSutun<R> extends SutunTanimi<R> {
  /**
   * Sıralama değeri. Verilmezse hücre metninden çıkarılır (`metinDegeri`: "1.234,5 m" → 1234.5, "29.09.2026" → tarih,
   * diğerleri metin). `false`: bu sütun sıralanmaz (gerekçesi tanımın yanında yazılır).
   */
  readonly siraDegeri?: ((r: R) => SiraDegeri) | false;
  /** Süzgeç alanı: `true` → hücre metni tek değer; fonksiyon → satırın değerleri (biri seçiliyse satır uyar). */
  readonly suzgec?: true | ((r: R) => readonly string[]);
  /** Süzgeç alanının etiketi (yoksa `ad ?? baslik`). */
  readonly suzgecEtiketi?: string;
  /** Arama dışı (ör. rozet sütunu metni zaten başka sütunda). Varsayılan: her sütunun hücre metni aranır. */
  readonly aranmaz?: boolean;
}

const BOS = new Set(["", "—", "-"]);
const TARIH = /^(\d{2})\.(\d{2})\.(\d{4})(?:\s+(\d{2}):(\d{2}))?/u;
const SAYI = /^(-?\d{1,3}(?:\.\d{3})*|-?\d+)(?:,(\d+))?(?=$|\s|%|\/)/u;

/**
 * Hücre metninden sıralama değeri: boş/"—" → null; "dd.MM.yyyy[ HH:mm]" → zaman damgası (sayı); Türkçe biçimli sayı
 * (binlik nokta, ondalık virgül, ardında birim olabilir: "1.234,5 m", "12 cm", "%40") → sayı; diğer her şey metin.
 * Tarih sayıdan ÖNCE denenir ("12.09.2026" bir sayı değildir).
 */
export function metinDegeri(metin: string): SiraDegeri {
  const m = metin.trim();
  if (BOS.has(m)) return null;
  const t = TARIH.exec(m);
  if (t) return Date.UTC(Number(t[3]), Number(t[2]) - 1, Number(t[1]), Number(t[4] ?? 0), Number(t[5] ?? 0));
  const yuzde = m.startsWith("%") ? m.slice(1) : m;
  const s = SAYI.exec(yuzde);
  if (s) return Number(`${s[1]!.replace(/\./g, "")}.${s[2] ?? "0"}`);
  return m;
}

/** Sütunun sıralama değeri okuyucusu; sıralanmayan sütunda null. */
export function siraOkuyucu<R>(c: YerelSutun<R>): ((r: R) => SiraDegeri) | null {
  if (c.siraDegeri === false) return null;
  if (c.siraDegeri) return c.siraDegeri;
  return (r) => metinDegeri(c.hucre(r));
}

/** Sıralanabilir sütun anahtarları (yerel tabloda sıralama alanı = sütun anahtarı). */
export const yerelSiralanabilir = <R>(sutunlar: readonly YerelSutun<R>[]): string[] => sutunlar.filter((c) => siraOkuyucu(c) !== null).map((c) => c.key);

const bosMu = (v: SiraDegeri): boolean => v === null || (typeof v === "string" && BOS.has(v.trim()));

/** İki değerin karşılaştırması (boşlar hariç): ikisi de sayıysa fark, değilse Türkçe sayı duyarlı metin. */
export function degerKarsilastir(x: string | number, y: string | number): number {
  if (typeof x === "number" && typeof y === "number") return x - y;
  return String(x).localeCompare(String(y), "tr", { numeric: true });
}

/**
 * Kararlı sıralama: seçim yoksa ya da sütun bilinmiyorsa satırların GELDİĞİ sıra (fabrikanın/ekranın varsayılanı) aynen
 * korunur. Boş değer her iki yönde sonda; eşitlikte geliş sırası.
 */
export function yerelSirala<R>(satirlar: readonly R[], sutunlar: readonly YerelSutun<R>[], s: Siralama | null): R[] {
  const c = s ? sutunlar.find((x) => x.key === s.alan) : undefined;
  const oku = c ? siraOkuyucu(c) : null;
  if (!s || !oku) return [...satirlar];
  const yon = s.yon === "artan" ? 1 : -1;
  const xs = satirlar.map((r, i) => ({ r, i, v: oku(r) }));
  xs.sort((a, b) => {
    const ab = bosMu(a.v);
    const bb = bosMu(b.v);
    if (ab || bb) return ab === bb ? a.i - b.i : ab ? 1 : -1;
    const k = degerKarsilastir(a.v as string | number, b.v as string | number);
    return k !== 0 ? k * yon : a.i - b.i;
  });
  return xs.map((x) => x.r);
}

const suzgecDegerleri = <R>(c: YerelSutun<R>, r: R): readonly string[] => {
  if (c.suzgec === true) {
    const v = c.hucre(r);
    return BOS.has(v.trim()) ? [] : [v];
  }
  return c.suzgec ? c.suzgec(r).filter((v) => !BOS.has(v.trim())) : [];
};

/**
 * Sütunlardan süzgeç alanları: her `suzgec` sütununun tekil değerleri (Türkçe, sayı duyarlı sıra), çoklu seçim. Tek
 * değerli alan çizilmez (seçecek bir şey yok) — ama saklı seçimi olan alan kalır (seçim kaldırılabilsin).
 */
export function sutunGruplari<R>(sutunlar: readonly YerelSutun<R>[], satirlar: readonly R[], secim: Readonly<Record<string, string>> = {}): SuzgecGrubu[] {
  const out: SuzgecGrubu[] = [];
  for (const c of sutunlar) {
    if (!c.suzgec) continue;
    const set = new Set<string>();
    for (const r of satirlar) for (const v of suzgecDegerleri(c, r)) if (!v.includes("\n")) set.add(v);
    const secenekler: SuzgecSecenegi[] = [...set].sort((a, b) => a.localeCompare(b, "tr", { numeric: true })).map((v) => ({ deger: v, etiket: v }));
    if (secenekler.length >= 2 || (secim[c.key] && secenekler.length > 0)) {
      out.push({ anahtar: c.key, etiket: c.suzgecEtiketi ?? c.ad ?? c.baslik, secenekler, coklu: true });
    }
  }
  return out;
}

/** Aramanın kelimeleri (Türkçe harf katlamalı; yerel ayarlı büyük/küçük çeviri yok). */
export const aramaKelimeleri = (ara: string): string[] => katla(ara).replace(/\s+/g, " ").trim().split(" ").filter(Boolean);

/**
 * Süzgeç (alan içinde VEYA, alanlar arası VE) + arama (her kelime satırın aranan metninde: bütün sütunların hücre
 * metni — gizli sütunlar dahil — ve `ekMetin`). Yalnız SEÇİM yapar; sayı türetmez.
 */
export function yerelSuz<R>(
  satirlar: readonly R[],
  sutunlar: readonly YerelSutun<R>[],
  gruplar: readonly SuzgecGrubu[],
  secim: Readonly<Record<string, string>>,
  ara: string,
  ekMetin?: (r: R) => string,
): R[] {
  const etkin = gruplar.flatMap((g) => {
    const c = sutunlar.find((x) => x.key === g.anahtar && x.suzgec);
    const xs = gecerliDegerler(g, secim[g.anahtar]);
    return c && xs.length > 0 ? [{ c, xs }] : [];
  });
  const kelimeler = aramaKelimeleri(ara);
  const aranan = sutunlar.filter((c) => !c.aranmaz);
  return satirlar.filter((r) => {
    for (const { c, xs } of etkin) if (!suzgecDegerleri(c, r).some((v) => xs.includes(v))) return false;
    if (kelimeler.length === 0) return true;
    const metin = katla([...aranan.map((c) => c.hucre(r)), ekMetin?.(r) ?? ""].join(" "));
    return kelimeler.every((w) => metin.includes(w));
  });
}

/**
 * Ortak (sunucu tablosuyla paylaşılan) sütun tanımlarını yerel tabloya uyarlar: `haric` sütunlar düşer (ör. tek carinin
 * tablosunda Müşteri), `suzgec` anahtarları hücre metniyle süzgeç alanı olur.
 */
export function yerelSutunlar<R>(tanimlar: readonly SutunTanimi<R>[], o: { readonly haric?: readonly string[]; readonly suzgec?: readonly string[] } = {}): YerelSutun<R>[] {
  return tanimlar.filter((c) => !o.haric?.includes(c.key)).map((c) => (o.suzgec?.includes(c.key) ? { ...c, suzgec: true as const } : c));
}

/** Saklı sütun seçiminden yalnız şu an tanımlı olanlar (sıra korunur); hiçbiri kalmazsa varsayılan. */
export function gorunurAnahtarlar(sakli: readonly string[], tanimli: readonly string[], varsayilan: readonly string[]): string[] {
  const xs = sakli.filter((k) => tanimli.includes(k));
  if (xs.length > 0) return xs;
  const v = varsayilan.filter((k) => tanimli.includes(k));
  return v.length > 0 ? v : tanimli.slice(0, 1);
}
