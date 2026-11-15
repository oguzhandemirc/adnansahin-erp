// Geniş düzen (tablet, yatay) güvenli alan: ray başlığı ("Adnan Şahin") saat/tarihin, panodaki "Düzenle" pil/wifi
// simgelerinin altına binmesin — üst pay hem rayda hem ekran başlığında uygulanır; dar düzen değişmez.
import { act, render, screen } from "@testing-library/react-native";
import type { ReactElement } from "react";
import { StyleSheet, Text } from "react-native";
import { ThemeProvider } from "../src/ui/theme-context";
import { WIDE_MIN } from "../src/ui/tokens";

const INSETS = { top: 32, bottom: 0, left: 20, right: 0 };
let mockWidth = 1100;
const mockSession = {
  permissions: ["bulut:siparis:oku"] as string[], facility: null as unknown, facilities: [], switchError: null,
  offline: false, offlineSince: null, factoryStamp: null as string | null, facilityId: null,
};
jest.mock("../src/state/session", () => ({ useSession: () => mockSession }));
jest.mock("expo-router", () => ({ useRouter: () => ({ back: jest.fn(), replace: jest.fn(), navigate: jest.fn(), push: jest.fn(), canGoBack: () => false }), usePathname: () => "/pano" }));
jest.mock("react-native-safe-area-context", () => ({ useSafeAreaInsets: () => INSETS }));
jest.mock("react-native/Libraries/Utilities/useWindowDimensions", () => ({
  __esModule: true,
  default: () => ({ width: mockWidth, height: 700, scale: 2, fontScale: 1 }),
}));

const { Screen, SideNav, useWide } = require("../src/ui/Frame") as typeof import("../src/ui/Frame");

async function draw(ui: ReactElement) {
  const store = { get: jest.fn(async () => null), set: jest.fn(async () => undefined) };
  const r = render(<ThemeProvider store={store}>{ui}</ThemeProvider>);
  await act(async () => undefined);
  return r;
}
const flat = (id: string) => StyleSheet.flatten(screen.getByTestId(id).props.style) as Record<string, number>;

function WideProbe() {
  return <Text testID="genis">{String(useWide())}</Text>;
}

afterEach(() => {
  mockWidth = 1100;
});

describe("geniş düzen güvenli alan", () => {
  it("ölçüm geniş düzende yapılıyor", async () => {
    await draw(<WideProbe />);
    expect(screen.getByTestId("genis").props.children).toBe("true");
  });
  it("ray üst güvenli alanı ve yatay sol payı uygular", async () => {
    await draw(<SideNav />);
    const rail = flat("yan-ray");
    expect(rail.paddingTop).toBeGreaterThanOrEqual(INSETS.top);
    expect(rail.paddingLeft).toBeGreaterThanOrEqual(INSETS.left);
  });
  it("ekran başlığı (Düzenle düğmesinin satırı) geniş düzende de üst güvenli alanın altında başlar", async () => {
    await draw(<Screen title="Pano" back={false}><Text>içerik</Text></Screen>);
    const top = flat("ekran-basligi").paddingTop;
    expect(top).toBeGreaterThanOrEqual(INSETS.top);
    expect(top).toBeLessThanOrEqual(INSETS.top + 8);
  });
  it("dar düzen (telefon) aynı: başlık üst güvenli alan + küçük pay", async () => {
    mockWidth = WIDE_MIN - 1;
    await draw(<Screen title="Pano" back={false}><Text>içerik</Text></Screen>);
    const top = flat("ekran-basligi").paddingTop;
    expect(top).toBeGreaterThanOrEqual(INSETS.top);
    expect(top).toBeLessThanOrEqual(INSETS.top + 8);
  });
});
