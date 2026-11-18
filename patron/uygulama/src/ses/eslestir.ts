// Sesli giriş — listeyle YAKLAŞIK eşleştirme (SAF). Söylenen sözcük aralığı, seçicinin kullandığı kayıtlarla
// (cari / ürün / renk: başlık + kod) karşılaştırılır. "Güçlü" eşleşme yalnız eşik üstü VE açık ara öndeyse sayılır;
// adım içi girişte güçlü eşleşme bile SESSİZCE seçilmez, yalnız en üstte vurgulanır (`alan.ts`).
import { benzerlik, govdeler, sozcuklere, sozcukBenzerligi, type Sozcuk } from "./metin";
import { sayiOku } from "./sayi";

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
/** Söylenen rakam dizisi kayıttaki rakam dizisiyle BİREBİR eşleşti ve söylenenin her sözcüğü karşılık buldu: taban skor. */
const RAKAM_TABANI = 0.9;
/** Noktalı tek harf kısaltması ("A.BEJ" içindeki "A") ↔ aynı harfle başlayan söz ("açık"). */
const KISALTMA_BENZERLIGI = 0.8;

/** Ad eşleştirmesi için sözcük: rakamlar kanonik, noktalı tek harf kısaltması işaretli. */
export interface AdSozcugu extends Sozcuk {
  readonly kisaltma?: boolean;
}

const rakamMi = (k: string) => /^\d/.test(k);

/**
 * Liste alanında (cari / ürün / renk) söylenen HER ŞEY addır — sayı dahil. Söz ve kayıt adı AYNI katlamadan geçer:
 * - Sayı sözcükleri rakama iner ("bin dört yüz otuz" → 1430, "elli beş" → 55, tek "bir" → 1, "sıfır bir" → 1).
 * - Rakam içi ayırıcı atılır ("1.430", "1,430", "14.30" → 1430); art arda rakamlar birleşir ("14 30", "14:30",
 *   "on dört otuz" → 1430; "30 bölü 1" → 301); baştaki sıfır düşer ("01" → 1).
 * - Harf+rakam bitişiği ayrılır ("V63" → v 63, "v10" → v 10); rakamdan önceki "ve"/"vi" → "v" (tanıma V harfini böyle yazar).
 * - Noktayla biten tek harf kısaltma işaretlenir ("A.BEJ" → a* bej); kısaltma sözlüğü YOK.
 * Miktar/termin bu katlamayı KULLANMAZ (`sozcuklere` + `sayiOku`).
 */
export function adSozcukleri(metin: string): AdSozcugu[] {
  const s: AdSozcugu[] = [];
  for (const w of sozcuklere(metin)) {
    const kisaltma = !w.sinir && /^\p{L}$/u.test(w.k) && w.son !== undefined && metin[w.son] === "." && /\p{L}/u.test(metin[w.son + 1] ?? "");
    if (!w.sinir && /\d/.test(w.k) && /\p{L}/u.test(w.k)) {
      for (const m of w.k.matchAll(/\d+|[^\d]+/g)) s.push({ k: m[0], o: m[0] });
      continue;
    }
    s.push(kisaltma ? { ...w, kisaltma: true } : w);
  }
  const sayisal = (i: number) => {
    const w = s[i];
    return !!w && !w.sinir && (rakamMi(w.k) || w.k === "bir" || sayiOku(s, i) !== null);
  };
  const out: AdSozcugu[] = [];
  const rakamEkle = (rakam: string, o: string) => {
    const onceki = out[out.length - 1];
    if (onceki && !onceki.sinir && rakamMi(onceki.k)) out[out.length - 1] = { k: onceki.k + rakam, o: `${onceki.o} ${o}` };
    else out.push({ k: rakam, o });
  };
  for (let i = 0; i < s.length; i++) {
    const w = s[i]!;
    if (w.sinir) {
      out.push(w);
      continue;
    }
    if (rakamMi(w.k)) {
      rakamEkle(w.k.replace(/\D/g, ""), w.o);
      continue;
    }
    if ((w.k === "ve" || w.k === "vi") && sayisal(i + 1)) {
      out.push({ k: "v", o: w.o });
      continue;
    }
    // "30 bölü 1": iki rakam arasındaki "bölü" yazımdaki "/" gibi atılır.
    if (w.k === "bolu" && out.length > 0 && rakamMi(out[out.length - 1]!.k) && sayisal(i + 1)) continue;
    const n = sayiOku(s, i);
    if (n && Number.isInteger(n.deger) && n.deger >= 0) {
      rakamEkle(String(n.deger), s.slice(i, n.son).map((x) => x.o).join(" "));
      i = n.son - 1;
      continue;
    }
    if (w.k === "bir") {
      rakamEkle("1", w.o);
      continue;
    }
    out.push(w);
  }
  return out.map((w) => (!w.sinir && rakamMi(w.k) ? { ...w, k: w.k.replace(/^0+(?=\d)/, "") } : w));
}

