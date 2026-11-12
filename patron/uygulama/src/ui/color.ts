// Renk matematiği (saf, kütüphanesiz): hex ↔ HSL, WCAG göreli parlaklık/kontrast, okunur ön plan seçimi.
// Ham renk değeri burada YAZILMAZ — girdi ve çıktı hep çağıranın verdiği/türettiği hex'tir.

export interface Hsl {
  readonly h: number;
  readonly s: number;
  readonly l: number;
}

const HEX6 = /^#([0-9a-f]{6})$/i;

export function isHex(v: unknown): v is string {
  return typeof v === "string" && HEX6.test(v);
}

function channels(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

export function hexToHsl(hex: string): Hsl {
  const [r, g, b] = channels(hex).map((c) => c / 255) as [number, number, number];
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  if (max === min) return { h: 0, s: 0, l: l * 100 };
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  const h = max === r ? (g - b) / d + (g < b ? 6 : 0) : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return { h: h * 60, s: s * 100, l: l * 100 };
}

export function hslToHex({ h, s, l }: Hsl): string {
  const hh = ((h % 360) + 360) % 360;
  const ss = Math.max(0, Math.min(100, s)) / 100;
  const ll = Math.max(0, Math.min(100, l)) / 100;
  const k = (n: number) => (n + hh / 30) % 12;
  const a = ss * Math.min(ll, 1 - ll);
  const f = (n: number) => ll - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
  return `#${[f(0), f(8), f(4)].map((v) => Math.round(v * 255).toString(16).padStart(2, "0")).join("").toUpperCase()}`;
}

export function luminance(hex: string): number {
  const c = channels(hex).map((v) => v / 255).map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  return 0.2126 * c[0]! + 0.7152 * c[1]! + 0.0722 * c[2]!;
}

export function contrast(a: string, b: string): number {
  const [x, y] = [luminance(a), luminance(b)].sort((p, q) => q - p);
  return (x! + 0.05) / (y! + 0.05);
}

/** İki adaydan zemine karşı daha okunur olanı (panel `pickForeground`). */
export function pickForeground(bg: string, light: string, dark: string): string {
  return contrast(light, bg) >= contrast(dark, bg) ? light : dark;
}

/** `fg` zemine karşı `ratio`a ulaşana dek açıklığı adım adım kaydırır (koyu zeminde açar, açık zeminde koyulaştırır). */
export function ensureContrast(fg: string, bg: string, ratio: number): string {
  if (contrast(fg, bg) >= ratio) return fg;
  const hsl = hexToHsl(fg);
  const step = luminance(bg) > 0.5 ? -2 : 2;
  let out = fg;
  for (let l = hsl.l; l >= 0 && l <= 100; l += step) {
    out = hslToHex({ ...hsl, l });
    if (contrast(out, bg) >= ratio) return out;
  }
  return out;
}

/** `rgba(r,g,b,a)` (gölge ve yarı saydam katman için). */
export function rgba(hex: string, alpha: number): string {
  const [r, g, b] = channels(hex);
  return `rgba(${r},${g},${b},${alpha})`;
}
