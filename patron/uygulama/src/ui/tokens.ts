// =============================================================================
// Tasarım belirteçleri — patron uygulamasının TEK renk/ölçü kaynağı.
//
// Ham hex YALNIZ bu dosyada yazılır; ekran ve bileşenler `useTokens()` ile okur (bekçi: `__tests__/tokens.test.ts`).
// Değerler panelin bitmiş belirteçlerinin (Electron `index.css`) hex karşılığıdır; tema `buildTheme(scheme, görünüm)`
// ile kurulur ve anahtarına göre önbelleklenir. Şartname: belgeler/MOBIL-TASARIM-SARTNAMESI.md §1–§2.
// Eski alan adları (`bg`, `surface`, `tint`, `domain`, `status`…) bir sürüm boyunca türetilmiş takma ad olarak kalır.
// =============================================================================
import type { TextStyle, ViewStyle } from "react-native";
import type { ModePref, PresetKey, RadiusScale, SurfaceTone, ThemePreset, TileStyle } from "./appearance";
import { contrast, ensureContrast, hexToHsl, hslToHex, pickForeground, rgba } from "./color";

export type Scheme = "light" | "dark";

export interface Appearance {
  readonly mode: ModePref;
  readonly preset: ThemePreset;
  readonly customColor: string;
  readonly surface: SurfaceTone;
  readonly radius: RadiusScale;
  readonly tiles: TileStyle;
}

/** Marka moru (varsayılan tema rengi; kimlik.json `markaRengi` ile aynı). */
export const BRAND_PRIMARY = "#6047E1";

export const DEFAULT_APPEARANCE: Appearance = {
  mode: "sistem",
  preset: "violet",
  customColor: BRAND_PRIMARY,
  surface: "lavender",
  radius: "large",
  tiles: "color",
};

/** Simge karesi tonları (panel `--tile-*`). */
export type TileTone = "violet" | "blue" | "sky" | "teal" | "green" | "amber" | "orange" | "rose";
export const TILE_TONES: readonly TileTone[] = ["violet", "blue", "sky", "teal", "green", "amber", "orange", "rose"];

/** Alan kimliği (eski ad): rengi yalnız "hangi iş" der, iyi/kötü söylemez. */
export type Domain = "uretim" | "siparisler" | "sevkiyat" | "finans" | "cariler" | "stok" | "fason" | "raporlar" | "gelenKutusu" | "genel";

/** Alan → simge karesi tonu (panel `box-meta.ts` eşlemesi). */
export const DOMAIN_TONE: Readonly<Record<Domain, TileTone | "primary">> = {
  uretim: "violet",
  siparisler: "blue",
  finans: "sky",
  stok: "teal",
  sevkiyat: "green",
  raporlar: "amber",
  fason: "orange",
  cariler: "rose",
  gelenKutusu: "primary",
  genel: "primary",
};

/** 4'lü durum seti (eski ad): renk + metin + zemin + ikon (durum asla yalnız renkle söylenmez). */
export type StatusKind = "iyi" | "uyari" | "kritik" | "bilgi";

export interface Pair {
  readonly fg: string;
  readonly bg: string;
}
export interface Tone {
  readonly solid: string;
  readonly bg: string;
  readonly fg: string;
}
export interface DomainColor {
  readonly fg: string;
  readonly chip: string;
}
export interface StatusColor {
  readonly fill: string;
  readonly text: string;
  readonly bg: string;
  readonly icon: "checkmark-circle" | "warning" | "alert-circle" | "information-circle";
}
export type StationKind = "ic" | "dis";

export interface ThemeColor {
  readonly background: string;
  readonly chrome: string;
  readonly chromeBorder: string;
  readonly tabstrip: string;
  readonly band: string;
  readonly card: string;
  readonly cardBorder: string;
  readonly border: string;
  readonly input: string;
  readonly text: string;
  readonly textMuted: string;
  readonly muted: string;
  readonly secondary: string;
  readonly pressed: string;
  readonly primary: string;
  readonly primary2: string;
  readonly onPrimary: string;
  readonly primarySoft: string;
  readonly onPrimarySoft: string;
  readonly focus: string;
  /** Kart zemininde metin olarak okunan tema rengi (bağlantı, "Tümü", seçili etiket): ≥ 4.5:1. */
  readonly link: string;
  /** Modal arkası örtü rengi (opaklık bileşende). */
  readonly scrim: string;
  readonly success: Tone;
  readonly warning: Tone;
  readonly danger: Tone;
  readonly info: Tone;
}

