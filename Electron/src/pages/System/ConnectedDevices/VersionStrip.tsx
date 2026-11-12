import { cn } from "@/lib/utils";
import type { VersionBucket } from "./connected-devices-utils";

/** Sürüme göre cihaz sayısı şeridi; türünün en yüksek sürümünden geride olan kova uyarı renginde. */
export function VersionStrip({ buckets, total }: { buckets: VersionBucket[]; total: number }) {
  return (
    <div className="flex flex-wrap items-center gap-x-1.5 gap-y-1 text-sm">
      <span className="font-medium text-muted-foreground">{total} açık oturum</span>
      {buckets.map((b) => (
        <span key={b.key} className="flex items-center gap-1.5">
          <span className="text-muted-foreground">·</span>
          <span className={cn("tabular-nums", b.behind ? "font-medium text-warning" : "text-foreground")}>
            {b.label}: <strong>{b.count}</strong>
          </span>
        </span>
      ))}
    </div>
  );
}
