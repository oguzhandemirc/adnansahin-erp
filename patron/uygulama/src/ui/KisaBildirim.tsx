// Kısa bildirim (toast, 2026-11-19): elle yenileme hata verirse cümle ("Bağlantı yok — tekrar deneyin") ekranın
// ALTINDA, düzeni itmeden (mutlak konum) kısa süre görünür. Ekran okuyucu cümleyi duyurur (`accessibilityLiveRegion` +
// `announceForAccessibility`); "hareketi azalt" açıkken solma yok. Süreyi çağıran tutar (metin boşalınca kalkar).
// Konum (2026-11-19, iPhone: "çok aşağıda kalıyor"): sabit sayı değil, ekranın GERÇEK yerleşiminden — alt sekme
// çubuğunun ÜSTÜNDE `SEKME_PAYI`, sekmesiz ekranda alt güvenli alan + `SEKMESIZ_PAYI`, alt sabit şeridin (ör. stok
// toplam satırı) ve açık klavyenin üstünde `SERIT_PAYI` (`kisaBildirimAltPayi`, `Screen` ölçer).
import { useEffect, useState } from "react";
import { AccessibilityInfo, Keyboard, Platform, Text } from "react-native";
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from "react-native-reanimated";
import { useHareketAzalt } from "./hareket/azalt";
import { SURE } from "./hareket/sabitler";
import { makeStyles, useTokens } from "./theme-context";
import { FONT_SCALE, space, typography } from "./tokens";

/** Sekme çubuğunun üstündeki boşluk (pt). */
export const SEKME_PAYI = 16;
/** Sekmesiz ekranda (ve tablette) alt güvenli alanın üstündeki boşluk (pt). */
export const SEKMESIZ_PAYI = 24;
/** Alt sabit şeridin / klavyenin üstündeki boşluk (pt). */
export const SERIT_PAYI = 12;

export interface AltPayGirdisi {
  /** Ekran kabının altı ile pencerenin altı arasındaki boşluk (> 0: altta sekme çubuğu var; kap onun üstünde biter). */
  readonly altBosluk: number;
  /** Alt güvenli alan (ev çizgisi). */
  readonly guvenliAlt: number;
  /** Ekran kabının içinde, altta sabit şeridin yüksekliği (yoksa 0). */
  readonly altSerit: number;
  /** Açık klavyenin pencere altından yüksekliği (kapalıysa 0). */
  readonly klavye: number;
}

/** Bildirimin ekran kabının altından uzaklığı (pt). */
export function kisaBildirimAltPayi(g: AltPayGirdisi): number {
  const taban = g.altBosluk > 1 ? SEKME_PAYI : g.guvenliAlt + SEKMESIZ_PAYI;
  const serit = g.altSerit > 0 ? g.altSerit + SERIT_PAYI : 0;
  const klavye = g.klavye > 0 ? g.klavye - g.altBosluk + SERIT_PAYI : 0;
  return Math.round(Math.max(taban, serit, klavye));
}

/** Açık klavyenin yüksekliği (iOS "will", Android "did" olayları); kapalıyken 0. */
export function useKlavyeYuksekligi(): number {
  const [h, setH] = useState(0);
  useEffect(() => {
    const ac = Platform.OS === "ios" ? "keyboardWillShow" : "keyboardDidShow";
    const kapa = Platform.OS === "ios" ? "keyboardWillHide" : "keyboardDidHide";
    const a = Keyboard.addListener(ac, (e) => setH(e?.endCoordinates?.height ?? 0));
    const b = Keyboard.addListener(kapa, () => setH(0));
    return () => {
      a?.remove();
      b?.remove();
    };
  }, []);
  return h;
}

export function KisaBildirim({ metin, ton = "bilgi", altPay = SEKMESIZ_PAYI }: {
  readonly metin: string | null;
  readonly ton?: "bilgi" | "hata";
  /** Ekran kabının altından uzaklık (çağıran `kisaBildirimAltPayi` ile verir). */
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
      style={[s.kap, { bottom: altPay, backgroundColor: hata ? t.color.danger.solid : t.text }, stil]}
      accessibilityLiveRegion="polite"
      testID="kisa-bildirim"
    >
      <Text style={[s.yazi, { color: hata ? t.color.onPrimary : t.bg }]} maxFontSizeMultiplier={FONT_SCALE.title} testID="kisa-bildirim-metni">{metin}</Text>
    </Animated.View>
  );
}

const useStyles = makeStyles((t) => ({
  kap: { position: "absolute" as const, alignSelf: "center" as const, maxWidth: 480, marginHorizontal: space.l, paddingHorizontal: space.l, paddingVertical: space.s, borderRadius: t.radius.card, zIndex: 10, ...t.shadow.float },
  yazi: { ...typography.footnote, fontWeight: "500" as const, textAlign: "center" as const },
}));
