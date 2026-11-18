// İki seçenekli küçük bölmeli düğme (2026-11-18, kullanıcı: "ham/bitmiş ve kalem/top seçimini daha kompakt yaptır,
// sayfa düzenini bozuyor"). İçerik genişliği kadar (tam genişliğe yayılmaz), yükseklik 32; dokunma alanı hitSlop ile
// ≥ 44. Seçim TEK satırda araç şeridiyle yan yana durur. Çok seçenekli seçiciler modal kalır; bu yalnız iki seçenek için.
import { Pressable, Text, View } from "react-native";
import { haptic } from "./haptics";
import { BASMA } from "./hareket/sabitler";
import { makeStyles } from "./theme-context";
import { FONT_SCALE, space, typography } from "./tokens";

export interface KompaktSecenek<K extends string> {
  readonly key: K;
  readonly label: string;
  /** Ekran okuyucu için uzun ad (yoksa `label`). */
  readonly ad?: string;
}

export const KOMPAKT_YUKSEKLIK = 32;
/** 32 + 6 + 6 = 44: dokunma hedefi asgarisi. */
const HIT = { top: 6, bottom: 6, left: 2, right: 2 };

export function KompaktSecim<K extends string>(p: {
  readonly items: readonly KompaktSecenek<K>[];
  readonly value: K;
  readonly onChange: (k: K) => void;
  readonly accessibilityLabel: string;
  /** Her parçanın testID'si `${testIDPrefix}${key}`. */
  readonly testIDPrefix: string;
}) {
  const s = useStyles();
  return (
    <View style={s.iz} accessibilityRole="tablist" accessibilityLabel={p.accessibilityLabel} testID={`${p.testIDPrefix}secim`}>
      {p.items.map((i) => {
        const on = i.key === p.value;
        return (
          <Pressable
            key={i.key}
            accessibilityRole="tab"
            accessibilityState={{ selected: on }}
            accessibilityLabel={i.ad ?? i.label}
            hitSlop={HIT}
            onPress={() => {
              if (on) return;
              haptic("selection");
              p.onChange(i.key);
            }}
            testID={`${p.testIDPrefix}${i.key}`}
            style={({ pressed }) => [s.parca, on && s.parcaOn, pressed && !on && { opacity: BASMA.opaklik }]}
          >
            <Text style={[s.yazi, on && s.yaziOn]} numberOfLines={1} maxFontSizeMultiplier={FONT_SCALE.title}>
              {i.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const PAD = 2;
const useStyles = makeStyles((t) => ({
  iz: {
    flexDirection: "row" as const,
    alignSelf: "flex-start" as const,
    height: KOMPAKT_YUKSEKLIK,
    padding: PAD,
    borderRadius: t.radius.control,
    backgroundColor: t.scheme === "dark" ? t.surfaceAlt : t.separator,
  },
  parca: {
    height: KOMPAKT_YUKSEKLIK - PAD * 2,
    paddingHorizontal: space.m,
    alignItems: "center" as const,
    justifyContent: "center" as const,
    borderRadius: t.radius.control - PAD,
  },
  parcaOn: { backgroundColor: t.surface, ...t.cardShadow },
  yazi: { ...typography.footnote, color: t.textSecondary },
  yaziOn: { color: t.text, fontWeight: "600" as const },
}));
