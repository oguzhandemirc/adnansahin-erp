// Stok › "Ürün bazında" tablosu dört özellik (2026-11-20): §1 sütun seçimi PROFİLDE kalır (`tablo.stok`; bugünkü saklı
// seçim aynen okunur, değişiklik profile yazılır) · §2 başlıktan sıralama hücre DEĞERİyle (1.200 > 95 metin sırası
// değil), üçüncü dokunuş fabrikanın sırası · §3 arama + Ürün süzgeci (simgeler blok başlığında) · satır sayısı/sayılar
// fabrikanın, sıralama yalnız gösterim sırası.
import AsyncStorage from "@react-native-async-storage/async-storage";
import { act, fireEvent, render, screen, within } from "@testing-library/react-native";
import type React from "react";

const mockApi = { snapshot: jest.fn(), list: jest.fn(), record: jest.fn(), viewPref: jest.fn(), viewPrefSet: jest.fn() };
const mockCache = {
  load: jest.fn(async (_k: string, f: () => Promise<unknown>) => ({ data: await f(), offline: false, savedAt: "2026-11-20T09:00:00.000Z" })),
  peek: jest.fn(async () => null),
};
const mockSession = {
  api: mockApi, cache: mockCache, markOnline: jest.fn(), permissions: ["bulut:stok:oku"] as string[], offline: false, offlineSince: null,
  facility: { tesis: { id: "t1" }, hesap: { id: "h1" }, liste: { siralama: {} } } as Record<string, unknown>, facilities: [], switchError: null, factoryStamp: "2026-11-20T08:55:00Z",
};
jest.mock("../src/state/session", () => ({ useSession: () => mockSession }));
jest.mock("expo-router", () => ({
  useRouter: () => ({ push: jest.fn(), replace: jest.fn(), back: jest.fn(), navigate: jest.fn(), canGoBack: () => true }),
  usePathname: () => "/stok",
  useLocalSearchParams: () => ({}),
  useFocusEffect: (cb: () => void | (() => void)) => (require("react") as typeof import("react")).useEffect(() => cb(), [cb]),
}));
jest.mock("react-native-safe-area-context", () => ({ useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }) }));

const Stock = (require("../app/(app)/(tabs)/stok") as { default: () => React.ReactElement }).default;

const KALEM = { ham: { toplamTop: 0, toplamMetre: 0, kalemler: [], toplar: [] }, bitmis: { toplamTop: 0, toplamMetre: 0, kalemler: [], toplar: [] } };
const KARNE = {
  ozet: {}, yasKovalari: [],
  urunler: [
    { anahtar: "u1", etiket: "SATEN", miktar: 95, adet: 2, enEskiGun: 3, siparissizMiktar: 0 },
    { anahtar: "u2", etiket: "PANOS", miktar: 1200, adet: 12, enEskiGun: 40, siparissizMiktar: 300 },
    { anahtar: "u3", etiket: "KADİFE", miktar: 8, adet: 1, enEskiGun: 9, siparissizMiktar: 8 },
  ],
};

async function flush() {
  for (let i = 0; i < 4; i++) await act(async () => undefined);
}
const sira = () => screen.getAllByTestId(/^stok-satir-/).map((x) => String(x.props.testID).slice("stok-satir-".length)).join(",");

beforeEach(async () => {
  await AsyncStorage.clear();
  for (const f of Object.values(mockApi)) f.mockReset();
  mockApi.snapshot.mockImplementation(async (p: string) => ({ projeksiyon: p, veri: p === "stok-karnesi" ? KARNE : KALEM, surum: "2026-11-20T08:55:00.000Z" }));
  mockApi.list.mockResolvedValue({ kayitlar: [], sonraki: null });
  mockApi.viewPrefSet.mockResolvedValue({ ok: true });
});

describe("§1 sütun seçimi profilde", () => {
  it("profilde saklı seçim (Ürün · Siparişsiz) aynen çizilir; sütun açmak profile yazılır", async () => {
    mockApi.viewPref.mockResolvedValue({ anahtar: "tablo.stok", deger: { surum: 1, sutunlar: ["urun", "siparissiz"], siralama: null, suzgec: {} }, guncelleme: "2026-11-19T10:00:00Z" });
    render(<Stock />);
    await flush();
    const baslik = within(screen.getByTestId("stok-baslik"));
    expect(baslik.getByText("Siparişsiz")).toBeTruthy();
    expect(baslik.queryByText("Top")).toBeNull();
    fireEvent.press(screen.getByTestId("stok-sutunlar"));
    expect(screen.getByTestId("stok-sutun-secici")).toBeTruthy();
    fireEvent.press(screen.getByTestId("stok-sutun-secici-top"));
    await flush();
    expect(within(screen.getByTestId("stok-baslik")).getByText("Top")).toBeTruthy();
    // Profil yazımı gecikmeli (TERCIH_GECIKME_MS).
    await act(async () => { await new Promise((r) => setTimeout(r, 900)); });
    expect(mockApi.viewPrefSet).toHaveBeenCalledWith("tablo.stok", expect.objectContaining({ sutunlar: ["urun", "siparissiz", "top"] }));
  });
});

describe("§2 başlıktan sıralama", () => {
  it("Miktar: 8 < 95 < 1.200 (değer); azalan; üçüncü dokunuş fabrikanın sırası; satır sayısı değişmez", async () => {
    mockApi.viewPref.mockResolvedValue({ anahtar: "tablo.stok", deger: null, guncelleme: null });
    render(<Stock />);
    await flush();
    expect(sira()).toBe("u1,u2,u3");
    fireEvent.press(screen.getByTestId("stok-sutun-miktar"));
    await flush();
    expect(sira()).toBe("u3,u1,u2");
    fireEvent.press(screen.getByTestId("stok-sutun-miktar"));
    await flush();
    expect(sira()).toBe("u2,u1,u3");
    fireEvent.press(screen.getByTestId("stok-sutun-miktar"));
    await flush();
    expect(sira()).toBe("u1,u2,u3");
  });
});

describe("§3 arama + süzgeç", () => {
  it("arama simgesi kutuyu açar ('kadife' → u3, Türkçe katlama); süzgeç sayfası Ürün değerleriyle açılır", async () => {
    mockApi.viewPref.mockResolvedValue({ anahtar: "tablo.stok", deger: null, guncelleme: null });
    render(<Stock />);
    await flush();
    expect(within(screen.getByTestId("stok-kumaslar")).getByTestId("stok-simgeler")).toBeTruthy();
    fireEvent.press(screen.getByTestId("stok-ara-ac"));
    fireEvent.changeText(screen.getByTestId("stok-ara"), "kadife");
    expect(sira()).toBe("u3");
    fireEvent.changeText(screen.getByTestId("stok-ara"), "yok-böyle");
    expect(screen.getByText("Aramaya uyan ürün yok")).toBeTruthy();
    fireEvent.changeText(screen.getByTestId("stok-ara"), "");
    fireEvent.press(screen.getByTestId("stok-suzgec"));
    expect(screen.getByTestId("stok-suzgec-secici")).toBeTruthy();
  });
});
