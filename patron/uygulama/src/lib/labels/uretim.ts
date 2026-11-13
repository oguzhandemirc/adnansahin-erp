// Pano · Üretim · Stok · Sevkiyat sözlüğü: fabrikanın anlık/kayıt alanlarındaki ham değerler → Türkçe etiket + ton.
// Kaynak enum'lar fabrikadadır (Teks-Erp prisma şeması, `cloud-sync/snapshots.ts`); bilinmeyen değer ham döner
// (`lookup`) — ekran yine çizilir, bekçi testi eksik anahtarı yakalar.
import type { StatusEntry, StatusTone } from "./ortak";

/**
 * Kayıt durumu tonu: renk = anlam. iyi/uyari/kritik YALNIZ gerçekten o durumlar için; normal akış "etkin"
 * (marka), bekleyen "notr", kapanmış/iptal "sonuk" (iptal arıza değildir). Rozet çizimi `ui/pano/KayitDurumRozeti`.
 */
export type RecordTone = StatusTone | "etkin" | "notr" | "sonuk";

export interface RecordStatusEntry {
  readonly label: string;
  readonly tone: RecordTone;
}

/** Fabrikanın dört standart dönemi (`ozet.sevkiyat` / `ozet.fason` anahtarları); segment için kısa ad, açıklamada `PERIOD_LABEL`. */
export const PERIODS = [
  { key: "bugun", label: "Bugün" },
  { key: "buAy", label: "Bu ay" },
  { key: "gecenAy", label: "Geçen ay" },
  { key: "son30Gun", label: "30 gün" },
] as const;

export type PeriodKey = (typeof PERIODS)[number]["key"];

export const PERIOD_LABEL: Readonly<Record<PeriodKey, string>> = {
  bugun: "Bugün",
  buAy: "Bu ay",
  gecenAy: "Geçen ay",
  son30Gun: "Son 30 gün",
};

/**
 * Birimler: fabrika paneli aynı alanları bu birimle basar (stok/sevk/fason karneleri "m", istasyon sayaçları top).
 * Uygulama birim UYDURMAZ; yalnız bu tabloda adı geçen alana birim yazılır.
 */
export const UNIT = { metre: "m", top: "top", kalem: "kalem", gun: "gün", adet: "adet" } as const;

/** Terbiye iş emri durumu (`WorkOrderStatus`). */
// Fabrika "gecikmiş" diye bir iş emri durumu vermez; uyarı/kritik tonu bu sözlükte bilerek yok.
export const WORK_ORDER_STATUS: Readonly<Record<string, RecordStatusEntry>> = {
  PLANNED: { label: "Planlandı", tone: "notr" },
  IN_PROGRESS: { label: "Üretimde", tone: "etkin" },
  COMPLETED: { label: "Tamamlandı", tone: "iyi" },
  CANCELLED: { label: "İptal", tone: "sonuk" },
  SUPERSEDED: { label: "Devredildi", tone: "sonuk" },
};

/** Terbiye iş emri türü (`WorkOrderType`). */
export const WORK_ORDER_TYPE: Readonly<Record<string, string>> = {
  ORDER_PRODUCTION: "Siparişe üretim",
  STOCK_PRODUCTION: "Stoka üretim",
  CUSTOMER_GOODS_SERVICE: "Fason (müşteri malı)",
};

/** Sevkiyat durumu (`ShipmentStatus`). */
export const SHIPMENT_STATUS: Readonly<Record<string, RecordStatusEntry>> = {
  PLANNED: { label: "Onay bekliyor", tone: "notr" },
  DISPATCHED: { label: "Sevk edildi", tone: "iyi" },
  CANCELLED: { label: "İptal", tone: "sonuk" },
};

/** Ölü stok rozeti: siparişsiz bekleyen bitmiş stok dikkat ister (uyarı), arıza değildir (kritik değil). */
export const DEAD_STOCK_STATUS: Readonly<Record<"var" | "yok", StatusEntry>> = {
  var: { label: "Dikkat", tone: "uyari" },
  yok: { label: "Yok", tone: "iyi" },
};

/** Sevkiyat yönü (bulut `sevkiyat.yon`). */
export const SHIPMENT_DIRECTION: Readonly<Record<string, string>> = { CIKIS: "Çıkış", GIRIS: "Giriş" };

/** Sevkiyat varış kapsamı (`ShipmentDestination`). */
export const SHIPMENT_DESTINATION: Readonly<Record<string, string>> = {
  DOMESTIC: "Yurtiçi",
  EXPORT: "İhracat",
};

/** İstasyon türü (`StationType`): dış istasyon = fason. */
export const STATION_TYPE: Readonly<Record<string, string>> = {
  INTERNAL: "İç istasyon",
  EXTERNAL: "Fason",
};

/** Stok yaş kovası (`stok-karnesi.yasKovalari[].anahtar`) → ton; etiket fabrikadan gelir. */
export const STOCK_AGE_TONE: Readonly<Record<string, StatusEntry["tone"]>> = {
  "0-7": "iyi",
  "8-30": "bilgi",
  "31-90": "uyari",
  "90+": "kritik",
};

/** Üretim akışı kolonları (`uretim-akisi.kolonlar[].anahtar`; etiket fabrikadan, Kanban ile aynı). */
export const FLOW_KEYS = ["hamStok", "yariMamul", "fason", "kursun", "tambur", "depo", "sevk"] as const;

/** Stok ↔ akış ayrımı: stoktaki bitmiş = çuvala/sevke girmemiş SERBEST mal; akıştaki "depo" çuvaldakileri de sayar. */
export const FREE_STOCK_LABEL = "Serbest stok";
export const FREE_STOCK_HINT = "çuvalsız";
/** Akış kolonu altına küçük ikincil not (etiket fabrikadan; not yalnız sayının kapsamını söyler). */
export const FLOW_NOTE: Readonly<Partial<Record<(typeof FLOW_KEYS)[number], string>>> = { depo: "çuvaldakiler dahil" };

/** Kayıt durumu sözlükten; bilinmeyen değer ham adıyla nötr çizilir (uyarı rengi uydurulmaz). */
export function recordStatus(dict: Readonly<Record<string, RecordStatusEntry>>, value: unknown): RecordStatusEntry {
  const key = typeof value === "string" ? value : "";
  return dict[key] ?? { label: key || "—", tone: "notr" };
}
