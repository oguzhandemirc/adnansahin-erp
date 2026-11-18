// Telefon başlığı (2026-11-19, ilk gerçek iPhone denemesi: "Siparişl / er" kırılıyor, tazelik üçüncü satıra düşüyordu).
// Kurallar: başlık HER ZAMAN tek satır (küçülür, sonra "…"); birincil düğme KISA ad ("+ Sipariş", erişilebilirlik tam
// ad); telefonda (< 600) ikinciller tek "⋯" menüsünde, zil dışarıda; kökte sol üstte "≡" → soldan çekmece (rayla aynı
// öğe kaynağı), ayrıntıda aynı yerde geri; tablette (≥ 768) ray var, çekmece/≡/⋯ yok, ikinciller açık simge.
import { act, fireEvent, render, screen, within } from "@testing-library/react-native";
import type { ReactElement } from "react";
import { StyleSheet, Text } from "react-native";
import { ThemeProvider } from "../src/ui/theme-context";

let mockWidth = 393;
jest.mock("react-native/Libraries/Utilities/useWindowDimensions", () => ({
  __esModule: true,
  default: () => ({ width: mockWidth, height: 852, scale: 3, fontScale: 1 }),
}));
const mockSession = {
  permissions: ["bulut:oturum", "bulut:cari:oku", "bulut:cari:yaz", "bulut:ozet:oku", "bulut:rapor:oku", "bulut:sevkiyat:oku", "bulut:siparis:oku", "bulut:siparis:yaz", "bulut:stok:oku", "bulut:uretim:oku"] as string[],
  switchError: null,
  facility: null as unknown,
  facilities: [],
  offline: false,
  offlineSince: null,
  factoryStamp: new Date(Date.now() - 60_000).toISOString() as string | null,
  api: { syncNow: jest.fn() },
  refresh: jest.fn(async () => null),
};
const mockRouter = { back: jest.fn(), replace: jest.fn(), navigate: jest.fn(), push: jest.fn(), canGoBack: () => true };
let mockPath = "/siparisler";
jest.mock("../src/state/session", () => ({ useSession: () => mockSession }));
jest.mock("expo-router", () => ({ useRouter: () => mockRouter, usePathname: () => mockPath }));
jest.mock("react-native-safe-area-context", () => ({ useSafeAreaInsets: () => ({ top: 59, bottom: 34, left: 0, right: 0 }) }));

const { Screen } = require("../src/ui/Frame") as typeof import("../src/ui/Frame");
const { kartSecEylemi, MENU_KAPANIS_MS, DAR_BASLIK } = require("../src/ui/BaslikMenusu") as typeof import("../src/ui/BaslikMenusu");
const { CapsuleButton } = require("../src/ui/siparis/parts") as typeof import("../src/ui/siparis/parts");
const { RAIL_GROUPS } = require("../src/ui/tabs") as typeof import("../src/ui/tabs");
const { moduleVisible } = require("../src/lib/access") as typeof import("../src/lib/access");

const kartlar = jest.fn();
async function siparisler(ui?: ReactElement) {
  const store = { get: jest.fn(async () => null), set: jest.fn(async () => undefined) };
  render(
    <ThemeProvider store={store}>
      {ui ?? (
        <Screen title="Siparişler" back={false} headerRight={<CapsuleButton label="Sipariş" erisim="Yeni sipariş" icon="add" onPress={() => undefined} testID="yeni-siparis" />} headerSecondary={[kartSecEylemi(kartlar, "siparis-kart-sec")]}>
          <Text>içerik</Text>
        </Screen>
      )}
    </ThemeProvider>,
  );
  await act(async () => undefined);
}
const flat = (id: string) => StyleSheet.flatten(screen.getByTestId(id).props.style) as Record<string, unknown>;

afterEach(() => {
  mockWidth = 393;
  mockPath = "/siparisler";
  kartlar.mockReset();
  jest.useRealTimers();
});

