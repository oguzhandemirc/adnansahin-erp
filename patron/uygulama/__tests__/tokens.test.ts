// Tema bekçisi: ham 6 haneli hex YALNIZ `src/ui/tokens.ts`te (ekranlar `useTokens()`tan okur); her görünüm bileşiminde
// açık/koyu temalar aynı şekilde; okunurluk çiftleri WCAG eşiğinde (tüm ön ayar × zemin × kip × köşe × kareler + özel renk).
// Eski §4 (docs/design/PATRON-TASARIM-DILI.md ↔ kod) kaldırıldı: belge bu repoda yok; değerlerin kaynağı artık şartname
// §1 tabloları ve aynası tokens.ts — kontrast ve şekil bekçileri değerin kendisini ölçer.
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { PRESET_KEYS, RADIUS_SCALES, SURFACE_TONES, TILE_STYLES, resolveAppearance, type Appearance } from "../src/ui/appearance";
import { contrast } from "../src/ui/color";
import { CUSTOM_SUGGESTIONS, DEFAULT_APPEARANCE, PRESET_SWATCH, TILE_TONES, buildTheme, dark, light, type Scheme, type Theme } from "../src/ui/tokens";

const ROOT = join(__dirname, "..");
const HEX = /#[0-9A-Fa-f]{6}\b/g;
const TOKENS_FILE = "src/ui/tokens.ts";

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((n) => {
    const p = join(dir, n);
    if (statSync(p).isDirectory()) return walk(p);
    return /\.(tsx?|jsx?)$/.test(n) ? [p] : [];
  });
}

function offenders(files: readonly string[], re: RegExp): string[] {
  const out: string[] = [];
  for (const f of files) {
    const rel = relative(ROOT, f).split("\\").join("/");
    if (rel === TOKENS_FILE) continue;
    readFileSync(f, "utf8").split("\n").forEach((line, i) => {
      if (line.match(re)) out.push(`${rel}:${i + 1}: ${line.trim()}`);
    });
  }
  return out;
}

const SOURCES = () => [...walk(join(ROOT, "src")), ...walk(join(ROOT, "app"))];

describe("§1 ham değer yalnız tokens.ts'te", () => {
  it("src/ ve app/ altında tokens.ts dışında 6 haneli hex yok", () => {
    const files = SOURCES();
    expect(files.length).toBeGreaterThan(20);
    expect(offenders(files, HEX)).toEqual([]);
  });
  it("tam yuvarlak köşe (999) yalnız `radius.badge`ten gelir — elle yazılmaz", () => {
    expect(offenders(SOURCES(), /\b999\b/)).toEqual([]);
  });
});

/** Bütün görünüm bileşimleri (özel renk: öneri listesi + uç değerler). */
function allAppearances(): Appearance[] {
  const out: Appearance[] = [];
  const presets = [...PRESET_KEYS.map((p) => ({ preset: p, customColor: DEFAULT_APPEARANCE.customColor })), ...[...CUSTOM_SUGGESTIONS, "#FFFF00", "#000000", "#FFFFFF", "#808080"].map((c) => ({ preset: "custom" as const, customColor: c }))];
  for (const p of presets) for (const surface of SURFACE_TONES) for (const radius of RADIUS_SCALES) for (const tiles of TILE_STYLES) out.push({ ...DEFAULT_APPEARANCE, ...p, surface, radius, tiles });
  return out;
}
const CASES: [string, Theme][] = allAppearances().flatMap((a) => (["light", "dark"] as Scheme[]).map((s) => [`${s}|${a.preset}|${a.customColor}|${a.surface}|${a.radius}|${a.tiles}`, buildTheme(s, a)] as [string, Theme]));

