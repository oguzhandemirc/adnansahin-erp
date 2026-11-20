import { AlertTriangle } from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { safeFormat } from "@/lib/format";
import { cn } from "@/lib/utils";
import { AllocationInput } from "./AllocationParts";
import { fmtM, fullQtyText } from "./order-allocation";
import type { LinkableOrderLine } from "./types";

/**
 * Sipariş satırı + bu iş emrine bağlanacak metre tablosu (boş = paylaştırma yok).
 * İki yerde kullanılır: "Sipariş Bağla" diyaloğu (seçim kutulu) ve YENİ iş emri formu
 * (`onToggle` yok → satırlar zaten seçilmiştir, seçim sütunu çizilmez).
 * KG/ADET satıra metre paylaştırılamaz (backend 400) → kutu yok.
 */
export function LinkableLinesTable({
  lines,
  selected,
  qty,
  onToggle,
  onQty,
}: {
  lines: LinkableOrderLine[];
  selected: ReadonlySet<string>;
  qty: Readonly<Record<string, string>>;
  onToggle?: (id: string) => void;
  onQty: (id: string, v: string) => void;
}) {
  const selectable = Boolean(onToggle);
  return (
    <table className="w-full text-sm">
      <LinkableHead selectable={selectable} />
      <tbody>
        {lines.map((l) => (
          <tr
            key={l.id}
            className={cn("border-t transition-colors", selectable && "cursor-pointer hover:bg-accent/40")}
            onClick={onToggle ? () => onToggle(l.id) : undefined}
          >
            {onToggle && (
              <td className="p-2" onClick={(e) => e.stopPropagation()}>
                <Checkbox
                  aria-label={`${l.orderNumber} seç`}
                  checked={selected.has(l.id)}
                  onCheckedChange={() => onToggle(l.id)}
                />
              </td>
            )}
            <td className="p-2">
              <div className="font-mono text-xs">{l.orderNumber}</div>
              <div className="text-xs text-muted-foreground">{l.customerName}</div>
            </td>
            <td className="p-2">
              <div>{l.itemName}</div>
              <div className="text-xs text-muted-foreground">
                {l.colorName ?? "renksiz"}
                {l.width != null ? ` · ${l.width} cm` : ""}
              </div>
              {l.warnings.map((w) => (
                <div key={w} className="mt-1 flex items-center gap-1 text-[11px] text-amber-700 dark:text-amber-300">
                  <AlertTriangle className="h-3 w-3 shrink-0" /> {w}
                </div>
              ))}
            </td>
            <td className="p-2 text-right tabular-nums">
              <div className="font-medium">{fmtM(l.quantity)} m</div>
              <div className="text-[11px] text-muted-foreground">
                {l.openQty === null ? "metre ölçülmüyor" : `açık ${fmtM(l.openQty)} m`}
              </div>
            </td>
            <td className="p-2 text-xs">
              {l.deadline ? safeFormat(l.deadline, "dd.MM.yyyy") : <Badge variant="muted">—</Badge>}
            </td>
            <td className="p-2">
              {l.measured ? (
                <AllocationInput
                  label={`${l.orderNumber} bu iş emrine bağlanacak metre`}
                  value={qty[l.id] ?? ""}
                  onChange={(v) => onQty(l.id, v)}
                  fullValue={fullQtyText(l)}
                />
              ) : (
                <div className="text-right text-[11px] text-muted-foreground">metre dışı</div>
              )}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function LinkableHead({ selectable }: { selectable: boolean }) {
  return (
    <thead className="sticky top-0 z-10 bg-muted text-xs">
      <tr>
        {selectable && <th className="w-9 p-2" />}
        <th className="p-2 text-left font-medium">Sipariş / Müşteri</th>
        <th className="p-2 text-left font-medium">Kumaş / Renk</th>
        <th className="p-2 text-right font-medium">Sipariş metresi</th>
        <th className="p-2 text-left font-medium">Termin</th>
        <th
          className="p-2 text-right font-medium text-primary"
          title="Bu iş emrinin metresinden bu siparişe ayrılan (plan). Boş = paylaştırma yok."
        >
          Bu iş emrine (m)
        </th>
      </tr>
    </thead>
  );
}
