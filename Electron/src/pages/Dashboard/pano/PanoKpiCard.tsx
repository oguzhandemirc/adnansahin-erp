import { StatCard } from "@/components/ui/stat-card";
import { metaOf } from "./box-meta";
import { degisimRozeti, formatCount, metre } from "./pano-bicim";
import { TARGETS, reportTarget } from "./pano-hedefler";
import { useGo } from "./pano-ui";
import type { KpiBox, PanoDonem } from "./types";
import type { PanoErisim, PanoTarget } from "./usePanoErisim";

export type KpiKey = "uretim" | "sevk" | "siparis" | "fason" | "stok";

export const KPI_LABEL: Record<KpiKey, string> = { uretim: "Üretim", sevk: "Sevk", siparis: "Yeni sipariş", fason: "Fasona giden", stok: "Mamul stok" };

export const KPI_TARGETS: Record<KpiKey, PanoTarget> = {
  uretim: reportTarget("kalite"),
  sevk: TARGETS.sevkiyatlar,
  siparis: TARGETS.siparisler,
  fason: reportTarget("fason"),
  stok: TARGETS.depoda,
};

interface Props { boxKey: KpiKey; data: KpiBox; donem: PanoDonem; erisim: PanoErisim }

/** Tek KPI kutusu: değer + kısa ek + önceki döneme göre değişim (kıyas yoksa kısa nötr metin, kartlar eş boy). */
export function PanoKpiCard({ boxKey, data, donem, erisim }: Props) {
  const go = useGo(erisim)(KPI_TARGETS[boxKey]);
  const meta = metaOf(boxKey);
  const value = data.anaBirim === "m" ? metre(data.ana.deger) : formatCount(data.ana.deger);
  const rozet = degisimRozeti(data.ana, donem);
  // Anlık ölçüde (stok) kıyas yok — ek bilgi değişim satırına iner.
  const anlik = data.ana.onceki === null && boxKey === "stok";
  const bos = anlik ? data.ek : data.ana.deger > 0 ? "Öncesi yok" : "Değişim yok";
  return (
    <StatCard
      label={KPI_LABEL[boxKey]}
      value={value}
      icon={meta.icon}
      tone={meta.tone}
      hint={anlik ? undefined : data.ek}
      trend={rozet?.trend ?? "neutral"}
      delta={rozet
        ? <span title={rozet.metin}><span className="font-semibold">{rozet.yuzde}</span> <span className="hidden font-normal text-muted-foreground @[13rem]:inline">{rozet.kiyas}</span></span>
        : <span className="font-normal" data-kpi-bos-kiyas="">{bos}</span>}
      className="h-full"
      onClick={go}
    />
  );
}
