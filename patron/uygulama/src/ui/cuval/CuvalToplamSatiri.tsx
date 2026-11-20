// Çuvallar ekranının ALTTA SABİT toplam şeridi (Stok/Fason şeridiyle aynı düzen, 2026-11-20): tek satır, kaydırma yok;
// sığmazsa yazı küçülür (en çok %75). "Toplam 12 çuval · 142 top · 3.386 m · 680 kg" — süzgeç/arama etkinken "Süzülen …".
// Sayılar görünen çuval satırlarının FABRİKA sayılarının toplamıdır (`cuvalToplami`); kg yalnız tartılı çuvallardan.
import { Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import type { cuvalToplami } from "../../lib/cuval-deposu";
import { UNIT } from "../../lib/labels/uretim";
import { useWide } from "../Frame";
import { qty } from "../pano/read";
import { makeStyles } from "../theme-context";
import { FONT_SCALE, ekranOlugu, space, tabularNums, typography } from "../tokens";

export interface CuvalAltToplam {
  readonly etiket: "Toplam" | "Süzülen";
  readonly sayilar: ReturnType<typeof cuvalToplami>;
}

/** SAF: şeridin değer metni ("12 çuval · 142 top · 3.386 m · 680 kg"). */
export function cuvalToplamMetni(t: CuvalAltToplam): string {
  const x = t.sayilar;
  return [`${qty(x.cuval)} çuval`, `${qty(x.top)} ${UNIT.top}`, `${qty(x.metre)} ${UNIT.metre}`, x.kg === null ? null : `${qty(x.kg)} kg`].filter(Boolean).join(" · ");
}

export function CuvalToplamSatiri({ toplam }: { readonly toplam: CuvalAltToplam | null }) {
  const s = useStyles();
  const wide = useWide();
  const insets = useSafeAreaInsets();
  if (!toplam) return null;
  const deger = cuvalToplamMetni(toplam);
  return (
    <View
      style={[s.cubuk, { paddingBottom: space.s + (wide ? insets.bottom : 0), paddingHorizontal: ekranOlugu(wide) }]}
      testID="cuval-toplam-satiri" accessible accessibilityLabel={`${toplam.etiket}: ${deger}`}
    >
      <Text style={s.satir} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.75} maxFontSizeMultiplier={FONT_SCALE.title}>
        <Text style={s.etiket}>{`${toplam.etiket} `}</Text>
        <Text style={s.deger} testID="cuval-toplam-deger">{deger}</Text>
      </Text>
    </View>
  );
}

const useStyles = makeStyles((t) => ({
  cubuk: { backgroundColor: t.color.chrome, borderTopWidth: 1, borderTopColor: t.color.chromeBorder, paddingTop: space.s, minHeight: 28, justifyContent: "center" as const },
  satir: { ...typography.callout, ...tabularNums, color: t.text },
  etiket: { fontWeight: "400" as const, color: t.color.textMuted },
  deger: { fontWeight: "600" as const, color: t.text },
}));
