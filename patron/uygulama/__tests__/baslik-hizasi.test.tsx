// Ekran başlığı: tek satır — geri (varsa) başlığın SOLUNDA, eylem (ör. "Yeni sipariş") aynı satırda dikey ortalı ve
// sağa yaslı; başlığın yanında eşitleme simgesi + kısa göreli süre, eşitleme gecikmesi için UYARI bandı yok.
import { act, fireEvent, render, screen, within } from "@testing-library/react-native";
import type { ReactElement } from "react";
import { StyleSheet, Text } from "react-native";
import { ThemeProvider } from "../src/ui/theme-context";

const mockSession = {
  permissions: ["*"] as string[],
  switchError: null,
  facility: null as unknown,
  facilities: [],
  offline: false,
  offlineSince: null,
  factoryStamp: null as string | null,
};
const mockRouter = { back: jest.fn(), replace: jest.fn(), canGoBack: () => true };
let mockPath = "/siparisler";
jest.mock("../src/state/session", () => ({ useSession: () => mockSession }));
jest.mock("expo-router", () => ({ useRouter: () => mockRouter, usePathname: () => mockPath }));
jest.mock("react-native-safe-area-context", () => ({ useSafeAreaInsets: () => ({ top: 47, bottom: 0, left: 0, right: 0 }) }));

const { Screen } = require("../src/ui/Frame") as typeof import("../src/ui/Frame");

async function draw(ui: ReactElement) {
  const store = { get: jest.fn(async () => null), set: jest.fn(async () => undefined) };
  render(<ThemeProvider store={store}>{ui}</ThemeProvider>);
  await act(async () => undefined);
}
const flat = (id: string) => StyleSheet.flatten(screen.getByTestId(id).props.style) as Record<string, unknown>;
const minutesAgo = (m: number) => new Date(Date.now() - m * 60_000).toISOString();

afterEach(() => {
  mockSession.factoryStamp = null;
  mockSession.facility = null;
  mockSession.offline = false;
  mockPath = "/siparisler";
  jest.useRealTimers();
});

describe("Ekran başlığı + eylem", () => {
  it("eylem başlık satırında: satır yatay ve dikey ortalı, eylem küçülmez", async () => {
    await draw(<Screen title="Siparişler" back={false} headerRight={<Text testID="eylem">Yeni sipariş</Text>}><Text>içerik</Text></Screen>);
    const satir = screen.getByTestId("baslik-satiri");
    expect(within(satir).getByText("Siparişler")).toBeTruthy();
    expect(within(satir).getByTestId("eylem")).toBeTruthy();
    expect(flat("baslik-satiri")).toMatchObject({ flexDirection: "row", alignItems: "center" });
    expect(flat("baslik-eylemi")).toMatchObject({ flexShrink: 0 });
    expect(screen.getAllByTestId("eylem")).toHaveLength(1);
  });

  it("uzun başlık esner (flex 1, minWidth 0), eylemsiz ekranda eylem yuvası yok", async () => {
    await draw(<Screen title={"Çok uzun bir ekran başlığı ".repeat(3)} back={false}><Text>içerik</Text></Screen>);
    expect(screen.queryByTestId("baslik-eylemi")).toBeNull();
    expect(flat("baslik-kutusu")).toMatchObject({ flex: 1, minWidth: 0 });
  });

  it("başlık tavana yakın: üst dolgu güvenli alan + küçük pay; başlık kaydırılan içerikte ikinci kez çizilmez", async () => {
    await draw(<Screen title="Siparişler" back={false}><Text>içerik</Text></Screen>);
    const top = flat("ekran-basligi").paddingTop as number;
    expect(top).toBeGreaterThanOrEqual(47);
    expect(top).toBeLessThanOrEqual(47 + 8);
    expect(screen.getAllByText("Siparişler")).toHaveLength(1);
  });
});

describe("Geri düğmesi", () => {
  it("alt ekranda geri başlık satırında, başlığın SOLUNDA (ilk çocuk), yazısız simge ve ≥ 44 hedef", async () => {
    mockPath = "/siparisler/s2";
    await draw(<Screen title="SIP-2026-0450" headerRight={<Text testID="eylem">Düzenle</Text>}><Text>içerik</Text></Screen>);
    const satir = screen.getByTestId("baslik-satiri");
    const geri = within(satir).getByTestId("geri");
    const kids = (satir.props.children as ReactElement[]).filter(Boolean);
    expect((kids[0] as ReactElement<{ testID?: string }>).props.testID).toBe("geri");
    expect(within(geri).queryByText("Geri")).toBeNull();
    expect(geri.props.accessibilityLabel).toBe("Geri");
    const st = StyleSheet.flatten(typeof geri.props.style === "function" ? geri.props.style({ pressed: false }) : geri.props.style) as Record<string, number>;
    expect(st.width).toBeGreaterThanOrEqual(44);
    expect(st.height).toBeGreaterThanOrEqual(44);
    fireEvent.press(geri);
    expect(mockRouter.back).toHaveBeenCalled();
  });

  it("sekme kökünde geri yok", async () => {
    mockPath = "/siparisler";
    await draw(<Screen title="Siparişler"><Text>içerik</Text></Screen>);
    expect(screen.queryByTestId("geri")).toBeNull();
  });
});

describe("Eşitleme göstergesi", () => {
  it("başlığın yanında simge + kısa süre; gecikmiş eşitlemede de uyarı bandı yok", async () => {
    mockSession.factoryStamp = minutesAgo(36 * 60);
    mockSession.facility = { tesis: { id: "t", ad: "Örnek", saklamaAy: 13 }, hesap: { ad: "A" }, esitleme: { sonEsitleme: minutesAgo(36 * 60), ufuk: minutesAgo(36 * 60) }, hizmet: { asama: "ACIK" } };
    await draw(<Screen title="Pano" back={false}><Text>içerik</Text></Screen>);
    const gosterge = within(screen.getByTestId("baslik-kutusu")).getByTestId("esitleme-gostergesi");
    expect(within(gosterge).getByText("36 saat önce")).toBeTruthy();
    expect(screen.queryByTestId("bant-gecikme")).toBeNull();
    expect(screen.queryByText(/gecikti/)).toBeNull();
  });

  it("damga yoksa gösterge çizilmez", async () => {
    await draw(<Screen title="Pano" back={false}><Text>içerik</Text></Screen>);
    expect(screen.queryByTestId("esitleme-gostergesi")).toBeNull();
  });

  it("süre her dakika kendini günceller", async () => {
    jest.useFakeTimers({ now: Date.parse("2026-11-13T10:00:00Z") });
    mockSession.factoryStamp = "2026-11-13T09:59:30Z";
    await draw(<Screen title="Pano" back={false}><Text>içerik</Text></Screen>);
    expect(screen.getByText("şimdi")).toBeTruthy();
    await act(async () => {
      jest.advanceTimersByTime(2 * 60_000);
    });
    expect(screen.getByText("2 dk önce")).toBeTruthy();
  });

  it("dokununca ekranın yenilemesi çağrılır", async () => {
    const yenile = jest.fn();
    mockSession.factoryStamp = minutesAgo(5);
    await draw(<Screen title="Pano" back={false} onRefresh={yenile}><Text>içerik</Text></Screen>);
    expect(screen.getByText("5 dk önce")).toBeTruthy();
    fireEvent.press(screen.getByTestId("esitleme-gostergesi"));
    expect(yenile).toHaveBeenCalled();
  });
});
