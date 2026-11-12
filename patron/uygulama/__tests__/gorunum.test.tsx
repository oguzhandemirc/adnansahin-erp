// Profil › Görünüm: her ayar tema nesnesini ANINDA değiştirir, `patron.gorunum`a yazılır ve yeni açılışta (aynı depo)
// geri gelir; özel renk modalı geçersiz kodda kaydetmez; eski `patron.tema` kipi bir kez göçer; "Varsayılana dön".
import { act, fireEvent, render, screen } from "@testing-library/react-native";
import { Text } from "react-native";

jest.mock("../src/state/session", () => ({ useSession: () => ({ permissions: [], facility: null, facilities: [] }) }));
jest.mock("expo-router", () => ({ useRouter: () => ({ push: jest.fn(), back: jest.fn(), canGoBack: () => true }), usePathname: () => "/gorunum" }));
jest.mock("react-native-safe-area-context", () => ({ useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }) }));

const Gorunum = (require("../app/(app)/gorunum") as typeof import("../app/(app)/gorunum")).default;
const { ThemeProvider, useTokens, loadAppearance } = require("../src/ui/theme-context") as typeof import("../src/ui/theme-context");
const { normalizeHex } = require("../src/ui/gorunum/RenkSecici") as typeof import("../src/ui/gorunum/RenkSecici");
const { TemaGecisi } = require("../src/ui/hareket/TemaGecisi") as typeof import("../src/ui/hareket/TemaGecisi");
const { DEFAULT_APPEARANCE, buildTheme } = require("../src/ui/tokens") as typeof import("../src/ui/tokens");

/** Bellek içi KeyValue: iki "açılış" aynı depoyu paylaşır. */
function memoryStore(seed: Record<string, string> = {}) {
  const m = new Map(Object.entries(seed));
  return {
    get: jest.fn(async (k: string) => m.get(k) ?? null),
    set: jest.fn(async (k: string, v: string) => {
      m.set(k, v);
    }),
    raw: m,
  };
}

let seen: ReturnType<typeof useTokens> | null = null;
function Probe() {
  const t = useTokens();
  seen = t;
  return <Text testID="tema-anahtari">{t.key}</Text>;
}

async function open(store: ReturnType<typeof memoryStore>) {
  const r = render(<ThemeProvider store={store}><Gorunum /><Probe /></ThemeProvider>);
  await act(async () => undefined);
  return r;
}

describe("Görünüm ekranı", () => {
  it("⭐ her eksen tema nesnesini anında değiştirir ve yeniden açılışta korunur", async () => {
    const store = memoryStore();
    const first = await open(store);
    expect(seen).toBe(buildTheme("light", DEFAULT_APPEARANCE));

    fireEvent.press(screen.getByTestId("tema-koyu"));
    expect(seen!.scheme).toBe("dark");
    fireEvent.press(screen.getByTestId("renk-teal"));
    expect(seen!.color.primary).toBe(buildTheme("dark", { ...DEFAULT_APPEARANCE, preset: "teal" }).color.primary);
    fireEvent.press(screen.getByTestId("zemin-white"));
    fireEvent.press(screen.getByTestId("kose-small"));
    expect(seen!.radius.badge).toBe(4);
    fireEvent.press(screen.getByTestId("kareler-mono"));
    expect(seen!.tile.rose).toEqual(seen!.tile.primary);
    const final = seen!;
    expect(JSON.parse(store.raw.get("patron.gorunum")!)).toEqual({ mode: "koyu", preset: "teal", customColor: "#6047E1", surface: "white", radius: "small", tiles: "mono" });
    first.unmount();

    seen = null;
    await open(store);
    expect(seen).toBe(final);
  });

  it("özel renk: modal doğrudan açılır, geçersiz kod kaydetmez, geçerli kod uygulanır ve saklanır", async () => {
    const store = memoryStore();
    await open(store);
    fireEvent.press(screen.getByTestId("renk-ozel"));
    expect(screen.getByTestId("ozel-renk-sayfasi")).toBeTruthy();
    fireEvent.changeText(screen.getByTestId("ozel-renk-girdi"), "#12");
    expect(screen.getByTestId("ozel-renk-kaydet").props.accessibilityState).toMatchObject({ disabled: true });
    fireEvent.press(screen.getByTestId("oneri-7C3AED"));
    fireEvent.press(screen.getByTestId("ozel-renk-kaydet"));
    expect(seen!.color.primary).toBe("#7C3AED");
    expect(JSON.parse(store.raw.get("patron.gorunum")!)).toMatchObject({ preset: "custom", customColor: "#7C3AED" });
  });

  it("Varsayılana dön bütün eksenleri sıfırlar", async () => {
    const store = memoryStore({ "patron.gorunum": JSON.stringify({ mode: "koyu", preset: "rose", surface: "neutral", radius: "medium", tiles: "mono" }) });
    await open(store);
    expect(seen!.scheme).toBe("dark");
    fireEvent.press(screen.getByTestId("gorunum-varsayilan"));
    expect(seen).toBe(buildTheme("light", DEFAULT_APPEARANCE));
    expect(JSON.parse(store.raw.get("patron.gorunum")!)).toEqual(DEFAULT_APPEARANCE);
  });

  it("eski `patron.tema` kipi bir kez yeni anahtara göçer", async () => {
    const store = memoryStore({ "patron.tema": "koyu" });
    expect(await loadAppearance(store)).toEqual({ ...DEFAULT_APPEARANCE, mode: "koyu" });
    expect(JSON.parse(store.raw.get("patron.gorunum")!)).toMatchObject({ mode: "koyu" });
  });

  it("tema değişince eski zemin renginde örtü belirip kaybolur (yumuşak renk geçişi)", async () => {
    jest.useFakeTimers();
    try {
      function Kok() {
        const t = useTokens();
        return <TemaGecisi anahtar={t.key} renk={t.bg} />;
      }
      const store = memoryStore();
      render(<ThemeProvider store={store}><Gorunum /><Kok /></ThemeProvider>);
      await act(async () => undefined);
      expect(screen.queryByTestId("tema-gecisi")).toBeNull();
      fireEvent.press(screen.getByTestId("tema-koyu"));
      expect(screen.getByTestId("tema-gecisi")).toBeTruthy();
      act(() => jest.advanceTimersByTime(400));
      expect(screen.queryByTestId("tema-gecisi")).toBeNull();
    } finally {
      jest.useRealTimers();
    }
  });

  it("hex girdisi: diyez isteğe bağlı, küçük harf büyür, eksik/bozuk null", () => {
    expect(normalizeHex("7c3aed")).toBe("#7C3AED");
    expect(normalizeHex(" #0284c7 ")).toBe("#0284C7");
    expect(normalizeHex("#12")).toBeNull();
    expect(normalizeHex("#GGGGGG")).toBeNull();
  });
});
