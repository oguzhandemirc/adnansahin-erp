// Ekran başlığı: tavana yakın, kaydırmayla kaybolmayan tek satır — [geri] Başlık ⟳ süre ········ [eylem].
// Geri düğmesi başlığın SOLUNDA aynı satırdadır; sekme köklerinde yoktur ve başlık sola yaslı kalır.
import { BASMA } from "./hareket/sabitler";
import Ionicons from "@expo/vector-icons/Ionicons";
import { useCallback, useRef, type ReactNode } from "react";
import { Pressable, Text, View } from "react-native";
import Animated, { Extrapolation, interpolate, runOnJS, useAnimatedScrollHandler, useAnimatedStyle, useSharedValue, type SharedValue } from "react-native-reanimated";
import { makeStyles, useTokens } from "./theme-context";
import { CONTENT_MAX, FONT_SCALE, TOUCH, space, typography } from "./tokens";

/** Sona bu kadar kala `onEndReached` çağrılır (sonsuz kaydırma). */
export const END_THRESHOLD = 600;

/** Geri düğmesinin kare dokunma hedefi (≥ 44). */
export const BACK_SIZE = 44;

/** Dikişsiz başlıkta alt çizginin tamamen belirdiği kaydırma mesafesi. */
const LINE_AT = 12;

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

/**
 * Başlık çubuğu. Eylem (ör. "Yeni sipariş") başlıkla AYNI satırda, dikey ortalı ve sağa yaslıdır; uzun başlık
 * kısalır/sarılır, eylem sarılmaz (`flexShrink: 0`). `meta` başlığın hemen yanında (eşitleme göstergesi).
 * Alt çizgi: `seamless` (altında krom zeminli alt satır kaydırılan içerikte devam ediyor) iken kaydırınca belirir.
 */
export function ScreenHeader({ title, topInset, gutter, scrollY, seamless = false, onBack, action, meta }: {
  readonly title: string;
  readonly topInset: number;
  readonly gutter: number;
  readonly scrollY: SharedValue<number>;
  readonly seamless?: boolean;
  readonly onBack?: () => void;
  readonly action?: ReactNode;
  readonly meta?: ReactNode;
}) {
  const t = useTokens();
  const s = useStyles();
  const line = useAnimatedStyle(() => ({ opacity: seamless ? interpolate(scrollY.value, [0, LINE_AT], [0, 1], Extrapolation.CLAMP) : 1 }));
  return (
    <View style={[s.bar, { paddingTop: topInset }]} testID="ekran-basligi">
      <View style={[s.inner, { paddingHorizontal: gutter }]}>
        <View style={s.titleRow} testID="baslik-satiri">
          {onBack ? (
            <Pressable accessibilityRole="button" accessibilityLabel="Geri" testID="geri" onPress={onBack} style={({ pressed }) => [s.back, pressed && { opacity: BASMA.opaklik }]}>
              <Ionicons name="chevron-back" size={26} color={t.tint} />
            </Pressable>
          ) : null}
          <View style={s.titleBox} testID="baslik-kutusu">
            <Text style={s.title} accessibilityRole="header" numberOfLines={2} maxFontSizeMultiplier={FONT_SCALE.title}>{title}</Text>
            {meta ? <View style={s.meta}>{meta}</View> : null}
          </View>
          {action ? <View style={s.action} testID="baslik-eylemi">{action}</View> : null}
        </View>
      </View>
      <Animated.View style={[s.line, line]} testID="baslik-cizgisi" />
    </View>
  );
}

const useStyles = makeStyles((t) => ({
  bar: { backgroundColor: t.color.chrome, zIndex: 3 },
  line: { height: 1, backgroundColor: t.color.chromeBorder },
  inner: { maxWidth: CONTENT_MAX, width: "100%" as const, alignSelf: "center" as const, paddingBottom: space.s },
  titleRow: { flexDirection: "row" as const, alignItems: "center" as const, gap: space.s, minHeight: TOUCH },
  // Simge kutunun ortasında: görsel hizayı oluğa çekmek için kutu sola taşar (dokunma hedefi daralmaz).
  back: { width: BACK_SIZE, height: BACK_SIZE, marginLeft: -space.m, marginRight: -space.s, alignItems: "center" as const, justifyContent: "center" as const },
  titleBox: { flex: 1, minWidth: 0, flexDirection: "row" as const, flexWrap: "wrap" as const, alignItems: "center" as const, columnGap: space.s },
  title: { ...typography.largeTitle, fontSize: 24, lineHeight: 30, color: t.text, flexShrink: 1 },
  meta: { flexShrink: 0 },
  action: { flexShrink: 0, flexDirection: "row" as const, alignItems: "center" as const },
}));
