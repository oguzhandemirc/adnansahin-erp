import React, { useMemo } from 'react';
import { ScrollView, useWindowDimensions, View } from 'react-native';
import { Icon, IconButton, Text } from 'react-native-paper';
import AppModal from '../../../components/AppModal';
import { AnimatedEntrance } from '../../../components/motion';
import { colors } from '../../../theme';
import { upperTr } from '../../../utils/trCase';
import type { TamburContextOrder } from '../../../types/models';
import {
  ORDER_TOTAL_LABEL,
  orderLineDisplayQty,
  PLANNED_QTY_LABEL,
} from './orderLineDisplayQty';
import { ORDERS_ACCENT_DARK, ordersModalStyles } from './TamburOrdersDetailModal.styles';

// ─────────────────────────────────────────────────────────────────────────────
// İş Emri Siparişleri Detay Modal'ı — operatör kesim planı için referans alır.
// Her sipariş kalemi: müşteri + sipariş no + ürün + renk + siparişin metresi
// (her zaman); paylaştırma varsa ayrıca "Bu işten planlanan X m". Sipariş
// kutusuna BASILI TUTUNCA açılır (tek dokunuş sade balonu açar, 2026-11-17).
// ─────────────────────────────────────────────────────────────────────────────
export default function TamburOrdersDetailModal({
  visible,
  orders,
  onDismiss,
}: {
  visible: boolean;
  orders: TamburContextOrder[];
  onDismiss: () => void;
}) {
  const { width: winW, height: winH } = useWindowDimensions();
  const phone = winW < 600;

  // Başlık özeti için toplam kalem sayısı.
  const lineCount = useMemo(
    () => orders.reduce((n, o) => n + o.lines.length, 0),
    [orders],
  );

  return (
    <AppModal visible={visible} onDismiss={onDismiss}>
      <View
        style={[
          ordersModalStyles.sheet,
          {
            width: phone ? winW * 0.94 : Math.min(720, winW * 0.62),
            maxHeight: winH * 0.86,
          },
        ]}
      >
        {/* Başlık — lacivert kimlik; özet (sipariş + kalem) gömülü */}
        <View style={ordersModalStyles.header}>
          <View style={ordersModalStyles.headerIcon}>
            <Icon source="clipboard-list-outline" size={22} color="#fff" />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={ordersModalStyles.title}>İş Emri Siparişleri</Text>
            <Text style={ordersModalStyles.subtitle}>
              {orders.length} sipariş · {lineCount} kalem
            </Text>
          </View>
          <IconButton
            icon="close"
            size={22}
            iconColor="#fff"
            onPress={onDismiss}
            style={{ margin: 0 }}
          />
        </View>

        <ScrollView
          contentContainerStyle={ordersModalStyles.scroll}
          showsVerticalScrollIndicator={false}
        >
          {orders.length === 0 ? (
            <View style={ordersModalStyles.emptyWrap}>
              <Icon
                source="package-variant-closed"
                size={44}
                color={colors.borderStrong}
              />
              <Text style={ordersModalStyles.empty}>
                Bu iş emrine bağlı sipariş yok
              </Text>
              <Text style={ordersModalStyles.emptyHint}>Stok için üretim</Text>
            </View>
          ) : (
            orders.map((o, oi) => (
              <AnimatedEntrance
                key={o.orderId}
                index={oi}
                style={ordersModalStyles.orderCard}
              >
                {/* Sipariş başlığı — müşteri baş harfi rozeti + ad + sipariş no */}
                <View style={ordersModalStyles.orderHeaderRow}>
                  <View style={ordersModalStyles.avatar}>
                    <Text style={ordersModalStyles.avatarText}>
                      {upperTr((o.customerName || '?').trim().charAt(0))}
                    </Text>
                  </View>
                  <Text style={ordersModalStyles.customerName} numberOfLines={1}>
                    {o.customerName}
                  </Text>
                  <View style={ordersModalStyles.orderChip}>
                    <Icon source="pound" size={11} color={ORDERS_ACCENT_DARK} />
                    <Text style={ordersModalStyles.orderChipText}>
                      {o.orderNumber}
                    </Text>
                  </View>
                </View>

                {o.lines.map((line) => {
                  // Loose modelde top→sipariş satırı bağı yok; per-line karşılanma
                  // türetilemez (backend F133) → kalan/karşılanan gösterilmez.
                  // Metre kararı tek kaynak: paylaştırma varsa bu işten planlanan.
                  const shown = orderLineDisplayQty(line);
                  const hasMeta =
                    line.width != null ||
                    line.requiredProperties.length > 0 ||
                    line.pieceLengthM != null ||
                    !!line.cutNote?.trim();
                  return (
                    <View key={line.lineId} style={ordersModalStyles.lineRow}>
                      {/* Sol: ürün + tüm nitelikler tek satır akışında (kompakt) */}
                      <View style={ordersModalStyles.lineMain}>
                        <Text style={ordersModalStyles.lineItem} numberOfLines={1}>
                          {line.itemName}
                          {line.colorName ? (
                            <Text style={ordersModalStyles.lineColor}>
                              {' · '}
                              {line.colorName}
                            </Text>
                          ) : null}
                        </Text>

                        {hasMeta && (
                          <View style={ordersModalStyles.metaRow}>
                            {line.width != null && (
                              <View style={ordersModalStyles.metaChip}>
                                <Icon
                                  source="arrow-expand-horizontal"
                                  size={11}
                                  color={colors.textSecondary}
                                />
                                <Text style={ordersModalStyles.metaChipText}>
                                  {line.width} cm
                                </Text>
                              </View>
                            )}
                            {line.requiredProperties.map((p) => (
                              <View key={p.id} style={ordersModalStyles.propChip}>
                                <Text style={ordersModalStyles.propChipText}>
                                  {p.name}
                                </Text>
                              </View>
                            ))}
                            {line.pieceLengthM != null && (
                              <View style={ordersModalStyles.cutChip}>
                                <Icon
                                  source="content-cut"
                                  size={11}
                                  color={colors.warningDark}
                                />
                                <Text style={ordersModalStyles.cutChipText}>
                                  Her {line.pieceLengthM} m
                                </Text>
                              </View>
                            )}
                            {!!line.cutNote?.trim() && (
                              <View style={ordersModalStyles.cutChip}>
                                <Icon
                                  source="note-text-outline"
                                  size={11}
                                  color={colors.warningDark}
                                />
                                <Text
                                  style={ordersModalStyles.cutChipText}
                                  numberOfLines={1}
                                >
                                  {line.cutNote.trim()}
                                </Text>
                              </View>
                            )}
                          </View>
                        )}
                      </View>

                      {/* Sağ: siparişin metresi HER ZAMAN (lacivert pill).
                          Paylaştırma varsa pill "Sipariş toplamı" etiketi alır
                          ve altında AYRICA "Bu işten planlanan X m" yazar. */}
                      <View style={ordersModalStyles.qtyCol}>
                        <View
                          style={ordersModalStyles.remainingPill}
                          testID={`order-line-qty-${line.lineId}`}
                        >
                          <Text style={ordersModalStyles.remainingValue}>
                            {Math.max(0, line.orderedQty || 0).toFixed(1)}
                          </Text>
                          <Text style={ordersModalStyles.remainingUnit}>m</Text>
                        </View>
                        {shown.planned && (
                          <>
                            <Text style={ordersModalStyles.totalLabel}>
                              {ORDER_TOTAL_LABEL}
                            </Text>
                            <Text
                              style={ordersModalStyles.plannedLabel}
                              testID={`order-line-planned-${line.lineId}`}
                            >
                              {PLANNED_QTY_LABEL}{' '}
                              <Text style={ordersModalStyles.plannedValue}>
                                {shown.qty.toFixed(1)} m
                              </Text>
                            </Text>
                          </>
                        )}
                      </View>
                    </View>
                  );
                })}
              </AnimatedEntrance>
            ))
          )}
        </ScrollView>
      </View>
    </AppModal>
  );
}
