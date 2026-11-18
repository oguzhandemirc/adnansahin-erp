// Veri tablosu modeli — SAF (React yok): sütun tanımı, tercih şekli, sıralama döngüsü, sütun seçimi, süzgeç rozeti ve
// sunucu sorgusu. Süzme/sıralama/arama SUNUCUDA: buradaki tek iş tercihi sorgu parametresine çevirmektir.
import type { ReactNode } from "react";
import type { ListFilterOption, ListSearchSpec, ListSortDir } from "../../api/wire";

export interface Siralama {
  readonly alan: string;
  readonly yon: ListSortDir;
}

/** Profilde saklanan görünüm (sürümlü; tanınmayan alan okunurken düşer). `suzgec`: grup anahtarı → seçili değer. */
export interface TabloTercihi {
  readonly surum: 1;
  readonly sutunlar: readonly string[];
  readonly siralama: Siralama | null;
  readonly suzgec: Readonly<Record<string, string>>;
}

export interface SutunTanimi<R> {
  readonly key: string;
  /** Başlık şeridindeki kısa ad. */
  readonly baslik: string;
  /** Sütun seçicideki açık ad (yoksa `baslik`). */
  readonly ad?: string;
  /** Oranlı genişlik (flex); başlık ve satır AYNI ağırlığı kullanır → hizalı. */
  readonly agirlik: number;
  /** Sayı sütunu: rakamlar tabular (alt alta hizalı); hiza sayı olmasından bağımsızdır (varsayılan sol). */
  readonly sayi?: boolean;
  /** Başlık + hücre hizası (tek kaynak `sutunHizasi`); verilmezse SOLA (sayı da). */
  readonly hiza?: "sol" | "sag";
  /** Sunucu sıralama alanı (`LIST_SORT`); yoksa sütun sıralanamaz. */
  readonly sirala?: string;
  readonly hucre: (r: R) => string;
  /** Hücre metninin en çok satır sayısı (varsayılan 1); ayırt edici kısmı sonda olan adlar için 2. */
  readonly satir?: number;
  /** Metin yerine rozet gibi öğe (erişilebilirlik ve test yine `hucre` metnini kullanır). */
  readonly ogeler?: (r: R) => ReactNode;
  /**
   * KIRPILMAZ belge/kayıt numarası sütunu (sevk no, sipariş no, iş emri no, çuval no, top no, cari kodu, fatura no):
   * değer, numaranın fabrika biçimindeki en uzun gerçek uzunluğudur (karakter; ör. "SVK1811260034" → 13). Sütun hiçbir
   * genişlikte kırpılmaz ve üç noktayla kesilmez: hücrede satır sınırı yok, sütun daralmaz (`flexShrink: 0`), genişliği
   * `max(bu değer, görünen satırlardaki en uzun parça, başlık)` karakterden hesaplanır (`kirpilmazGenislik`). Sığmayınca
   * önce esnek sütunlar daralır/sarar, o da yetmezse tablo yatay kayar (`yatayGerekir`).
   */
  readonly kirpilmaz?: number;
  /** ÇİZİM ANINDA hesaplanır (`sutunlariOlc`), tanımda verilmez: kırpılmaz sütunun pt genişliği. */
  readonly genislik?: number;
}

export interface SuzgecSecenegi {
  readonly deger: string;
  readonly etiket: string;
}

export interface SuzgecGrubu {
  /** Ana süzgeç `ANA`; ek gruplar sunucudaki anahtarla. */
  readonly anahtar: string;
  readonly etiket: string;
  readonly secenekler: readonly SuzgecSecenegi[];
}

export const ANA = "ana";

/** Ekrana SIĞAN sütun: telefon dikeyde 4 (390 pt'de her sütun ≥ ~80 pt), geniş ekranda 7. Fazlası yatay kaydırılır. */
export const TELEFON_SUTUN = 4;
export const GENIS_SUTUN = 7;
export const siganSutun = (genislik: number): number => (genislik >= 600 ? GENIS_SUTUN : TELEFON_SUTUN);
/** Seçilebilecek en çok sütun (sığmayanlar yatay kaydırmayla görünür). */
export const AZAMI_SUTUN = 10;
export const azamiSutun = (_genislik?: number): number => AZAMI_SUTUN;
/** Yatay kipte sütun genişliği = ağırlık × birim (pt); kırpılmaz sütun hesaplanan genişliğinden dar olamaz. */
export const SUTUN_BIRIMI = 80;
export const sutunGenisligi = (c: { readonly agirlik: number; readonly genislik?: number; readonly kirpilmaz?: number }): number =>
  Math.max(Math.round(c.agirlik * SUTUN_BIRIMI), asgariGenislik(c) ?? 0);