export interface ThemeRadius {
  readonly control: number;
  readonly card: number;
  /** Rozet/çip/hap köşesi — yalnız buradan okunur (kişiselleştirmenin "köşe" ayarı). */
  readonly badge: number;
  readonly sheet: number;
  readonly tile: { readonly xs: number; readonly sm: number; readonly md: number; readonly lg: number };
  /** Eski adlar. */
  readonly cardInner: number;
  readonly button: number;
  readonly chip: number;
}

export interface Theme {
  readonly scheme: Scheme;
  readonly key: string;
  readonly color: ThemeColor;
  readonly tile: Readonly<Record<TileTone | "primary", Pair>>;
  readonly chart: readonly [string, string, string, string, string, string];
  readonly radius: ThemeRadius;
  readonly shadow: { readonly soft: ViewStyle; readonly card: ViewStyle; readonly float: ViewStyle; readonly active: ViewStyle };
  // ---- eski alan adları (türetilmiş takma ad; yeni kod `color.*` okur)
  readonly bg: string;
  readonly surface: string;
  readonly surfaceAlt: string;
  readonly separator: string;
  readonly text: string;
  readonly textSecondary: string;
  readonly textMuted: string;
  readonly tint: string;
  readonly tintContainer: string;
  readonly onTint: string;
  readonly domain: Readonly<Record<Domain, DomainColor>>;
  readonly status: Readonly<Record<StatusKind, StatusColor>>;
  readonly station: Readonly<Record<StationKind, DomainColor>>;
  readonly role: { readonly yonetici: Pair; readonly ekip: Pair };
  readonly cardShadow: ViewStyle;
  readonly floatShadow: ViewStyle;
  /** Karekod gibi her temada beyaz kalması gereken yüzey. */
  readonly paper: string;
}

/** Eski tip adı. */
export type Tokens = Theme;

// ----------------------------------------------------------------------------- ham değerler (§1.1–§1.3)

const WHITE = "#FFFFFF";
const INK = "#191929";

interface Base {
  readonly border: string;
  readonly input: string;
  readonly text: string;
  readonly textMuted: string;
  readonly muted: string;
  readonly secondary: string;
  readonly pressed: string;
  readonly scrim: string;
  readonly success: Tone;
  readonly warning: Tone;
  readonly danger: Tone;
  readonly info: Tone;
  readonly chart: readonly [string, string, string, string, string, string];
}

const BASE: Readonly<Record<Scheme, Base>> = {
  light: {
    border: "#E3E2EE",
    input: "#D5D4E2",
    text: INK,
    textMuted: "#606076",
    muted: "#F2F2F8",
    secondary: "#EFEEF6",
    pressed: "#F0EFFB",
    scrim: INK,
    success: { solid: "#157F4A", bg: "#E2F8EB", fg: "#0F673B" },
    warning: { solid: "#DB8D06", bg: "#FFF3D1", fg: "#834107" },
    danger: { solid: "#DB2424", bg: "#FEE7E7", fg: "#A91E1E" },
    info: { solid: "#1260DE", bg: "#E5F1FF", fg: "#1847A5" },
    chart: ["#6047E1", "#1099C6", "#F59F0A", "#29A366", "#EA3E69", "#2B75EE"],
  },
  dark: {
    border: "#2A2B3C",
    input: "#3A3C50",
    text: "#F0F0F5",
    textMuted: "#A4A4B7",
    muted: "#212330",
    secondary: "#262736",
    pressed: "#282640",
    scrim: "#030307",
    success: { solid: "#2EB873", bg: "#183929", fg: "#8DE2B0" },
    warning: { solid: "#F6AF23", bg: "#3D2E14", fg: "#FBD06A" },
    danger: { solid: "#CB2A2A", bg: "#461B1B", fg: "#FA9E9E" },
    info: { solid: "#5A9EF6", bg: "#1B2B46", fg: "#9CC6FC" },
    chart: ["#937BF4", "#3EC7EA", "#F6B531", "#4DCB82", "#F3688B", "#5A9EF6"],
  },
};

interface SurfaceSet {
  readonly background: string;
  readonly cardBorder: string;
  readonly chromeBorder: string;
  readonly band: string;
  readonly chrome: string;
  readonly tabstrip: string;
  readonly card: string;
}

