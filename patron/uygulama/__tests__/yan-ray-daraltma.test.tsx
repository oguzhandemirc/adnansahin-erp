// Geniş düzen › sol menü rayı açılır/kapanır (2026-11-17): §1 varsayılan açık (bugünkü genişlik, tesis adı ve
// etiketler) · §2 düğme rayı simge şeridine daraltır, etiketler gizlenir ama erişilebilirlik adı kalır, durum cihazda
// saklanır ve yeniden açılışta okunur · §3 dar (telefon) düzende ray hiç çizilmez.
import { act, fireEvent, render, screen } from "@testing-library/react-native";
import type { ReactElement } from "react";
import { StyleSheet } from "react-native";
import { ThemeProvider } from "../src/ui/theme-context";
import { RAIL_COLLAPSED_WIDTH, RAIL_WIDTH } from "../src/ui/tokens";

const mockSession = {
  permissions: ["bulut:siparis:oku", "bulut:stok:oku"] as string[], facility: { tesis: { id: "t1", ad: "Örnek Tesis" }, hesap: { id: "h1" } } as unknown,
  facilities: [], switchError: null, offline: false, offlineSince: null, factoryStamp: null as string | null, facilityId: null,
};
jest.mock("../src/state/session", () => ({ useSession: () => mockSession }));
jest.mock("expo-router", () => ({ useRouter: () => ({ back: jest.fn(), replace: jest.fn(), navigate: jest.fn(), push: jest.fn(), canGoBack: () => false }), usePathname: () => "/stok" }));
jest.mock("react-native-safe-area-context", () => ({ useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }) }));

const { SideNav, RAY_TERCIHI } = require("../src/ui/Frame") as typeof import("../src/ui/Frame");
const { plainStore } = require("../src/state/store") as typeof import("../src/state/store");
const ANAHTAR = `acik-kapali:t1:h1:${RAY_TERCIHI}`;

async function draw(ui: ReactElement) {
  const theme = { get: jest.fn(async () => null), set: jest.fn(async () => undefined) };
  const r = render(<ThemeProvider store={theme}>{ui}</ThemeProvider>);
  await act(async () => undefined);
  await act(async () => undefined);
  return r;
}
const genislik = () => (StyleSheet.flatten(screen.getByTestId("yan-ray").props.style) as { width: number }).width;

beforeEach(async () => {
  await plainStore.remove(ANAHTAR);
});

describe("§1 varsayılan", () => {
  it("açık: bugünkü genişlik, tesis adı ve menü etiketleri; düğme 'Menüyü daralt'", async () => {
    await draw(<SideNav />);
    expect(genislik()).toBe(RAIL_WIDTH);
    expect(screen.getByText("Örnek Tesis")).toBeTruthy();
    expect(screen.getByText("Stok")).toBeTruthy();
    const d = screen.getByTestId("yan-ray-dugme");
    expect(d.props.accessibilityLabel).toBe("Menüyü daralt");
    expect(d.props.accessibilityState).toMatchObject({ expanded: true });
  });
});

describe("§2 daraltma", () => {
  it("düğme simge şeridine daraltır; etiket gizlenir, erişilebilirlik adı kalır; durum saklanır", async () => {
    await draw(<SideNav />);
    fireEvent.press(screen.getByTestId("yan-ray-dugme"));
    await act(async () => undefined);
    expect(genislik()).toBe(RAIL_COLLAPSED_WIDTH);
    expect(screen.queryByText("Örnek Tesis")).toBeNull();
    expect(screen.queryByText("Stok")).toBeNull();
    expect(screen.getByTestId("menu-stok").props.accessibilityLabel).toBe("Stok");
    const d = screen.getByTestId("yan-ray-dugme");
    expect(d.props.accessibilityLabel).toBe("Menüyü genişlet");
    expect(d.props.accessibilityState).toMatchObject({ expanded: false });
    expect(await plainStore.get(ANAHTAR)).toBe("0");
  });

  it("saklı '0' yeniden açılışta daraltılmış çizer; yeniden basınca açılır ve '1' yazılır", async () => {
    await plainStore.set(ANAHTAR, "0");
    await draw(<SideNav />);
    expect(genislik()).toBe(RAIL_COLLAPSED_WIDTH);
    fireEvent.press(screen.getByTestId("yan-ray-dugme"));
    await act(async () => undefined);
    expect(genislik()).toBe(RAIL_WIDTH);
    expect(await plainStore.get(ANAHTAR)).toBe("1");
  });
});

