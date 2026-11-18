// Ekran başlığı: tek satır — geri (varsa) başlığın SOLUNDA, eylem (ör. "Yeni sipariş") aynı satırda dikey ortalı ve
// sağa yaslı; başlıkta tazelik öğesi YOK (2026-11-19: "Son veri" menüde), bayat veri şeritte, aşağı çek = tam yenileme.
import { act, fireEvent, render, screen, within } from "@testing-library/react-native";
import type { ReactElement } from "react";
import { RefreshControl, StyleSheet, Text } from "react-native";
import { ThemeProvider } from "../src/ui/theme-context";

const mockSession = {
  permissions: ["*"] as string[],
  switchError: null,
  facility: null as unknown,
  facilities: [],
  offline: false,
  offlineSince: null,
  factoryStamp: null as string | null,
  api: { syncNow: jest.fn() },
  refresh: jest.fn(async () => null),
};
const mockRouter = { back: jest.fn(), replace: jest.fn(), canGoBack: () => true };
let mockPath = "/siparisler";
jest.mock("../src/state/session", () => ({ useSession: () => mockSession }));
jest.mock("expo-router", () => ({ useRouter: () => mockRouter, usePathname: () => mockPath }));
jest.mock("react-native-safe-area-context", () => ({ useSafeAreaInsets: () => ({ top: 47, bottom: 0, left: 0, right: 0 }) }));

