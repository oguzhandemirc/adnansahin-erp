// Siparişler ekranı ve sipariş ayrıntısının kart/satır seçimi (2026-11-17, kullanıcı: "koyabildiğin her şeyi koy, biz
// eleriz"). SAF. Ortak model `tablo/kartSecimi`: varsayılan küme BUGÜNKÜ görünümdür; sonradan eklenenler seçicide KAPALI.
// Liste kartları `tablo.siparis` tercihinin `suzgec.kartlar` alanında (sunucu sorgusu yalnız bilinen süzgeç gruplarını
// gönderir; bu alan gitmez). Ayrıntı seçimi CİHAZDA (`useCihazTercihi`): aynı bulut anahtarını iki ekran yazsaydı
// birbirinin alanını ezerdi. Her değer telin kendi alanıdır; burada hesap yok.
import { gorunurKartlar, kartDegistir, kartlariSifirla, type KartSecimi } from "../tablo/kartSecimi";
import { tercihiTemizle, type TabloTercihi } from "../tablo/model";

// ---------------------------------------------------------------- liste: özet kartları (`ozet.siparis`)
export const SIPARIS_KARTLARI = [
  { key: "acik", label: "Açık kalem" },
  { key: "miktar", label: "Açık miktar" },
  { key: "karsilanma", label: "Karşılanma" },
  { key: "karsilanmayan", label: "Karşılanmayan miktar" },
  { key: "enCokCari", label: "En çok açık siparişi olan müşteriler" },
] as const;
export type SiparisKartKey = (typeof SIPARIS_KARTLARI)[number]["key"];

export const SIPARIS_KART_SECIMI: KartSecimi<SiparisKartKey> = {
  kartlar: SIPARIS_KARTLARI,
  varsayilan: ["acik", "miktar", "karsilanma"],
  alan: "kartlar",
};
export const siparisKartlari = (t: TabloTercihi): SiparisKartKey[] => gorunurKartlar(SIPARIS_KART_SECIMI, t);
export const siparisKartDegistir = (t: TabloTercihi, k: SiparisKartKey): TabloTercihi => kartDegistir(SIPARIS_KART_SECIMI, t, k);
export const siparisKartSifirla = (t: TabloTercihi): TabloTercihi => kartlariSifirla(SIPARIS_KART_SECIMI, t);

// ---------------------------------------------------------------- ayrıntı: kartlar + bilgi satırları (tek seçici)
export const DETAY_OGELERI = [
  { key: "kartAcik", label: "Kart: Açık miktar" },
  { key: "kartSevk", label: "Kart: Sevk edilen (brüt)" },
  { key: "kartToplam", label: "Kart: Sipariş toplamı" },
  { key: "kartKalem", label: "Kart: Kalem sayısı" },
  { key: "sube", label: "Şube" },
  { key: "sevk", label: "Sevk edilen / toplam" },
  { key: "tarih", label: "Sipariş tarihi" },
  { key: "termin", label: "Termin" },
  { key: "yon", label: "Sevk yönü" },
  { key: "uretim", label: "Üretim" },
  { key: "doviz", label: "Para birimi" },
  { key: "tamam", label: "Tamamlanma" },
  { key: "iptal", label: "İptal tarihi" },
  { key: "kayit", label: "Kayıt tarihi" },
] as const;
export type DetayKey = (typeof DETAY_OGELERI)[number]["key"];

export const DETAY_SECIMI: KartSecimi<DetayKey> = {
  kartlar: DETAY_OGELERI,
  varsayilan: ["kartAcik", "sube", "sevk", "tarih", "termin", "yon", "uretim", "doviz", "tamam", "iptal"],
  alan: "ogeler",
};
const DETAY_VARSAYILAN: TabloTercihi = { surum: 1, sutunlar: ["-"], siralama: null, suzgec: {} };
export const detayTemizle = (ham: unknown): TabloTercihi => tercihiTemizle(ham, { varsayilan: DETAY_VARSAYILAN, sutunlar: ["-"], azami: 1 });
export const detayOgeleri = (t: TabloTercihi): DetayKey[] => gorunurKartlar(DETAY_SECIMI, t);
export const detayDegistir = (t: TabloTercihi, k: DetayKey): TabloTercihi => kartDegistir(DETAY_SECIMI, t, k);
export const detaySifirla = (t: TabloTercihi): TabloTercihi => kartlariSifirla(DETAY_SECIMI, t);
/** Cihaz deposundaki anahtar (bulut tercih anahtarı değildir). */
export const DETAY_ANAHTARI = "siparis.ayrinti";
