// Pano kutularının ortak küçük parçaları — sekme, halka (SVG), renk noktası, satır, boş durum.
// Renkler belirteçten (`--chart-N`); birinci renk vurgu rengini izler.
import type { ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { upperTr } from "@/lib/tr-case";
import { useTabsStore } from "@/store/tabs";
import type { PanoErisim, PanoTarget } from "./usePanoErisim";

export const CHART_BG = ["bg-primary", "bg-chart-2", "bg-chart-3", "bg-chart-4", "bg-chart-5", "bg-chart-6"] as const;
export const CHART_STROKE = ["stroke-primary", "stroke-chart-2", "stroke-chart-3", "stroke-chart-4", "stroke-chart-5", "stroke-chart-6"] as const;

export interface TabItem { key: string; label: string }

/** Kutu başlığındaki küçük sekme anahtarı (tek seçenekte düz etiket). */
export function BoxTabs({ items, active, onChange, label }: { items: TabItem[]; active: string; onChange: (k: string) => void; label: string }) {
  if (items.length <= 1) return items[0] ? <span className="text-xs text-muted-foreground">{items[0].label}</span> : null;
  return (
    <div role="tablist" aria-label={label} className="flex rounded-lg bg-muted p-0.5 text-xs">
      {items.map((s) => (
        <button key={s.key} type="button" role="tab" aria-selected={s.key === active} onClick={() => onChange(s.key)}
          className={cn("rounded-md px-2 py-1 font-medium", s.key === active ? "bg-card shadow-sm" : "text-muted-foreground")}>{s.label}</button>
      ))}
    </div>
  );
}

export interface RingPart { value: number; stroke: string }

/** Segmentli halka — toplam 0 ise soluk tam halka. Ortadaki içerik `children`. */
export function Ring({ parts, size = 112, thickness = 12, label, children }: { parts: RingPart[]; size?: number; thickness?: number; label: string; children?: ReactNode }) {
  const r = (size - thickness) / 2;
  const c = 2 * Math.PI * r;
  const total = parts.reduce((a, p) => a + Math.max(0, p.value), 0);
  let offset = 0;
  return (
    <div className="relative shrink-0" style={{ width: size, height: size }} role="img" aria-label={label}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" strokeWidth={thickness} className="stroke-muted" />
        {total > 0 && parts.map((p, i) => {
          const len = (Math.max(0, p.value) / total) * c;
          const el = (
            <circle key={i} cx={size / 2} cy={size / 2} r={r} fill="none" strokeWidth={thickness}
              strokeDasharray={`${len} ${c - len}`} strokeDashoffset={-offset} className={p.stroke} />
          );
          offset += len;
          return el;
        })}
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center text-center leading-tight">{children}</div>
    </div>
  );
}

/** Renk noktası + etiket. */
export function LegendDot({ color, children, className }: { color: string; children: ReactNode; className?: string }) {
  return (
    <span className={cn("inline-flex min-w-0 items-center gap-2", className)}>
      <span className={cn("h-2.5 w-2.5 shrink-0 rounded-full", color)} aria-hidden />
      <span className="min-w-0 truncate">{children}</span>
    </span>
  );
}

/** Tıklanabilir satır kabuğu — hedef açılamıyorsa düz satır. */
export function RowLink({ onClick, className, children }: { onClick?: () => void; className?: string; children: ReactNode }) {
  const base = cn("flex w-full min-w-0 items-center gap-3 rounded-lg px-2 py-1.5 text-left text-sm", className);
  return onClick ? (
    <button type="button" onClick={onClick} className={cn(base, "transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring")}>{children}</button>
  ) : <div className={base}>{children}</div>;
}

/** Hedef açılabiliyorsa tıklama işlevi, değilse undefined (izin + modül + rapor kapısı). */
export function useGo(erisim: PanoErisim): (t: PanoTarget) => (() => void) | undefined {
  const navigateActive = useTabsStore((s) => s.navigateActive);
  return (t) => (erisim.canGo(t) ? () => navigateActive(t.to) : undefined);
}

/** Kutu içi boş durum: soluk simge + kısa metin. */
export function PanoEmptyState({ icon: Icon, metin }: { icon: LucideIcon; metin: string }) {
  return (
    <div className="flex min-h-28 flex-1 flex-col items-center justify-center gap-2 py-4 text-center">
      <span className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-muted text-muted-foreground" aria-hidden>
        <Icon className="h-5 w-5" strokeWidth={1.75} />
      </span>
      <p className="text-sm font-medium text-muted-foreground">{metin}</p>
    </div>
  );
}

const AVATAR_TONES = ["tile-violet", "tile-blue", "tile-teal", "tile-rose", "tile-amber"] as const;

/** Ad baş harfleri ("Boyer Tekstil" → "BT"). */
export function initialsOf(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  return upperTr(parts.length > 1 ? `${parts[0]![0]}${parts[1]![0]}` : (parts[0] ?? "?").slice(0, 2));
}

export function Avatar({ name, index }: { name: string; index: number }) {
  return (
    <span className={cn("icon-tile inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-[11px] font-bold", AVATAR_TONES[index % AVATAR_TONES.length])} aria-hidden>
      {initialsOf(name)}
    </span>
  );
}