const { Screen } = require("../src/ui/Frame") as typeof import("../src/ui/Frame");
const { yenileci } = require("../src/state/yenile") as typeof import("../src/state/yenile");

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

  it("uzun başlık esner (flex 1, minWidth 0); headerRight vermeyen ekranda da eylem yuvasında yalnız bildirim zili var (2026-11-18)", async () => {
    await draw(<Screen title={"Çok uzun bir ekran başlığı ".repeat(3)} back={false}><Text>içerik</Text></Screen>);
    expect(screen.getByTestId("baslik-eylemi")).toBeTruthy();
    expect(screen.getByTestId("bildirim-zili")).toBeTruthy();
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

describe("Başlıkta tazelik YOK (2026-11-19)", () => {
  const BEYANLI = { tesis: { id: "t", ad: "Örnek", saklamaAy: 13 }, hesap: { ad: "A" }, simdiGuncelle: true, esitleme: { sonEsitleme: minutesAgo(5), ufuk: minutesAgo(5) }, hizmet: { asama: "ACIK" } };

  it("beyanlı da beyansız da: başlıkta '↻ … önce' düğmesi/yazısı çizilmez", async () => {
    mockSession.factoryStamp = minutesAgo(5);
    await draw(<Screen title="Stok" back={false} onRefresh={jest.fn()}><Text>içerik</Text></Screen>);
    expect(screen.queryByTestId("esitleme-gostergesi")).toBeNull();
    expect(screen.queryByTestId("simdi-guncelle")).toBeNull();
    expect(screen.queryByText(/önce$/)).toBeNull();
    screen.unmount();
    mockSession.facility = BEYANLI;
    await draw(<Screen title="Stok" back={false} onRefresh={jest.fn()}><Text>içerik</Text></Screen>);
    expect(screen.queryByTestId("simdi-guncelle")).toBeNull();
    expect(screen.queryByText(/önce$/)).toBeNull();
  });

  it("ekranın kısa bilgisi (meta) başlık kutusunda kalır; alt satır yok", async () => {
    mockSession.factoryStamp = minutesAgo(5);
    await draw(<Screen title="Cari" back={false} meta={<Text testID="ozel-meta">Müşteri</Text>}><Text>içerik</Text></Screen>);
    expect(within(screen.getByTestId("baslik-kutusu")).getByTestId("ozel-meta")).toBeTruthy();
    expect(screen.queryByTestId("baslik-alt-satiri")).toBeNull();
  });
});

describe("Bayat fabrika verisi şeridi", () => {
  it("eşik (60 dk) altında şerit yok", async () => {
    mockSession.factoryStamp = minutesAgo(59);
    await draw(<Screen title="Pano" back={false}><Text>içerik</Text></Screen>);
    expect(screen.queryByTestId("bant-bayat")).toBeNull();
  });

  it("eşikten eskiyse her ekranda şerit: 'Fabrika verisi 2 saattir güncellenmedi'", async () => {
    mockSession.factoryStamp = minutesAgo(125);
    await draw(<Screen title="Pano" back={false}><Text>içerik</Text></Screen>);
    expect(within(screen.getByTestId("bant-bayat")).getByText("Fabrika verisi 2 saattir güncellenmedi")).toBeTruthy();
  });

  it("çevrimdışıyken yalnız çevrimdışı bandı (iki şerit yok)", async () => {
    mockSession.factoryStamp = minutesAgo(36 * 60);
    mockSession.offline = true;
    await draw(<Screen title="Pano" back={false}><Text>içerik</Text></Screen>);
    expect(screen.getByTestId("bant-cevrimdisi")).toBeTruthy();
    expect(screen.queryByTestId("bant-bayat")).toBeNull();
  });
});

describe("Aşağı çek = tam yenileme", () => {
  const BEYANLI = { tesis: { id: "t", ad: "Örnek", saklamaAy: 13 }, hesap: { ad: "A" }, simdiGuncelle: true, esitleme: { sonEsitleme: minutesAgo(5), ufuk: minutesAgo(5) }, hizmet: { asama: "ACIK" } };
  const cek = async () => {
    await act(async () => {
      screen.UNSAFE_getByType(RefreshControl).props.onRefresh();
    });
  };
  beforeEach(() => yenileci.sifirla());
  afterEach(() => {
    mockSession.api.syncNow.mockReset();
    mockSession.refresh.mockClear();
    yenileci.sifirla();
  });

  it("çekince ekranın okuması + oturum + fabrika isteği; başarı SESSİZ (toast yok)", async () => {
    const yenile = jest.fn();
    mockSession.facility = BEYANLI;
    mockSession.api.syncNow.mockResolvedValue({ durum: "BEKLIYOR", sonrakiMumkun: new Date(Date.now() + 60_000).toISOString() });
    await draw(<Screen title="Stok" back={false} onRefresh={yenile}><Text>içerik</Text></Screen>);
    await cek();
    expect(yenile).toHaveBeenCalledTimes(1);
    expect(mockSession.refresh).toHaveBeenCalled();
    expect(mockSession.api.syncNow).toHaveBeenCalledTimes(1);
    expect(screen.queryByTestId("kisa-bildirim")).toBeNull();
  });

  it("hata: kısa bildirim (toast) düzeni itmez", async () => {
    mockSession.facility = BEYANLI;
    mockSession.api.syncNow.mockRejectedValue(new Error("ağ"));
    await draw(<Screen title="Stok" back={false} onRefresh={jest.fn()}><Text>içerik</Text></Screen>);
    await cek();
    expect(screen.getByText("Bağlantı yok — tekrar deneyin")).toBeTruthy();
    expect(flat("kisa-bildirim")).toMatchObject({ position: "absolute" });
    expect(screen.queryByTestId("baslik-alt-satiri")).toBeNull();
  });

  it("60 sn penceresinde ikinci çekiş fabrikaya gitmez, ekran yine okunur", async () => {
    const yenile = jest.fn();
    mockSession.facility = BEYANLI;
    mockSession.api.syncNow.mockResolvedValue({ durum: "YAKIN_ZAMANDA", sonrakiMumkun: new Date(Date.now() + 60_000).toISOString() });
    await draw(<Screen title="Stok" back={false} onRefresh={yenile}><Text>içerik</Text></Screen>);
    await cek();
    await cek();
    expect(yenile).toHaveBeenCalledTimes(2);
    expect(mockSession.api.syncNow).toHaveBeenCalledTimes(1);
    expect(screen.queryByTestId("kisa-bildirim")).toBeNull();
  });

  it("eski bulut (beyan yok): yalnız ekran okunur, fabrikaya istek yok", async () => {
    const yenile = jest.fn();
    await draw(<Screen title="Stok" back={false} onRefresh={yenile}><Text>içerik</Text></Screen>);
    await cek();
    expect(yenile).toHaveBeenCalledTimes(1);
    expect(mockSession.api.syncNow).not.toHaveBeenCalled();
  });

  it("onRefresh vermeyen ekranda (form, ayar) yenileme denetimi yok", async () => {
    await draw(<Screen title="Görünüm"><Text>içerik</Text></Screen>);
    expect(screen.UNSAFE_queryByType(RefreshControl)).toBeNull();
  });
});
