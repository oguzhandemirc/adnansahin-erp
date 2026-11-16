// =============================================================================
// Bekçi: Tambur "İş Emri Siparişleri" modalı — sipariş toplamı + planlanan
// =============================================================================
// 2026-11-17 (ikinci tur): modal artık sipariş kutusuna BASILI TUTUNCA açılan
// AYRINTI yüzeyidir; siparişin metresi (`orderedQty`) HER ZAMAN pill'dedir ve
// sipariş no görünür. Paylaştırma varsa pill "Sipariş toplamı" etiketini alır,
// altında AYRICA "Bu işten planlanan X m" yazar. Plansız satır ve eski backend
// (alan yok) etiketsiz siparişin metresi.
// Negatif sondalar (ölçüldü): (1) pill'i `orderLineDisplayQty(line).qty`ye
// döndürmek "toplam her zaman" vakalarını kırmızıya düşürür; (2) yardımcıyı
// `planned:false`a sabitlemek "planlanan satırı" vakalarını kırmızıya düşürür.
// =============================================================================
import React from 'react';
import { screen, within } from '@testing-library/react-native';
import { renderWithPaper } from '../../../test/render';
import TamburOrdersDetailModal from './TamburOrdersDetailModal';
import type { TamburContextOrder, TamburContextOrderLine } from '../../../types/models';

const line = (
  lineId: string,
  itemName: string,
  orderedQty: number,
  extra: Partial<TamburContextOrderLine> = {},
): TamburContextOrderLine => ({
  lineId,
  itemCode: itemName.toUpperCase(),
  itemName,
  colorCode: null,
  colorName: null,
  width: null,
  orderedQty,
  requiredProperties: [],
  ...extra,
});

const order = (lines: TamburContextOrderLine[]): TamburContextOrder => ({
  orderId: 'o1',
  orderNumber: 'SP-0001',
  customerId: 'c1',
  customerName: 'Metro Tekstil',
  lines,
});

const pillText = (lineId: string) =>
  within(screen.getByTestId(`order-line-qty-${lineId}`))
    .getAllByText(/./)
    .map((n) => String(n.props.children))
    .join(' ');

const renderModal = (orders: TamburContextOrder[]) =>
  renderWithPaper(
    <TamburOrdersDetailModal visible orders={orders} onDismiss={() => undefined} />,
  );

describe('TamburOrdersDetailModal metre', () => {
  it('paylaştırma varsa sipariş toplamı pill\'de KALIR + ayrıca planlanan satırı', () => {
    renderModal([order([line('l1', 'Kadife', 1000, { plannedQty: 250 })])]);
    expect(pillText('l1')).toBe('1000.0 m');
    expect(screen.getByText('Sipariş toplamı')).toBeTruthy();
    expect(screen.getByText(/^Bu işten planlanan\s*250\.0 m$/)).toBeTruthy();
  });

  it('sipariş no ve müşteri ayrıntıda görünür', () => {
    renderModal([order([line('l1', 'Kadife', 1000, { plannedQty: 250 })])]);
    expect(screen.getByText('SP-0001')).toBeTruthy();
    expect(screen.getByText('Metro Tekstil')).toBeTruthy();
  });

  it('plannedQty null → siparişin metresi, etiket yok (bugünkü görünüm)', () => {
    renderModal([order([line('l1', 'Kadife', 1000, { plannedQty: null })])]);
    expect(pillText('l1')).toBe('1000.0 m');
    expect(screen.queryByTestId('order-line-planned-l1')).toBeNull();
    expect(screen.queryByText('Sipariş toplamı')).toBeNull();
  });

  it('eski backend 2.12.2 (alan yok) → siparişin metresi, etiket yok', () => {
    renderModal([order([line('l1', 'Kadife', 480)])]);
    expect(pillText('l1')).toBe('480.0 m');
    expect(screen.queryByTestId('order-line-planned-l1')).toBeNull();
  });

  it('karışık: her satır kendi toplamı; yalnız planlı satırda planlanan', () => {
    renderModal([
      order([
        line('l1', 'Kadife', 1000, { plannedQty: 300 }),
        line('l2', 'Saten', 600, { plannedQty: null }),
        line('l3', 'Keten', 200),
      ]),
    ]);
    expect(pillText('l1')).toBe('1000.0 m');
    expect(pillText('l2')).toBe('600.0 m');
    expect(pillText('l3')).toBe('200.0 m');
    expect(screen.getByText(/^Bu işten planlanan\s*300\.0 m$/)).toBeTruthy();
    expect(screen.queryByTestId('order-line-planned-l2')).toBeNull();
    expect(screen.queryByTestId('order-line-planned-l3')).toBeNull();
  });
});