describe("telefon (393 pt)", () => {
  it("başlık tek satır, sığmazsa küçülür; başlıkta tazelik öğesi yok (menüde 'Son veri')", async () => {
    await siparisler();
    const yazi = screen.getByTestId("baslik-yazisi");
    expect(yazi.props.numberOfLines).toBe(1);
    expect(yazi.props.adjustsFontSizeToFit).toBe(true);
    expect(yazi.props.minimumFontScale).toBeGreaterThanOrEqual(0.7);
    expect(flat("baslik-kutusu")).toMatchObject({ flexDirection: "column", minWidth: 120 });
    expect(screen.queryByTestId("esitleme-gostergesi")).toBeNull();
    expect(screen.queryByTestId("simdi-guncelle")).toBeNull();
  });

  it("birincil düğme kısa ad, erişilebilirlik tam ad", async () => {
    await siparisler();
    const d = screen.getByTestId("yeni-siparis");
    expect(within(d).getByText("Sipariş")).toBeTruthy();
    expect(within(d).queryByText("Yeni sipariş")).toBeNull();
    expect(d.props.accessibilityLabel).toBe("Yeni sipariş");
  });

  it("ikinciller ⋯ menüsünde, zil dışarıda; menü öğesi menü kapandıktan sonra koşar", async () => {
    jest.useFakeTimers();
    await siparisler();
    const eylem = screen.getByTestId("baslik-eylemi");
    expect(within(eylem).getByTestId("bildirim-zili")).toBeTruthy();
    expect(within(eylem).getByTestId("baslik-tasma")).toBeTruthy();
    // NEGATİF SONDA: ikincil eylem açık simge olarak başlıkta DURMAZ.
    expect(screen.queryByTestId("siparis-kart-sec")).toBeNull();
    fireEvent.press(screen.getByTestId("baslik-tasma"));
    expect(within(screen.getByTestId("baslik-tasma-menu")).getByText("Kartları seç")).toBeTruthy();
    fireEvent.press(screen.getByTestId("siparis-kart-sec"));
    expect(kartlar).not.toHaveBeenCalled();
    act(() => jest.advanceTimersByTime(MENU_KAPANIS_MS));
    expect(kartlar).toHaveBeenCalledTimes(1);
  });

  it("kökte sol üstte ≡ (geri yok) → soldan çekmece; öğeler rayın kaynağından (RAIL_GROUPS)", async () => {
    await siparisler();
    expect(screen.queryByTestId("geri")).toBeNull();
    const satir = screen.getByTestId("baslik-satiri");
    expect(satir.props.children[0]).toBeTruthy();
    expect(within(satir).getByTestId("baslik-menu")).toBeTruthy();
    expect(screen.queryByTestId("cekmece")).toBeNull();
    fireEvent.press(screen.getByTestId("baslik-menu"));
    const panel = flat("cekmece");
    expect(panel).toMatchObject({ position: "absolute", left: 0 });
    const tx = (panel.transform as { translateX: number }[])[0]!.translateX;
    expect(tx).toBeLessThanOrEqual(0); // soldan kayar (kapalıyken −genişlik, açıkken 0)
    const beklenen = RAIL_GROUPS.flatMap((g) => g.modules).filter((k) => moduleVisible(mockSession.permissions, k)).map((k) => `menu-${k}`);
    expect(beklenen.length).toBeGreaterThanOrEqual(8);
    const cizilen = within(screen.getByTestId("cekmece-liste")).queryAllByTestId(/^menu-/).map((n) => n.props.testID as string);
    expect(cizilen).toEqual(beklenen);
    // Perde ekran okuyucuya gizli (panel `accessibilityViewIsModal`); kapatma düğmesi erişilebilir.
    fireEvent.press(screen.getByTestId("cekmece-perde", { includeHiddenElements: true }));
    await act(async () => undefined);
    expect(screen.queryByTestId("cekmece")).toBeNull();
  });

  it("çekmecenin ALTINDA, hesap kartının hemen üstünde 'Son veri: HH:MM' + yenile simgesi; dokununca tam yenileme", async () => {
    mockSession.refresh.mockClear();
    mockSession.factoryStamp = "2026-11-19T22:34:00.000Z"; // İstanbul 20.11 01:34
    jest.useFakeTimers({ now: Date.parse("2026-11-19T23:00:00.000Z"), doNotFake: ["nextTick", "setImmediate"] });
    await siparisler();
    fireEvent.press(screen.getByTestId("baslik-menu"));
    const cekmece = screen.getByTestId("cekmece");
    const satir = within(cekmece).getByTestId("cekmece-son-veri");
    expect(within(satir).getByText("Son veri: 01:34")).toBeTruthy();
    expect(within(satir).getByTestId("cekmece-son-veri-simge")).toBeTruthy();
    expect(satir.props.accessibilityLabel).toBe("Son veri: 01:34. Yenile");
    // Sıra: liste → Son veri → hesap kartı (panelin son iki çocuğu).
    const ids = (cekmece.props.children as { props?: { testID?: string } }[]).flat().map((c) => c?.props?.testID);
    expect(ids.slice(-2)).toEqual(["cekmece-son-veri", "cekmece-hesap"]);
    await act(async () => {
      fireEvent.press(satir);
    });
    expect(mockSession.refresh).toHaveBeenCalled();
    mockSession.factoryStamp = new Date(Date.now() - 60_000).toISOString();
  });

  it("ayrıntı ekranında aynı yerde geri oku, ≡ yok", async () => {
    mockPath = "/cariler/abc";
    await siparisler(<Screen title={"SMHTEX TEKSTİL SANAYİ VE TİCARET ANONİM ŞİRKETİ"} back><Text>içerik</Text></Screen>);
    expect(screen.getByTestId("geri")).toBeTruthy();
    expect(screen.queryByTestId("baslik-menu")).toBeNull();
    expect(screen.getByTestId("baslik-yazisi").props.ellipsizeMode).toBe("tail");
  });
});

describe("tablet", () => {
  it("geniş (1024): ≡, ⋯ ve çekmece yok; ikinciller açık simge", async () => {
    mockWidth = 1024;
    await siparisler();
    expect(screen.queryByTestId("baslik-menu")).toBeNull();
    expect(screen.queryByTestId("baslik-tasma")).toBeNull();
    fireEvent.press(screen.getByTestId("siparis-kart-sec"));
    expect(kartlar).toHaveBeenCalledTimes(1);
    expect(flat("baslik-kutusu").flexDirection).toBe("row");
  });

  it(`dikey tablet (700 ≥ ${DAR_BASLIK}, ray yok): ≡ var, ikinciller açık`, async () => {
    mockWidth = 700;
    await siparisler();
    expect(screen.getByTestId("baslik-menu")).toBeTruthy();
    expect(screen.queryByTestId("baslik-tasma")).toBeNull();
    expect(screen.getByTestId("siparis-kart-sec")).toBeTruthy();
  });
});
