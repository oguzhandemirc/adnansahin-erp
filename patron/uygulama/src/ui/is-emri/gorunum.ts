// İş emri satırının görünümü — SAF okuyucular. Aşama, sayılar ve kimlikler FABRİKANIN türettiği alanlardır; burada
// yalnız etikete çevrilir (yeniden hesap yok). Siparişsiz iş emri "Siparişsiz" yazar (+ iş emrinde müşteri varsa adı).
import { formatDate, formatNumber } from "../../lib/format";
import { WORK_ORDER_STATUS, WORK_ORDER_TYPE } from "../../lib/labels/uretim";
import type { IconName } from "../icons";
import type { IconTileTone } from "../ortak";

export type Kayit = Readonly<Record<string, unknown>>;

const metin = (v: unknown): string | null => (typeof v === "string" && v.trim() !== "" ? v : null);
const sayi = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : typeof v === "string" && /^-?\d+(\.\d+)?$/.test(v) ? Number(v) : null);
const metinDizisi = (v: unknown): string[] => (Array.isArray(v) ? v.filter((x): x is string => typeof x === "string" && x !== "") : []);

/** Fabrikanın `asama` kodu → kısa etiket (liste hücresi ve süzgeç çipiyle aynı dil). */
export const ASAMA_ETIKET: Readonly<Record<string, string>> = {
  fason: "Fasonda",
  kursun: "Kurşun",
  tambur: "Tambur",
  kk1: "Giriş kalite",
  diger: "Diğer",
};

/** Aşama sayısı satırları (`asamaTop[].anahtar`) → etiket + simge; sıra fabrikanın gönderdiği sıradır. */
export const ASAMA_SATIRI: Readonly<Record<string, { readonly etiket: string; readonly icon: IconName; readonly ton: IconTileTone }>> = {
  fason: { etiket: "Fasonda", icon: "color-fill-outline", ton: "orange" },
  kursun: { etiket: "Kurşun + KK2", icon: "scan-outline", ton: "violet" },
  tambur: { etiket: "Tambur", icon: "disc-outline", ton: "rose" },
  depo: { etiket: "Depoda", icon: "cube-outline", ton: "green" },
  sevkEdildi: { etiket: "Sevk edildi", icon: "paper-plane-outline", ton: "sky" },
  diger: { etiket: "Diğer (giriş, bekleyen)", icon: "ellipsis-horizontal", ton: "blue" },
};

export const isEmriNo = (k: Kayit): string => metin(k.isEmriNo) ?? "—";
export const siparisNolari = (k: Kayit): string[] => metinDizisi(k.siparisNolari);
export const siparisIdleri = (k: Kayit): string[] => metinDizisi(k.siparisIdleri);
export const siparissiz = (k: Kayit): boolean => Array.isArray(k.siparisIdleri) && siparisIdleri(k).length === 0;
export const acik = (k: Kayit): boolean => k.acik !== false;

/** "Kimin malı": müşteri adı; siparişsizse "Siparişsiz" (+ ad). Alan hiç gelmediyse (eski fabrika) "—". */
export function musteriMetni(k: Kayit): string {
  const ad = metin(k.musteriAdi);
  if (siparissiz(k)) return ad ? `${ad} (siparişsiz)` : "Siparişsiz";
  return ad ?? "—";
}

export function kumasMetni(k: Kayit): string {
  const urun = metin(k.urunAdi);
  const renk = metin(k.renkAdi);
  return [urun, renk].filter(Boolean).join(" · ") || "—";
}

export function asamaMetni(k: Kayit): string {
  if (!acik(k)) return "Kapandı";
  const a = metin(k.asama);
  return a ? (ASAMA_ETIKET[a] ?? "Diğer") : "—";
}

/** İptal edilmiş ya da devredilmiş (tüm topları başka iş emrine geçmiş) iş emri: siparişin iş emri listesinde çizilmez. */
export const iptalMi = (k: Kayit): boolean => k.durum === "CANCELLED" || k.durum === "SUPERSEDED";

/** "Şu an nerede": açıkta kaba aşama (fasondaysa "Fasonda – <firma>"), kapalıda tamamlandıysa "Tamamlandı". */
export function yerMetni(k: Kayit): string {
  if (!acik(k)) return k.durum === "COMPLETED" ? "Tamamlandı" : "Kapandı";
  const firma = metin(k.fasonFirmaAdi);
  if (k.asama === "fason" && firma) return `Fasonda – ${firma}`;
  return asamaMetni(k);
}

export const topSayisi = (k: Kayit): number | null => sayi(k.topSayisi);
export const metre = (k: Kayit): number | null => sayi(k.metre);
export const topMetni = (k: Kayit): string => {
  const t = topSayisi(k);
  return t === null ? "—" : formatNumber(t, 0);
};

