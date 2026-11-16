// =============================================================================
// Bekçi: Tambur sipariş kutusu — dokun = balon, basılı tut = ayrıntı modalı
// =============================================================================
// 2026-11-17 kullanıcı tasarımı: tek dokunuş kutunun altında sade balonu açar,
// tekrar dokunuş kapatır, modalı AÇMAZ; basılı tutma ayrıntı modalını açar;
// balon iş emri (kart) değişince kapalı başlar. Balon yalnız müşteri + metre
// yazar; uzun müşteri adı tek satırda kesilir, metre ayrı Text'te tam durur.
// Negatif sondalar (ölçüldü): (1) `onPress` modalı açacak şekilde geri
// alınınca "tek dokunuş modalı açmaz" kırmızı; (2) `useOrdersBalloon` hâli
// karttan bağımsız (düz boolean) tutulunca "kart değişince kapalı" kırmızı.
// =============================================================================
import React from 'react';
import { act, fireEvent, renderHook, screen, within } from '@testing-library/react-native';
import { renderWithPaper } from '../../../test/render';
import type { TamburContextOrder, TamburContextOrderLine } from '../../../types/models';
import TamburOrdersHeaderBoxes, {
  ORDERS_DETAIL_LONG_PRESS_MS,
  useOrdersBalloon,
} from './TamburOrdersHeaderBoxes';

// Ayrıntı modalı saplanır: içeriği kendi bekçisinde (TamburOrdersDetailModal.test)
// ölçülür; burada yalnız "açıldı mı" sorulur (AppModal portalı test ağacında
// false→true geçişini senkron göstermiyor).
jest.mock('./TamburOrdersDetailModal', () => {
  const { Text } = jest.requireActual('react-native');
  return {
    __esModule: true,
    default: ({ visible, orders }: { visible: boolean; orders: { orderNumber: string }[] }) =>
      visible ? <Text testID="orders-detail-modal">{orders.map((o) => o.orderNumber).join(',')}</Text> : null,
  };
});

const line = (lineId: string, orderedQty: number, plannedQty?: number | null) =>
  ({
    lineId,
    itemCode: 'K',
    itemName: 'Kadife',
    colorCode: null,
    colorName: null,
    width: null,
    orderedQty,
    requiredProperties: [],
    ...(plannedQty === undefined ? {} : { plannedQty }),
  }) as TamburContextOrderLine;

const LONG_NAME = 'Çok Uzun Adlı Tekstil Sanayi ve Ticaret Anonim Şirketi İstanbul Şubesi';
const ORDERS: TamburContextOrder[] = [
  { orderId: 'o1', orderNumber: 'SP-0042', customerId: 'c1', customerName: 'Metro Tekstil',
    lines: [line('l1', 1000, 250)] },
  { orderId: 'o2', orderNumber: 'SP-0043', customerId: 'c2', customerName: LONG_NAME,
    lines: [line('l2', 480)] },
];

function Harness({ cardKey, orders = ORDERS }: { cardKey: string; orders?: TamburContextOrder[] }) {
  const b = useOrdersBalloon(cardKey);
  return (
    <TamburOrdersHeaderBoxes
      orders={orders}
      compact={false}
      balloonOpen={b.open}
      onToggleBalloon={b.toggle}
      rowStyle={{ flexDirection: 'row' }}
      boxStyle={{ minHeight: 52 }}
      valueStyle={{}}
      subStyle={{}}
    >
      {null}
    </TamburOrdersHeaderBoxes>
  );
}

const modalShown = () => screen.queryByTestId('orders-detail-modal') != null;

