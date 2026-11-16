// =============================================================================
// Bekçi: Tambur "İş Emri Siparişleri" modalı paylaştırılan metreyi gösterir
// =============================================================================
// 2026-11-17: paylaştırma belirlenmiş satırda modal siparişin toplam metresini
// (`orderedQty`) HİÇ göstermez; bu işten planlanan metreyi "Bu işten planlanan"
// etiketiyle gösterir. Plansız satır ve eski backend (alan yok) bugünkü gibi
// siparişin metresini etiketsiz gösterir. Karışık siparişte her satır kendi
// kuralıyla.
// Negatif sonda: `orderLineDisplayQty` `orderedQty`ye sabitlenince planlı satır
// beklentileri kırmızıya düşer (ölçüldü).
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
  it('paylaştırma varsa planlanan metre + etiket; sipariş toplamı yazılmaz', () => {
    renderModal([order([line('l1', 'Kadife', 1000, { plannedQty: 250 })])]);
    expect(pillText('l1')).toBe('250.0 m');
    expect(screen.getByText('Bu işten planlanan')).toBeTruthy();
    expect(screen.queryByText('1000.0')).toBeNull();
  });

  it('plannedQty null → siparişin metresi, etiket yok (bugünkü görünüm)', () => {
    renderModal([order([line('l1', 'Kadife', 1000, { plannedQty: null })])]);
    expect(pillText('l1')).toBe('1000.0 m');
    expect(screen.queryByText('Bu işten planlanan')).toBeNull();
  });

  it('eski backend 2.12.2 (alan yok) → siparişin metresi, etiket yok', () => {
    renderModal([order([line('l1', 'Kadife', 480)])]);
    expect(pillText('l1')).toBe('480.0 m');
    expect(screen.queryByText('Bu işten planlanan')).toBeNull();
  });

  it('karışık: planlı satır planı, plansız satır siparişi gösterir', () => {
    renderModal([
      order([
        line('l1', 'Kadife', 1000, { plannedQty: 300 }),
        line('l2', 'Saten', 600, { plannedQty: null }),
        line('l3', 'Keten', 200),
      ]),
    ]);
    expect(pillText('l1')).toBe('300.0 m');
    expect(pillText('l2')).toBe('600.0 m');
    expect(pillText('l3')).toBe('200.0 m');
    expect(screen.getAllByText('Bu işten planlanan')).toHaveLength(1);
    expect(screen.queryByText('1000.0')).toBeNull();
  });
});
