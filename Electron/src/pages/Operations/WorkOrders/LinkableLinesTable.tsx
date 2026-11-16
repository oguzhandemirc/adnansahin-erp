import { AlertTriangle } from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { safeFormat } from "@/lib/format";
import { AllocationInput } from "./AllocationParts";
import { fmtM } from "./order-allocation";
import type { LinkableOrderLine } from "./types";

/**
 * "Sipariş Bağla" tablosu — seçim + satır başına paylaştırma metresi (boş = yok).
 * KG/ADET satıra metre paylaştırılamaz (backend 400) → kutu kapalı.
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
  onToggle: (id: string) => void;
  onQty: (id: string, v: string) => void;
}) {
  return (
    <table className="w-full text-sm">
      <LinkableHead />
      <tbody>
        {lines.map((l) => (
          <tr
            key={l.id}
            className="cursor-pointer border-t transition-colors hover:bg-accent/40"
            onClick={() => onToggle(l.id)}
          >
            <td className="p-2" onClick={(e) => e.stopPropagation()}>
              <Checkbox
                aria-label={`${l.orderNumber} seç`}
                checked={selected.has(l.id)}
                onCheckedChange={() => onToggle(l.id)}
              />
            </td>
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
              <div className="font-medium">{l.openQty === null ? "ölçülmüyor" : `${fmtM(l.openQty)} m`}</div>
              <div className="text-[11px] text-muted-foreground">{fmtM(l.quantity)} istendi</div>
            </td>
            <td className="p-2 text-xs">
              {l.deadline ? safeFormat(l.deadline, "dd.MM.yyyy") : <Badge variant="muted">—</Badge>}
            </td>
            <td className="p-2">
              {l.measured ? (
                <AllocationInput
                  label={`${l.orderNumber} paylaştırılan metre`}
                  value={qty[l.id] ?? ""}
                  onChange={(v) => onQty(l.id, v)}
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

function LinkableHead() {
  return (
    <thead className="sticky top-0 z-10 bg-muted text-xs">
      <tr>
        <th className="w-9 p-2" />
        <th className="p-2 text-left font-medium">Sipariş / Müşteri</th>
        <th className="p-2 text-left font-medium">Kumaş / Renk</th>
        <th className="p-2 text-right font-medium">Açık</th>
        <th className="p-2 text-left font-medium">Termin</th>
        <th className="p-2 text-right font-medium" title="Bu iş emrinin metresinden bu satıra ayrılan (plan)">
          Paylaştır
        </th>
      </tr>
    </thead>
  );
}
