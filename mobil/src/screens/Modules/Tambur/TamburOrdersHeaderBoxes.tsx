import React, { useCallback, useState } from 'react';
import { View, type StyleProp, type TextStyle, type ViewStyle } from 'react-native';
import { Text, TouchableRipple } from 'react-native-paper';
import type { TamburContextOrder } from '../../../types/models';
import TamburOrdersBalloon from './TamburOrdersBalloon';
import TamburOrdersDetailModal from './TamburOrdersDetailModal';
import { ordersBoxStyles as s } from './TamburOrdersBox.styles';

// ─────────────────────────────────────────────────────────────────────────────
// Tambur başlığındaki kutu grubu (mt kalan / sarım / SİPARİŞ) + sipariş balonu.
// Kullanıcı tasarımı 2026-11-17:
//  · sipariş kutusuna TEK dokunuş → altında sade balon açılır, tekrar dokunuş
//    kapatır; başka hiçbir etkileşim balonu kapatmaz (popover değil);
//  · balon iş emri (kart) açık olduğu sürece açık kalır; yeni kart kapalı başlar;
//  · BASILI TUTMA → ayrıntı modalı (sipariş no, kumaş/renk, siparişin tamamı).
// Balon akışa GİRMEZ: kutu satırına mutlak konumla çapalanır, başlık bandını
// uzatmaz, alttaki bileşenin üstünde yüzer; dokunuş yutmaz (pointerEvents none).
// ─────────────────────────────────────────────────────────────────────────────

/** Sipariş kutusunu basılı tutma süresi (ms) — ayrıntı modalı bu sürede açılır. */
export const ORDERS_DETAIL_LONG_PRESS_MS = 500;

/**
 * Balon açık mı — açık olduğu KART anahtarıyla tutulur; kart değişince anahtar
 * uyuşmaz → kapalı. Aynı karta dönülürse operatörün bıraktığı hâl korunur.
 */
export function useOrdersBalloon(cardKey: string | null | undefined) {
  const [openFor, setOpenFor] = useState<string | null>(null);
  const open = !!cardKey && openFor === cardKey;
  const toggle = useCallback(() => {
    if (!cardKey) return;
    setOpenFor((cur) => (cur === cardKey ? null : cardKey));
  }, [cardKey]);
  return { open, toggle };
}

interface Props {
  /** Balon açık mı — durum EKRAN kökünde yaşar (`useOrdersBalloon`): başlık top
   *  değişiminde yeniden kurulsa da iş emri açık olduğu sürece hâl korunur. */
  balloonOpen: boolean;
  onToggleBalloon: () => void;
  orders: TamburContextOrder[];
  compact: boolean;
  /** Kutu satırının stili (ekranın `headerBoxes` + compact). */
  rowStyle: StyleProp<ViewStyle>;
  /** Sipariş kutusunun stili (ekranın `headerBox` + turuncu + compact flex). */
  boxStyle: StyleProp<ViewStyle>;
  valueStyle: StyleProp<TextStyle>;
  subStyle: StyleProp<TextStyle>;
  /** Önceki kutular (mt kalan, sarım). */
  children: React.ReactNode;
}

export default function TamburOrdersHeaderBoxes(props: Props) {
  const { orders, compact, rowStyle, boxStyle, valueStyle, subStyle } = props;
  const [detailOpen, setDetailOpen] = useState(false);
  const hasOrders = orders.length > 0;
  const showBalloon = props.balloonOpen && hasOrders;

  return (
    <View style={[s.group, compact && s.groupCompact]}>
      <View style={rowStyle}>
        {props.children}
        {hasOrders && (
          <TouchableRipple
            onPress={props.onToggleBalloon}
            onLongPress={() => setDetailOpen(true)}
            delayLongPress={ORDERS_DETAIL_LONG_PRESS_MS}
            // Kutu 52 dp; dikey pay ile dokunma hedefi ≥ 56 dp (MO-15a).
            hitSlop={{ top: 4, bottom: 4 }}
            borderless
            style={boxStyle}
            accessibilityRole="button"
            accessibilityState={{ expanded: showBalloon }}
            accessibilityLabel={`${orders.length} sipariş`}
            accessibilityHint="Dokun: siparişleri göster · Basılı tut: ayrıntı"
            testID="tambur-orders-box"
          >
            <View style={{ alignItems: 'center' }}>
              <Text style={valueStyle}>{orders.length}</Text>
              <Text style={subStyle}>sipariş</Text>
            </View>
          </TouchableRipple>
        )}
      </View>
      {showBalloon && <TamburOrdersBalloon orders={orders} compact={compact} />}
      <TamburOrdersDetailModal
        visible={detailOpen}
        orders={orders}
        onDismiss={() => setDetailOpen(false)}
      />
    </View>
  );
}
