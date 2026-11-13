// Stok › yaş dağılımı açılır-kapanır: §1 varsayılan kapalı (gövde erişilebilirlikten gizli, özet görünür) · §2 başlığa
// dokununca açılır/kapanır ve durum cihaza yazılır · §3 saklı "açık" okunur · §4 hesap/tesis kapsamlı anahtar.
import AsyncStorage from "@react-native-async-storage/async-storage";
import { act, fireEvent, render, screen } from "@testing-library/react-native";
import type React from "react";

const mockApi = { snapshot: jest.fn(), list: jest.fn(), record: jest.fn() };
const mockCache = {
  load: jest.fn(async (_k: string, f: () => Promise<unknown>) => ({ data: await f(), offline: false, savedAt: "2026-11-08T09:00:00.000Z" })),
  peek: jest.fn(async () => null),
};
const mockSession = {
  api: mockApi, cache: mockCache, markOnline: jest.fn(), permissions: ["bulut:stok:oku"] as string[], offline: false, offlineSince: null,
  facility: { tesis: { id: "t1" }, hesap: { id: "h1" } } as unknown, facilities: [], switchError: null, factoryStamp: "2026-11-08T08:55:00Z",
};
jest.mock("../src/state/session", () => ({ useSession: () => mockSession }));
jest.mock("expo-router", () => ({
  useRouter: () => ({ push: jest.fn(), replace: jest.fn(), back: jest.fn(), navigate: jest.fn(), canGoBack: () => true }),
  usePathname: () => "/",
  useLocalSearchParams: () => ({}),
  useFocusEffect: (cb: () => void | (() => void)) => (require("react") as typeof import("react")).useEffect(() => cb(), [cb]),
}));
jest.mock("react-native-safe-area-context", () => ({ useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }) }));

const Stock = (require("../app/(app)/(tabs)/stok") as { default: () => React.ReactElement }).default;

const ANAHTAR = "acik-kapali:t1:h1:stok.yas-dagilimi";
const KARNE = {
  ozet: { bitmisMiktar: 5000, bitmisAdet: 50, hamMiktar: 2000, hamAdet: 20, yariMamulMiktar: 0, yariMamulAdet: 0, yasliMiktar: 9400, oluMiktar: 0, oluStokGun: 90, yassizAdet: 0, yassizMiktar: 0 },
  yasKovalari: [
    { anahtar: "0-30", etiket: "0–30 gün", adet: 10, miktar: 61200, yuzde: 72.7 },
    { anahtar: "180+", etiket: "180+ gün", adet: 2, miktar: 3100, yuzde: 3.7 },
  ],
  urunler: [],
};

async function flush() {
  await act(async () => undefined);
  await act(async () => undefined);
}

beforeEach(async () => {
  await AsyncStorage.clear();
  mockApi.snapshot.mockReset();
  mockApi.snapshot.mockImplementation(async (p: string) => ({ projeksiyon: p, veri: p === "stok-karnesi" ? KARNE : { toplam: null, cariler: [] }, surum: "2026-11-08T08:55:00.000Z" }));
});

const baslik = () => screen.getByTestId("bolum-yas-basligi");
const govde = () => screen.getByTestId("bolum-yas-govde", { includeHiddenElements: true });

describe("Stok › yaş dağılımı açılır-kapanır", () => {
  it("§1 varsayılan kapalı: başlık + özet görünür, gövde gizli", async () => {
    render(<Stock />);
    await flush();
    expect(baslik().props.accessibilityState).toMatchObject({ expanded: false });
    expect(screen.getByText("Yaşlı 9.400 m")).toBeTruthy();
    expect(govde().props.importantForAccessibility).toBe("no-hide-descendants");
    expect(govde().props.pointerEvents).toBe("none");
    expect(screen.queryByTestId("yas-kovalari")).toBeNull();
  });

  it("§2 dokununca açılır, yeniden dokununca kapanır; durum cihaza yazılır", async () => {
    render(<Stock />);
    await flush();
    fireEvent.press(baslik());
    await flush();
    expect(baslik().props.accessibilityState).toMatchObject({ expanded: true });
    expect(govde().props.importantForAccessibility).toBe("auto");
    expect(screen.getByTestId("yas-kovalari")).toBeTruthy();
    expect(await AsyncStorage.getItem(ANAHTAR)).toBe("1");
    fireEvent.press(baslik());
    await flush();
    expect(baslik().props.accessibilityState).toMatchObject({ expanded: false });
    expect(await AsyncStorage.getItem(ANAHTAR)).toBe("0");
  });

  it("§3 saklı 'açık' tercihi okunur", async () => {
    await AsyncStorage.setItem(ANAHTAR, "1");
    render(<Stock />);
    await flush();
    expect(baslik().props.accessibilityState).toMatchObject({ expanded: true });
  });

  it("§4 anahtar tesis + hesap kapsamlı: başka hesabın 'açık'ı bu hesabı açmaz", async () => {
    await AsyncStorage.setItem("acik-kapali:t1:h2:stok.yas-dagilimi", "1");
    render(<Stock />);
    await flush();
    expect(baslik().props.accessibilityState).toMatchObject({ expanded: false });
  });
});
