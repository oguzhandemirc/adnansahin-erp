// Tema: görünüm tercihi (kip · tema rengi · zemin · köşe · simge kareleri) cihazda `patron.gorunum` (JSON); eski
// `patron.tema` (yalnız kip) bir kez okunup göçer. Uygulanış anlıktır. Sağlayıcı yoksa (testler) varsayılan açık tema.
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { AccessibilityInfo, useColorScheme } from "react-native";
import type { KeyValue } from "../state/store";
import { APPEARANCE_KEY, DEFAULT_APPEARANCE, LEGACY_THEME_KEY, MODE_LABEL, MODE_PREFS, resolveAppearance, resolveScheme, type Appearance, type ModePref } from "./appearance";
import { buildTheme, light, type Theme } from "./tokens";

/** Eski adlar (Profil ekranı ve testler): kip tercihi. */
export type ThemePref = ModePref;
export const THEME_PREFS: readonly ThemePref[] = MODE_PREFS;
export const THEME_PREF_LABEL = MODE_LABEL;
export const THEME_KEY = LEGACY_THEME_KEY;
export { resolveScheme };

export function isThemePref(v: unknown): v is ThemePref {
  return typeof v === "string" && (THEME_PREFS as readonly string[]).includes(v);
}

interface ThemeValue {
  readonly tokens: Theme;
  readonly appearance: Appearance;
  /** Depodaki tercih okundu mu (açılış ekranı bunu bekler; renk sıçraması olmasın). */
  readonly ready: boolean;
  readonly setAppearance: (patch: Partial<Appearance>) => void;
  readonly resetAppearance: () => void;
}

const ThemeContext = createContext<ThemeValue>({
  tokens: light,
  appearance: DEFAULT_APPEARANCE,
  ready: true,
  setAppearance: () => undefined,
  resetAppearance: () => undefined,
});

/** Depodan görünüm: yeni anahtar varsa o; yoksa eski kip anahtarı `mode`a göçer (bir kez yazılır). */
export async function loadAppearance(store: Pick<KeyValue, "get" | "set">): Promise<Appearance> {
  const raw = await store.get(APPEARANCE_KEY).catch(() => null);
  if (raw) return resolveAppearance(raw);
  const legacy = await store.get(LEGACY_THEME_KEY).catch(() => null);
  if (isThemePref(legacy)) {
    const a = { ...DEFAULT_APPEARANCE, mode: legacy };
    await store.set(APPEARANCE_KEY, JSON.stringify(a)).catch(() => undefined);
    return a;
  }
  return DEFAULT_APPEARANCE;
}

export function ThemeProvider({ children, store }: { children: ReactNode; store?: Pick<KeyValue, "get" | "set"> }) {
  const system = useColorScheme();
  const [appearance, setState] = useState<Appearance>(DEFAULT_APPEARANCE);
  const [ready, setReady] = useState(!store);

  useEffect(() => {
    if (!store) return;
    let live = true;
    loadAppearance(store)
      .then((a) => {
        if (live) setState(a);
      })
      .finally(() => {
        if (live) setReady(true);
      });
    return () => {
      live = false;
    };
  }, [store]);

  const persist = useCallback(
    (a: Appearance) => {
      void store?.set(APPEARANCE_KEY, JSON.stringify(a)).catch(() => undefined);
    },
    [store],
  );

  const setAppearance = useCallback(
    (patch: Partial<Appearance>) => {
      setState((prev) => {
        const next = resolveAppearance({ ...prev, ...patch });
        persist(next);
        return next;
      });
    },
    [persist],
  );

  const resetAppearance = useCallback(() => {
    setState(DEFAULT_APPEARANCE);
    persist(DEFAULT_APPEARANCE);
  }, [persist]);

  const tokens = buildTheme(resolveScheme(appearance.mode, system), appearance);
  const value = useMemo(() => ({ tokens, appearance, ready, setAppearance, resetAppearance }), [tokens, appearance, ready, setAppearance, resetAppearance]);
  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTokens(): Theme {
  return useContext(ThemeContext).tokens;
}

/** Kişiselleştirme ekranı: görünüm + değiştirici. */
export function useAppearance(): Pick<ThemeValue, "appearance" | "setAppearance" | "resetAppearance" | "ready"> {
  const { appearance, setAppearance, resetAppearance, ready } = useContext(ThemeContext);
  return { appearance, setAppearance, resetAppearance, ready };
}

/** Eski arayüz: "Sistem · Açık · Koyu" seçimi. */
export function useThemePref(): { pref: ThemePref; setPref: (p: ThemePref) => void } {
  const { appearance, setAppearance } = useContext(ThemeContext);
  return { pref: appearance.mode, setPref: (p) => setAppearance({ mode: p }) };
}

/** Hareket azaltma (erişilebilirlik) açık mı — animasyonlar kısalır/kapanır. */
export function useReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    let live = true;
    AccessibilityInfo.isReduceMotionEnabled()
      .then((v) => {
        if (live) setReduced(!!v);
      })
      .catch(() => undefined);
    const sub = AccessibilityInfo.addEventListener("reduceMotionChanged", (v) => setReduced(!!v));
    return () => {
      live = false;
      sub?.remove?.();
    };
  }, []);
  return reduced;
}

/** Temaya bağlı stil fabrikası: her tema için bir kez kurulur (bileşen başına yeniden hesaplanmaz). */
export function makeStyles<T>(build: (t: Theme) => T): () => T {
  const cache = new Map<Theme, T>();
  return function useStyles(): T {
    const t = useTokens();
    let s = cache.get(t);
    if (!s) {
      s = build(t);
      cache.set(t, s);
    }
    return s;
  };
}
