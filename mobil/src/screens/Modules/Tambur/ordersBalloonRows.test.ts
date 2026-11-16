// =============================================================================
// Bekçi: Tambur sipariş balonu satırları — müşteri + metre, başka hiçbir şey
// =============================================================================
// 2026-11-17 kullanıcı tasarımı: "balon çok sade olacak. müşteri ve metre".
// Metre tek kaynaktan: plannedQty > 0 → o; değilse siparişin metresi (eski
// backend alan göndermez). Aynı müşteri birden çok satırda TOPLANMAZ. Satır
// sayısı MAX'ı aşarsa ilk (MAX−1) satır + "+N daha".
// Negatif sondalar (ölçüldü): (1) qty `orderedQty`ye sabitlenince planlı/karışık
// vakaları kırmızı; (2) satırlar müşteriye göre toplanınca "toplamaz" vakası
// kırmızı.
// =============================================================================
import type { TamburContextOrder, TamburContextOrderLine } from '../../../types/models';
import {
  buildOrdersBalloonRows,
  formatBalloonQty,
  ORDERS_BALLOON_MAX_ROWS,
} from './ordersBalloonRows';

const line = (
  lineId: string,
  orderedQty: number,
  plannedQty?: number | null,
): TamburContextOrderLine => ({
  lineId,
  itemCode: 'K',
  itemName: 'Kadife',
  colorCode: null,
  colorName: 'Lacivert',
  width: null,
  orderedQty,
  requiredProperties: [],
  ...(plannedQty === undefined ? {} : { plannedQty }),
});

const order = (
  orderId: string,
  customerName: string,
  lines: TamburContextOrderLine[],
): TamburContextOrder => ({
  orderId,
  orderNumber: `SP-${orderId}`,
  customerId: `c-${orderId}`,
  customerName,
  lines,
});

describe('buildOrdersBalloonRows', () => {
  it('planlı satır planlanan metreyi yazar', () => {
    const r = buildOrdersBalloonRows([order('1', 'Metro', [line('a', 1000, 250)])]);
    expect(r.rows).toEqual([{ key: 'a', customerName: 'Metro', qtyText: '250 m' }]);
    expect(r.moreCount).toBe(0);
  });

  it('plansız (null) ve eski backend (alan yok) siparişin metresini yazar', () => {
    const r = buildOrdersBalloonRows([
      order('1', 'Metro', [line('a', 1000, null)]),
      order('2', 'Akın', [line('b', 480)]),
    ]);
    expect(r.rows.map((x) => x.qtyText)).toEqual(['1000 m', '480 m']);
  });

  it('karışık: her satır kendi kuralıyla', () => {
    const r = buildOrdersBalloonRows([
      order('1', 'Metro', [line('a', 1000, 300), line('b', 600, 0), line('c', 200)]),
    ]);
    expect(r.rows.map((x) => x.qtyText)).toEqual(['300 m', '600 m', '200 m']);
  });

  it('aynı müşterinin satırları TOPLANMAZ, satır satır yazılır', () => {
    const r = buildOrdersBalloonRows([
      order('1', 'Metro', [line('a', 100, 40)]),
      order('2', 'Metro', [line('b', 100, 60)]),
    ]);
    expect(r.rows).toHaveLength(2);
    expect(r.rows.map((x) => x.qtyText)).toEqual(['40 m', '60 m']);
  });

  it('satır yalnız müşteri + metre taşır (sipariş no, renk yok)', () => {
    const r = buildOrdersBalloonRows([order('77', 'Metro', [line('a', 100)])]);
    expect(Object.keys(r.rows[0]).sort()).toEqual(['customerName', 'key', 'qtyText']);
    expect(JSON.stringify(r.rows)).not.toContain('SP-77');
    expect(JSON.stringify(r.rows)).not.toContain('Lacivert');
  });

  it(`MAX (${ORDERS_BALLOON_MAX_ROWS}) satıra kadar hepsi; aşınca ilk MAX−1 + "+N"`, () => {
    const five = Array.from({ length: 5 }, (_, i) => line(`l${i}`, 10));
    expect(buildOrdersBalloonRows([order('1', 'M', five)])).toMatchObject({ moreCount: 0 });
    const six = Array.from({ length: 6 }, (_, i) => line(`l${i}`, 10));
    const r = buildOrdersBalloonRows([order('1', 'M', six)]);
    expect(r.rows).toHaveLength(ORDERS_BALLOON_MAX_ROWS - 1);
    expect(r.moreCount).toBe(2);
  });

  it('sipariş yok → satır yok', () => {
    expect(buildOrdersBalloonRows([])).toEqual({ rows: [], moreCount: 0 });
  });
});

describe('formatBalloonQty', () => {
  it('tam sayı ondalıksız, kesirli tek ondalık', () => {
    expect(formatBalloonQty(500)).toBe('500 m');
    expect(formatBalloonQty(250.46)).toBe('250.5 m');
    expect(formatBalloonQty(99.96)).toBe('100 m');
  });
});
