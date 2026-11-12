import { formatNumber } from "@/lib/format";
import { Skeleton } from "@/components/ui/skeleton";
import type { CustomerSummaryAccess, CustomerSummaryQueries } from "./useCustomerSummary";

interface Tile {
  key: string;
  label: string;
  value: string;
  hint?: string;
}

interface Props {
  access: CustomerSummaryAccess;
  q: CustomerSummaryQueries;
}

/**
 * Toplam şeridi — YALNIZ uçların verdiği toplamlar (istemcide toplama yok); veremeyen,
 * izni olmayan ya da hata veren kutu çizilmez. Tutar/bakiye yok (finans kapalı).
 */
export function CustomerSummaryStrip({ access, q }: Props) {
  const tiles: Tile[] = [];
  let loading = false;
  const stats = q.stats.data?.data;
  if (access.orders) {
    if (q.stats.isLoading) loading = true;
    else if (stats) {
      tiles.push({ key: "orders", label: "Sipariş", value: formatNumber(stats.totalCount, 0), hint: "iptaller hariç" });
      tiles.push({ key: "open", label: "Açık miktar", value: `${formatNumber(stats.totalOpenQty, 1)} m`, hint: "istenen − sevk" });
    }
  }
  const ship = q.shipments.data?.summary;
  if (access.shipping) {
    if (q.shipments.isLoading) loading = true;
    else if (ship) {
      tiles.push({
        key: "shipped",
        label: "Sevk (brüt)",
        value: `${formatNumber(ship.totalMeters, 1)} m`,
        // Tartısız çuvalda kg toplamı 0'dır; "0 kg" yanıltır, yazılmaz.
        hint: `${formatNumber(ship.shipmentCount, 0)} sevk${ship.totalKg > 0 ? ` · ${formatNumber(ship.totalKg, 1)} kg` : ""}`,
      });
    }
  }
  const ret = q.returns.data?.summary;
  if (access.returns) {
    if (q.returns.isLoading) loading = true;
    else if (ret) {
      tiles.push({ key: "returns", label: "İade", value: `${formatNumber(ret.totalQty, 1)} m`, hint: `${formatNumber(ret.count, 0)} top` });
    }
  }
  if (tiles.length === 0 && !loading) return null;
  return (
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-4" data-testid="summary-strip">
      {tiles.map((t) => (
        <div key={t.key} className="rounded-md border bg-muted/30 px-3 py-2" data-testid={`summary-tile-${t.key}`}>
          <div className="text-[11px] text-muted-foreground">{t.label}</div>
          <div className="text-base font-semibold tabular-nums">{t.value}</div>
          {t.hint && <div className="truncate text-[11px] text-muted-foreground">{t.hint}</div>}
        </div>
      ))}
      {loading && <Skeleton className="h-[60px] w-full" />}
    </div>
  );
}
