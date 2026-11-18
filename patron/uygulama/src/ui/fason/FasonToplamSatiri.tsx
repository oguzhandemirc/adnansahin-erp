// Fason ekranının ALTTA SABİT toplam şeridi (Stok'un `StokToplamSatiri` düzeni): tek satır, kaydırma yok; sığmazsa yazı
// küçülür (en çok %75). "Fasonda 330 top · 12.345 m · 42 iş emri" — süzgeçliyken "Süzülen …". Sayılar `altToplam`dan
// (fabrikanın toplamı ya da satırların fabrika sayıları; firma/işlem süzgecinde fabrikanın firma payları varsa seçime
// düşen paylar); top/metre yazılamayan kümede (pay göndermeyen eski fabrika + bölünmüş iş emri) yalnız iş emri adedi.
import { Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { UNIT } from "../../lib/labels/uretim";
import { useWide } from "../Frame";
import { qty } from "../pano/read";
import { makeStyles } from "../theme-context";
import { FONT_SCALE, ekranOlugu, space, tabularNums, typography } from "../tokens";
import type { AltToplam } from "./tablo";

/** SAF: şeridin değer metni ("330 top · 12.345 m · 42 iş emri"); hiçbir parça yoksa null. */
export function toplamMetni(t: AltToplam): string | null {
  const parcalar = [
    t.top === null ? null : `${qty(t.top)} ${UNIT.top}`,
    t.metre === null ? null : `${qty(t.metre)} ${UNIT.metre}`,
    t.isEmri === null ? null : `${qty(t.isEmri)} iş emri`,
  ].filter(Boolean);
  return parcalar.length > 0 ? parcalar.join(" · ") : null;
}

export function FasonToplamSatiri({ toplam }: { readonly toplam: AltToplam | null }) {
  const s = useStyles();
  const wide = useWide();
  const insets = useSafeAreaInsets();
  const deger = toplam ? toplamMetni(toplam) : null;
  if (!toplam || !deger) return null;
  const not = toplam.etiket === "Süzülen" && toplam.top === null ? ". Bu süzgeçte top ve metre toplamı fabrikadan gelmiyor." : "";
  return (
    <View
      style={[s.cubuk, { paddingBottom: space.s + (wide ? insets.bottom : 0), paddingHorizontal: ekranOlugu(wide) }]}
      testID="fason-toplam-satiri" accessible accessibilityLabel={`${toplam.etiket}: ${deger}${not}`}
    >
      <Text style={s.satir} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.75} maxFontSizeMultiplier={FONT_SCALE.title} testID="fason-toplam-yazi">
        <Text style={s.etiket}>{`${toplam.etiket} `}</Text>
        <Text style={s.deger} testID="fason-toplam-deger">{deger}</Text>
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
