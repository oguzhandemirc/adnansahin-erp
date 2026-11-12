// Kutu görünüm meta verisi — simge, ton ve önizleme iskeleti türü.
import {
  Activity, Boxes, ChartColumn, ChartLine, ChartPie, ClipboardList, Factory, Gauge, Hourglass, LayoutGrid, ListOrdered,
  Send, ShieldCheck, Trophy, Truck, Users, Warehouse, Zap, type LucideIcon,
} from "lucide-react";
import type { IconTileTone } from "@/components/ui/icon-tile";
import type { PanoBoxGroup } from "./types";

export type PreviewKind = "kpi" | "area" | "bars" | "hbars" | "donut" | "list" | "tiles";

export interface BoxMeta { icon: LucideIcon; tone: IconTileTone; preview: PreviewKind }

export const BOX_META: Record<string, BoxMeta> = {
  uretim: { icon: Factory, tone: "violet", preview: "kpi" },
  sevk: { icon: Truck, tone: "green", preview: "kpi" },
  siparis: { icon: ClipboardList, tone: "blue", preview: "kpi" },
  fason: { icon: Send, tone: "orange", preview: "kpi" },
  stok: { icon: Boxes, tone: "teal", preview: "kpi" },
  egilim: { icon: ChartLine, tone: "violet", preview: "area" },
  dagilim: { icon: ChartPie, tone: "blue", preview: "donut" },
  kalite: { icon: ShieldCheck, tone: "green", preview: "donut" },
  enCokMusteri: { icon: Users, tone: "rose", preview: "list" },
  enCok: { icon: Trophy, tone: "amber", preview: "list" },
  hizliIslemler: { icon: Zap, tone: "amber", preview: "tiles" },
  sonHareketler: { icon: ListOrdered, tone: "blue", preview: "list" },
  bekleyen: { icon: Hourglass, tone: "sky", preview: "list" },
  bekleyenMal: { icon: ChartColumn, tone: "violet", preview: "hbars" },
  istasyonDoluluk: { icon: Activity, tone: "teal", preview: "tiles" },
  fasonOzeti: { icon: Send, tone: "orange", preview: "list" },
  stokOzeti: { icon: Warehouse, tone: "teal", preview: "list" },
  isEmriDurum: { icon: Gauge, tone: "orange", preview: "donut" },
};

export const FALLBACK_META: BoxMeta = { icon: LayoutGrid, tone: "primary", preview: "list" };

export const metaOf = (key: string): BoxMeta => BOX_META[key] ?? FALLBACK_META;

export const GROUP_LABEL: Record<PanoBoxGroup, string> = { uretim: "Üretim", satis: "Satış ve sevk", stok: "Stok", genel: "Genel" };

export const GROUP_ORDER: readonly PanoBoxGroup[] = ["uretim", "satis", "stok", "genel"];
