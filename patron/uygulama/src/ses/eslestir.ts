// Sesli giriş — listeyle YAKLAŞIK eşleştirme (SAF). Söylenen sözcük aralığı, seçicinin kullandığı kayıtlarla
// (cari / ürün / renk: başlık + kod) karşılaştırılır. "Güçlü" eşleşme yalnız eşik üstü VE açık ara öndeyse sayılır;
// adım içi girişte güçlü eşleşme bile SESSİZCE seçilmez, yalnız en üstte vurgulanır (`alan.ts`).
import { benzerlik, govdeler, katla, sozcuklere, sozcukBenzerligi, type Sozcuk } from "./metin";

export interface Aday {
  readonly id: string;
  readonly title: string;
  readonly kod?: string;
  /** Ürünün fabrika birimi (`urun` projeksiyonu `birim`, ör. "MT", "KG"); diğer listelerde yok. */
  readonly birim?: string;
}

/** Alan sonucu: kesin değer · birden çok aday · bulunamadı. `duyulan` eşleşmede kullanılan söz. */
export type Alan<T> =
  | { readonly durum: "bulundu"; readonly deger: T; readonly duyulan: string }
  | { readonly durum: "adaylar"; readonly adaylar: readonly T[]; readonly duyulan: string }
  | { readonly durum: "bulunamadi"; readonly duyulan?: string; /** Neden yazılmadı (ör. geçmiş tarih). */ readonly neden?: string };

/** Ayırt etmeyen sözcükler (şirket türü, ölçü) eşleşme kapsamında az sayılır. */
const GENEL = new Set([
  "tekstil", "ltd", "sti", "limited", "sirketi", "san", "sanayi", "tic", "ticaret", "as", "insaat", "ith", "ihr",
  "ithalat", "ihracat", "pazarlama", "konfeksiyon", "ve", "cm", "mm", "gr", "m", "mt", "dis", "ic", "hazir", "giyim",
]);
const GENEL_AGIRLIK = 0.3;
/** Söylenen her sözcüğün kayıttaki bir sözcüğe en az bu kadar benzemesi gerekir. */
const SOZCUK_ESIGI = 0.75;
/** Kesin seçim eşiği ve ikinciyle en az fark. */
export const KESIN_ESIK = 0.7;
export const FARK = 0.12;
/** Aday listesine girme eşiği. */
export const ADAY_ESIK = 0.55;
const EN_COK_ADAY = 8;
const EN_UZUN_ARALIK = 4;

interface Hazir {
  readonly aday: Aday;
  readonly sozler: readonly { k: string; w: number }[];
  readonly toplamAgirlik: number;
  readonly birlesik: string;
  /** Adın bitişik önekleri ("ahmet", "ahmettekstil", …): tanıma adı bitiştirip türünü düşürdüğünde. */
  readonly onekler: readonly string[];
  readonly kod: string | null;
}

export type HazirListe = readonly Hazir[];

/** Kayıt listesini bir kez katlar (her eşleşmede yeniden katlanmasın). */
export function hazirla(adaylar: readonly Aday[]): HazirListe {
  return adaylar.map((aday) => {
    const sozler = sozcuklere(aday.title).filter((w) => !w.sinir).map((w) => ({ k: w.k, w: GENEL.has(w.k) || /^\d/.test(w.k) ? GENEL_AGIRLIK : 1 }));
    return {
      aday,
      sozler,
      toplamAgirlik: sozler.reduce((t, x) => t + x.w, 0) || 1,
      birlesik: sozler.map((x) => x.k).join(""),
      onekler: sozler.map((_, i) => sozler.slice(0, i + 1).map((x) => x.k).join("")).slice(1),
      kod: aday.kod ? katla(aday.kod).replace(/[^a-z0-9]/g, "") : null,
    };
  });
}

/** Söylenen aralığın kayda benzerliği (0–1). Aralığın HER sözcüğü kayıtta karşılık bulmalı. */
export function skor(aralik: readonly string[], h: Hazir): number {
  if (aralik.length === 0) return 0;
  const bitisik = aralik.join("");
  if (h.kod && h.kod.length >= 2 && bitisik === h.kod) return 1;
  let toplam = 0;
  const eslesen = new Set<number>();
  for (const k of aralik) {
    let en = 0;
    let hangi = -1;
    h.sozler.forEach((x, i) => {
      const b = sozcukBenzerligi(k, x.k);
      if (b > en || (b === en && !eslesen.has(i) && hangi >= 0 && eslesen.has(hangi))) {
        en = b;
        hangi = i;
      }
    });
    if (en < SOZCUK_ESIGI) {
      // Tanıma sözcükleri bitiştirmiş/ayırmış olabilir ("akıntekstil"): tüm ad bitişik karşılaştırılır.
      return bitisikSkor(bitisik, h);
    }
    toplam += en;
    eslesen.add(hangi);
  }
  const kapsam = [...eslesen].reduce((t, i) => t + (h.sozler[i]?.w ?? 0), 0) / h.toplamAgirlik;
  return (toplam / aralik.length) * (0.6 + 0.4 * Math.min(1, kapsam));
}

