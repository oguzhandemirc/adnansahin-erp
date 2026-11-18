// Kısa bildirimin yeri (2026-11-19, iPhone: "çok aşağıda kalıyor"): sekme çubuğunun üstünde 16 pt; sekmesiz ekranda
// alt güvenli alan + 24; alt sabit şerit (ör. stok toplam satırı) ve açık klavyenin üstünde 12. Konum ekranın gerçek
// yerleşiminden türetilir (kabın altı pencerenin altında değilse altta sekme çubuğu var).
import { act, fireEvent, render, screen } from "@testing-library/react-native";
import { RefreshControl, StyleSheet, Text } from "react-native";
import { ThemeProvider } from "../src/ui/theme-context";

jest.mock("react-native/Libraries/Utilities/useWindowDimensions", () => ({
  __esModule: true,
  default: () => ({ width: 393, height: 852, scale: 3, fontScale: 1 }),
}));
const mockSession = {
  permissions: ["*"] as string[],
  facility: { tesis: { id: "t", ad: "Örnek" }, hesap: { ad: "A" }, simdiGuncelle: true, esitleme: null, hizmet: { asama: "ACIK" } } as unknown,
  offline: false,
  offlineSince: null,
  factoryStamp: null as string | null,
  api: { syncNow: jest.fn(async () => {
    throw new Error("ağ");
  }) },
  refresh: jest.fn(async () => null),
};
jest.mock("../src/state/session", () => ({ useSession: () => mockSession }));
jest.mock("expo-router", () => ({ useRouter: () => ({ back: jest.fn(), replace: jest.fn(), navigate: jest.fn(), canGoBack: () => true }), usePathname: () => "/stok" }));
jest.mock("react-native-safe-area-context", () => ({ useSafeAreaInsets: () => ({ top: 59, bottom: 34, left: 0, right: 0 }) }));

const { Screen } = require("../src/ui/Frame") as typeof import("../src/ui/Frame");
const { SEKME_PAYI, SEKMESIZ_PAYI, SERIT_PAYI, kisaBildirimAltPayi } = require("../src/ui/KisaBildirim") as typeof import("../src/ui/KisaBildirim");
const { yenileci } = require("../src/state/yenile") as typeof import("../src/state/yenile");

const yerlesim = (height: number) => ({ nativeEvent: { layout: { x: 0, y: 0, width: 393, height } } });

async function hataliYenileme(footer?: boolean, kapYuksekligi = 852, seritYuksekligi = 0) {
  const store = { get: jest.fn(async () => null), set: jest.fn(async () => undefined) };
  render(
    <ThemeProvider store={store}>
      <Screen title="Stok" back={false} onRefresh={jest.fn()} footer={footer ? <Text>Depoda 10</Text> : undefined}><Text>içerik</Text></Screen>
    </ThemeProvider>,
  );
  await act(async () => undefined);
  await act(async () => {
    // RNTL, dokunuş yanıtlayıcısı (kenar hareketi) olan öğede olayları süzer: yerleşim doğrudan bildirilir.
    screen.getByTestId("ekran").props.onLayout(yerlesim(kapYuksekligi));
    if (footer) fireEvent(screen.getByTestId("ekran-alt-serit"), "layout", yerlesim(seritYuksekligi));
  });
  await act(async () => {
    screen.UNSAFE_getByType(RefreshControl).props.onRefresh();
  });
  return StyleSheet.flatten(screen.getByTestId("kisa-bildirim").props.style) as { bottom: number };
}

beforeEach(() => yenileci.sifirla());
afterEach(() => yenileci.sifirla());

describe("alt pay hesabı", () => {
  it("sekme çubuğu varken kabın altından 16 (kap zaten çubuğun üstünde biter)", () => {
    expect(kisaBildirimAltPayi({ altBosluk: 98, guvenliAlt: 34, altSerit: 0, klavye: 0 })).toBe(SEKME_PAYI);
  });
  it("sekmesiz ekran / tablet: alt güvenli alan + 24 (ev çizgisinin içine düşmez)", () => {
    expect(kisaBildirimAltPayi({ altBosluk: 0, guvenliAlt: 34, altSerit: 0, klavye: 0 })).toBe(34 + SEKMESIZ_PAYI);
    expect(kisaBildirimAltPayi({ altBosluk: 0, guvenliAlt: 0, altSerit: 0, klavye: 0 })).toBe(SEKMESIZ_PAYI);
  });
  it("alt sabit şeridin ve açık klavyenin üstünde", () => {
    expect(kisaBildirimAltPayi({ altBosluk: 98, guvenliAlt: 34, altSerit: 44, klavye: 0 })).toBe(44 + SERIT_PAYI);
    expect(kisaBildirimAltPayi({ altBosluk: 98, guvenliAlt: 34, altSerit: 44, klavye: 336 })).toBe(336 - 98 + SERIT_PAYI);
    expect(kisaBildirimAltPayi({ altBosluk: 0, guvenliAlt: 34, altSerit: 0, klavye: 336 })).toBe(336 + SERIT_PAYI);
  });
});

describe("Screen'de gerçek yerleşimden", () => {
  it("sekmesiz ekran (kap pencere boyu): alt güvenli alan + 24", async () => {
    expect((await hataliYenileme(false, 852)).bottom).toBe(34 + SEKMESIZ_PAYI);
  });
  it("sekmeli ekran (kap pencereden kısa): çubuğun 16 üstü", async () => {
    expect((await hataliYenileme(false, 852 - 98)).bottom).toBe(SEKME_PAYI);
  });
  it("alt sabit şerit (stok toplam satırı) varken onun 12 üstü", async () => {
    expect((await hataliYenileme(true, 852 - 98, 44)).bottom).toBe(44 + SERIT_PAYI);
  });
});
