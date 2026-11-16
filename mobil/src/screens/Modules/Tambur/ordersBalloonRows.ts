import type { TamburContextOrder } from '../../../types/models';
import { orderLineDisplayQty } from './orderLineDisplayQty';

// ─────────────────────────────────────────────────────────────────────────────
// Tambur sipariş balonunun satırları — saf mantık (kullanıcı tasarımı 2026-11-17:
// "balon çok sade olacak. müşteri ve metre, bu kadar").
//
// Her sipariş SATIRI tek balon satırıdır: müşteri adı + gösterilecek metre.
// Metre kararı tek kaynaktan (`orderLineDisplayQty`): paylaştırma varsa bu işten
// planlanan, yoksa siparişin metresi. Aynı müşterinin birden çok satırı TOPLANMAZ
// (ekran toplamaz; her satır kendi metresiyle yazılır).
// Balon uzamasın: toplam satır `ORDERS_BALLOON_MAX_ROWS`u aşarsa ilk
// (MAX − 1) satır + "+N daha" satırı → balon en çok MAX satır yüksekliğindedir.
// ─────────────────────────────────────────────────────────────────────────────

export const ORDERS_BALLOON_MAX_ROWS = 5;

export interface OrdersBalloonRow {
  key: string;
  customerName: string;
  qtyText: string;
}

export interface OrdersBalloonRows {
  rows: OrdersBalloonRow[];
  /** Gösterilmeyen satır sayısı ("+N daha"); 0 → satır yok. */
  moreCount: number;
}

/** "500 m" · "250.5 m" — tam sayıda ondalık yazılmaz (ekranın nokta dili). */
export function formatBalloonQty(qty: number): string {
  const rounded = Math.round(qty * 10) / 10;
  return `${Number.isInteger(rounded) ? rounded.toFixed(0) : rounded.toFixed(1)} m`;
}

export function buildOrdersBalloonRows(
  orders: TamburContextOrder[],
  maxRows: number = ORDERS_BALLOON_MAX_ROWS,
): OrdersBalloonRows {
  const all: OrdersBalloonRow[] = orders.flatMap((o) =>
    o.lines.map((line) => ({
      key: line.lineId,
      customerName: (o.customerName || '').trim() || '—',
      qtyText: formatBalloonQty(orderLineDisplayQty(line).qty),
    })),
  );
  if (all.length <= maxRows) return { rows: all, moreCount: 0 };
  const visible = Math.max(1, maxRows - 1);
  return { rows: all.slice(0, visible), moreCount: all.length - visible };
}