/** Bitişik karşılaştırmada rakamlar bulanık eşleşmez: iki taraftaki rakam dizileri aynı olmalı (1430 ≠ 1450). */
const rakamlar = (s: string) => (s.match(/\d+/g) ?? []).join(",");

interface Hazir {
  readonly aday: Aday;
  readonly sozler: readonly { k: string; w: number; kisaltma?: boolean }[];
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
    const sozler = adSozcukleri(aday.title)
      .filter((w) => !w.sinir)
      .map((w) => ({ k: w.k, w: GENEL.has(w.k) || rakamMi(w.k) ? GENEL_AGIRLIK : 1, ...(w.kisaltma ? { kisaltma: true } : {}) }));
    return {
      aday,
      sozler,
      toplamAgirlik: sozler.reduce((t, x) => t + x.w, 0) || 1,
      birlesik: sozler.map((x) => x.k).join(""),
      onekler: sozler.map((_, i) => sozler.slice(0, i + 1).map((x) => x.k).join("")).slice(1),
      kod: aday.kod ? adSozcukleri(aday.kod).filter((w) => !w.sinir).map((w) => w.k).join("").replace(/[^a-z0-9]/g, "") : null,
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
  let rakamEslesti = false;
  for (const k of aralik) {
    let en = 0;
    let hangi = -1;
    h.sozler.forEach((x, i) => {
      let b = sozcukBenzerligi(k, x.k);
      if (x.kisaltma && b < KISALTMA_BENZERLIGI && k.length >= 3 && !rakamMi(k) && k[0] === x.k) b = KISALTMA_BENZERLIGI;
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
    // Rakamlar yalnız birebir eşleşir (`sozcukBenzerligi`); birebir rakam eşleşmesi çok güçlü sinyaldir.
    if (rakamMi(k)) rakamEslesti = true;
  }
  // Yalnız kısaltma harfine bağlanan söz ("bej" → "B.BEYAZ"nın B'si) kayda bağlanmaz.
  if ([...eslesen].every((i) => h.sozler[i]?.kisaltma)) return 0;
  const kapsam = [...eslesen].reduce((t, i) => t + (h.sozler[i]?.w ?? 0), 0) / h.toplamAgirlik;
  const sk = (toplam / aralik.length) * (0.6 + 0.4 * Math.min(1, kapsam));
  return rakamEslesti ? Math.max(sk, RAKAM_TABANI) : sk;
}

/** Bitişik söylenmiş ad (ekli olabilir) ↔ adın tamamı ya da en az iki sözcüklük öneki; eşik 0,88. */
function bitisikSkor(bitisik: string, h: Hazir): number {
  let en = 0;
  for (const g of govdeler(bitisik)) {
    for (const hedef of [h.birlesik, ...h.onekler]) {
      if (rakamlar(g) !== rakamlar(hedef)) continue;
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
 * Sözcükler `adSozcukleri` ile katlanmış olmalı. Rakam aralığı da aranır (liste alanında sayı da addır: "1430");
 * yalnız ayırt etmeyen sözcüklerden oluşan aralık aranmaz. Eşit skorda uzun aralık, sonra erken konum kazanır.
 */
export function enIyiAralik(s: readonly Sozcuk[], kullanildi: readonly boolean[], liste: HazirListe, bas = 0, son = s.length): AralikSonucu | null {
  if (liste.length === 0) return null;
  let en: AralikSonucu | null = null;
  let enSkor = 0;
  for (let i = bas; i < son; i++) {
    for (let n = 1; n <= EN_UZUN_ARALIK && i + n <= son; n++) {
      const parca = s.slice(i, i + n);
      if (parca.some((w, j) => w.sinir || kullanildi[i + j])) break;
      if (parca.every((w) => !rakamMi(w.k) && genelMi(w.k))) continue;
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
