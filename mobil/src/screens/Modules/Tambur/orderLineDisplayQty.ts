import type { TamburContextOrderLine } from '../../../types/models';

/**
 * Tambur'da bir sipariş satırı için ÖN PLANDA gösterilecek metre — tek kaynak.
 *
 * Paylaştırma belirlenmişse (`plannedQty` sonlu sayı ve > 0) bu iş emrinden o
 * satıra paylaştırılan metre; `plannedQty` null / 0 / alan yok (eski backend
 * 2.12.2) → siparişin metresi (`orderedQty`, negatif/boş → 0).
 *
 * Kullanım (2026-11-17): sipariş BALONU yalnız bu metreyi yazar; ayrıntı modalı
 * siparişin metresini HER ZAMAN yazar ve `planned` ise bunu AYRICA
 * `PLANNED_QTY_LABEL` etiketiyle ekler.
 */
export interface OrderLineDisplayQty {
  qty: number;
  /** true → `qty` bu işten planlanan metredir; false → siparişin metresi. */
  planned: boolean;
}

export const PLANNED_QTY_LABEL = 'Bu işten planlanan';
/** Modalda paylaştırma varken siparişin metresinin etiketi. */
export const ORDER_TOTAL_LABEL = 'Sipariş toplamı';

export function orderLineDisplayQty(
  line: Pick<TamburContextOrderLine, 'orderedQty' | 'plannedQty'>,
): OrderLineDisplayQty {
  const planned = line.plannedQty;
  if (typeof planned === 'number' && Number.isFinite(planned) && planned > 0) {
    return { qty: planned, planned: true };
  }
  return { qty: Math.max(0, line.orderedQty || 0), planned: false };
}
