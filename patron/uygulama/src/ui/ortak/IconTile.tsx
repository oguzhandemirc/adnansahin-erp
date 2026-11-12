// Simge karesi (şartname §3): xs 24/14 · sm 28/16 · md 40/20 · lg 48/24; köşe `radius.tile[boy]`, renk `tile[ton]`
// (8 ton + primary) ya da durum tonu. Süstür, basılmaz; anlam taşıyorsa `accessibilityLabel` verilir.
import Ionicons from "@expo/vector-icons/Ionicons";
import { View } from "react-native";
import type { IconName } from "../icons";
import { useTokens } from "../theme-context";
import type { Pair, Theme, TileTone } from "../tokens";

export type DurumTonu = "success" | "warning" | "danger" | "info";
export type IconTileTone = TileTone | "primary" | DurumTonu;
export type IconTileSize = "xs" | "sm" | "md" | "lg";

export const ICON_TILE_SIZE: Readonly<Record<IconTileSize, { readonly kutu: number; readonly simge: number }>> = {
  xs: { kutu: 24, simge: 14 },
  sm: { kutu: 28, simge: 16 },
  md: { kutu: 40, simge: 20 },
  lg: { kutu: 48, simge: 24 },
};

const DURUM: readonly string[] = ["success", "warning", "danger", "info"];

/** Ton → {fg, bg} (durum tonları `color.*` çiftinden). */
export function tilePair(t: Theme, tone: IconTileTone): Pair {
  if (DURUM.includes(tone)) {
    const c = t.color[tone as DurumTonu];
    return { fg: c.fg, bg: c.bg };
  }
  return t.tile[tone as TileTone | "primary"];
}

export function IconTile({ icon, tone = "primary", size = "sm", accessibilityLabel, testID }: {
  readonly icon: IconName;
  readonly tone?: IconTileTone;
  readonly size?: IconTileSize;
  readonly accessibilityLabel?: string;
  readonly testID?: string;
}) {
  const t = useTokens();
  const p = tilePair(t, tone);
  const d = ICON_TILE_SIZE[size];
  return (
    <View
      testID={testID}
      accessible={!!accessibilityLabel}
      accessibilityLabel={accessibilityLabel}
      style={{ width: d.kutu, height: d.kutu, borderRadius: t.radius.tile[size], backgroundColor: p.bg, alignItems: "center", justifyContent: "center" }}
    >
      <Ionicons name={icon} size={d.simge} color={p.fg} />
    </View>
  );
}