/** Zemin tonu (§1.1 ikinci tablo): açıkta `chrome` ve `card` hep beyaz. */
const SURFACES: Readonly<Record<SurfaceTone, Readonly<Record<Scheme, SurfaceSet>>>> = {
  lavender: {
    light: { background: "#F1EFFA", cardBorder: "#E5E4F2", chromeBorder: "#D6D4E8", band: "#F9F8FE", chrome: WHITE, tabstrip: "#E6E4F4", card: WHITE },
    dark: { background: "#10111E", cardBorder: "#262736", chromeBorder: "#282939", band: "#151623", chrome: "#181928", tabstrip: "#0C0C16", card: "#181925" },
  },
  neutral: {
    light: { background: "#EFF0F3", cardBorder: "#E0E2E6", chromeBorder: "#D5D7DD", band: "#F8F8FA", chrome: WHITE, tabstrip: "#E4E6EA", card: WHITE },
    dark: { background: "#161618", cardBorder: "#2A2C32", chromeBorder: "#2D2F34", band: "#1A1B1E", chrome: "#1D1E21", tabstrip: "#101012", card: "#1E1F23" },
  },
  white: {
    light: { background: WHITE, cardBorder: "#DEDDE9", chromeBorder: "#D5D4E2", band: "#F8F8FC", chrome: WHITE, tabstrip: "#EEEDF5", card: WHITE },
    dark: { background: "#1B1C27", cardBorder: "#2E3042", chromeBorder: "#303245", band: "#1F212D", chrome: "#1F2030", tabstrip: "#14151E", card: "#222331" },
  },
};

interface PresetSet {
  readonly primary: string;
  readonly primary2: string;
  readonly primarySoft: string;
  readonly onPrimarySoft: string;
}

/** Hazır tema renkleri (§1.2): açık `primary · primary2 · soft · onSoft`; koyu `primary · soft · onSoft`. */
const PRESETS: Readonly<Record<PresetKey, Readonly<Record<Scheme, PresetSet>>>> = {
  violet: {
    light: { primary: BRAND_PRIMARY, primary2: "#8A54E8", primarySoft: "#EFECFE", onPrimarySoft: "#3D29A3" },
    dark: { primary: "#6E52E0", primary2: "#8756DC", primarySoft: "#29224F", onPrimarySoft: "#BCAFFD" },
  },
  blue: {
    light: { primary: "#1659E9", primary2: "#0B6DD5", primarySoft: "#E5F1FF", onPrimarySoft: "#1D48A5" },
    dark: { primary: "#1659E9", primary2: "#0B6DD5", primarySoft: "#1C2E4A", onPrimarySoft: "#A5CBFD" },
  },
  teal: {
    light: { primary: "#087981", primary2: "#108474", primarySoft: "#E2F8F8", onPrimarySoft: "#0C636A" },
    dark: { primary: "#087981", primary2: "#108474", primarySoft: "#183939", onPrimarySoft: "#81E4DC" },
  },
  green: {
    light: { primary: "#147B4B", primary2: "#1C7D3C", primarySoft: "#E2F8EB", onPrimarySoft: "#10653D" },
    dark: { primary: "#147B4B", primary2: "#1C7D3C", primarySoft: "#183929", onPrimarySoft: "#8DE2B0" },
  },
  orange: {
    light: { primary: "#C94F08", primary2: "#CF3617", primarySoft: "#FFECDB", onPrimarySoft: "#8E370B" },
    dark: { primary: "#C94F08", primary2: "#CF3617", primarySoft: "#432819", onPrimarySoft: "#FCB97E" },
  },
  rose: {
    light: { primary: "#CE1C4F", primary2: "#C32278", primarySoft: "#FFE5EC", onPrimarySoft: "#9C1C40" },
    dark: { primary: "#CE1C4F", primary2: "#C32278", primarySoft: "#471F2A", onPrimarySoft: "#FAA8BC" },
  },
  graphite: {
    light: { primary: "#3C465D", primary2: "#565F76", primarySoft: "#EDEEF3", onPrimarySoft: "#323C53" },
    dark: { primary: "#5C657A", primary2: "#565F76", primarySoft: "#2B303B", onPrimarySoft: "#D1D6E0" },
  },
};

/** Ön ayar seçicisinin örnek dairesi (açık kip `primary`). */
export const PRESET_SWATCH: Readonly<Record<PresetKey, string>> = Object.fromEntries(
  (Object.keys(PRESETS) as PresetKey[]).map((k) => [k, PRESETS[k].light.primary]),
) as Record<PresetKey, string>;

