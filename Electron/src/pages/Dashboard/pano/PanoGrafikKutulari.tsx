import { useId, useMemo } from "react";
import { Area, AreaChart, Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { ChartLine, ChartPie } from "lucide-react";
import { formatNumber } from "@/lib/format";
import { PanoCard } from "./PanoBoxFrame";
import { kovaEtiketi, metre, yuzde } from "./pano-bicim";
import { CHART_BG, CHART_STROKE, LegendDot, PanoEmptyState, Ring } from "./pano-ui";
import type { DistributionBox, TrendBox } from "./types";

const SERIES = [
  { key: "uretim", name: "Üretim", color: "hsl(var(--primary))", dot: "bg-primary" },
  { key: "sevk", name: "Sevk", color: "hsl(var(--chart-2))", dot: "bg-chart-2" },
] as const;

const kisaEksen = (n: number): string => (n >= 1000 ? `${formatNumber(n / 1000, 1)}b` : formatNumber(n, 0));

/** Üretim (biten) ve sevk eğilimi — alan grafiği; 3'ten az kovada çubuk (tek nokta alan çizmez). */
export function PanoEgilim({ d }: { d: TrendBox }) {
  const gid = useId().replace(/:/g, "");
  const series = SERIES.filter((s) => d.noktalar.some((n) => n[s.key] !== null));
  const rows = useMemo(() => d.noktalar.map((n) => ({ ad: kovaEtiketi(n.anahtar, d.kova), uretim: n.uretim, sevk: n.sevk })), [d]);
  const sumOf = (k: "uretim" | "sevk") => d.noktalar.reduce((a, n) => a + (n[k] ?? 0), 0);
  const bos = series.every((s) => sumOf(s.key) === 0);
  const legend = (
    <div className="flex items-center gap-3 text-xs">
      {series.map((s) => <LegendDot key={s.key} color={s.dot}><span className="text-muted-foreground">{s.name}</span> <span className="font-semibold tabular-nums">{metre(sumOf(s.key))}</span></LegendDot>)}
    </div>
  );
  const ortak = (
    <>
      <CartesianGrid vertical={false} stroke="hsl(var(--border))" strokeDasharray="3 3" />
      <XAxis dataKey="ad" tickLine={false} axisLine={false} fontSize={11} tick={{ fill: "hsl(var(--muted-foreground))" }} minTickGap={16} />
      <YAxis tickLine={false} axisLine={false} fontSize={11} width={40} tick={{ fill: "hsl(var(--muted-foreground))" }} tickFormatter={kisaEksen} />
      <Tooltip formatter={(v) => metre(Number(v))} contentStyle={{ borderRadius: 10, fontSize: 12, borderColor: "hsl(var(--border))", background: "hsl(var(--popover))" }} />
    </>
  );
  return (
    <PanoCard title="Üretim ve sevk" description="Metre, dönem içinde" action={legend}>
      {bos ? <PanoEmptyState icon={ChartLine} metin="Bu dönemde üretim ve sevk yok" /> : (
        <div className="h-60" role="img" aria-label="Üretim ve sevk eğilimi">
          <ResponsiveContainer width="100%" height="100%">
            {rows.length < 3 ? (
              <BarChart data={rows} margin={{ top: 8, right: 4, left: -8, bottom: 0 }}>
                {ortak}
                {series.map((s) => <Bar key={s.key} dataKey={s.key} name={s.name} fill={s.color} radius={[6, 6, 0, 0]} maxBarSize={48} />)}
              </BarChart>
            ) : (
              <AreaChart data={rows} margin={{ top: 8, right: 4, left: -8, bottom: 0 }}>
                <defs>
                  {series.map((s) => (
                    <linearGradient key={s.key} id={`${gid}-${s.key}`} x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor={s.color} stopOpacity={0.32} />
                      <stop offset="100%" stopColor={s.color} stopOpacity={0.02} />
                    </linearGradient>
                  ))}
                </defs>
                {ortak}
                {series.map((s) => (
                  <Area key={s.key} type="monotone" dataKey={s.key} name={s.name} stroke={s.color} strokeWidth={2.25}
                    fill={`url(#${gid}-${s.key})`} dot={false} activeDot={{ r: 4 }} isAnimationActive={false} />
                ))}
              </AreaChart>
            )}
          </ResponsiveContainer>
        </div>
      )}
    </PanoCard>
  );
}

/** Üretilen kumaş dağılımı — halka + lejant (ilk 5 + Diğer). */
export function PanoDagilim({ d }: { d: DistributionBox }) {
  return (
    <PanoCard title="Üretilen kumaşlar" description="Dönemde biten metre">
      {d.toplam <= 0 ? <PanoEmptyState icon={ChartPie} metin="Bu dönemde biten kumaş yok" /> : (
        <div className="@container">
          <div className="flex flex-col items-center gap-4 @[20rem]:flex-row">
            <Ring size={132} thickness={18} label="Üretilen kumaş dağılımı" parts={d.dilimler.map((s, i) => ({ value: s.metre, stroke: CHART_STROKE[i % CHART_STROKE.length]! }))}>
              <span className="text-base font-bold tabular-nums">{metre(d.toplam)}</span>
              <span className="text-[10px] text-muted-foreground">toplam</span>
            </Ring>
            <ul className="w-full min-w-0 space-y-1.5 text-xs">
              {d.dilimler.map((s, i) => (
                <li key={s.key} className="flex items-center gap-2">
                  <LegendDot color={CHART_BG[i % CHART_BG.length]!} className="flex-1">{s.ad}</LegendDot>
                  <span className="tabular-nums text-muted-foreground">{metre(s.metre)}</span>
                  <span className="w-12 text-right font-semibold tabular-nums">{yuzde(s.yuzde)}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}
    </PanoCard>
  );
}
