// Sesli giriş — ADIM İÇİ okuma (SAF; ağ, yapay zekâ, cihaz yok). Söylenen söz YALNIZ bulunulan adımın tek alanına
// uygulanır (2026-11-18, tek cümle kipi kaldırıldı): liste alanı (cari/ürün/renk) → en benzerden sıralı adaylar;
// miktar → sayı (ürün birimiyle uyuşmazsa yazılmaz, neden döner); termin → gün (geçmiş gün yazılmaz); not → aynen;
// yeni cari alanları (ad, il, vergi no, telefon, e-posta) → temizlenmiş metin. Hiçbir sonuç kendiliğinden seçilmez/gönderilmez.
import { fmtDayKey } from "../lib/factory-time";
import { enIyiAralik, karar, KESIN_ESIK, type Aday, type HazirListe, type Sirali } from "./eslestir";
import { katla, sozcuklere } from "./metin";
import { birimOku, miktarMetni, sayiOku, type Birim } from "./sayi";
import { tarihBul } from "./tarih";

export type { Aday } from "./eslestir";

export interface Listeler {
  readonly cari: HazirListe;
  readonly urun: HazirListe;
  readonly renk: HazirListe;
}
export type ListeAlani = keyof Listeler;

export interface AdaySonucu {
  /** Söylenen/düzeltilen metin (arama kutusunda görünür). */
  readonly duyulan: string;
  /** En benzerden başlayarak adaylar (en çok 8). */
  readonly sirali: readonly Sirali[];
  /** En üstteki aday güçlü ve tek mi (vurgu için; seçim YİNE kullanıcının dokunuşudur). */
  readonly guclu: boolean;
}

const EN_COK = 8;

/** Söz → listede en benzer adaylar. Boş/eşleşmesiz → boş `sirali`. */
export function adaySirala(metin: string, liste: HazirListe): AdaySonucu {
  const duyulan = metin.trim();
  if (!duyulan || liste.length === 0) return { duyulan, sirali: [], guclu: false };
  const r = enIyiAralik(sozcuklere(duyulan), [], liste);
  if (!r || r.sirali.length === 0) return { duyulan, sirali: [], guclu: false };
  return { duyulan, sirali: r.sirali.slice(0, EN_COK), guclu: karar(r.sirali, r.duyulan).durum === "bulundu" };
}

/** Sonuç zayıf mı (aday yok ya da en iyisi kesin eşiğin altında): "yeni cari oluştur" kısayolu öne çıkar. */
export function zayifMi(s: AdaySonucu): boolean {
  return (s.sirali[0]?.skor ?? 0) < KESIN_ESIK;
}

/** "Yok / geç / atla / boş": isteğe bağlı alanı (renk, teslim) boş bırak. */
export function atlaMi(metin: string): boolean {
  const s = sozcuklere(metin).filter((w) => !w.sinir);
  if (s.length === 0 || s.length > 3) return false;
  return s.some((w) => ["yok", "gec", "atla", "bos", "hayir", "istemiyorum", "farketmez", "gerek", "olmasin", "renksiz"].includes(w.k));
}

export type Okuma<T> = { readonly tamam: true; readonly deger: T } | { readonly tamam: false; readonly neden: string };

const tirnak = (s: string) => (s.trim() ? `“${s.trim()}”` : "Söylediğiniz");

/** Fabrika birim kodu ("MT", "m", "KG", "kilogram") → sesli birim; tanınmıyorsa null (denetlenmez). */
export function urunBirimi(kod: string | undefined | null): "metre" | "kg" | null {
  const k = katla(kod ?? "").replace(/[^a-z]/g, "");
  if (["m", "mt", "mtr", "metre"].includes(k)) return "metre";
  if (["kg", "kilo", "kilogram"].includes(k)) return "kg";
  return null;
}

const BIRIM_ADI: Readonly<Record<Birim, string>> = { metre: "metre", kg: "kilo", top: "top", adet: "adet" };

/**
 * Miktar sözü → forma yazılacak metin ("250", "2,5"). Top/adet ürün birimine çevrilemez; ürünün birimi biliniyorsa
 * ve söylenen birim (metre/kilo) farklıysa YAZILMAZ — neden döner.
 */
export function miktarOku(metin: string, birim: "metre" | "kg" | null): Okuma<string> {
  const s = sozcuklere(metin);
  for (let i = 0; i < s.length; i++) {
    const n = sayiOku(s, i);
    if (!n || n.deger <= 0) continue;
    const b = birimOku(s, n.son)?.birim ?? null;
    if (b === "top" || b === "adet") return { tamam: false, neden: `${BIRIM_ADI[b]} ürün birimine çevrilemez; miktarı ${birim === "kg" ? "kilo" : "metre"} olarak söyleyin.` };
    if (b && birim && b !== birim) return { tamam: false, neden: `Bu ürün ${BIRIM_ADI[birim]} ile giriliyor; ${BIRIM_ADI[b]} yazılmadı. Miktarı ${BIRIM_ADI[birim]} olarak söyleyin.` };
    return { tamam: true, deger: miktarMetni(n.deger) };
  }
  return { tamam: false, neden: `${tirnak(metin)} bir miktar olarak anlaşılmadı. Örnek: “iki yüz elli metre”.` };
}

/** Teslim sözü → "GG.AA.YYYY"; geçmiş gün YAZILMAZ. `bugun` fabrika günü `yyyy-MM-dd`. */
export function terminOku(metin: string, bugun: string): Okuma<string> {
  const t = tarihBul(sozcuklere(metin), bugun);
  if (!t) return { tamam: false, neden: `${tirnak(metin)} bir tarih olarak anlaşılmadı. Örnek: “cuma”, “yarın”, “25 Kasım”.` };
  if (t.gecmis || t.gun < bugun) return { tamam: false, neden: `Geçmiş bir gün (${fmtDayKey(t.gun)}); teslim tarihi yazılmadı.` };
  return { tamam: true, deger: fmtDayKey(t.gun, "") };
}

/** Rakam dizisi (vergi no, telefon): "sıfır beş yüz otuz iki …" → "0532…"; rakamla söylenen aynen. */
export function rakamDizisi(metin: string): string {
  const s = sozcuklere(metin);
  let out = "";
  for (let i = 0; i < s.length; i++) {
    const w = s[i]!;
    if (w.sinir) continue;
    if (/^\d/.test(w.k)) {
      out += w.k.replace(/\D/g, "");
      continue;
    }
    if (w.k === "sifir") {
      out += "0";
      continue;
    }
    const n = sayiOku(s, i);
    if (n && Number.isInteger(n.deger)) {
      out += String(n.deger);
      i = n.son - 1;
    } else if (w.k === "bir") out += "1";
  }
  return out;
}

/** E-posta sözü: "ahmet at gmail nokta com" → "ahmet@gmail.com" (Türkçe harf ASCII'ye iner). */
export function epostaOku(metin: string): string {
  return katla(metin)
    .replace(/\s+(at|et|kuyruklu a)\s+/g, "@")
    .replace(/\s*(nokta|dot)\s*/g, ".")
    .replace(/\s*(alt cizgi)\s*/g, "_")
    .replace(/\s*(tire)\s*/g, "-")
    .replace(/\s+/g, "");
}

/** Serbest metin (not, ad, il): fazla boşluk atılır, aynen kalır. */
export const serbestMetin = (metin: string) => metin.replace(/\s+/g, " ").trim();
