// Stok › kart seçimi (2026-11-16): §1 saf model (tanım sırası, en az bir, varsayılan, bozuk değer) · §2 başlıktaki
// "Kartları seç" simgesi seçiciyi açar; kapatılan kart çizilmez; son kart kapatılamaz; "Varsayılana dön" · §3 seçim
// MEVCUT `tablo.stok` tercihine yazılır (yeni anahtar/uç yok) ve ürün tablosunun sütun seçimini EZMEZ · §4 tercih ucu
// başarısızken yerelde çalışır.
import AsyncStorage from "@react-native-async-storage/async-storage";
import { act, fireEvent, render, screen } from "@testing-library/react-native";
import type React from "react";
import { resetCards, shownCards, toggleCard } from "../src/ui/stok/kartlar";
import type { TabloTercihi } from "../src/ui/tablo/model";

const mockApi = { snapshot: jest.fn(), list: jest.fn(), record: jest.fn(), viewPref: jest.fn(), viewPrefSet: jest.fn() };
const mockCache = {
  load: jest.fn(async (_k: string, f: () => Promise<unknown>) => ({ data: await f(), offline: false, savedAt: "2026-11-08T09:00:00.000Z" })),
  peek: jest.fn(async () => null),
};
const mockSession = {
  api: mockApi, cache: mockCache, markOnline: jest.fn(), permissions: ["bulut:stok:oku"] as string[], offline: false, offlineSince: null,
  facility: { tesis: { id: "t1" }, hesap: { id: "h1" } } as Record<string, unknown>, facilities: [], switchError: null, factoryStamp: "2026-11-08T08:55:00Z",
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

const T = (suzgec: Record<string, string> = {}): TabloTercihi => ({ surum: 1, sutunlar: ["urun", "miktar"], siralama: null, suzgec });
const KARNE = {
  ozet: { bitmisMiktar: 5000, bitmisAdet: 50, hamMiktar: 2000, hamAdet: 20, yariMamulMiktar: 10, yariMamulAdet: 1, yasliMiktar: 9400, oluMiktar: 0, oluStokGun: 90, yassizAdet: 0, yassizMiktar: 0 },
  yasKovalari: [{ anahtar: "0-30", etiket: "0–30 gün", adet: 10, miktar: 61200, yuzde: 72.7 }],
  urunler: [{ anahtar: "u1", etiket: "ÖRNEK SATEN", miktar: 100, adet: 2, enEskiGun: 3, siparissizMiktar: 0 }],
};
const YEREL = "tablo-tercihi:t1:h1:tablo.stok";

async function flush() {
  for (let i = 0; i < 3; i++) await act(async () => undefined);
}

beforeEach(async () => {
  await AsyncStorage.clear();
  mockSession.facility = { tesis: { id: "t1" }, hesap: { id: "h1" } };
  mockApi.viewPref.mockReset();
  mockApi.viewPrefSet.mockReset();
  mockApi.snapshot.mockReset();
  mockApi.snapshot.mockImplementation(async (p: string) => ({ projeksiyon: p, veri: p === "stok-karnesi" ? KARNE : { toplam: null, cariler: [] }, surum: "2026-11-08T08:55:00.000Z" }));
  mockApi.list.mockResolvedValue({ kayitlar: [], sonraki: null });
});

describe("§1 model", () => {
  it("varsayılan hepsi; bozuk/boş/bilinmeyen değer varsayılana düşer; çıktı tanım sırasında", () => {
    expect(shownCards(T())).toEqual(["ham", "yari", "bitmis", "olu", "cuval", "yas"]);
    expect(shownCards(T({ kartlar: "" }))).toEqual(["ham", "yari", "bitmis", "olu", "cuval", "yas"]);
    expect(shownCards(T({ kartlar: "xyz,,foo" }))).toEqual(["ham", "yari", "bitmis", "olu", "cuval", "yas"]);
    expect(shownCards(T({ kartlar: "olu,ham,ham,xyz" }))).toEqual(["ham", "olu"]);
  });

  it("aç/kapa; son kart da kapatılır ('-' = hiç); hepsi açılınca alan silinir; varsayılan yalnız kart alanını siler", () => {
    const yalnizHam = T({ kartlar: "ham", diger: "x" });
    const hic = toggleCard(yalnizHam, "ham");
    expect(hic.suzgec).toEqual({ kartlar: "-", diger: "x" });
    expect(shownCards(hic)).toEqual([]);
    expect(shownCards(toggleCard(hic, "olu"))).toEqual(["olu"]);
    expect(shownCards(toggleCard(yalnizHam, "olu"))).toEqual(["ham", "olu"]);
    const hepsiEksikBir = T({ kartlar: "ham,yari,bitmis,olu,cuval" });
    expect(toggleCard(hepsiEksikBir, "yas").suzgec).toEqual({});
    const r = resetCards(T({ kartlar: "ham", diger: "x" }));
    expect(r.suzgec).toEqual({ diger: "x" });
    expect(r.sutunlar).toEqual(["urun", "miktar"]);
  });
});

describe("§2 ekran", () => {
  it("başlıkta 'Kartları seç' simgesi; kapatılan kart çizilmez, son kart da kapanır, varsayılana dön", async () => {
    render(<Stock />);
    await flush();
    const dugme = screen.getByTestId("stok-kart-sec");
    expect(dugme.props.accessibilityLabel).toBe("Kartları seç");
    expect(screen.getByTestId("kpi-ham")).toBeTruthy();
    fireEvent.press(dugme);
    await flush();
    fireEvent.press(screen.getByTestId("stok-kart-secici-ham"));
    await flush();
    expect(screen.queryByTestId("kpi-ham")).toBeNull();
    expect(screen.getByTestId("kpi-yari")).toBeTruthy();
    for (const k of ["yari", "bitmis", "olu", "cuval", "yas"]) {
      fireEvent.press(screen.getByTestId(`stok-kart-secici-${k}`));
      await flush();
    }
    // Hepsi kapatıldı (2026-11-17): son kart da kapanır, hiçbir kart çizilmez; seçici bunu söyler.
    expect(screen.getByTestId("stok-kart-secici-yas").props.accessibilityState).toMatchObject({ checked: false, disabled: false });
    expect(screen.queryByTestId("bolum-yas")).toBeNull();
    expect(screen.getByText("Hepsi kapatılabilir")).toBeTruthy();
    expect(screen.queryByTestId("olu-stok")).toBeNull();
    fireEvent.press(screen.getByTestId("stok-kart-secici-varsayilan"));
    await flush();
    expect(screen.getByTestId("kpi-ham")).toBeTruthy();
    expect(screen.getByTestId("olu-stok")).toBeTruthy();
  });
});

describe("§3 saklama: mevcut `tablo.stok` tercihi", () => {
  it("kart seçimi aynı anahtara gider ve sütun seçimini korur", async () => {
    jest.useFakeTimers();
    try {
      mockSession.facility = { tesis: { id: "t1" }, hesap: { id: "h1" }, liste: { siralama: {} } };
      mockApi.viewPref.mockResolvedValue({ anahtar: "tablo.stok", deger: { surum: 1, sutunlar: ["urun", "siparissiz"], siralama: null, suzgec: {} }, guncelleme: null });
      mockApi.viewPrefSet.mockResolvedValue({});
      render(<Stock />);
      await flush();
      fireEvent.press(screen.getByTestId("stok-kart-sec"));
      fireEvent.press(screen.getByTestId("stok-kart-secici-olu"));
      await act(async () => {
        jest.advanceTimersByTime(1_000);
      });
      expect(mockApi.viewPrefSet).toHaveBeenCalledTimes(1);
      const [anahtar, deger] = mockApi.viewPrefSet.mock.calls[0] as [string, TabloTercihi];
      expect(anahtar).toBe("tablo.stok");
      expect(deger.sutunlar).toEqual(["urun", "siparissiz"]);
      expect(deger.suzgec).toEqual({ kartlar: "ham,yari,bitmis,cuval,yas" });
    } finally {
      jest.useRealTimers();
    }
  });

  it("tercih ucu düşerse seçim yerelde kalır ve çizilir", async () => {
    mockSession.facility = { tesis: { id: "t1" }, hesap: { id: "h1" }, liste: { siralama: {} } };
    mockApi.viewPref.mockRejectedValue(new Error("ağ"));
    mockApi.viewPrefSet.mockRejectedValue(new Error("ağ"));
    render(<Stock />);
    await flush();
    fireEvent.press(screen.getByTestId("stok-kart-sec"));
    fireEvent.press(screen.getByTestId("stok-kart-secici-ham"));
    await flush();
    expect(screen.queryByTestId("kpi-ham")).toBeNull();
    const yerel = JSON.parse((await AsyncStorage.getItem(YEREL)) ?? "null") as { deger: TabloTercihi; kirli: boolean };
    expect(yerel.deger.suzgec.kartlar).toBe("yari,bitmis,olu,cuval,yas");
    expect(yerel.kirli).toBe(true);
  });
});
