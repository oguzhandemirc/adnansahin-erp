// Ekran başlığı hizası: eylem (ör. "Yeni sipariş") büyük başlıkla AYNI satırda, dikey ortalı, sağa yaslı; uzun başlıkta
// eylem sarılmaz/küçülmez. Eylem üst çubuğa (ayrı satıra) düşmez.
import { act, render, screen, within } from "@testing-library/react-native";
import type { ReactElement } from "react";
import { StyleSheet, Text } from "react-native";
import { ThemeProvider } from "../src/ui/theme-context";

jest.mock("../src/state/session", () => ({ useSession: () => ({ permissions: ["*"], switchError: null, facility: null, facilities: [], offline: false }) }));
jest.mock("expo-router", () => ({ useRouter: () => ({ back: jest.fn(), replace: jest.fn(), canGoBack: () => true }), usePathname: () => "/siparisler" }));
jest.mock("react-native-safe-area-context", () => ({ useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }) }));
jest.mock("../src/ui/data", () => ({ StatusBands: () => null }));

const { Screen } = require("../src/ui/Frame") as typeof import("../src/ui/Frame");

async function draw(ui: ReactElement) {
  const store = { get: jest.fn(async () => null), set: jest.fn(async () => undefined) };
  render(<ThemeProvider store={store}>{ui}</ThemeProvider>);
  await act(async () => undefined);
}
const flat = (id: string) => StyleSheet.flatten(screen.getByTestId(id).props.style) as Record<string, unknown>;

describe("Ekran başlığı + eylem", () => {
  it("eylem başlık satırında: satır yatay ve dikey ortalı, eylem küçülmez", async () => {
    await draw(<Screen title="Siparişler" back={false} headerRight={<Text testID="eylem">Yeni sipariş</Text>}><Text>içerik</Text></Screen>);
    const satir = screen.getByTestId("baslik-satiri");
    expect(within(satir).getByText("Siparişler")).toBeTruthy();
    expect(within(satir).getByTestId("eylem")).toBeTruthy();
    expect(flat("baslik-satiri")).toMatchObject({ flexDirection: "row", alignItems: "center" });
    expect(flat("baslik-eylemi")).toMatchObject({ flexShrink: 0 });
    // Eylem tek kez çizilir (üst çubukta ikinci kopya yok).
    expect(screen.getAllByTestId("eylem")).toHaveLength(1);
  });

  it("uzun başlık esner (flex 1, minWidth 0), eylemsiz ekranda eylem yuvası yok", async () => {
    await draw(<Screen title={"Çok uzun bir ekran başlığı ".repeat(3)} back={false}><Text>içerik</Text></Screen>);
    expect(screen.queryByTestId("baslik-eylemi")).toBeNull();
    const kutu = StyleSheet.flatten(screen.getByRole("header").parent?.parent?.props.style) as Record<string, unknown>;
    expect(kutu).toMatchObject({ flex: 1, minWidth: 0 });
  });
});