/**
 * Kırpılmaz sütunun ölçüsü. Hücre yazısı 13 pt (`typography.footnote`), ilk sütunda kalın; numaralar tabular rakamlı.
 * Karakter başına 0,66 em: Roboto/SF kalın tabular rakam ≈ 0,56–0,62 em, büyük harf (S, V, K, C) ≈ 0,60–0,67 em → en
 * geniş karışık biçime pay. Üstüne hücre iç boşluğu (2 × 4) ve 4 pt yuvarlama payı. Sistem yazı büyütmesi hücrenin
 * `maxFontSizeMultiplier` (1,4) sınırına kadar çarpılır.
 */
export const HUCRE_PUNTO = 13;
export const KARAKTER_EM = 0.66;
export const HUCRE_IC_BOSLUK = 8;
export const OLCU_PAYI = 4;
export const AZAMI_YAZI_OLCEGI = 1.4;
export const kirpilmazGenislik = (karakter: number, yaziOlcegi = 1): number =>
  Math.ceil(karakter * HUCRE_PUNTO * KARAKTER_EM * Math.min(Math.max(yaziOlcegi, 1), AZAMI_YAZI_OLCEGI)) + HUCRE_IC_BOSLUK + OLCU_PAYI;
/** Kırpılmaz sütunun asgari genişliği (ölçülmemişse yalnız beyandan); kırpılmaz değilse yok. */
export const asgariGenislik = (c: { readonly genislik?: number; readonly kirpilmaz?: number }): number | undefined =>
  c.genislik ?? (c.kirpilmaz ? kirpilmazGenislik(c.kirpilmaz) : undefined);

/** Metnin bölünemez en uzun parçası (boşluk, virgül, satır sonunda sarılabilir): "SIP1, SIP2" → 4. */
export const enUzunParca = (metin: string): number => metin.split(/[\s,]+/u).reduce((a, p) => Math.max(a, [...p].length), 0);

/** Kırpılmaz sütunlara görünen satırlardan + başlıktan genişlik yazar; diğer sütunlar aynen döner. */
export function sutunlariOlc<R>(sutunlar: readonly SutunTanimi<R>[], satirlar: readonly R[], yaziOlcegi = 1): readonly SutunTanimi<R>[] {
  return sutunlar.map((c) => {
    if (!c.kirpilmaz) return c;
    let karakter = Math.max(c.kirpilmaz, enUzunParca(c.baslik));
    for (const r of satirlar) karakter = Math.max(karakter, enUzunParca(c.hucre(r)));
    return { ...c, genislik: kirpilmazGenislik(karakter, yaziOlcegi) };
  });
}

/** Esnek (kırpılabilir) sütunun oranlı kipte inebileceği en dar genişlik; bunun altında tablo yatay kayar. */
export const ESNEK_ASGARI = 56;
/** Satırın iki yan kenarı (`VeriTablosu` `KENAR` × 2) + tablo kartının çerçevesi. */
export const SATIR_KENARI = 10;

/**
 * Tablo yatay kayar mı: görünür sütun sayısı ekrana sığandan fazlaysa YA DA kırpılmaz sütunların genişliği + esnek
 * sütunların asgarisi kullanılabilir genişliğe sığmıyorsa. Sütun seçimi KORUNUR — sütun gizlenmez, tablo kayar.
 */
export function yatayGerekir(sutunlar: readonly { readonly genislik?: number; readonly kirpilmaz?: number }[], kullanilabilir: number, ekran: number): boolean {
  if (sutunlar.length > siganSutun(ekran)) return true;
  const gerekli = sutunlar.reduce((a, c) => a + (asgariGenislik(c) ?? ESNEK_ASGARI), 0) + SATIR_KENARI;
  return gerekli > kullanilabilir;
}

/**
 * Sütunun hizası: başlık ve hücre bunu okur (birebir aynı). Kullanıcı kararı 2026-11-18 ("hepsini sola al"): her
 * liste/tablo sütunu SOLA dayalıdır, sayı sütunu da (rakamlar `tabular-nums` ile alt alta hizalı kalır). Sağa yaslamak
 * isteyen sütun `hiza: "sag"` verir.
 */
export const sutunHizasi = (c: { readonly hiza?: "sol" | "sag" }): "sol" | "sag" => c.hiza ?? "sol";

/** Başlığa dokununca: başka sütun → artan; artan → azalan; azalan → kapalı (sunucunun varsayılan sırası). */
export function sonrakiSiralama(simdiki: Siralama | null, alan: string): Siralama | null {
  if (!simdiki || simdiki.alan !== alan) return { alan, yon: "artan" };
  if (simdiki.yon === "artan") return { alan, yon: "azalan" };
  return null;
}

/** Göster/gizle: son görünür sütun gizlenemez; azamiye ulaşınca yenisi eklenmez. */
export function sutunDegistir(sutunlar: readonly string[], key: string, azami: number): readonly string[] {
  if (sutunlar.includes(key)) return sutunlar.length <= 1 ? sutunlar : sutunlar.filter((k) => k !== key);
  return sutunlar.length >= azami ? sutunlar : [...sutunlar, key];
}

