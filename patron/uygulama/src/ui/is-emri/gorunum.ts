// İş emri satırının görünümü — SAF okuyucular. Aşama, sayılar ve kimlikler FABRİKANIN türettiği alanlardır; burada
// yalnız etikete çevrilir (yeniden hesap yok). Siparişsiz iş emri "Siparişsiz" yazar (+ iş emrinde müşteri varsa adı).
import { formatNumber } from "../../lib/format";
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

export const topSayisi = (k: Kayit): number | null => sayi(k.topSayisi);
export const metre = (k: Kayit): number | null => sayi(k.metre);
export const topMetni = (k: Kayit): string => {
  const t = topSayisi(k);
  return t === null ? "—" : formatNumber(t, 0);
};

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
