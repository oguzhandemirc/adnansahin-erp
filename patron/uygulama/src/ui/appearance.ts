// Görünüm tercihinin TEK sahibi (panel `lib/theme/appearance.ts` aynası): kip · tema rengi (7 hazır + özel) · zemin ·
// köşe (rozet köşesi dahil) · simge kareleri. Cihazda `patron.gorunum` anahtarında JSON; bilinmeyen alan varsayılana düşer.
import { isHex } from "./color";
import { DEFAULT_APPEARANCE } from "./tokens";

export { DEFAULT_APPEARANCE };

export const PRESET_KEYS = ["violet", "blue", "teal", "green", "orange", "rose", "graphite"] as const;
export type PresetKey = (typeof PRESET_KEYS)[number];
export type ThemePreset = PresetKey | "custom";
export const MODE_PREFS = ["sistem", "acik", "koyu"] as const;
export type ModePref = (typeof MODE_PREFS)[number];
export const SURFACE_TONES = ["lavender", "neutral", "white"] as const;
export type SurfaceTone = (typeof SURFACE_TONES)[number];
export const RADIUS_SCALES = ["small", "medium", "large"] as const;
export type RadiusScale = (typeof RADIUS_SCALES)[number];
export const TILE_STYLES = ["color", "mono"] as const;
export type TileStyle = (typeof TILE_STYLES)[number];

export type { Appearance } from "./tokens";
import type { Appearance } from "./tokens";

export const APPEARANCE_KEY = "patron.gorunum";
/** Eski sürümün yalnız kip tutan anahtarı: bir kez okunup `mode`a göçer. */
export const LEGACY_THEME_KEY = "patron.tema";

export const PRESET_LABEL: Readonly<Record<ThemePreset, string>> = {
  violet: "Mor",
  blue: "Mavi",
  teal: "Turkuaz",
  green: "Yeşil",
  orange: "Turuncu",
  rose: "Gül",
  graphite: "Grafit",
  custom: "Özel",
};
export const MODE_LABEL: Readonly<Record<ModePref, string>> = { sistem: "Sistem", acik: "Açık", koyu: "Koyu" };
export const SURFACE_LABEL: Readonly<Record<SurfaceTone, string>> = { lavender: "Lavanta", neutral: "Nötr", white: "Beyaz" };
export const RADIUS_LABEL: Readonly<Record<RadiusScale, string>> = { small: "Az", medium: "Orta", large: "Geniş" };
export const TILE_LABEL: Readonly<Record<TileStyle, string>> = { color: "Renkli", mono: "Tek renk" };

const oneOf = <T extends string>(list: readonly T[], v: unknown, d: T): T => (typeof v === "string" && (list as readonly string[]).includes(v) ? (v as T) : d);

/** Depodan okunan ham blob → geçerli görünüm (bozuk JSON / bilinmeyen değer varsayılana düşer). */
export function resolveAppearance(raw: unknown): Appearance {
  let o: Record<string, unknown> = {};
  if (typeof raw === "string") {
    try {
      const p = JSON.parse(raw) as unknown;
      if (p && typeof p === "object" && !Array.isArray(p)) o = p as Record<string, unknown>;
    } catch {
      o = {};
    }
  } else if (raw && typeof raw === "object" && !Array.isArray(raw)) {
    o = raw as Record<string, unknown>;
  }
  const d = DEFAULT_APPEARANCE;
  return {
    mode: oneOf(MODE_PREFS, o.mode, d.mode),
    preset: o.preset === "custom" ? "custom" : oneOf(PRESET_KEYS, o.preset, d.preset),
    customColor: isHex(o.customColor) ? o.customColor.toUpperCase() : d.customColor,
    surface: oneOf(SURFACE_TONES, o.surface, d.surface),
    radius: oneOf(RADIUS_SCALES, o.radius, d.radius),
    tiles: oneOf(TILE_STYLES, o.tiles, d.tiles),
  };
}

export function resolveScheme(mode: ModePref, system: string | null | undefined): "light" | "dark" {
  if (mode === "acik") return "light";
  if (mode === "koyu") return "dark";
  return system === "dark" ? "dark" : "light";
}