describe("§4 kaydırma (2026-11-18)", () => {
  const ScrollView = (require("react-native") as typeof import("react-native")).ScrollView;
  const icinde = (kap: ReturnType<typeof screen.getByTestId>, id: string) => kap.findAll((n: { props: { testID?: string } }) => n.props.testID === id).length > 0;

  it.each([true, false])("öğe listesi ScrollView içinde, başlık düğmesi ve hesap kartı DIŞINDA (açık=%s)", async (acik) => {
    if (!acik) await plainStore.set(ANAHTAR, "0");
    await draw(<SideNav />);
    const liste = screen.UNSAFE_getByType(ScrollView);
    expect(liste.props.testID).toBe("yan-ray-liste");
    expect(icinde(liste, "menu-stok")).toBe(true);
    expect(icinde(liste, "menu-siparisler")).toBe(true);
    expect(icinde(liste, "yan-ray-dugme")).toBe(false);
    expect(icinde(liste, "ray-hesap")).toBe(false);
    // Liste kalan yüksekliği doldurur (sabit başlık + sabit hesap kartı arasında kayar).
    expect(StyleSheet.flatten(liste.props.style)).toMatchObject({ flex: 1 });
  });
});

describe("§5 geçiş (2026-11-18)", () => {
  const reanimated = require("react-native-reanimated") as typeof import("react-native-reanimated");
  const { AccessibilityInfo } = require("react-native") as typeof import("react-native");
  const { SURE } = require("../src/ui/hareket/sabitler") as typeof import("../src/ui/hareket/sabitler");
  afterEach(() => jest.restoreAllMocks());

  it("aç/kapa genişliği zamanlı geçişle değiştirir; kapanışta etiketler geçiş bitince sökülür", async () => {
    const spy = jest.spyOn(reanimated, "withTiming");
    await draw(<SideNav />);
    expect(spy).not.toHaveBeenCalled(); // açılışta (saklı durum okunurken) geçiş oynamaz
    fireEvent.press(screen.getByTestId("yan-ray-dugme"));
    await act(async () => undefined);
    expect(spy).toHaveBeenCalledWith(RAIL_COLLAPSED_WIDTH, expect.objectContaining({ duration: SURE.uzun }), expect.any(Function));
    expect(genislik()).toBe(RAIL_COLLAPSED_WIDTH);
    expect(screen.queryByText("Stok")).toBeNull();
    fireEvent.press(screen.getByTestId("yan-ray-dugme"));
    await act(async () => undefined);
    expect(spy).toHaveBeenLastCalledWith(RAIL_WIDTH, expect.objectContaining({ duration: SURE.uzun }), expect.any(Function));
    expect(genislik()).toBe(RAIL_WIDTH);
    expect(screen.getByText("Stok")).toBeTruthy();
  });

  it("'hareketi azalt' açıkken geçiş oynamaz, doğrudan hedefe", async () => {
    jest.spyOn(AccessibilityInfo, "isReduceMotionEnabled").mockResolvedValue(true);
    const spy = jest.spyOn(reanimated, "withTiming");
    await draw(<SideNav />);
    fireEvent.press(screen.getByTestId("yan-ray-dugme"));
    await act(async () => undefined);
    expect(spy).not.toHaveBeenCalled();
    expect(genislik()).toBe(RAIL_COLLAPSED_WIDTH);
    expect(screen.queryByText("Stok")).toBeNull();
  });

  it("Fabric'te etkisiz LayoutAnimation kullanılmaz", () => {
    const src = require("fs").readFileSync(require("path").join(__dirname, "../src/ui/Frame.tsx"), "utf8") as string;
    expect(src).not.toMatch(/LayoutAnimation\.(configureNext|create)/);
  });
});

describe("§3 dar düzen", () => {
  it("telefon genişliğinde uygulama yerleşimi rayı çizmez (useWide yanlış)", () => {
    const { useWide } = require("../src/ui/Frame") as typeof import("../src/ui/Frame");
    expect(typeof useWide).toBe("function");
    // Yerleşim kararı `app/(app)/_layout.tsx`: `{wide ? <SideNav /> : null}` — bu dilim onu değiştirmedi.
    const src = require("fs").readFileSync(require("path").join(__dirname, "../app/(app)/_layout.tsx"), "utf8") as string;
    expect(src).toContain("{wide ? <SideNav /> : null}");
  });
});
