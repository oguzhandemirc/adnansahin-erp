// =============================================================================
// Bekçi: Tambur sipariş modalında gösterilecek metre — tek kaynak
// =============================================================================
// 2026-11-17 kullanıcı kararı: "siparişin paylaştırması belirlendiyse siparişin
// kendisi değil paylaştırıldığı kadarı yazsın, tamburun o siparişin tamamını
// bilmesine gerek yok". Paylaştırma yok / alan yok (eski backend 2.12.2) →
// bugünkü davranış: siparişin metresi.
// Negatif sonda: yardımcı `orderedQty`ye sabitlenince "planlı" ve "karışık"
// vakaları kırmızıya düşer (ölçüldü).
// =============================================================================
import { orderLineDisplayQty } from './orderLineDisplayQty';

describe('orderLineDisplayQty', () => {
  it('paylaştırma varsa bu işten planlanan metre, sipariş toplamı değil', () => {
    expect(orderLineDisplayQty({ orderedQty: 1000, plannedQty: 250 })).toEqual({
      qty: 250,
      planned: true,
    });
  });

  it('plannedQty null → siparişin metresi (bugünkü davranış)', () => {
    expect(orderLineDisplayQty({ orderedQty: 1000, plannedQty: null })).toEqual({
      qty: 1000,
      planned: false,
    });
  });

  it('alan hiç yok (eski backend 2.12.2) → siparişin metresi', () => {
    expect(orderLineDisplayQty({ orderedQty: 480.5 })).toEqual({
      qty: 480.5,
      planned: false,
    });
  });

  it('plannedQty 0 / negatif / NaN → paylaştırma yok sayılır', () => {
    for (const p of [0, -5, Number.NaN]) {
      expect(orderLineDisplayQty({ orderedQty: 300, plannedQty: p })).toEqual({
        qty: 300,
        planned: false,
      });
    }
  });

  it('plansız satırda orderedQty boş/negatif → 0 (eski davranış)', () => {
    expect(orderLineDisplayQty({ orderedQty: -3, plannedQty: null }).qty).toBe(0);
    expect(
      orderLineDisplayQty({ orderedQty: undefined as unknown as number }).qty,
    ).toBe(0);
  });

  it('karışık satırlar: her satır kendi kuralıyla', () => {
    const lines = [
      { orderedQty: 1000, plannedQty: 400 },
      { orderedQty: 600, plannedQty: null },
      { orderedQty: 200 },
      { orderedQty: 900, plannedQty: 120.5 },
    ];
    expect(lines.map(orderLineDisplayQty)).toEqual([
      { qty: 400, planned: true },
      { qty: 600, planned: false },
      { qty: 200, planned: false },
      { qty: 120.5, planned: true },
    ]);
  });
});
