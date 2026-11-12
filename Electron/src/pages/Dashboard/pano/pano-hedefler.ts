// Pano tıklama hedefleri — HER adres route'un kendi iznini taşır (`content-routes.tsx` ile birebir);
// tıklanabilirlik `usePanoErisim().canGo` ile izin + yol modülü + rapor kapısından ölçülür.
import { ClipboardList, Factory, FileChartColumn, PackageOpen, Truck, Undo2, Warehouse, Workflow, type LucideIcon } from "lucide-react";
import type { IconTileTone } from "@/components/ui/icon-tile";
import { REPORT_BY_KEY } from "@/lib/report-catalog";
import type { PanoTarget } from "./usePanoErisim";

/** Kutunun beslendiği rapor ucu (katalog anahtarı) — adres ve izin katalog satırından türer. */
export const PANO_RAPORLARI = {
  kalite: "quality/scorecard",
  fire: "quality/scrap-scorecard",
  sevk: "sales/shipment-scorecard",
  siparis: "sales/order-intake",
  fason: "subcontract/scorecard",
  stok: "inventory/scorecard",
  wip: "production/wip",
} as const;

export type PanoRapor = keyof typeof PANO_RAPORLARI;

export function reportTarget(r: PanoRapor): PanoTarget {
  const entry = REPORT_BY_KEY.get(PANO_RAPORLARI[r]);
  // Katalog dışı anahtar: boş izin kutuyu tıklanmaz bırakır (fail-closed).
  return entry ? { to: `/${entry.panelYolu}`, izin: [entry.izin] } : { to: "/forbidden", izin: [] };
}

export const TARGETS = {
  siparisler: { to: "/operations/orders", izin: ["order:read"] },
  acikSiparisler: { to: "/operations/orders?filter[status]=PENDING,APPROVED,PARTIAL_SHIPPED", izin: ["order:read"] },
  isEmriYok: { to: "/operations/orders?filter[woState]=NONE&filter[status]=PENDING,APPROVED,PARTIAL_SHIPPED", izin: ["order:read"] },
  sevkiyatlar: { to: "/operations/shipments", izin: ["shipping:read"] },
  isEmirleri: { to: "/operations/work-orders?filter[status]=PLANNED,IN_PROGRESS", izin: ["workorder:read"] },
  depoda: { to: "/operations/rolls?tab=FINISHED_STOCK", izin: ["roll:read"] },
  uretimde: { to: "/operations/rolls?tab=PRODUCTION", izin: ["roll:read"] },
  fasonda: { to: "/operations/rolls?tab=SUBCONTRACTOR", izin: ["roll:read"] },
  stok: { to: "/operations/rolls", izin: ["roll:read"] },
} as const satisfies Record<string, PanoTarget>;

export interface HizliEylem extends PanoTarget {
  key: string;
  label: string;
  icon: LucideIcon;
  tone: IconTileTone;
}

/** Sık işler — route izni; kapalı modülde yol kapısı gizler. */
export const HIZLI_EYLEMLER: readonly HizliEylem[] = [
  { key: "wo-new", label: "İş emri oluştur", icon: Factory, tone: "violet", to: "/operations/work-orders/new", izin: ["workorder:write"] },
  { key: "orders", label: "Siparişler", icon: ClipboardList, tone: "blue", ...TARGETS.siparisler },
  { key: "rolls", label: "Kumaş stoğu", icon: PackageOpen, tone: "teal", ...TARGETS.stok },
  { key: "kursun", label: "Kurşun planlama", icon: Workflow, tone: "orange", to: "/operations/kursun-dagitim", izin: ["quality:write", "workorder:distribute"] },
  { key: "sacks", label: "Çuval deposu", icon: Warehouse, tone: "amber", to: "/operations/sack-store", izin: ["shipping:read"] },
  { key: "shipments", label: "Sevkiyatlar", icon: Truck, tone: "green", ...TARGETS.sevkiyatlar },
  { key: "returns", label: "İadeler", icon: Undo2, tone: "rose", to: "/operations/returns", izin: ["return:read"] },
  { key: "reports", label: "Raporlar", icon: FileChartColumn, tone: "sky", to: "/reports", izin: ["report:production", "report:quality", "report:sales", "report:inventory", "report:subcontract", "report:customer"] },
];
