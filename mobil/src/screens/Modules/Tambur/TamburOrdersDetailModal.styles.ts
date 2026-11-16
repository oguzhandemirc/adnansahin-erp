// Tambur "İş Emri Siparişleri" modalının stilleri (TamburScreen.tsx'ten taşındı 2026-11-17).
import { StyleSheet } from 'react-native';
import { colors, spacing, radius, shadow } from '../../../theme';

// Lacivert aksan — tema mavi (blue/info) ailesi; modal header + rozet/chip kimliği.
export const ORDERS_ACCENT = '#1e40af'; // blue-800
export const ORDERS_ACCENT_DARK = '#1e3a8a'; // blue-900 (en koyu — header)
export const ORDERS_ACCENT_SOFT = '#eff6ff'; // blue-50
export const ORDERS_ACCENT_BORDER = '#bfdbfe'; // blue-200
export const ORDERS_ACCENT_ON = '#dbeafe'; // blue-100

export const ordersModalStyles = StyleSheet.create({
  sheet: {
    backgroundColor: colors.surface,
    borderRadius: radius.xl,
    overflow: 'hidden',
    ...shadow.lg,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingLeft: spacing.lg,
    paddingRight: spacing.sm,
    paddingVertical: spacing.md,
    backgroundColor: ORDERS_ACCENT_DARK,
  },
  headerIcon: {
    width: 38,
    height: 38,
    borderRadius: radius.md,
    backgroundColor: 'rgba(255,255,255,0.16)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: { fontSize: 17, fontWeight: '800', color: '#fff' },
  subtitle: {
    fontSize: 12,
    fontWeight: '600',
    color: ORDERS_ACCENT_ON,
    marginTop: 1,
  },

  scroll: { padding: spacing.md, gap: spacing.sm },

  emptyWrap: { alignItems: 'center', paddingVertical: spacing.xxxl, gap: spacing.sm },
  empty: {
    textAlign: 'center',
    color: colors.textSecondary,
    fontSize: 14,
    fontWeight: '700',
  },
  emptyHint: { textAlign: 'center', color: colors.textMuted, fontSize: 12 },

  orderCard: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    ...shadow.sm,
  },
  orderHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingBottom: spacing.xs,
  },
  avatar: {
    width: 26,
    height: 26,
    borderRadius: radius.full,
    backgroundColor: ORDERS_ACCENT_ON,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: { fontSize: 13, fontWeight: '800', color: ORDERS_ACCENT_DARK },
  customerName: { flex: 1, fontSize: 14, fontWeight: '800', color: colors.text },
  orderChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
    backgroundColor: ORDERS_ACCENT_SOFT,
    borderWidth: 1,
    borderColor: ORDERS_ACCENT_BORDER,
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    borderRadius: radius.full,
  },
  orderChipText: { fontSize: 11, fontWeight: '700', color: ORDERS_ACCENT_DARK },

  // Tek satır akışında kompakt kalem satırı — ürün solda, kalan sağda.
  lineRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.xs + 2,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  lineMain: { flex: 1, gap: spacing.xs },
  lineItem: { fontSize: 13, fontWeight: '700', color: colors.text },
  lineColor: { fontWeight: '600', color: colors.textSecondary },

  metaRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: spacing.xs,
  },
  metaChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    backgroundColor: colors.surfaceMuted,
    paddingHorizontal: spacing.sm,
    paddingVertical: 1,
    borderRadius: radius.sm,
  },
  metaChipText: { fontSize: 11, fontWeight: '700', color: colors.textSecondary },
  propChip: {
    backgroundColor: ORDERS_ACCENT_ON,
    borderColor: ORDERS_ACCENT_BORDER,
    borderWidth: 1,
    paddingHorizontal: spacing.sm,
    paddingVertical: 1,
    borderRadius: radius.sm,
  },
  propChipText: { fontSize: 11, fontWeight: '700', color: ORDERS_ACCENT_DARK },
  cutChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    maxWidth: '100%',
    backgroundColor: colors.warningContainer,
    paddingHorizontal: spacing.sm,
    paddingVertical: 1,
    borderRadius: radius.sm,
  },
  cutChipText: {
    fontSize: 11,
    fontWeight: '700',
    color: colors.warningDark,
    flexShrink: 1,
  },

  remainingPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
    minWidth: 56,
    justifyContent: 'center',
    paddingHorizontal: spacing.sm,
    paddingVertical: 5,
    borderRadius: radius.sm,
    backgroundColor: ORDERS_ACCENT,
  },
  remainingValue: { fontSize: 15, fontWeight: '800', color: '#fff' },
  remainingUnit: { fontSize: 10, fontWeight: '700', color: ORDERS_ACCENT_ON },
  qtyCol: { alignItems: 'flex-end', gap: 2 },
  totalLabel: { fontSize: 12, fontWeight: '600', color: colors.textSecondary },
  plannedLabel: { fontSize: 12, fontWeight: '700', color: ORDERS_ACCENT },
  plannedValue: { fontSize: 14, fontWeight: '800', color: ORDERS_ACCENT },
});
