// Tambur başlık kutuları (mt kalan / sarım / sipariş) + sipariş balonu — ortak
// stil değerleri. Balon kutunun köşe ve renk dilini TAŞIR (kullanıcı tasarımı
// 2026-11-17: "köşe radius miktarı kutununkiyle aynı"); değer burada tek kaynak,
// `TamburScreen` başlık kutusu da buradan okur.
import { StyleSheet } from 'react-native';
import { colors, palette, spacing } from '../../../theme';

/** Başlık kutularının (ve balonun) köşe yarıçapı. */
export const HEADER_BOX_RADIUS = 10;
/** Sipariş kutusunun turuncusu (2026-08-04 kararı) — balonun kenarı da bu. */
export const ORDERS_BOX_COLOR = palette.orange[600];

export const ordersBoxStyles = StyleSheet.create({
  // Kutu satırı balonun ÇAPASIDIR: balon akışa girmez, satırın altından taşıp
  // alttaki bileşenin ÜSTÜNDE yüzer (kullanıcı 2026-11-17: lacivert bant
  // uzamayacak, hiçbir şey aşağı kaymayacak).
  group: { alignItems: 'flex-end', zIndex: 20 },
  groupCompact: { alignSelf: 'stretch' },
  balloon: {
    position: 'absolute',
    top: '100%',
    right: 0,
    marginTop: spacing.xs,
    zIndex: 20,
    elevation: 6,
    backgroundColor: colors.surface,
    borderRadius: HEADER_BOX_RADIUS,
    borderWidth: 1.5,
    borderColor: ORDERS_BOX_COLOR,
    paddingHorizontal: spacing.md - 2,
    paddingVertical: spacing.xs + 2,
    gap: 2,
    overflow: 'hidden',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.md,
    minHeight: 22,
  },
  customer: {
    flexShrink: 1,
    fontSize: 14,
    fontWeight: '600',
    color: colors.text,
  },
  qty: {
    flexShrink: 0,
    fontSize: 14,
    fontWeight: '800',
    color: palette.orange[700],
    fontVariant: ['tabular-nums'],
    textAlign: 'right',
  },
  more: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.textSecondary,
  },
});
