// Büyük başlık → küçülen başlık (iOS düzeni): içerikteki 34 pt başlık kaydırınca solar, üst bardaki 17 pt başlık
// ve ince alt çizgi belirir. Kaydırma değeri `useHeaderScroll` ile ekranın kaydırıcısından gelir (UI iş parçacığı).
import { BASMA } from "./hareket/sabitler";
import Ionicons from "@expo/vector-icons/Ionicons";
import { useCallback, useRef, type ReactNode } from "react";
import { Pressable, Text, View } from "react-native";
import Animated, { Extrapolation, interpolate, runOnJS, useAnimatedScrollHandler, useAnimatedStyle, useSharedValue, type SharedValue } from "react-native-reanimated";
import { makeStyles, useTokens } from "./theme-context";
import { BAR_HEIGHT, FONT_SCALE, TOUCH, space, typography } from "./tokens";

/** Başlığın tamamen küçüldüğü kaydırma mesafesi (büyük başlık satır yüksekliği). */
export const COLLAPSE_AT = 41;

/** Sona bu kadar kala `onEndReached` çağrılır (sonsuz kaydırma). */
export const END_THRESHOLD = 600;

export function useHeaderScroll(onEndReached?: () => void): { scrollY: SharedValue<number>; onScroll: ReturnType<typeof useAnimatedScrollHandler> } {
  const scrollY = useSharedValue(0);
  const nearEnd = useSharedValue(false);
  const endRef = useRef(onEndReached);
  endRef.current = onEndReached;
  const fireEnd = useCallback(() => endRef.current?.(), []);
  const wantsEnd = !!onEndReached;
  const onScroll = useAnimatedScrollHandler(
    {
      onScroll: (e) => {
        scrollY.value = e.contentOffset.y;
        if (!wantsEnd) return;
        // Eşiği GEÇİŞTE bir kez tetikler: her karede çağrı yok.
        const near = e.contentOffset.y + e.layoutMeasurement.height >= e.contentSize.height - END_THRESHOLD;
        if (near && !nearEnd.value) runOnJS(fireEnd)();
        nearEnd.value = near;
      },
    },
    [wantsEnd],
  );
  return { scrollY, onScroll };
}

/** Üst bar: geri düğmesi · küçük başlık (kaydırınca belirir) · sağ yuva. */
export function LargeHeader({ title, scrollY, topInset, onBack, right }: {
  readonly title: string;
  readonly scrollY: SharedValue<number>;
  readonly topInset: number;
  readonly onBack?: () => void;
  readonly right?: ReactNode;
}) {
  const t = useTokens();
  const s = useStyles();
  const small = useAnimatedStyle(() => ({ opacity: interpolate(scrollY.value, [COLLAPSE_AT * 0.6, COLLAPSE_AT], [0, 1], Extrapolation.CLAMP) }));
  const line = useAnimatedStyle(() => ({ opacity: interpolate(scrollY.value, [0, COLLAPSE_AT], [0, 1], Extrapolation.CLAMP) }));
  return (
    <View style={[s.bar, { paddingTop: topInset }]}>
      <View style={s.inner}>
        <View style={s.side}>
          {onBack ? (
            <Pressable accessibilityRole="button" accessibilityLabel="Geri" testID="geri" onPress={onBack} style={({ pressed }) => [s.back, pressed && { opacity: BASMA.opaklik }]} hitSlop={4}>
              <Ionicons name="chevron-back" size={24} color={t.tint} />
              <Text style={s.backText}>Geri</Text>
            </Pressable>
          ) : null}
        </View>
        <Animated.Text style={[s.small, small]} numberOfLines={1} maxFontSizeMultiplier={FONT_SCALE.title} importantForAccessibility="no" accessibilityElementsHidden>
          {title}
        </Animated.Text>
        <View style={[s.side, s.right]}>{right}</View>
      </View>
      <Animated.View style={[s.line, line]} />
    </View>
  );
}

/**
 * İçerikteki büyük başlık (ekran okuyucu bunu başlık olarak duyar). Eylem (ör. "Yeni sipariş") başlıkla AYNI satırda,
 * dikey ortalı ve sağa yaslıdır; uzun başlık kısalır/sarılır, eylem sarılmaz (`flexShrink: 0`).
 */
export function LargeTitle({ title, scrollY, subtitle, bleed = 0, action }: { readonly title: string; readonly scrollY: SharedValue<number>; readonly subtitle?: ReactNode; readonly bleed?: number; readonly action?: ReactNode }) {
  const s = useStyles();
  const fade = useAnimatedStyle(() => ({
    opacity: interpolate(scrollY.value, [0, COLLAPSE_AT * 0.8], [1, 0], Extrapolation.CLAMP),
    transform: [{ scale: interpolate(scrollY.value, [-80, 0], [1.06, 1], Extrapolation.CLAMP) }],
  }));
  return (
    <View style={[s.largeBlock, { marginHorizontal: -bleed, paddingHorizontal: bleed }]}>
      <View style={s.large}>
        <View style={s.titleRow} testID="baslik-satiri">
          <Animated.View style={[s.titleBox, fade]}>
            <Text style={s.largeText} accessibilityRole="header" numberOfLines={2} maxFontSizeMultiplier={FONT_SCALE.title}>{title}</Text>
          </Animated.View>
          {action ? <View style={s.action} testID="baslik-eylemi">{action}</View> : null}
        </View>
        {subtitle}
      </View>
    </View>
  );
}

const useStyles = makeStyles((t) => ({
  bar: { backgroundColor: t.color.chrome },
  inner: { height: BAR_HEIGHT, flexDirection: "row" as const, alignItems: "center" as const, paddingHorizontal: space.s },
  side: { minWidth: 88, flexDirection: "row" as const, alignItems: "center" as const },
  right: { justifyContent: "flex-end" as const },
  back: { minHeight: TOUCH, minWidth: TOUCH, flexDirection: "row" as const, alignItems: "center" as const },
  backText: { ...typography.body, color: t.tint },
  small: { ...typography.headline, color: t.text, flex: 1, textAlign: "center" as const },
  line: { height: 1, backgroundColor: t.color.chromeBorder },
  // Büyük başlık bloğu üst çubukla aynı krom zeminde, altında 1 px krom çizgisi: kabuk içerikten ayrışır.
  largeBlock: { backgroundColor: t.color.chrome, borderBottomWidth: 1, borderBottomColor: t.color.chromeBorder, marginBottom: space.l },
  large: { paddingBottom: space.m },
  titleRow: { flexDirection: "row" as const, alignItems: "center" as const, gap: space.m, minHeight: TOUCH },
  titleBox: { flex: 1, minWidth: 0, transformOrigin: "left" as const },
  action: { flexShrink: 0, flexDirection: "row" as const, alignItems: "center" as const },
  largeText: { ...typography.largeTitle, color: t.text },
}));
