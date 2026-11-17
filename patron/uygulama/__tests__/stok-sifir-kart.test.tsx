// Stok › SIFIR KART (2026-11-17, kullanıcı: "kart görmek istemeyebilir patron"): §1 saklı "-" açılışta hiç kart
// çizdirmez, kart satırı/boşluk artığı kalmaz, kalem listesi ve ürün tablosu yerinde · §2 seçiciden hepsini kapatmak
// "-" olarak mevcut `tablo.stok` tercihine yazılır ve sütun seçimini ezmez · §3 ortak model başka ekranın varsayılan
// kümesini (yeni kartlar KAPALI) doğru uygular.
import AsyncStorage from "@react-native-async-storage/async-storage";
import { act, fireEvent, render, screen } from "@testing-library/react-native";
import type React from "react";
import { gorunurKartlar, kartDegistir, kartlariSifirla, type KartSecimi } from "../src/ui/tablo/kartSecimi";
import type { TabloTercihi } from "../src/ui/tablo/model";

const mockApi = { snapshot: jest.fn(), list: jest.fn(), record: jest.fn(), viewPref: jest.fn(), viewPrefSet: jest.fn() };
const mockCache = {
  load: jest.fn(async (_k: string, f: () => Promise<unknown>) => ({ data: await f(), offline: false, savedAt: "2026-11-08T09:00:00.000Z" })),
  peek: jest.fn(async () => null),
};
const mockSession = {
  api: mockApi, cache: mockCache, markOnline: jest.fn(), permissions: ["bulut:stok:oku"] as string[], offline: false, offlineSince: null,
  facility: { tesis: { id: "t1" }, hesap: { id: "h1" }, liste: { siralama: {} } } as Record<string, unknown>, facilities: [], switchError: null, factoryStamp: "2026-11-08T08:55:00Z",
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

const KARNE = {
  ozet: { bitmisMiktar: 5000, bitmisAdet: 50, hamMiktar: 2000, hamAdet: 20, yariMamulMiktar: 10, yariMamulAdet: 1, yasliMiktar: 9400, oluMiktar: 0, oluStokGun: 90, yassizAdet: 0, yassizMiktar: 0 },
  yasKovalari: [{ anahtar: "0-30", etiket: "0–30 gün", adet: 10, miktar: 61200, yuzde: 72.7 }],
  urunler: [{ anahtar: "u1", etiket: "ÖRNEK SATEN", miktar: 100, adet: 2, enEskiGun: 3, siparissizMiktar: 0 }],
};
const KALEM = { ham: { toplamTop: 0, toplamMetre: 0, kalemler: [], toplar: [] }, bitmis: { toplamTop: 0, toplamMetre: 0, kalemler: [], toplar: [] } };
const KARTLAR = ["kpi-ham", "kpi-yari", "kpi-bitmis", "olu-stok", "bolum-yas"];

async function flush() {
  for (let i = 0; i < 3; i++) await act(async () => undefined);
}

beforeEach(async () => {
  await AsyncStorage.clear();
  for (const f of Object.values(mockApi)) f.mockReset();
  mockApi.snapshot.mockImplementation(async (p: string) => ({ projeksiyon: p, veri: p === "stok-karnesi" ? KARNE : KALEM, surum: "2026-11-08T08:55:00.000Z" }));
  mockApi.list.mockResolvedValue({ kayitlar: [], sonraki: null });
});

describe("§1 saklı hiç-kart", () => {
  it("'-' saklıysa hiçbir kart ve kart satırı çizilmez; kalem listesi ve ürün tablosu yerinde", async () => {
    mockApi.viewPref.mockImplementation(async (k: string) =>
      k === "tablo.stok"
        ? { anahtar: k, deger: { surum: 1, sutunlar: ["urun", "miktar"], siralama: null, suzgec: { kartlar: "-" } }, guncelleme: null }
        : { anahtar: k, deger: null, guncelleme: null });
    render(<Stock />);
    await flush();
    for (const id of KARTLAR) expect(screen.queryByTestId(id)).toBeNull();
    expect(screen.getByTestId("stok-kalem-bolumu")).toBeTruthy();
    expect(screen.getByTestId("stok-kumaslar")).toBeTruthy();
    // Kart butonu durur: patron kartları geri açabilir.
    expect(screen.getByTestId("stok-kart-sec")).toBeTruthy();
  });

  it("negatif sonda: alan yoksa bütün kartlar (bugünkü varsayılan) çizilir", async () => {
    mockApi.viewPref.mockResolvedValue({ anahtar: "tablo.stok", deger: null, guncelleme: null });
    render(<Stock />);
    await flush();
    for (const id of KARTLAR) expect(screen.getByTestId(id)).toBeTruthy();
  });
});

describe("§2 seçiciden hepsini kapatmak", () => {
  it("'-' olarak aynı anahtara yazılır, sütun seçimi korunur", async () => {
    jest.useFakeTimers();
    try {
      mockApi.viewPref.mockResolvedValue({ anahtar: "tablo.stok", deger: { surum: 1, sutunlar: ["urun", "siparissiz"], siralama: null, suzgec: {} }, guncelleme: null });
      mockApi.viewPrefSet.mockResolvedValue({});
      render(<Stock />);
      await flush();
      fireEvent.press(screen.getByTestId("stok-kart-sec"));
      for (const k of ["ham", "yari", "bitmis", "olu", "cuval", "yas"]) fireEvent.press(screen.getByTestId(`stok-kart-secici-${k}`));
      await act(async () => {
        jest.advanceTimersByTime(1_000);
      });
      const son = mockApi.viewPrefSet.mock.calls.at(-1) as [string, TabloTercihi];
      expect(son[0]).toBe("tablo.stok");
      expect(son[1].suzgec).toEqual({ kartlar: "-" });
      expect(son[1].sutunlar).toEqual(["urun", "siparissiz"]);
      for (const id of KARTLAR) expect(screen.queryByTestId(id)).toBeNull();
    } finally {
      jest.useRealTimers();
    }
  });
});

describe("§3 ortak model (başka ekranlar)", () => {
  const S: KartSecimi<"a" | "b" | "c"> = { kartlar: [{ key: "a", label: "A" }, { key: "b", label: "B" }, { key: "c", label: "C" }], varsayilan: ["a", "b"], alan: "kartlar" };
  const T = (suzgec: Record<string, string> = {}): TabloTercihi => ({ surum: 1, sutunlar: ["x"], siralama: null, suzgec });
  it("varsayılan küme dışındaki (yeni) kart kapalı gelir; açılınca yazılır; varsayılana eşitlenince alan silinir", () => {
    expect(gorunurKartlar(S, T())).toEqual(["a", "b"]);
    const c = kartDegistir(S, T(), "c");
    expect(c.suzgec).toEqual({ kartlar: "a,b,c" });
    expect(kartDegistir(S, c, "c").suzgec).toEqual({});
    expect(gorunurKartlar(S, kartDegistir(S, kartDegistir(S, T(), "a"), "b"))).toEqual([]);
    expect(kartlariSifirla(S, T({ kartlar: "-", diger: "1" })).suzgec).toEqual({ diger: "1" });
  });
});