describe('Tambur sipariş kutusu', () => {
  it('tek dokunuş balonu açar, ikinci dokunuş kapatır; modal AÇILMAZ', () => {
    renderWithPaper(<Harness cardKey="card-1" />);
    expect(screen.queryByTestId('tambur-orders-balloon')).toBeNull();
    fireEvent.press(screen.getByTestId('tambur-orders-box'));
    expect(screen.getByTestId('tambur-orders-balloon')).toBeTruthy();
    expect(modalShown()).toBe(false);
    fireEvent.press(screen.getByTestId('tambur-orders-box'));
    expect(screen.queryByTestId('tambur-orders-balloon')).toBeNull();
    expect(modalShown()).toBe(false);
  });

  it('balon yalnız müşteri + metre yazar (sipariş no YOK)', () => {
    renderWithPaper(<Harness cardKey="card-1" />);
    fireEvent.press(screen.getByTestId('tambur-orders-box'));
    const balloon = screen.getByTestId('tambur-orders-balloon');
    expect(within(balloon).getByText('Metro Tekstil')).toBeTruthy();
    expect(within(balloon).getByText('250 m')).toBeTruthy();
    expect(within(balloon).getByText('480 m')).toBeTruthy();
    expect(within(balloon).queryByText(/SP-00/)).toBeNull();
    expect(within(balloon).queryByText('1000 m')).toBeNull();
  });

  it('uzun müşteri adı tek satırda kesilir, metre ayrı ve kesilmeden durur', () => {
    renderWithPaper(<Harness cardKey="card-1" />);
    fireEvent.press(screen.getByTestId('tambur-orders-box'));
    const name = screen.getByText(LONG_NAME);
    expect(name.props.numberOfLines).toBe(1);
    expect(name.props.ellipsizeMode).toBe('tail');
    const row = screen.getByTestId('balloon-row-l2');
    expect(within(row).getByText('480 m')).toBeTruthy();
  });

  it('6 satırda balon uzamaz: 4 satır + "+2 daha"', () => {
    const many: TamburContextOrder[] = [
      { orderId: 'o9', orderNumber: 'SP-9', customerId: 'c9', customerName: 'Akın',
        lines: Array.from({ length: 6 }, (_, i) => line(`m${i}`, 10 * (i + 1))) },
    ];
    renderWithPaper(<Harness cardKey="card-1" orders={many} />);
    fireEvent.press(screen.getByTestId('tambur-orders-box'));
    expect(screen.getAllByText('Akın')).toHaveLength(4);
    expect(screen.getByText('+2 daha')).toBeTruthy();
  });

  it('basılı tutma ayrıntı modalını açar (sipariş no orada)', () => {
    renderWithPaper(<Harness cardKey="card-1" />);
    fireEvent(screen.getByTestId('tambur-orders-box'), 'longPress');
    expect(modalShown()).toBe(true);
    expect(screen.getByTestId('orders-detail-modal').props.children).toBe('SP-0042,SP-0043');
    expect(screen.queryByTestId('tambur-orders-balloon')).toBeNull();
  });

  it('basılı tutma süresi tek sabitte ve kutuya verilmiş', () => {
    renderWithPaper(<Harness cardKey="card-1" />);
    // Kompozit TouchableRipple'ın prop'u: sabit gerçekten kutuya verilmiş olmalı.
    expect(
      screen.UNSAFE_getByProps({
        testID: 'tambur-orders-box',
        delayLongPress: ORDERS_DETAIL_LONG_PRESS_MS,
      }),
    ).toBeTruthy();
    expect(ORDERS_DETAIL_LONG_PRESS_MS).toBe(500);
  });

  it('sipariş yoksa kutu ve balon çizilmez', () => {
    renderWithPaper(<Harness cardKey="card-1" orders={[]} />);
    expect(screen.queryByTestId('tambur-orders-box')).toBeNull();
    expect(screen.queryByTestId('tambur-orders-balloon')).toBeNull();
  });

  it('erişilebilirlik etiketi ve ipucu', () => {
    renderWithPaper(<Harness cardKey="card-1" />);
    const box = screen.getByTestId('tambur-orders-box');
    expect(box.props.accessibilityLabel).toBe('2 sipariş');
    expect(box.props.accessibilityHint).toBe('Dokun: siparişleri göster · Basılı tut: ayrıntı');
  });
});

describe('useOrdersBalloon', () => {
  it('kart değişince kapalı başlar; aynı kartta açık kalır', () => {
    const { result, rerender } = renderHook(({ k }: { k: string | null }) => useOrdersBalloon(k), {
      initialProps: { k: 'card-1' as string | null },
    });
    expect(result.current.open).toBe(false);
    act(() => result.current.toggle());
    expect(result.current.open).toBe(true);
    rerender({ k: 'card-1' });
    expect(result.current.open).toBe(true);
    rerender({ k: 'card-2' });
    expect(result.current.open).toBe(false);
    rerender({ k: null });
    expect(result.current.open).toBe(false);
    act(() => result.current.toggle());
    expect(result.current.open).toBe(false);
  });
});
