// Kısa bildirim (toast, 2026-11-19): başlıktaki "↻ 1 dk önce" basılınca sonucun cümlesi ("Güncelleme istendi",
// "Zaten güncel", "Bağlantı yok — tekrar deneyin") ekranın ALTINDA, düzeni itmeden (mutlak konum) kısa süre görünür.
// Eskiden başlığın altına yeni satır olarak giriyor ve bütün içeriği aşağı itiyordu. Ekran okuyucu cümleyi duyurur
// (`accessibilityLiveRegion` + `announceForAccessibility`); "hareketi azalt" açıkken solma yok. Süreyi çağıran tutar
// (metin boşalınca bildirim kalkar).
import { useEffect } from "react";
import { AccessibilityInfo, Text } from "react-native";
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from "react-native-reanimated";
import { useHareketAzalt } from "./hareket/azalt";
import { SURE } from "./hareket/sabitler";
import { makeStyles, useTokens } from "./theme-context";
import { FONT_SCALE, space, typography } from "./tokens";

export function KisaBildirim({ metin, ton = "bilgi", altPay = 0 }: {
  readonly metin: string | null;
  readonly ton?: "bilgi" | "hata";
  /** Alt kenardan ek pay (güvenli alan; çağıran verir). */
  readonly altPay?: number;
}) {
  const t = useTokens();
  const s = useStyles();
  const azalt = useHareketAzalt();
  const gorunur = useSharedValue(0);
  useEffect(() => {
    gorunur.value = azalt ? (metin ? 1 : 0) : withTiming(metin ? 1 : 0, { duration: SURE.kisa });
    if (metin) AccessibilityInfo.announceForAccessibility?.(metin);
  }, [metin, azalt, gorunur]);
  const stil = useAnimatedStyle(() => ({ opacity: gorunur.value, transform: [{ translateY: (1 - gorunur.value) * 8 }] }));
  if (!metin) return null;
  const hata = ton === "hata";
  return (
    <Animated.View
      pointerEvents="none"
      style={[s.kap, { bottom: altPay + space.l, backgroundColor: hata ? t.color.danger.solid : t.text }, stil]}
      accessibilityLiveRegion="polite"
      testID="kisa-bildirim"
    >
      <Text style={[s.yazi, { color: hata ? t.color.onPrimary : t.bg }]} maxFontSizeMultiplier={FONT_SCALE.title} testID="simdi-guncelle-bildirim">{metin}</Text>
    </Animated.View>
  );
}


const useStyles = makeStyles((t) => ({
  kap: { position: "absolute" as const, alignSelf: "center" as const, maxWidth: 480, marginHorizontal: space.l, paddingHorizontal: space.l, paddingVertical: space.s, borderRadius: t.radius.card, zIndex: 10, ...t.shadow.float },
  yazi: { ...typography.footnote, fontWeight: "500" as const, textAlign: "center" as const },
}));