/** "Özel" renk modalında önerilen 12 renk. */
export const CUSTOM_SUGGESTIONS: readonly string[] = [
  "#6047E1", "#7C3AED", "#9333EA", "#C026D3", "#DB2777", "#E11D48",
  "#DC2626", "#EA580C", "#CA8A04", "#16A34A", "#0D9488", "#0284C7",
];

const TILES: Readonly<Record<Scheme, Readonly<Record<TileTone, Pair>>>> = {
  light: {
    violet: { fg: "#6E3EE0", bg: "#EEE7FE" },
    blue: { fg: "#1366EC", bg: "#E0EEFF" },
    sky: { fg: "#0F8AB3", bg: "#DAF4FB" },
    teal: { fg: "#158471", bg: "#DAF6EF" },
    green: { fg: "#238B4E", bg: "#DFF6E7" },
    amber: { fg: "#C47608", bg: "#FFF2CC" },
    orange: { fg: "#E6560F", bg: "#FFEADB" },
    rose: { fg: "#E31C4E", bg: "#FFE5EC" },
  },
  dark: {
    violet: { fg: "#AD8EF6", bg: "#30244C" },
    blue: { fg: "#77AFF8", bg: "#20314B" },
    sky: { fg: "#5ACFED", bg: "#193843" },
    teal: { fg: "#54D4B6", bg: "#1A3D37" },
    green: { fg: "#69D390", bg: "#1E3E2B" },
    amber: { fg: "#F8C54F", bg: "#433319" },
    orange: { fg: "#F89B59", bg: "#46291B" },
    rose: { fg: "#F782A0", bg: "#4B202B" },
  },
};

/** Köşe ölçeği (§1.5; panel `[data-radius]`). */
const RADII: Readonly<Record<RadiusScale, { control: number; card: number; badge: number; tile: [number, number, number, number] }>> = {
  small: { control: 6, card: 8, badge: 4, tile: [4, 6, 8, 8] },
  medium: { control: 8, card: 12, badge: 6, tile: [6, 8, 10, 10] },
  large: { control: 10, card: 16, badge: 999, tile: [6, 8, 12, 12] },
};

const STATUS_ICON = { iyi: "checkmark-circle", uyari: "warning", kritik: "alert-circle", bilgi: "information-circle" } as const;

// ----------------------------------------------------------------------------- tema kurucu

/**
 * Özel renk: panelin `[data-preset="custom"]` formülü + okunurluk düzeltmesi. Orta tonda (ne beyaz ne mürekkep 4.5:1
 * tutmuyor) dolgu rengi beyaz yazı okunana dek koyulaşır; yumuşak zemin üstü metin 4.5:1'e itilir.
 */
function customPreset(hex: string, scheme: Scheme): PresetSet {
  const { h, s, l } = hexToHsl(hex);
  const fg = pickForeground(hex, WHITE, INK);
  const primary = contrast(fg, hex) >= 4.5 ? hex : ensureContrast(hex, WHITE, 4.5);
  const soft = scheme === "light" ? hslToHex({ h, s: 85, l: 95 }) : hslToHex({ h, s: 35, l: 20 });
  const onSoft = ensureContrast(scheme === "light" ? hslToHex({ h, s: 65, l: 32 }) : hslToHex({ h, s: 90, l: 82 }), soft, 4.5);
  return { primary, primary2: hslToHex({ h: h + 12, s, l }), primarySoft: soft, onPrimarySoft: onSoft };
}

export function appearanceKey(scheme: Scheme, a: Appearance): string {
  return [scheme, a.preset, a.preset === "custom" ? a.customColor : "", a.surface, a.radius, a.tiles].join("|");
}

