// Rozet (şartname §3 Badge): boy 20, yatay dolgu 8, `micro`, köşe YALNIZ `radius.badge` (Görünüm › Köşe ayarı);
// zemin/metin tonun çiftinden. Durum rozetinde simge 12 kalır (renk körü de okur).
import Ionicons from "@expo/vector-icons/Ionicons";
import { Text, View } from "react-native";
import type { IconName } from "../icons";
import { makeStyles, useTokens } from "../theme-context";
import { FONT_SCALE, space, typography, type Pair, type StatusKind, type Theme } from "../tokens";

export type RozetTonu = "soft" | "primary" | "success" | "warning" | "danger" | "info";

/** Durum türü (`StatusKind`) → rozet tonu; sözlük girdilerinin tek eşlemesi. */
export const STATUS_ROZET_TONU: Readonly<Record<StatusKind, RozetTonu>> = { iyi: "success", uyari: "warning", kritik: "danger", bilgi: "info" };

export function rozetRenk(t: Theme, ton: RozetTonu): Pair {
  switch (ton) {
    case "soft":
      return { fg: t.color.textMuted, bg: t.color.secondary };
    case "primary":
      return { fg: t.color.onPrimarySoft, bg: t.color.primarySoft };
    default:
      return { fg: t.color[ton].fg, bg: t.color[ton].bg };
  }
}

export function Rozet({ label, tone = "soft", icon, testID, accessibilityLabel }: {
  readonly label: string;
  readonly tone?: RozetTonu;
  readonly icon?: IconName;
  readonly testID?: string;
  /** Verilmezse rozet metni okunur. */
  readonly accessibilityLabel?: string;
}) {
  const t = useTokens();
  const s = useStyles();
  const c = rozetRenk(t, tone);
  return (
    <View style={[s.rozet, { backgroundColor: c.bg }]} testID={testID} accessible accessibilityLabel={accessibilityLabel ?? label}>
      {icon ? <Ionicons name={icon} size={12} color={c.fg} /> : null}
      <Text style={[s.yazi, { color: c.fg }]} numberOfLines={1} maxFontSizeMultiplier={FONT_SCALE.title}>{label}</Text>
    </View>
  );
}

const useStyles = makeStyles((t) => ({
  rozet: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    alignSelf: "flex-start" as const,
    gap: space.xs,
    minHeight: 20,
    paddingHorizontal: space.s,
    borderRadius: t.radius.badge,
  },
  yazi: { ...typography.micro },
}));