/** Görünür sütunu bir sıra öne/arkaya taşır (sınırda değişmez). */
export function sutunTasi(sutunlar: readonly string[], key: string, yon: -1 | 1): readonly string[] {
  const i = sutunlar.indexOf(key);
  const j = i + yon;
  if (i < 0 || j < 0 || j >= sutunlar.length) return sutunlar;
  const out = [...sutunlar];
  [out[i], out[j]] = [out[j]!, out[i]!];
  return out;
}

export function etkinSuzgecSayisi(suzgec: Readonly<Record<string, string>>): number {
  return Object.values(suzgec).filter((v) => v !== "").length;
}

/** Grupta seçim: aynı değere yeniden dokunmak seçimi kaldırır ("Tümü"). */
export function suzgecSec(suzgec: Readonly<Record<string, string>>, grup: string, deger: string | null): Readonly<Record<string, string>> {
  const out: Record<string, string> = { ...suzgec };
  if (deger === null || out[grup] === deger) delete out[grup];
  else out[grup] = deger;
  return out;
}

/** Sunucunun beyanından süzgeç grupları (ana + ek); `haric` alanlardaki seçenek çizilmez (ör. gecikme). */
export function gruplar(spec: ListSearchSpec | null, cokluSuzgec: boolean, haric: readonly string[] = []): SuzgecGrubu[] {
  if (!spec) return [];
  const sec = (xs: readonly ListFilterOption[]) =>
    xs.filter((o) => !haric.includes(o.alan)).map((o) => ({ deger: o.deger, etiket: o.etiket }));
  const out: SuzgecGrubu[] = [];
  if (spec.suzgec) out.push({ anahtar: ANA, etiket: spec.suzgec.etiket, secenekler: sec(spec.suzgec.secenekler) });
  // Çoklu süzgeci yalnız `liste.siralama` beyan eden sunucu kabul eder; eski sunucuda yalnız ana grup.
  if (cokluSuzgec) for (const g of spec.ekSuzgecler ?? []) out.push({ anahtar: g.anahtar, etiket: g.etiket, secenekler: sec(g.secenekler) });
  return out.filter((g) => g.secenekler.length > 0);
}

export interface SunucuSorgusu {
  readonly ara?: string;
  readonly suzgec?: string;
  readonly sirala?: string;
  readonly yon?: ListSortDir;
}

/**
 * Tercih → sunucu parametreleri. Grup sırası beyandaki sıradır (anahtar kararlı → saklı kopya anahtarı kararlı); bilinmeyen
 * grup/değer gönderilmez (sunucu 400 verirdi). Sıralama yalnız sunucu o alanı beyan ettiyse.
 */
export function sunucuSorgusu(t: TabloTercihi, ara: string, gs: readonly SuzgecGrubu[], siralanabilir: readonly string[]): SunucuSorgusu {
  const degerler = gs.flatMap((g) => {
    const v = t.suzgec[g.anahtar];
    return v && g.secenekler.some((o) => o.deger === v) ? [v] : [];
  });
  const sirali = t.siralama && siralanabilir.includes(t.siralama.alan) ? t.siralama : null;
  return {
    ...(ara.trim() ? { ara: ara.trim() } : {}),
    ...(degerler.length > 0 ? { suzgec: degerler.join(",") } : {}),
    ...(sirali ? { sirala: sirali.alan, yon: sirali.yon } : {}),
  };
}

/** Saklı (yerel ya da profil) değeri güvenle okur: bilinmeyen sütun/grup/değer düşer, boş kalan sütun listesi varsayılana döner. */
export function tercihiTemizle(ham: unknown, o: { readonly varsayilan: TabloTercihi; readonly sutunlar: readonly string[]; readonly azami: number; readonly gruplar?: readonly SuzgecGrubu[] }): TabloTercihi {
  if (typeof ham !== "object" || ham === null || Array.isArray(ham)) return o.varsayilan;
  const h = ham as Record<string, unknown>;
  const sut = Array.isArray(h.sutunlar) ? h.sutunlar.filter((k, i, a): k is string => typeof k === "string" && o.sutunlar.includes(k) && a.indexOf(k) === i).slice(0, o.azami) : [];
  const s = h.siralama as Record<string, unknown> | null | undefined;
  const siralama: Siralama | null = s && typeof s.alan === "string" && (s.yon === "artan" || s.yon === "azalan") ? { alan: s.alan, yon: s.yon } : null;
  const suzgec: Record<string, string> = {};
  if (typeof h.suzgec === "object" && h.suzgec !== null && !Array.isArray(h.suzgec)) {
    for (const [g, v] of Object.entries(h.suzgec as Record<string, unknown>)) {
      if (typeof v !== "string") continue;
      // Gruplar henüz bilinmiyorsa (yetenek gelmeden) değer korunur; sorgu yine yalnız bilinenleri gönderir.
      if (o.gruplar && !o.gruplar.some((x) => x.anahtar === g && x.secenekler.some((y) => y.deger === v))) continue;
      suzgec[g] = v;
    }
  }
  return { surum: 1, sutunlar: sut.length > 0 ? sut : o.varsayilan.sutunlar.slice(0, o.azami), siralama, suzgec };
}
