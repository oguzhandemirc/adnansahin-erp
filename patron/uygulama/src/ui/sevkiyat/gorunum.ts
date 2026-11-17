// Sevkiyat ekranının kart ve satır alanı seçimi (2026-11-17, kullanıcı: "koyabildiğin her şeyi koy, biz eleriz"). SAF.
// Ortak model `tablo/kartSecimi`; seçim `tablo.sevkiyat` profil tercihinde (bulut anahtar listesinde vardı, kullanılmıyordu):
// kartlar `suzgec.kartlar`, satır alanları `suzgec.alanlar`. Varsayılan BUGÜNKÜ görünüm: iki kart, satırda ek alan yok.
// Her değer telin kendi alanıdır (`sevkiyat` kaydı / `ozet.sevkiyat` dönemi); sevk sayıları BRÜT, burada hesap yok.
import { formatDate, formatNumber } from "../../lib/format";
import { gorunurKartlar, kartDegistir, kartlariSifirla, type KartSecimi } from "../tablo/kartSecimi";
import { tercihiTemizle, type TabloTercihi } from "../tablo/model";

type Obj = Readonly<Record<string, unknown>>;
const sayiVar = (v: unknown) => (typeof v === "number" && Number.isFinite(v)) || (typeof v === "string" && v.trim() !== "");
const metin = (v: unknown) => (typeof v === "string" && v !== "" ? v : null);

export const SEVK_KARTLARI = [
  { key: "metre", label: "Sevk (brüt metre)" },
  { key: "top", label: "Sevk edilen top" },
  { key: "tamamlanan", label: "Tamamlanan sipariş" },
] as const;
export type SevkKartKey = (typeof SEVK_KARTLARI)[number]["key"];
export const SEVK_KART_SECIMI: KartSecimi<SevkKartKey> = { kartlar: SEVK_KARTLARI, varsayilan: ["metre", "top"], alan: "kartlar" };

/** Satırın ikinci satırına eklenebilen alanlar (tanım sırası = görünüm sırası). */
export const SEVK_ALANLARI = [
  { key: "top", label: "Top sayısı (brüt)", bicim: (k: Obj) => (sayiVar(k.topSayisi) ? `${formatNumber(k.topSayisi, 0)} top` : null) },
  { key: "cuval", label: "Çuval sayısı", bicim: (k: Obj) => (sayiVar(k.cuvalSayisi) ? `${formatNumber(k.cuvalSayisi, 0)} çuval` : null) },
  { key: "kg", label: "Toplam kg", bicim: (k: Obj) => (sayiVar(k.toplamKg) ? `${formatNumber(k.toplamKg, 0)} kg` : null) },
  { key: "fatura", label: "Fatura no", bicim: (k: Obj) => (metin(k.disFaturaNo) ? `Fatura ${metin(k.disFaturaNo)}` : null) },
  { key: "faturaTarihi", label: "Fatura tarihi", bicim: (k: Obj) => (metin(k.faturalanma) ? `Faturalandı ${formatDate(k.faturalanma)}` : null) },
  { key: "kayit", label: "Kayıt tarihi", bicim: (k: Obj) => (metin(k.olusturulma) ? `Kayıt ${formatDate(k.olusturulma)}` : null) },
  { key: "iptal", label: "İptal tarihi", bicim: (k: Obj) => (metin(k.iptalTarihi) ? `İptal ${formatDate(k.iptalTarihi)}` : null) },
] as const;
export type SevkAlanKey = (typeof SEVK_ALANLARI)[number]["key"];
export const SEVK_ALAN_SECIMI: KartSecimi<SevkAlanKey> = { kartlar: SEVK_ALANLARI, varsayilan: [], alan: "alanlar" };

const VARSAYILAN: TabloTercihi = { surum: 1, sutunlar: ["-"], siralama: null, suzgec: {} };
export const sevkTemizle = (ham: unknown): TabloTercihi => tercihiTemizle(ham, { varsayilan: VARSAYILAN, sutunlar: ["-"], azami: 1 });

export const sevkKartlari = (t: TabloTercihi): SevkKartKey[] => gorunurKartlar(SEVK_KART_SECIMI, t);
export const sevkKartDegistir = (t: TabloTercihi, k: SevkKartKey): TabloTercihi => kartDegistir(SEVK_KART_SECIMI, t, k);
export const sevkKartSifirla = (t: TabloTercihi): TabloTercihi => kartlariSifirla(SEVK_KART_SECIMI, t);
export const sevkAlanlari = (t: TabloTercihi): SevkAlanKey[] => gorunurKartlar(SEVK_ALAN_SECIMI, t);
export const sevkAlanDegistir = (t: TabloTercihi, k: SevkAlanKey): TabloTercihi => kartDegistir(SEVK_ALAN_SECIMI, t, k);
export const sevkAlanSifirla = (t: TabloTercihi): TabloTercihi => kartlariSifirla(SEVK_ALAN_SECIMI, t);

/** Seçili ek alanların metinleri (değeri gelmeyen alan atlanır — "0" uydurulmaz). */
export function sevkEkMetinleri(k: Obj, alanlar: readonly SevkAlanKey[]): string[] {
  return SEVK_ALANLARI.filter((a) => alanlar.includes(a.key)).flatMap((a) => {
    const v = a.bicim(k);
    return v ? [v] : [];
  });
}
