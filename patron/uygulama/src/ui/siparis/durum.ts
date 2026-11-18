// Sipariş durumu → rozet tonu + simge: TEK KAYNAK (2026-11-18, kullanıcı: "her durumun kendine özgü rengi olmalı").
// Liste hücresi, cari ayrıntısındaki sipariş satırı ve sipariş ayrıntısı rozeti buradan okur; başka yerde ton yazılmaz.
// Anlam: onay bekliyor = amber (panel `orderStatusTones.PENDING` warning ile aynı) · gönderilmedi = nötr gri ·
// kısmen gönderildi = mavi (panelde mor `progress`; uygulamada sabit mor belirteç yok, tema rengi kullanıcıya göre değişir) ·
// hepsi gönderildi = yeşil (panelle aynı) · iptal = kırmızı (panelde soluk `muted`; kullanıcı isteğiyle ayrık renk).
// Renk tek bilgi taşıyıcı değildir: metin her zaman yazılı, ayrıntı rozetinde simge de var.
import { ORDER_STATUS, orderStatus, orderStatusShort, type OrderStatus } from "../../lib/labels/siparis";
import type { IconName } from "../icons";
import type { RozetTonu } from "../ortak";

export interface SiparisDurumGorunumu {
  readonly ton: RozetTonu;
  readonly icon: IconName;
}

export const SIPARIS_DURUM_GORUNUMU: Readonly<Record<OrderStatus, SiparisDurumGorunumu>> = {
  PENDING: { ton: "warning", icon: "hourglass-outline" },
  APPROVED: { ton: "soft", icon: "time-outline" },
  PARTIAL_SHIPPED: { ton: "info", icon: "pie-chart-outline" },
  COMPLETED: { ton: "success", icon: "checkmark-circle" },
  CANCELLED: { ton: "danger", icon: "close-circle" },
};

/** Tanınmayan durum (yeni fabrika enum'u) nötr gri, simgesiz; metin ham değerle yine görünür. */
const BILINMEYEN: SiparisDurumGorunumu = { ton: "soft", icon: "ellipse-outline" };

export interface SiparisDurumu extends SiparisDurumGorunumu {
  /** Tam etiket (ayrıntı, erişilebilirlik). */
  readonly label: string;
  /** Liste rozeti için kısa etiket. */
  readonly kisa: string;
  readonly bilinen: boolean;
}

export function siparisDurumu(deger: unknown): SiparisDurumu {
  const anahtar = typeof deger === "string" && Object.prototype.hasOwnProperty.call(ORDER_STATUS, deger) ? (deger as OrderStatus) : null;
  const g = anahtar ? SIPARIS_DURUM_GORUNUMU[anahtar] : BILINMEYEN;
  return { ...g, label: orderStatus(deger).label, kisa: orderStatusShort(deger), bilinen: anahtar !== null };
}