/** Bitişik söylenmiş ad (ekli olabilir) ↔ adın tamamı ya da en az iki sözcüklük öneki; eşik 0,88. */
function bitisikSkor(bitisik: string, h: Hazir): number {
  let en = 0;
  for (const g of govdeler(bitisik)) {
    for (const hedef of [h.birlesik, ...h.onekler]) {
      const fark = Math.abs(g.length - hedef.length) / Math.max(g.length, hedef.length, 1);
      if (fark > 0.12) continue;
      const b = benzerlik(g, hedef);
      // Önek eşleşmesi tam addan biraz düşük sayılır (kapsam eksik).
      const sk = hedef === h.birlesik ? b : b * 0.95;
      if (b >= 0.88 && sk > en) en = sk;
    }
  }
  return en;
}

/** Yalnız ayırt etmeyen sözcüklerden ("tekstil", "ltd") oluşan söz hiçbir kayda bağlanmaz. */
export function genelMi(k: string): boolean {
  return govdeler(k).some((g) => GENEL.has(g));
}

export interface Sirali {
  readonly aday: Aday;
  readonly skor: number;
}

function sirala(aralik: readonly string[], liste: HazirListe): Sirali[] {
  const out: Sirali[] = [];
  for (const h of liste) {
    const sk = skor(aralik, h);
    if (sk >= ADAY_ESIK) out.push({ aday: h.aday, skor: sk });
  }
  return out.sort((a, b) => b.skor - a.skor || a.aday.title.localeCompare(b.aday.title));
}

/** Sıralamadan karar: kesin · adaylar · bulunamadı. */
export function karar(sirali: readonly Sirali[], duyulan: string): Alan<Aday> {
  const [ilk, ikinci] = sirali;
  if (!ilk) return { durum: "bulunamadi", duyulan };
  if (ilk.skor >= KESIN_ESIK && (!ikinci || ilk.skor - ikinci.skor >= FARK)) return { durum: "bulundu", deger: ilk.aday, duyulan };
  const adaylar = sirali.filter((x) => x.skor >= ilk.skor - 0.2).slice(0, EN_COK_ADAY).map((x) => x.aday);
  return { durum: "adaylar", adaylar, duyulan };
}

export interface AralikSonucu {
  readonly bas: number;
  readonly son: number;
  readonly sirali: readonly Sirali[];
  readonly duyulan: string;
}

/**
 * `[bas, son)` içinde, kullanılmamış ve sınır içermeyen 1–4 sözcüklük aralıklardan listeye en iyi uyanı bulur.
 * Yalnız sayıdan oluşan aralık aranmaz (miktar/tarih kalsın). Eşit skorda uzun aralık, sonra erken konum kazanır.
 */
export function enIyiAralik(s: readonly Sozcuk[], kullanildi: readonly boolean[], liste: HazirListe, bas = 0, son = s.length): AralikSonucu | null {
  if (liste.length === 0) return null;
  let en: AralikSonucu | null = null;
  let enSkor = 0;
  for (let i = bas; i < son; i++) {
    for (let n = 1; n <= EN_UZUN_ARALIK && i + n <= son; n++) {
      const parca = s.slice(i, i + n);
      if (parca.some((w, j) => w.sinir || kullanildi[i + j])) break;
      if (parca.every((w) => /^\d/.test(w.k) || genelMi(w.k))) continue;
      const sirali = sirala(parca.map((w) => w.k), liste);
      const ust = sirali[0]?.skor ?? 0;
      if (ust > enSkor + 1e-9 || (en && Math.abs(ust - enSkor) <= 1e-9 && ust > 0 && n > en.son - en.bas)) {
        en = { bas: i, son: i + n, sirali, duyulan: parca.map((w) => w.o).join(" ") };
        enSkor = ust;
      }
    }
  }
  return en;
}
