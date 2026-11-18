// Sevkiyat ekranının kart seçimi (2026-11-17, kullanıcı: "koyabildiğin her şeyi koy, biz eleriz"). SAF.
// Ortak model `tablo/kartSecimi`; seçim `tablo.sevkiyat` profil tercihinin `suzgec.kartlar` alanında (sütun seçimiyle aynı
// tercih, `useVeriTablosu`). Varsayılan: iki kart. Eski "Satırda göster" alanları 2026-11-19'dan beri tablonun sütunları
// (`./sutunlar`). Her değer `ozet.sevkiyat` döneminin kendi alanıdır; sevk sayıları BRÜT, burada hesap yok.
import { gorunurKartlar, kartDegistir, kartlariSifirla, type KartSecimi } from "../tablo/kartSecimi";
import type { TabloTercihi } from "../tablo/model";

export const SEVK_KARTLARI = [
  { key: "metre", label: "Sevk (brüt metre)" },
  { key: "top", label: "Sevk edilen top" },
  { key: "tamamlanan", label: "Tamamlanan sipariş" },
] as const;
export type SevkKartKey = (typeof SEVK_KARTLARI)[number]["key"];
export const SEVK_KART_SECIMI: KartSecimi<SevkKartKey> = { kartlar: SEVK_KARTLARI, varsayilan: ["metre", "top"], alan: "kartlar" };

export const sevkKartlari = (t: TabloTercihi): SevkKartKey[] => gorunurKartlar(SEVK_KART_SECIMI, t);
export const sevkKartDegistir = (t: TabloTercihi, k: SevkKartKey): TabloTercihi => kartDegistir(SEVK_KART_SECIMI, t, k);
export const sevkKartSifirla = (t: TabloTercihi): TabloTercihi => kartlariSifirla(SEVK_KART_SECIMI, t);
