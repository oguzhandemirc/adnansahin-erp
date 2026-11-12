import { ChevronRight, ShieldCheck, Workflow } from "lucide-react";
import { cn } from "@/lib/utils";
import { PanoCard } from "./PanoBoxFrame";
import { formatCount, metre, yuzde } from "./pano-bicim";
import { TARGETS, reportTarget } from "./pano-hedefler";
import { CHART_BG, CHART_STROKE, LegendDot, PanoEmptyState, Ring, RowLink, useGo } from "./pano-ui";
import type { OutsideBox, QualityBox, WipBox, WorkOrderBox } from "./types";
import type { PanoErisim } from "./usePanoErisim";

/** Kalite özeti — kademelerin payı halkası, kırılım ve fire satırı. */
export function PanoKalite({ d, erisim }: { d: QualityBox; erisim: PanoErisim }) {
  const go = useGo(erisim);
  if (d.bitenMetre <= 0) return <PanoCard title="Kalite özeti"><PanoEmptyState icon={ShieldCheck} metin="Bu dönemde biten kumaş yok" /></PanoCard>;
  const top = d.kaliteler[0] ?? null;
  return (
    <PanoCard title="Kalite özeti" description={`${metre(d.bitenMetre)} · ${formatCount(d.bitenTop)} top`}>
      <div className="@container">
        <div className="flex flex-col items-center gap-4 @[20rem]:flex-row">
          <Ring label={top ? `${top.ad} payı ${yuzde(top.yuzde)}` : "Kalite payı yok"} parts={d.kaliteler.map((g, i) => ({ value: g.metre, stroke: CHART_STROKE[i % CHART_STROKE.length]! }))}>
            <span className="text-xl font-bold tabular-nums">{top ? yuzde(top.yuzde) : "—"}</span>
            <span className="max-w-[5rem] truncate text-[10px] text-muted-foreground">{top?.ad ?? "kalite"}</span>
          </Ring>
          <ul className="w-full min-w-0 space-y-1.5 text-xs">
            {d.kaliteler.slice(0, 5).map((g, i) => (
              <li key={g.key} className="flex items-center gap-2">
                <LegendDot color={CHART_BG[i % CHART_BG.length]!} className="flex-1">{g.ad}</LegendDot>
                <span className="tabular-nums text-muted-foreground">{metre(g.metre)}</span>
                <span className="w-12 text-right font-semibold tabular-nums">{yuzde(g.yuzde)}</span>
              </li>
            ))}
            {d.belirsizMetre > 0 && <li className="flex justify-between text-muted-foreground"><span>Kalitesi girilmemiş</span><span className="tabular-nums">{metre(d.belirsizMetre)}</span></li>}
          </ul>
        </div>
      </div>
      {d.fire && (
        <div className="-mx-2 mt-3 border-t border-border/60 pt-1">
          <RowLink onClick={go(reportTarget("fire"))}>
            <span className="flex-1 text-muted-foreground">Fire</span>
            <span className={cn("font-semibold tabular-nums", (d.fire.yuzde ?? 0) > 0 && "text-warning")}>{metre(d.fire.metre)} · {yuzde(d.fire.yuzde)}</span>
            <span className="text-xs tabular-nums text-muted-foreground">{formatCount(d.fire.hata)} hata</span>
          </RowLink>
        </div>
      )}
    </PanoCard>
  );
}

/** Adımda bekleyen mal (WIP) — istasyon başına bekleyen metre çubuğu. */
export function PanoBekleyenMal({ d, erisim }: { d: WipBox; erisim: PanoErisim }) {
  const go = useGo(erisim)(reportTarget("wip"));
  const max = Math.max(1, ...d.istasyonlar.map((s) => s.metre));
  return (
    <PanoCard title="Adımda bekleyen mal" description={`${metre(d.toplam.metre)} · ${formatCount(d.toplam.top)} top`}>
      {d.istasyonlar.length === 0 ? <PanoEmptyState icon={Workflow} metin="Bekleyen yarı mamul yok" /> : (
        <ul className="-mx-2 space-y-0.5">
          {d.istasyonlar.slice(0, 6).map((s, i) => (
            <li key={s.key}>
              <RowLink onClick={go} className="flex-col items-stretch gap-1">
                <span className="flex items-baseline justify-between gap-2">
                  <span className="truncate font-medium" title={s.ad}>{s.ad}</span>
                  <span className="shrink-0 text-xs tabular-nums text-muted-foreground"><span className="font-semibold text-foreground">{metre(s.metre)}</span> · {formatCount(s.top)} top</span>
                </span>
                <span className="h-2 overflow-hidden rounded-full bg-muted">
                  <span className={cn("block h-full rounded-full", CHART_BG[i % CHART_BG.length])} style={{ width: `${Math.max(2, (s.metre / max) * 100)}%` }} />
                </span>
              </RowLink>
            </li>
          ))}
        </ul>
      )}
    </PanoCard>
  );
}

/** Fasondaki mal — fason istasyonlarında şu an bekleyen. */
export function PanoFasonda({ d, erisim }: { d: OutsideBox; erisim: PanoErisim }) {
  const go = useGo(erisim)(TARGETS.fasonda);
  return (
    <PanoCard title="Fasondaki mal" description="Şu an fasoncuda">
      <div className="-mx-2 divide-y divide-border/60">
        <RowLink onClick={go}><span className="flex-1 text-muted-foreground">Metre</span><span className="font-semibold tabular-nums">{metre(d.metre)}</span></RowLink>
        <RowLink><span className="flex-1 text-muted-foreground">Top</span><span className="font-semibold tabular-nums">{formatCount(d.top)}</span></RowLink>
        <RowLink><span className="flex-1 text-muted-foreground">Fason istasyonu</span><span className="font-semibold tabular-nums">{formatCount(d.istasyon)}</span></RowLink>
      </div>
    </PanoCard>
  );
}

const WO_LABEL: Record<WorkOrderBox["durumlar"][number]["durum"], string> = { PLANNED: "Planlı", IN_PROGRESS: "Üretimde" };

/** Açık iş emirleri — segmentli küçük halka + durum satırları. */
export function PanoIsEmri({ d, erisim }: { d: WorkOrderBox; erisim: PanoErisim }) {
  const go = useGo(erisim)(TARGETS.isEmirleri);
  return (
    <PanoCard title="Açık iş emirleri">
      <div className="@container">
        <div className="flex flex-col items-center gap-3 @[15rem]:flex-row">
          <Ring size={88} thickness={10} label={`${formatCount(d.toplam)} açık iş emri`} parts={d.durumlar.map((s, i) => ({ value: s.adet, stroke: CHART_STROKE[i]! }))}>
            <span className="text-lg font-bold tabular-nums">{formatCount(d.toplam)}</span>
            <span className="text-[10px] text-muted-foreground">açık</span>
          </Ring>
          <div className="-mx-2 w-full min-w-0 flex-1">
            {d.durumlar.map((s, i) => (
              <RowLink key={s.durum} onClick={go}>
                <LegendDot color={CHART_BG[i]!} className="flex-1 text-muted-foreground">{WO_LABEL[s.durum]}</LegendDot>
                <span className="font-semibold tabular-nums">{formatCount(s.adet)}</span>
                {go && <ChevronRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden />}
              </RowLink>
            ))}
          </div>
        </div>
      </div>
    </PanoCard>
  );
}
