import React, { useMemo } from 'react';
import { useWindowDimensions, View } from 'react-native';
import { Text } from 'react-native-paper';
import Animated, { FadeInUp, FadeOut, useReducedMotion } from 'react-native-reanimated';
import { durations } from '../../../theme';
import type { TamburContextOrder } from '../../../types/models';
import { buildOrdersBalloonRows } from './ordersBalloonRows';
import { ordersBoxStyles as s } from './TamburOrdersBox.styles';

// ─────────────────────────────────────────────────────────────────────────────
// Tambur sipariş BALONU — sipariş kutusunun hemen altında, aşağı doğru açılan
// sade panel: her sipariş satırı için "müşteri   metre". Başka hiçbir şey yok
// (sipariş no, renk, başlık → basılı tutunca açılan ayrıntı modalında).
// Akışa girmez: alttaki bileşenin üstünde yüzer, yer açmaz; dokunuş almaz.
// ─────────────────────────────────────────────────────────────────────────────

/** Tablette balonun en geniş hâli (dp) — taşan müşteri adı `…` ile kesilir. */
const BALLOON_MAX_WIDTH_TABLET = 360;

export default function TamburOrdersBalloon({
  orders,
  compact,
}: {
  orders: TamburContextOrder[];
  compact: boolean;
}) {
  const { width: winW } = useWindowDimensions();
  const reduced = useReducedMotion();
  const { rows, moreCount } = useMemo(() => buildOrdersBalloonRows(orders), [orders]);
  if (rows.length === 0) return null;

  const maxWidth = compact ? '100%' : Math.min(BALLOON_MAX_WIDTH_TABLET, winW * 0.4);
  return (
    <Animated.View
      entering={reduced ? undefined : FadeInUp.duration(durations.fast)}
      exiting={reduced ? undefined : FadeOut.duration(durations.instant)}
      style={[s.balloon, { maxWidth }]}
      pointerEvents="none"
      testID="tambur-orders-balloon"
    >
      {rows.map((r) => (
        <View key={r.key} style={s.row} testID={`balloon-row-${r.key}`}>
          <Text style={s.customer} numberOfLines={1} ellipsizeMode="tail">
            {r.customerName}
          </Text>
          <Text style={s.qty} numberOfLines={1}>
            {r.qtyText}
          </Text>
        </View>
      ))}
      {moreCount > 0 && <Text style={s.more}>+{moreCount} daha</Text>}
    </Animated.View>
  );
}
