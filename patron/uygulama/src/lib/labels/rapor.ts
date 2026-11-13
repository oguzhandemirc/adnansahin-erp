// Rapor sözlüğü (+ jenerik kayıt enum adları): rapor anahtarları → Türkçe başlık, aile rengi, durum tonu, parametre
// adı. Adnan'da yalnız fabrikanın 6 karnesi buluttan istenir (finans/maliyet/dokuma raporları kesildi, D3).
import { REPORT_STATUSES, type ReportStatus } from "../../api/wire";
import type { IconName } from "../../ui/icons";
import type { Domain } from "../../ui/tokens";
import { STATUS_DICT, type StatusEntry, type StatusTone } from "./ortak";
import { DESTINATION, ORDER_STATUS } from "./siparis";
import { SHIPMENT_DIRECTION, SHIPMENT_STATUS, WORK_ORDER_TYPE } from "./uretim";

const labelsOf = (d: Readonly<Record<string, { readonly label: string }>>): Readonly<Record<string, string>> =>
  Object.fromEntries(Object.entries(d).map(([k, v]) => [k, v.label]));

/** Jenerik kayıt ayrıntısında enum alanlarının Türkçe adı (projeksiyon → alan → değer → ad). */
export const RECORD_ENUMS: Readonly<Record<string, Readonly<Record<string, Readonly<Record<string, string>>>>>> = {
  siparis: { durum: labelsOf(ORDER_STATUS), yon: DESTINATION },
  sevkiyat: { durum: labelsOf(SHIPMENT_STATUS), yon: SHIPMENT_DIRECTION },
  "is-emri": { tur: WORK_ORDER_TYPE },
};

/** Rapor hata kodu (`REPORT_ERROR_CODES`, fabrika) → kullanıcı cümlesi; ham kod ekrana basılmaz. */
export const REPORT_ERROR: Readonly<Record<string, string>> = {
  RAPOR_BILINMIYOR: "Fabrika bu raporu tanımıyor.",
  PARAMETRE_GECERSIZ: "Seçilen dönem ya da ayar bu rapor için geçerli değil.",
  ZAMAN_ASIMI: "Rapor zamanında hesaplanamadı; daha kısa bir dönemle yeniden deneyin.",
  RAPOR_KAPALI: "Bu rapor fabrikada kapalı.",
  MODUL_KAPALI: "Raporun ait olduğu modül fabrikada kapalı.",
  SONUC_BUYUK: "Sonuç buluta gönderilemeyecek kadar büyük; daha kısa bir dönem seçin.",
};

// ------------------------------------------------------------------------------------------------- raporlar

/** Rapor anahtarı → Türkçe başlık (YEDEK; asıl ad fabrikanın `rapor-katalogu` anlığındaki `baslik`). */
export const REPORT_TITLE: Readonly<Record<string, string>> = {
  "sales/order-intake": "Sipariş karnesi",
  "sales/shipment-scorecard": "Sevk ve termin karnesi",
  "customer/scorecard": "Müşteri karnesi",
  "quality/scorecard": "Kalite karnesi",
  "subcontract/scorecard": "Fason karnesi",
  "inventory/scorecard": "Stok ve ölü stok",
};

/** Katalogda ad varsa ondan, yoksa sözlükten; ikisi de yoksa "Rapor" (ham anahtar ekrana basılmaz). */
export function reportTitle(key: string, catalog?: readonly { readonly anahtar: string; readonly baslik: string }[]): string {
  const fromCatalog = catalog?.find((e) => e.anahtar === key)?.baslik;
  if (fromCatalog) return fromCatalog;
  return Object.prototype.hasOwnProperty.call(REPORT_TITLE, key) ? REPORT_TITLE[key]! : "Rapor";
}

/** Rapor ailesi → alan rengi + ikon (kart ızgarası). */
export const REPORT_FAMILY: Readonly<Record<string, { readonly domain: Domain; readonly icon: IconName }>> = {
  sales: { domain: "siparisler", icon: "receipt-outline" },
  customer: { domain: "cariler", icon: "people-outline" },
  quality: { domain: "uretim", icon: "ribbon-outline" },
  subcontract: { domain: "fason", icon: "git-branch-outline" },
  inventory: { domain: "stok", icon: "cube-outline" },
};

/** Rapor ailesi → kategori adı (Raporlar merkezi kartları); bilinmeyen aile "Diğer" kartına düşer (ham kod görünmez). */
export const REPORT_FAMILY_LABEL: Readonly<Record<string, string>> = {
  sales: "Satış ve sevk",
  customer: "Müşteri",
  quality: "Kalite",
  subcontract: "Fason",
  inventory: "Stok",
};

/** Raporun ailesi: anahtarın ilk parçası (katalogdaki `aile` ile aynı). */
export function reportFamily(key: string): string {
  return key.split("/")[0] ?? "";
}

/** Anahtara özel alan (aile içinde ayrışanlar): sevk karnesi sevkiyat renginde. */
const REPORT_KEY_DOMAIN: Readonly<Record<string, Domain>> = { "sales/shipment-scorecard": "sevkiyat" };

export function reportDomain(key: string): { domain: Domain; icon: IconName } {
  const fam = REPORT_FAMILY[key.split("/")[0] ?? ""] ?? { domain: "raporlar" as Domain, icon: "document-text-outline" };
  const d = REPORT_KEY_DOMAIN[key];
  return d ? { domain: d, icon: d === "sevkiyat" ? "car-outline" : fam.icon } : fam;
}

/** Rapor isteği durumu → etiket + ton (HAZIR iyi · HESAPLANIYOR bilgi · HATA kritik · BEKLIYOR uyarı · IPTAL nötr). */
export const REPORT_STATUS: Readonly<Record<ReportStatus, StatusEntry>> = Object.fromEntries(
  REPORT_STATUSES.map((s) => [s, STATUS_DICT[s]]),
) as Record<ReportStatus, StatusEntry>;

/** Kesinleşmemiş istek: ekran açıkken kısa yoklama sürer. */
export function reportPending(s: unknown): boolean {
  return s === "BEKLIYOR" || s === "HESAPLANIYOR";
}

/** Rapor parametresi adı → okunur ad (fabrika şemasının adları; değer biçimi fabrikanın). */
export const REPORT_PARAM: Readonly<Record<string, string>> = {
  dateFrom: "Başlangıç",
  dateTo: "Bitiş",
  asOf: "Kesit anı",
  from: "Başlangıç",
  to: "Bitiş",
  kiyas: "Kıyas",
  cariId: "Cari",
};

export type { StatusEntry, StatusTone };
