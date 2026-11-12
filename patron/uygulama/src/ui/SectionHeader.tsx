// Bölüm başlığı: isteğe bağlı alan ikon çipi · başlık (+ sayaç) ve sağda isteğe bağlı "Tümü ›" bağlantısı.
import Ionicons from "@expo/vector-icons/Ionicons";
import { Pressable, Text, View } from "react-native";
import { IconTile } from "./ortak";
import { DOMAIN_TONE } from "./tokens";
import type { IconName } from "./icons";
import { makeStyles, useTokens } from "./theme-context";
import { FONT_SCALE, TOUCH, space, tabularNums, typography, type Domain } from "./tokens";

export interface SectionHeaderProps {
  readonly title: string;
  /** Sayaç: adet ya da "3/8" gibi hazır metin. */
  readonly count?: number | string;
  /** Başlığın solunda alan ikon çipi (renk `domain`den, verilmezse `genel`). */
  readonly icon?: IconName;
  readonly actionLabel?: string;
  readonly onAction?: () => void;
  readonly domain?: Domain;
  readonly testID?: string;
}

export function SectionHeader({ title, count, icon, actionLabel = "Tümü", onAction, domain, testID }: SectionHeaderProps) {
  const t = useTokens();
  const s = useStyles();
  return (
    <View style={s.row} testID={testID}>
      {icon ? <IconTile icon={icon} tone={DOMAIN_TONE[domain ?? "genel"]} size="sm" /> : null}
      <Text style={s.title} accessibilityRole="header" maxFontSizeMultiplier={FONT_SCALE.title}>
        {title}
      </Text>
      {count !== undefined ? <Text style={s.count}>{count}</Text> : null}
      <View style={s.flex} />
      {onAction ? (
        <Pressable onPress={onAction} accessibilityRole="link" accessibilityLabel={`${title}: ${actionLabel}`} style={s.action} testID={testID ? `${testID}-tumu` : undefined}>
          <Text style={s.actionText}>{actionLabel}</Text>
          <Ionicons name="chevron-forward" size={16} color={t.tint} />
        </Pressable>
      ) : null}
    </View>
  );
}

const useStyles = makeStyles((t) => ({
  // Yeni bölüm başlığı dili (ortak `BlokBasligi` ile aynı): küçük, büyük harf, muted; alan rengi YOK (tek tema rengi).
  row: { flexDirection: "row" as const, alignItems: "center" as const, gap: space.s, minHeight: 32, marginTop: space.l, marginBottom: space.xs },
  title: { ...typography.caption, fontWeight: "600" as const, color: t.color.textMuted, textTransform: "uppercase" as const, letterSpacing: 0.5 },
  count: { ...typography.caption, ...tabularNums, fontWeight: "600" as const, color: t.color.textMuted },
  flex: { flex: 1 },
  action: { minHeight: TOUCH, flexDirection: "row" as const, alignItems: "center" as const, gap: 2, paddingLeft: space.s },
  actionText: { fontSize: 15, lineHeight: 20, fontWeight: "600" as const, color: t.color.link },
}));
