import type { ReactNode } from "react";
import { ArrowDownRight, ArrowUpRight, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import type { IconTileTone } from "./icon-tile";

export type StatTrend = "up" | "down" | "neutral";

export interface StatCardProps {
  /** Küçük gri etiket ("Üretim"). */
  label: ReactNode;
  /** Kalın büyük değer (biçimlenmiş metin). */
  value: ReactNode;
  icon?: LucideIcon;
  tone?: IconTileTone;
  /** Değişim satırı ("%12,5 önceki döneme göre"). */
  delta?: ReactNode;
  /** up = yeşil ok, down = kırmızı ok, neutral = gri (ok yok). */
  trend?: StatTrend;
  /** Değerin yanındaki kısa ek (yer varsa). */
  hint?: ReactNode;
  onClick?: () => void;
  className?: string;
}

export function trendTone(trend: StatTrend | undefined): string {
  if (!trend || trend === "neutral") return "text-muted-foreground";
  return trend === "up" ? "text-success" : "text-destructive";
}

/** Kompakt KPI kartı: etiket, değer (+ kısa ek) ve değişim satırı; simge sağda, arka planda soluk ve büyük. */
export function StatCard({ label, value, icon: Icon, tone = "primary", delta, trend = "neutral", hint, onClick, className }: StatCardProps) {
  const Comp = onClick ? "button" : "div";
  const Arrow = trend === "up" ? ArrowUpRight : trend === "down" ? ArrowDownRight : null;
  return (
    <Comp type={onClick ? "button" : undefined} onClick={onClick} data-slot="card"
      className={cn(
        "@container relative flex w-full min-w-0 items-center overflow-hidden rounded-xl border border-card-border bg-card px-[var(--kpi-px)] py-[var(--kpi-py)] text-left text-card-foreground shadow-card",
        onClick && "transition-colors hover:border-primary/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        className,
      )}>
      {Icon && (
        <Icon aria-hidden strokeWidth={1.75} data-tone={tone}
          className={cn("pointer-events-none absolute -right-2 top-1/2 h-14 w-14 -translate-y-1/2 opacity-[0.13] dark:opacity-20",
            tone === "primary" ? "text-primary" : `tile-${tone} text-[hsl(var(--tile-fg))]`)} />
      )}
      <div className="relative min-w-0 flex-1 pr-8">
        <p className="truncate text-xs font-medium text-muted-foreground">{label}</p>
        <p className="flex min-w-0 items-baseline gap-1.5 leading-tight">
          <span className="min-w-0 truncate text-lg font-bold tabular-nums">{value}</span>
          {hint != null && <span className="hidden min-w-0 shrink truncate text-xs text-muted-foreground @[15rem]:inline">{hint}</span>}
        </p>
        {delta != null && (
          <p data-trend={trend} className={cn("flex h-4 items-center gap-0.5 truncate text-xs font-medium", trendTone(trend))}>
            {Arrow && <Arrow className="h-3.5 w-3.5 shrink-0" aria-hidden />}
            <span className="truncate">{delta}</span>
          </p>
        )}
      </div>
    </Comp>
  );
}