function create(scheme: Scheme, a: Appearance): Theme {
  const base = BASE[scheme];
  const surf = SURFACES[a.surface][scheme];
  const p = a.preset === "custom" ? customPreset(a.customColor, scheme) : PRESETS[a.preset][scheme];
  const onPrimary = pickForeground(p.primary, WHITE, INK);
  const ph = hexToHsl(p.primary);
  const link = scheme === "light" ? ensureContrast(p.primary, surf.card, 4.5) : ensureContrast(hslToHex({ h: ph.h, s: Math.max(ph.s, 70), l: 74 }), surf.card, 4.5);
  const focus = scheme === "dark" && a.preset === "violet" ? "#8E75F0" : link;
  const chart0 = a.preset === "violet" ? base.chart[0] : scheme === "light" ? p.primary : hslToHex({ h: ph.h, s: Math.max(ph.s, 70), l: 70 });
  const color: ThemeColor = {
    background: surf.background,
    chrome: surf.chrome,
    chromeBorder: surf.chromeBorder,
    tabstrip: surf.tabstrip,
    band: surf.band,
    card: surf.card,
    cardBorder: surf.cardBorder,
    border: base.border,
    input: base.input,
    text: base.text,
    textMuted: base.textMuted,
    muted: base.muted,
    secondary: base.secondary,
    pressed: base.pressed,
    primary: p.primary,
    primary2: p.primary2,
    onPrimary,
    primarySoft: p.primarySoft,
    onPrimarySoft: p.onPrimarySoft,
    focus,
    link,
    scrim: base.scrim,
    success: base.success,
    warning: base.warning,
    danger: base.danger,
    info: base.info,
  };
  const primaryPair: Pair = { fg: p.onPrimarySoft, bg: p.primarySoft };
  const tones = TILES[scheme];
  const tile = Object.fromEntries([...TILE_TONES.map((k) => [k, a.tiles === "mono" ? primaryPair : tones[k]] as const), ["primary", primaryPair] as const]) as Record<TileTone | "primary", Pair>;
  const r = RADII[a.radius];
  const radius: ThemeRadius = {
    control: r.control,
    card: r.card,
    badge: r.badge,
    sheet: r.card + 8,
    tile: { xs: r.tile[0], sm: r.tile[1], md: r.tile[2], lg: r.tile[3] },
    cardInner: r.control,
    button: r.control,
    chip: r.badge,
  };
  const shadow =
    scheme === "light"
      ? {
          soft: { boxShadow: "0 1px 2px rgba(57,54,99,0.05)" },
          card: { boxShadow: "0 1px 2px rgba(57,54,99,0.04), 0 6px 20px -8px rgba(68,61,143,0.12)" },
          float: { boxShadow: "0 8px 24px rgba(25,25,41,0.16)" },
          active: { boxShadow: `0 6px 16px -8px ${rgba(p.primary, 0.6)}` },
        }
      : { soft: {}, card: {}, float: { boxShadow: "0 8px 24px rgba(3,3,7,0.6)" }, active: { boxShadow: `0 6px 16px -8px ${rgba(p.primary, 0.6)}` } };
  const statusOf = (tone: Tone, k: StatusKind): StatusColor => ({ fill: tone.solid, text: tone.fg, bg: tone.bg, icon: STATUS_ICON[k] });
  const domain = Object.fromEntries(
    (Object.keys(DOMAIN_TONE) as Domain[]).map((d) => {
      const pair = tile[DOMAIN_TONE[d]];
      return [d, { fg: pair.fg, chip: pair.bg }];
    }),
  ) as Record<Domain, DomainColor>;
  return {
    scheme,
    key: appearanceKey(scheme, a),
    color,
    tile,
    chart: [chart0, base.chart[1], base.chart[2], base.chart[3], base.chart[4], base.chart[5]],
    radius,
    shadow,
    bg: color.background,
    surface: color.card,
    surfaceAlt: color.pressed,
    separator: color.cardBorder,
    text: color.text,
    textSecondary: color.textMuted,
    textMuted: color.textMuted,
    tint: link,
    tintContainer: color.primarySoft,
    onTint: onPrimary,
    domain,
    status: {
      iyi: statusOf(base.success, "iyi"),
      uyari: statusOf(base.warning, "uyari"),
      kritik: statusOf(base.danger, "kritik"),
      bilgi: { fill: base.textMuted, text: base.text, bg: color.secondary, icon: STATUS_ICON.bilgi },
    },
    station: { ic: { fg: tile.violet.fg, chip: tile.violet.bg }, dis: { fg: tile.orange.fg, chip: tile.orange.bg } },
    role: { yonetici: { fg: onPrimary, bg: p.primary }, ekip: primaryPair },
    cardShadow: shadow.card,
    floatShadow: shadow.float,
    paper: WHITE,
  };
}

const cache = new Map<string, Theme>();

/** (scheme, görünüm) → Theme; anahtara göre önbellekli (aynı girdi aynı nesne → `makeStyles` önbelleği tutar). */
export function buildTheme(scheme: Scheme, a: Appearance = DEFAULT_APPEARANCE): Theme {
  const key = appearanceKey(scheme, a);
  let t = cache.get(key);
  if (!t) {
    t = create(scheme, a);
    cache.set(key, t);
  }
  return t;
}

