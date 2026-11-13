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
  /** Sayılar sağa yaslı ve tabular rakamlı. */
  readonly sayi?: boolean;
  /** Sunucu sıralama alanı (`LIST_SORT`); yoksa sütun sıralanamaz. */
  readonly sirala?: string;
  readonly hucre: (r: R) => string;
  /** Hücre metninin en çok satır sayısı (varsayılan 1); ayırt edici kısmı sonda olan adlar için 2. */
  readonly satir?: number;
  /** Metin yerine rozet gibi öğe (erişilebilirlik ve test yine `hucre` metnini kullanır). */
  readonly ogeler?: (r: R) => ReactNode;
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

/** Telefon dikeyde en çok 4 sütun (390 pt'de her sütun ≥ ~80 pt, kesik yazı yok); geniş ekranda 7. */
export const TELEFON_SUTUN = 4;
export const GENIS_SUTUN = 7;
export const azamiSutun = (genislik: number): number => (genislik >= 600 ? GENIS_SUTUN : TELEFON_SUTUN);

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
