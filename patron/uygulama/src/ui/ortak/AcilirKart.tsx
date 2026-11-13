// Açılır bölüm kartı: SectionCard görünümü, başlık şeridinin tamamı düğme (dokununca aç/kapa). Ok simgesi döner,
// gövde yüksekliği `SURE.orta` ile açılır/kapanır; "hareketi azalt" açıkken anında. Kapalıyken gövde erişilebilirlik
// ağacından ve dokunmadan çıkar; açıklama satırı (özet) kapalıyken de görünür.
import Ionicons from "@expo/vector-icons/Ionicons";
import { useEffect, useRef, type ReactNode } from "react";
import { Text, View, type LayoutChangeEvent } from "react-native";
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from "react-native-reanimated";
import { useHareketAzalt } from "../hareket/azalt";
import { Basilabilir } from "../hareket/Basilabilir";
import { EGRI, sure } from "../hareket/sabitler";
import { makeStyles, useTokens } from "../theme-context";
import { CARD_PAD, FONT_SCALE, space, typography } from "../tokens";

export function AcilirKart({ baslik, aciklama, acik, hazir = true, onDegistir, children, testID }: {
  readonly baslik: string;
  readonly aciklama?: string;
  readonly acik: boolean;
  /** Saklı durum okunmadan `false`: ilk değer animasyonsuz oturur. */
  readonly hazir?: boolean;
  readonly onDegistir: () => void;
  readonly children: ReactNode;
  readonly testID: string;
}) {
  const t = useTokens();
  const s = useStyles();
  const azalt = useHareketAzalt();
  const ilerleme = useSharedValue(acik ? 1 : 0);
  const olcu = useSharedValue(0);
  const oturdu = useRef(false);

  useEffect(() => {
    const hedef = acik ? 1 : 0;
    if (!hazir || !oturdu.current) {
      ilerleme.value = hedef;
      if (hazir) oturdu.current = true;
      return;
    }
    ilerleme.value = withTiming(hedef, { duration: sure("orta", azalt), easing: EGRI.standart });
  }, [acik, hazir, azalt, ilerleme]);

  const govdeStil = useAnimatedStyle(() => ({ height: ilerleme.value * olcu.value, opacity: ilerleme.value }));
  const okStil = useAnimatedStyle(() => ({ transform: [{ rotate: `${ilerleme.value * 180}deg` }] }));
  const olc = (e: LayoutChangeEvent) => {
    olcu.value = e.nativeEvent.layout.height;
  };

  return (
    <View style={s.kart} testID={testID}>
      <Basilabilir
        onPress={onDegistir}
        olcek={1}
        dokunsal="selection"
        style={s.bas}
        accessibilityRole="button"
        accessibilityLabel={aciklama ? `${baslik}, ${aciklama}` : baslik}
        accessibilityHint={acik ? "Dokununca kapanır" : "Dokununca açılır"}
        accessibilityState={{ expanded: acik }}
        testID={`${testID}-basligi`}
      >
        <View style={s.esnek}>
          <Text style={s.baslik} numberOfLines={1} maxFontSizeMultiplier={FONT_SCALE.title}>{baslik}</Text>
          {aciklama ? <Text style={s.aciklama} numberOfLines={2}>{aciklama}</Text> : null}
        </View>
        <Animated.View style={okStil}>
          <Ionicons name="chevron-down" size={20} color={t.textSecondary} />
        </Animated.View>
      </Basilabilir>
      <Animated.View
        style={[s.govde, govdeStil]}
        pointerEvents={acik ? "auto" : "none"}
        accessibilityElementsHidden={!acik}
        importantForAccessibility={acik ? "auto" : "no-hide-descendants"}
        testID={`${testID}-govde`}
      >
        {/* Mutlak konumlu iç: kabın o anki yüksekliğinden bağımsız doğal boyu ölçülür. */}
        <View style={s.icerik} onLayout={olc}>{children}</View>
      </Animated.View>
    </View>
  );
}

const useStyles = makeStyles((t) => ({
  kart: { backgroundColor: t.color.card, borderRadius: t.radius.card, borderWidth: 1, borderColor: t.color.cardBorder, overflow: "hidden" as const, ...t.shadow.card },
  bas: { flexDirection: "row" as const, alignItems: "center" as const, gap: space.s, paddingHorizontal: CARD_PAD, paddingTop: 14, paddingBottom: 12, minHeight: 44 },
  esnek: { flex: 1, minWidth: 0 },
  baslik: { ...typography.sectionTitle, color: t.color.text },
  aciklama: { ...typography.caption, color: t.color.textMuted, marginTop: space.xxs },
  govde: { overflow: "hidden" as const },
  icerik: { position: "absolute" as const, top: 0, left: 0, right: 0, paddingHorizontal: CARD_PAD, paddingBottom: CARD_PAD },
}));