export const light: Theme = buildTheme("light");
export const dark: Theme = buildTheme("dark");
export const schemes: Readonly<Record<Scheme, Theme>> = { light, dark };

// ----------------------------------------------------------------------------- tipografi, ölçü

/** Sayılar sütunda hizalı kalsın, tazelenince titremesin. */
const tabular: TextStyle = { fontVariant: ["tabular-nums"] };

/** Tipografi ölçeği (§1.4; sistem yazı tipi, `allowFontScaling` açık). Eski adlar geçiş için korunur. */
export const typography = {
  pageTitle: { fontSize: 28, lineHeight: 34, fontWeight: "700" },
  heroValue: { fontSize: 28, lineHeight: 32, fontWeight: "700", ...tabular },
  kpiValue: { fontSize: 22, lineHeight: 26, fontWeight: "700", ...tabular },
  metricValue: { fontSize: 18, lineHeight: 22, fontWeight: "700", ...tabular },
  sectionTitle: { fontSize: 15, lineHeight: 20, fontWeight: "700" },
  rowTitle: { fontSize: 15, lineHeight: 20, fontWeight: "600" },
  body: { fontSize: 15, lineHeight: 20, fontWeight: "400" },
  label: { fontSize: 13, lineHeight: 18, fontWeight: "500" },
  caption: { fontSize: 12, lineHeight: 16, fontWeight: "500" },
  micro: { fontSize: 11, lineHeight: 14, fontWeight: "600" },
  // eski adlar
  display: { fontSize: 34, lineHeight: 40, fontWeight: "700", ...tabular },
  kpi: { fontSize: 26, lineHeight: 30, fontWeight: "700", ...tabular },
  largeTitle: { fontSize: 28, lineHeight: 34, fontWeight: "700" },
  title2: { fontSize: 20, lineHeight: 25, fontWeight: "700" },
  title3: { fontSize: 17, lineHeight: 22, fontWeight: "700" },
  headline: { fontSize: 16, lineHeight: 21, fontWeight: "600" },
  callout: { fontSize: 15, lineHeight: 20, fontWeight: "400" },
  subhead: { fontSize: 14, lineHeight: 19, fontWeight: "400" },
  footnote: { fontSize: 13, lineHeight: 18, fontWeight: "400" },
} as const satisfies Record<string, TextStyle>;

export const tabularNums = tabular;

/** Başlıkta büyük yazı çarpanı sınırı (Dynamic Type taşmasın); gövdede 2. */
export const FONT_SCALE = { title: 1.4, body: 2 } as const;

/** Boşluk ölçeği: 2 · 4 · 6 · 8 · 12 · 16 · 20 · 24 · 32 (eski adlar xs/s/m/l/ml/xl/xxl korunur). */
export const space = { xxs: 2, xs: 4, xsm: 6, s: 8, m: 12, l: 16, ml: 20, xl: 24, xxl: 32 } as const;

/** Ekran yan oluğu, kutular arası boşluk, kart dolgusu (§1.5). */
export const GUTTER = 16;
export const BOX_GAP = 12;
export const CARD_PAD = 16;
/** En küçük dokunma hedefi (iOS 44pt / Android 48dp → 48). */
export const TOUCH = 48;
/** Tek satırlı liste satırı; iki satırlı varyant. */
export const ROW = 48;
export const ROW_TWO = 56;
/** Bu genişlikten itibaren sol ray + iki sütun. */
export const WIDE_MIN = 768;
/** Geniş ekranda içerik kabı (ray hariç) en fazla bu kadar yayılır, ortalanır. */
export const CONTENT_MAX = 1120;
/** Tek sütunlu okuma genişliği (form, liste). */
export const READABLE_MAX = 960;
/** Telefonda sıkı üst bar yüksekliği. */
export const BAR_HEIGHT = 44;
/** Telefon alt sekme çubuğu yüksekliği (güvenli alan HARİÇ). */
export const TAB_BAR_HEIGHT = 64;
/** Sol ray genişliği (≥ WIDE_MIN). */
export const RAIL_WIDTH = 248;

/** Ekran içeriğinin yan oluğu (Screen); tam genişlik bloklar (`ortak/Bloklar`) bu kadar taşar. */
export const ekranOlugu = (wide: boolean): number => (wide ? space.xl : space.l);