/** "18 top · 2.160 m"; alan gelmediyse o parça yok, ikisi de yoksa "—". */
export function topMetreMetni(k: Kayit): string {
  const t = topSayisi(k);
  const m = metre(k);
  return [t === null ? null : `${formatNumber(t, 0)} top`, m === null ? null : `${formatNumber(m, 0)} m`].filter(Boolean).join(" · ") || "—";
}

export interface AsamaSayisi {
  readonly anahtar: string;
  readonly etiket: string;
  readonly icon: IconName;
  readonly ton: IconTileTone;
  readonly top: number;
  readonly metre: number | null;
}

/** Aşama başına sayılar: sıfır satır çizilmez; bilinmeyen anahtar "Diğer" görünümüyle kendi adını taşır. */
export function asamaSayilari(k: Kayit): AsamaSayisi[] {
  if (!Array.isArray(k.asamaTop)) return [];
  return k.asamaTop.flatMap((x: unknown) => {
    if (typeof x !== "object" || x === null) return [];
    const a = x as Kayit;
    const anahtar = metin(a.anahtar);
    const top = sayi(a.top);
    if (!anahtar || top === null || top <= 0) return [];
    const g = ASAMA_SATIRI[anahtar] ?? { ...ASAMA_SATIRI.diger!, etiket: anahtar };
    return [{ anahtar, etiket: g.etiket, icon: g.icon, ton: g.ton, top, metre: sayi(a.metre) }];
  });
}

/** Fasona gidişten bu yana tam gün (termin/gecikme DEĞİL, yalnız bilgi); tarih yoksa null. */
export function fasonGunu(k: Kayit, simdi: number = Date.now()): number | null {
  const t = metin(k.fasonGonderim);
  if (!t) return null;
  const ms = Date.parse(t);
  if (!Number.isFinite(ms)) return null;
  return Math.max(0, Math.floor((simdi - ms) / 86_400_000));
}

export const gunMetni = (gun: number): string => (gun === 0 ? "bugün gitti" : `${formatNumber(gun, 0)} gündür`);

/** Kapanan süzgeci "son 30 gün": kapanış tarihi pencerenin içinde mi (tarih yoksa dışarıda). */
export const KAPANAN_GUN = 30;
export function sonOtuzGunde(k: Kayit, simdi: number = Date.now()): boolean {
  const t = metin(k.kapanisTarihi);
  const ms = t ? Date.parse(t) : NaN;
  return Number.isFinite(ms) && simdi - ms <= KAPANAN_GUN * 86_400_000;
}

// ── Konum listesi ve ayrıntı (Üretimdeki toplar nerede?) ─────────────────────────────────────────────────────────
// "Sipariş" İŞ EMRİNİN siparişidir (top↔sipariş bağı yok; karşılama sevk anında): ilk no + "+N"; bağsız "Siparişsiz (stok)".

export const NO_ORDER_TEXT = "Siparişsiz (stok)";

/** Liste hücresi: ilk sipariş no (+N); bağsızsa "Siparişsiz (stok)"; alan hiç gelmediyse "—". */
export function orderCell(k: Kayit): string {
  if (siparissiz(k)) return NO_ORDER_TEXT;
  const nos = siparisNolari(k);
  if (nos.length === 0) return "—";
  return nos.length === 1 ? nos[0]! : `${nos[0]!} +${nos.length - 1}`;
}

/** Konum listesinin müşteri hücresi: ad; siparişsiz ve adsızsa "—" (sipariş hücresi zaten "Siparişsiz (stok)" der). */
export const customerCell = (k: Kayit): string => metin(k.musteriAdi) ?? "—";

/** Bu konumdaki top · metre (`asamaTop` satırı; fabrikanın sayısı). Satır yoksa iş emrinin toplamı. */
export function stageAmount(k: Kayit, stage: string | null): { readonly top: number | null; readonly metre: number | null } {
  if (stage && Array.isArray(k.asamaTop)) {
    const row = k.asamaTop.find((x: unknown) => typeof x === "object" && x !== null && (x as Kayit).anahtar === stage) as Kayit | undefined;
    if (row) return { top: sayi(row.top), metre: sayi(row.metre) };
  }
  return { top: topSayisi(k), metre: metre(k) };
}

/** Konumda "N gündür": yalnız fasonda (gönderimden bu yana); kurşun/tamburda bugünkü veride gün yok → null. */
export function locationDays(k: Kayit, stage: string | null, simdi: number = Date.now()): string | null {
  if (stage !== "fason" && k.asama !== "fason") return null;
  const g = fasonGunu(k, simdi);
  return g === null ? null : gunMetni(g);
}

const m0 = (v: unknown): string | null => (sayi(v) === null ? null : `${formatNumber(sayi(v), 0)} m`);

