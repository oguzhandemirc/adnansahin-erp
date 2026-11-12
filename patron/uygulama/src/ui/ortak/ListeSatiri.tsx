// Liste satırı (şartname §3 ListRow): TEK satır 48 pt, tam genişlik (yan oluk 0, köşe 0). [simge xs] · birincil
// `rowTitle` (isteğe bağlı sabit genişlik, ör. belge no) · ikincil muted esnek + "…" · değer 15/600 tabular · rozet ·
// chevron. Ayraç 1 px `cardBorder`, metin başından. Basılabilirse tüm satır dokunma hedefidir.
import Ionicons from "@expo/vector-icons/Ionicons";
import type { ReactNode } from "react";
import { Text, View } from "react-native";
import { Basilabilir } from "../hareket/Basilabilir";
import type { IconName } from "../icons";
import { makeStyles, useTokens } from "../theme-context";
import { FONT_SCALE, GUTTER, ROW, space, tabularNums, typography } from "../tokens";
import { IconTile, type IconTileTone } from "./IconTile";

export interface ListeSatiriProps {
  readonly birincil: string;
  readonly ikincil?: string;
  readonly deger?: string;
  readonly rozet?: ReactNode;
  readonly icon?: IconName;
  readonly ton?: IconTileTone;
  /** Birincil metnin sabit genişliği (sütun hizası); verilmezse içerik kadar. */
  readonly birincilGenislik?: number;
  /** İlk satırda ayraç çizilmez. */
  readonly ayrac?: boolean;
  readonly onPress?: () => void;
  /** Basılabilir satırda ok; yoğun tek satırlık listede (4 alan) yer açmak için kapatılır. */
  readonly ok?: boolean;
  readonly testID?: string;
  /** Verilmezse görünen metinlerden kurulur. */
  readonly accessibilityLabel?: string;
}

export function ListeSatiri(p: ListeSatiriProps) {
  const t = useTokens();
  const s = useStyles();
  const etiket = p.accessibilityLabel ?? [p.birincil, p.ikincil, p.deger].filter(Boolean).join(", ");
  const ic = (
    <View style={s.satir} testID={p.testID ? `${p.testID}-satir` : undefined}>
      {p.icon ? <IconTile icon={p.icon} tone={p.ton ?? "primary"} size="xs" /> : null}
      <View style={[s.metin, p.ayrac !== false && s.ayrac]}>
        <Text style={[s.birincil, p.birincilGenislik ? { width: p.birincilGenislik } : null]} numberOfLines={1} maxFontSizeMultiplier={FONT_SCALE.title}>{p.birincil}</Text>
        {p.ikincil ? <Text style={s.ikincil} numberOfLines={1} maxFontSizeMultiplier={FONT_SCALE.title}>{p.ikincil}</Text> : <View style={s.esnek} />}
        {p.deger ? <Text style={s.deger} numberOfLines={1} maxFontSizeMultiplier={FONT_SCALE.title}>{p.deger}</Text> : null}
        {p.rozet ? <View style={s.rozet}>{p.rozet}</View> : null}
        {p.onPress && p.ok !== false ? <Ionicons name="chevron-forward" size={16} color={t.color.textMuted} /> : null}
      </View>
    </View>
  );
  if (!p.onPress) {
    return <View style={s.kap} testID={p.testID} accessible accessibilityLabel={etiket}>{ic}</View>;
  }
  return (
    <Basilabilir style={s.kap} onPress={p.onPress} testID={p.testID} accessibilityLabel={etiket} olcek={1} basiliZemin={t.color.pressed}>
      {ic}
    </Basilabilir>
  );
}

const useStyles = makeStyles((t) => ({
  satir: { flexDirection: "row" as const, alignItems: "center" as const, gap: space.m, paddingLeft: GUTTER, minHeight: ROW },
  kap: { backgroundColor: t.color.card },
  metin: { flex: 1, minWidth: 0, flexDirection: "row" as const, alignItems: "center" as const, gap: space.s, minHeight: ROW, paddingRight: GUTTER },
  ayrac: { borderTopWidth: 1, borderTopColor: t.color.cardBorder },
  birincil: { ...typography.rowTitle, color: t.color.text, flexShrink: 0, maxWidth: "60%" as const },
  ikincil: { ...typography.label, color: t.color.textMuted, flex: 1, minWidth: 0 },
  esnek: { flex: 1 },
  // Rozet kendi içinde `alignSelf: flex-start`; satırda dikey ortalansın diye sarılır.
  rozet: { justifyContent: "center" as const, flexShrink: 0 },
  deger: { fontSize: 15, lineHeight: 20, fontWeight: "600" as const, ...tabularNums, color: t.color.text },
}));
