import type { TamburContextOrderLine } from '../../../types/models';

/**
 * Tambur sipariş modalında bir sipariş satırı için GÖSTERİLECEK metre — tek kaynak.
 *
 * Paylaştırma belirlenmişse (`plannedQty` sonlu sayı ve > 0) bu iş emrinden o
 * satıra paylaştırılan metre gösterilir; siparişin toplam metresi (`orderedQty`)
 * bu durumda Tambur'da HİÇ gösterilmez (kullanıcı kararı 2026-11-17: "tamburun
 * o siparişin tamamını bilmesine gerek yok").
 *
 * `plannedQty` null / 0 / alan yok (eski backend 2.12.2) → bugünkü davranış:
 * siparişin metresi (`orderedQty`, negatif/boş → 0).
 */
export interface OrderLineDisplayQty {
  qty: number;
  /** true → `qty` bu işten planlanan metredir; false → siparişin metresi. */
  planned: boolean;
}

export const PLANNED_QTY_LABEL = 'Bu işten planlanan';

export function orderLineDisplayQty(
  line: Pick<TamburContextOrderLine, 'orderedQty' | 'plannedQty'>,
): OrderLineDisplayQty {
  const planned = line.plannedQty;
  if (typeof planned === 'number' && Number.isFinite(planned) && planned > 0) {
    return { qty: planned, planned: true };
  }
  return { qty: Math.max(0, line.orderedQty || 0), planned: false };
}