// ── Liste hücreleri (panel eşliği) ──
export const meterCell = (v: unknown): string => (sayi(v) === null ? "—" : formatNumber(sayi(v), 0));
export const typeLabel = (k: Kayit): string => (metin(k.tur) ? (WORK_ORDER_TYPE[k.tur as string] ?? (k.tur as string)) : "—");
export const statusLabelOf = (k: Kayit): string => (metin(k.durum) ? (WORK_ORDER_STATUS[k.durum as string]?.label ?? (k.durum as string)) : "—");
/** Panelin "Fason" sütunu: en çok topu olan firma (+N firma); fasonda değilse "—". */
export function fasonFirmCell(k: Kayit): string {
  const ad = metin(k.fasonFirmaAdi);
  if (!ad) return "—";
  const n = metinDizisi(k.fasonFirmaIdleri).length;
  return n > 1 ? `${ad} +${n - 1}` : ad;
}
/** Panelin "İlerleme"si yüzde çizer; burada yüzde HESAPLANMAZ — fabrikanın iki sayısı yan yana ("470 / 2.200"). */
export function progressCell(k: Kayit): string {
  const u = sayi(k.uretilenMetre);
  const g = sayi(k.girenMetre);
  if (u === null && g === null) return "—";
  return `${u === null ? "—" : formatNumber(u, 0)} / ${g === null ? "—" : formatNumber(g, 0)}`;
}

/** "Üretim ayrıntıları" satırları: yalnız fabrikanın gönderdiği alanlar (gelmeyen satır çizilmez). */
export function detailRows(k: Kayit): { key: string; etiket: string; deger: string }[] {
  const tur = metin(k.tur);
  const durum = metin(k.durum);
  const en = sayi(k.en);
  const kat = metinDizisi(k.fasonKategoriler);
  return [
    { key: "no", etiket: "İş emri no", deger: isEmriNo(k) },
    tur ? { key: "tur", etiket: "Tür", deger: WORK_ORDER_TYPE[tur] ?? tur } : null,
    durum ? { key: "durum", etiket: "Durum", deger: WORK_ORDER_STATUS[durum]?.label ?? durum } : null,
    metin(k.olusturulma) ? { key: "acilis", etiket: "Açılış", deger: formatDate(k.olusturulma) } : null,
    !acik(k) && metin(k.kapanisTarihi) ? { key: "kapanis", etiket: "Kapanış", deger: formatDate(k.kapanisTarihi) } : null,
    m0(k.hedefMiktar) ? { key: "hedef", etiket: "Hedef", deger: m0(k.hedefMiktar)! } : null,
    en !== null ? { key: "en", etiket: "En", deger: `${formatNumber(en, 0)} cm` } : null,
    m0(k.siparisMetre) ? { key: "siparisMetre", etiket: "Sipariş metresi", deger: m0(k.siparisMetre)! } : null,
    m0(k.girenMetre) ? { key: "giren", etiket: "Giren", deger: m0(k.girenMetre)! } : null,
    m0(k.uretilenMetre) ? { key: "uretilen", etiket: "Üretilen", deger: m0(k.uretilenMetre)! } : null,
    { key: "toplam", etiket: "Toplam", deger: topMetreMetni(k) },
    kat.length > 0 ? { key: "fasonIs", etiket: "Fason işi", deger: kat.join(", ") } : null,
  ].filter((x): x is { key: string; etiket: string; deger: string } => x !== null);
}

/** Konum listesi satırının görünen metinleri — kart, tablo, erişilebilirlik ve test aynı kaynaktan. */
export function locationRowText(k: Kayit, stage: string | null, simdi: number = Date.now()) {
  const m = stageAmount(k, stage);
  const n = (v: number | null) => (v === null ? "—" : formatNumber(v, 0));
  return { musteri: customerCell(k), kumas: kumasMetni(k), top: n(m.top), metre: n(m.metre), siparis: orderCell(k), gun: locationDays(k, stage, simdi) };
}

/** "Nerede" cümlesi: açıkta aşama; fasondaysa firma (+N firma); kapalıda "Tamamlandı"/"Kapandı". */
export function whereText(k: Kayit): string {
  if (!acik(k)) return yerMetni(k);
  const firma = metin(k.fasonFirmaAdi);
  const firmalar = metinDizisi(k.fasonFirmaIdleri).length;
  const kat = metinDizisi(k.fasonKategoriler);
  const yer = kat.length > 0 && kat.every((x) => /boyahane/i.test(x)) ? "Boyahanede" : "Fasonda";
  if (k.asama === "fason" && firma) return `${yer} – ${firma}${firmalar > 1 ? ` +${firmalar - 1}` : ""}`;
  return k.asama === "kursun" ? "Kurşun + KK2" : asamaMetni(k);
}
