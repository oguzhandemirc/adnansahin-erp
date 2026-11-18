// Sevkiyat durumu → rozet tonu + simge: TEK KAYNAK (2026-11-19, kullanıcı: iptal sevkiyat gri değil KIRMIZI; sipariş
// durumuyla aynı anlam). Sevkiyat listesi, cari ayrıntısı sevkiyat satırları ve özet buradan okur; başka yerde ton yazılmaz.
// Anlam: onay bekliyor (PLANNED) = amber · sevk edildi = yeşil · iptal = kırmızı. Metin her zaman yazılı (renk tek bilgi
// taşıyıcı değil). Etiket sözlüğü `lib/labels/uretim` SHIPMENT_STATUS'ta kalır.
import { SHIPMENT_STATUS } from "../../lib/labels/uretim";
import type { IconName } from "../icons";
import type { RozetTonu } from "../ortak";

export interface SevkDurumu {
  readonly label: string;
  readonly ton: RozetTonu;
  readonly icon: IconName;
  readonly bilinen: boolean;
}

export const SEVK_DURUM_GORUNUMU: Readonly<Record<string, { readonly ton: RozetTonu; readonly icon: IconName }>> = {
  PLANNED: { ton: "warning", icon: "time-outline" },
  DISPATCHED: { ton: "success", icon: "checkmark-circle" },
  CANCELLED: { ton: "danger", icon: "close-circle" },
};

/** Tanınmayan durum (yeni fabrika enum'u) nötr gri; metin ham değerle görünür. */
export function sevkDurumu(deger: unknown): SevkDurumu {
  const anahtar = typeof deger === "string" && Object.prototype.hasOwnProperty.call(SEVK_DURUM_GORUNUMU, deger) ? deger : null;
  if (!anahtar) return { label: typeof deger === "string" && deger !== "" ? deger : "—", ton: "soft", icon: "ellipse-outline", bilinen: false };
  return { ...SEVK_DURUM_GORUNUMU[anahtar]!, label: SHIPMENT_STATUS[anahtar]?.label ?? anahtar, bilinen: true };
}