function leaves(o: unknown, path = ""): [string, unknown][] {
  if (o && typeof o === "object" && !Array.isArray(o)) return Object.entries(o).flatMap(([k, v]) => leaves(v, path ? `${path}.${k}` : k));
  if (Array.isArray(o)) return o.flatMap((v, i) => leaves(v, `${path}[${i}]`));
  return [[path, o]];
}
const COLOR_LEAF = /^(color|tile|chart|domain|status|station|role)[.[]|^(bg|surface|surfaceAlt|separator|text|textSecondary|textMuted|tint|tintContainer|onTint|paper)$/;

describe("§2 tema şekli", () => {
  it("her bileşimde aynı anahtarlar; renk alanları büyük harfli 6 haneli hex", () => {
    const shape = leaves(light).map(([k]) => k).filter((k) => !/shadow/i.test(k)).sort();
    expect(shape.length).toBeGreaterThan(80);
    for (const [name, t] of CASES) {
      expect([name, leaves(t).map(([k]) => k).filter((k) => !/shadow/i.test(k)).sort()]).toEqual([name, shape]);
      for (const [k, v] of leaves(t)) {
        if (!COLOR_LEAF.test(k) || k.endsWith(".icon")) continue;
        expect([name, k, v]).toEqual([name, k, expect.stringMatching(/^#[0-9A-F]{6}$/)]);
      }
    }
  });
  it("buildTheme önbellekli: aynı girdi aynı nesne; varsayılan = light/dark", () => {
    expect(buildTheme("light", { ...DEFAULT_APPEARANCE })).toBe(light);
    expect(buildTheme("dark")).toBe(dark);
    expect(buildTheme("light", { ...DEFAULT_APPEARANCE, preset: "blue" })).not.toBe(light);
  });
  it("köşe ayarı rozet köşesini de belirler; kare tonları 8 + primary", () => {
    const r = (radius: Appearance["radius"]) => buildTheme("light", { ...DEFAULT_APPEARANCE, radius }).radius;
    expect(r("small").badge).toBeLessThan(r("medium").badge);
    expect(r("medium").badge).toBeLessThan(r("large").badge);
    expect(r("small").card).toBeLessThan(r("large").card);
    expect(r("large").chip).toBe(r("large").badge);
    expect(Object.keys(light.tile).sort()).toEqual([...TILE_TONES, "primary"].sort());
  });
  it("tek renk kareler: her ton primary çiftine eşit; renkli: tonlar farklı", () => {
    const mono = buildTheme("light", { ...DEFAULT_APPEARANCE, tiles: "mono" });
    for (const k of TILE_TONES) expect(mono.tile[k]).toEqual(mono.tile.primary);
    expect(new Set(TILE_TONES.map((k) => light.tile[k].fg)).size).toBe(TILE_TONES.length);
  });
  it("özel renk: primary girilen renk (okunur değilse koyulaşır); türetmeler ondan; ön ayar örneği açık primary", () => {
    const t = buildTheme("light", { ...DEFAULT_APPEARANCE, preset: "custom", customColor: "#7C3AED" });
    expect(t.color.primary).toBe("#7C3AED");
    const mid = buildTheme("light", { ...DEFAULT_APPEARANCE, preset: "custom", customColor: "#0284C7" });
    expect(mid.color.primary).not.toBe("#0284C7");
    expect(contrast(mid.color.onPrimary, mid.color.primary)).toBeGreaterThanOrEqual(4.5);
    expect(t.color.primary2).not.toBe(t.color.primary);
    expect(t.color.primarySoft).not.toBe(light.color.primarySoft);
    for (const p of PRESET_KEYS) expect(PRESET_SWATCH[p]).toBe(buildTheme("light", { ...DEFAULT_APPEARANCE, preset: p }).color.primary);
  });
  it("bozuk/bilinmeyen tercih varsayılana düşer", () => {
    expect(resolveAppearance("{bozuk")).toEqual(DEFAULT_APPEARANCE);
    expect(resolveAppearance({ preset: "pembe", radius: "dev", customColor: "kırmızı" })).toEqual(DEFAULT_APPEARANCE);
    expect(resolveAppearance(JSON.stringify({ mode: "koyu", preset: "custom", customColor: "#abcdef" }))).toMatchObject({ mode: "koyu", preset: "custom", customColor: "#ABCDEF" });
  });
});

describe("§3 okunurluk — her bileşim", () => {
  it("metin ≥ 4.5:1 (zemin + kart), bağlantı ≥ 4.5:1, durum/ton çiftleri ≥ 4.5:1, kare ≥ 3:1", () => {
    const bad: string[] = [];
    const need = (name: string, what: string, a: string, b: string, min: number) => {
      const c = contrast(a, b);
      if (c < min) bad.push(`${name} ${what} ${a}/${b} = ${c.toFixed(2)} < ${min}`);
    };
    for (const [name, t] of CASES) {
      const c = t.color;
      for (const fg of [c.text, c.textMuted]) {
        need(name, "metin/zemin", fg, c.background, 4.5);
        need(name, "metin/kart", fg, c.card, 4.5);
      }
      need(name, "link/kart", c.link, c.card, 4.5);
      need(name, "onPrimary/primary", c.onPrimary, c.primary, 4.5);
      need(name, "onPrimarySoft/primarySoft", c.onPrimarySoft, c.primarySoft, 4.5);
      for (const k of ["success", "warning", "danger", "info"] as const) need(name, `${k}.fg/bg`, c[k].fg, c[k].bg, 4.5);
      for (const [k, p] of Object.entries(t.tile)) need(name, `tile.${k}`, p.fg, p.bg, 3);
      need(name, "rol yönetici", t.role.yonetici.fg, t.role.yonetici.bg, 4.5);
    }
    expect(bad).toEqual([]);
  });
});
