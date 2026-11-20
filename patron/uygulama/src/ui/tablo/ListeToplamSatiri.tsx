// Sunucu listesinin ALTTA SABİT toplam şeridi (2026-11-20; Stok/Çuvallar şeridiyle aynı düzen): tek satır, kaydırma yok,
// sığmazsa yazı küçülür. "Toplam 586 sevkiyat · 12.340 top · 456.789 m" — süzgeç/arama etkinken "Süzülen …".
// Sayılar bulutun `GET /liste/:p/toplam` yanıtıdır: süzülen kümenin satır sayısı + fabrikanın SATIR BAŞINA verdiği
// sayıların toplamı (liste ile aynı where; yeni türev yok). Sunucu toplam ucunu beyan etmezse şerit çizilmez.
import { Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import type { ListTotals } from "../../api/wire";
import { useWide } from "../Frame";
import { qty } from "../pano/read";
import { makeStyles } from "../theme-context";
import { FONT_SCALE, ekranOlugu, space, tabularNums, typography } from "../tokens";

/** SAF: şeridin değer metni. `birimler` alan → birim ("top", "m"); beyanda olmayan ya da boş toplam yazılmaz. */
export function listeToplamMetni(t: ListTotals, adi: string, birimler: Readonly<Record<string, string>>): string {
  const parcalar = [`${qty(t.adet)} ${adi}`];
  for (const [alan, birim] of Object.entries(birimler)) {
    const v = t.toplamlar[alan];
    if (v !== undefined && v !== null) parcalar.push(`${qty(v)} ${birim}`);
  }
  return parcalar.join(" · ");
}

export function ListeToplamSatiri(p: {
  readonly toplam: { readonly veri: ListTotals; readonly suzulmus: boolean } | null;
  readonly adi: string;
  readonly birimler: Readonly<Record<string, string>>;
  readonly testID: string;
}) {
  const s = useStyles();
  const wide = useWide();
  const insets = useSafeAreaInsets();
  if (!p.toplam) return null;
  const etiket = p.toplam.suzulmus ? "Süzülen" : "Toplam";
  const deger = listeToplamMetni(p.toplam.veri, p.adi, p.birimler);
  return (
    <View
      style={[s.cubuk, { paddingBottom: space.s + (wide ? insets.bottom : 0), paddingHorizontal: ekranOlugu(wide) }]}
      testID={p.testID} accessible accessibilityLabel={`${etiket}: ${deger}`}
    >
      <Text style={s.satir} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.75} maxFontSizeMultiplier={FONT_SCALE.title}>
        <Text style={s.etiket}>{`${etiket} `}</Text>
        <Text style={s.deger} testID={`${p.testID}-deger`}>{deger}</Text>
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
