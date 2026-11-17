// Sevkiyat › KART + SATIR ALANI SEÇİMİ (2026-11-17, kullanıcı: "koyabildiğin her şeyi koy, biz eleriz"):
// §1 varsayılan görünüm değişmedi (iki kart, satırda ek alan yok); yeni kart/alanlar seçicide KAPALI · §2 ek alanlar telin
// kendi alanını biçimler (top/çuval/kg/fatura/tarih; değer gelmezse atlanır, "0" uydurulmaz) ve `tablo.sevkiyat`a yazılır
// · §3 sıfır kart: "-" kart ve dönem şeridini çizdirmez, liste yerinde; "Tamamlanan sipariş" kartı açılınca fabrikanın sayısı.
import AsyncStorage from "@react-native-async-storage/async-storage";
import { act, fireEvent, render, screen } from "@testing-library/react-native";
import type React from "react";
import type { TabloTercihi } from "../src/ui/tablo/model";

const mockApi = { snapshot: jest.fn(), list: jest.fn(), record: jest.fn(), viewPref: jest.fn(), viewPrefSet: jest.fn() };
const mockCache = {
  load: jest.fn(async (_k: string, f: () => Promise<unknown>) => ({ data: await f(), offline: false, savedAt: "2026-11-17T09:00:00.000Z" })),
  peek: jest.fn(async () => null),
};
const mockSession = {
  api: mockApi, cache: mockCache, markOnline: jest.fn(), permissions: ["bulut:ozet:oku", "bulut:sevkiyat:oku"] as string[], offline: false, offlineSince: null,
  facility: { tesis: { id: "t1" }, hesap: { id: "h1" }, liste: { siralama: {} } } as Record<string, unknown>, facilities: [], switchError: null, factoryStamp: "2026-11-17T08:55:00Z",
};
jest.mock("../src/state/session", () => ({ useSession: () => mockSession }));
jest.mock("expo-router", () => ({
  useRouter: () => ({ push: jest.fn(), replace: jest.fn(), back: jest.fn(), navigate: jest.fn(), canGoBack: () => true }),
  usePathname: () => "/sevkiyat",
  useLocalSearchParams: () => ({}),
  useFocusEffect: (cb: () => void | (() => void)) => (require("react") as typeof import("react")).useEffect(() => cb(), [cb]),
}));
jest.mock("react-native-safe-area-context", () => ({ useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }) }));

const Shipments = (require("../app/(app)/sevkiyat") as { default: () => React.ReactElement }).default;

const DONEM = { sevkMiktari: 15230, sevkTopSayisi: 38, tamamlananSiparis: 6 };
const OZET = { bugun: DONEM, buAy: DONEM, gecenAy: DONEM, son30Gun: DONEM };
const V1 = "v1";
const V2 = "v2";
const SEVKLER = [
  { id: V1, surum: "x", kayit: { sevkNo: "SVK-0451", musteriAdi: "Örnek Tekstil A.Ş.", durum: "DISPATCHED", yon: "DOMESTIC", toplamMetre: 1800, cikisTarihi: "2026-11-16T08:00:00Z", olusturulma: "2026-11-15T08:00:00Z", topSayisi: 15, cuvalSayisi: 3, toplamKg: 512.4, disFaturaNo: "FTR-1", faturalanma: "2026-11-16T10:00:00Z" } },
  // Eski/eksik satır: türev alanlar yok → ek metin uydurulmaz.
  { id: V2, surum: "x", kayit: { sevkNo: "SVK-0450", musteriAdi: "Deneme Kumaş Ltd. Şti.", durum: "DISPATCHED", toplamMetre: 434, cikisTarihi: "2026-11-15T08:00:00Z" } },
];
const KARTLAR = ["kpi-sevk-metre", "kpi-sevk-top"];
const EK = ["top", "cuval", "kg", "fatura", "faturaTarihi", "kayit", "iptal"];

async function flush() {
  for (let i = 0; i < 4; i++) await act(async () => undefined);
}
const pref = (deger: unknown) => mockApi.viewPref.mockResolvedValue({ anahtar: "tablo.sevkiyat", deger, guncelleme: null });
const isaretli = (id: string) => screen.getByTestId(id).props.accessibilityState?.checked;
const ikincil = (id: string) => String(screen.getByTestId(`kayit-${id}`).props.accessibilityLabel);

beforeEach(async () => {
  await AsyncStorage.clear();
  for (const f of Object.values(mockApi)) f.mockReset();
  mockApi.snapshot.mockResolvedValue({ projeksiyon: "ozet.sevkiyat", veri: OZET, surum: "2026-11-17T08:55:00.000Z" });
  mockApi.list.mockResolvedValue({ kayitlar: SEVKLER, sonraki: null });
  mockApi.viewPrefSet.mockResolvedValue({});
  pref(null);
});

describe("§1 varsayılan görünüm değişmedi", () => {
  it("iki kart + dönem şeridi; satırda ek alan yok; yeniler seçicide kapalı", async () => {
    render(<Shipments />);
    await flush();
    for (const id of KARTLAR) expect(screen.getByTestId(id)).toBeTruthy();
    expect(screen.queryByTestId("kpi-sevk-tamamlanan")).toBeNull();
    expect(screen.getByTestId("donem")).toBeTruthy();
    expect(screen.queryByText(/15 top/)).toBeNull();
    expect(ikincil(V1)).toBe("Örnek Tekstil A.Ş., SVK-0451, 16.11.2026, 1.800 m");
    fireEvent.press(screen.getByTestId("sevk-kart-sec"));
    expect(isaretli("sevk-kart-secici-tamamlanan")).toBe(false);
    expect(isaretli("sevk-kart-secici-metre")).toBe(true);
    fireEvent.press(screen.getByTestId("sevk-alan-sec"));
    for (const k of EK) expect(isaretli(`sevk-alan-secici-${k}`)).toBe(false);
  });
});

describe("§2 satır ek alanları", () => {
  it("seçilen alanlar telin değeriyle ikinci satırda; değeri olmayan satıra eklenmez; tercih tablo.sevkiyat'a yazılır", async () => {
    jest.useFakeTimers();
    try {
      render(<Shipments />);
      await flush();
      fireEvent.press(screen.getByTestId("sevk-alan-sec"));
      for (const k of ["top", "cuval", "kg", "fatura", "faturaTarihi"]) fireEvent.press(screen.getByTestId(`sevk-alan-secici-${k}`));
      await act(async () => {
        jest.advanceTimersByTime(1_000);
      });
      expect(ikincil(V1)).toBe("Örnek Tekstil A.Ş., SVK-0451, 16.11.2026, 1.800 m, 15 top, 3 çuval, 512 kg, Fatura FTR-1, Faturalandı 16.11.2026");
      expect(ikincil(V2)).toBe("Deneme Kumaş Ltd. Şti., SVK-0450, 15.11.2026, 434 m");
      const son = mockApi.viewPrefSet.mock.calls.at(-1) as [string, TabloTercihi];
      expect(son[0]).toBe("tablo.sevkiyat");
      expect(son[1].suzgec).toEqual({ alanlar: "top,cuval,kg,fatura,faturaTarihi" });
    } finally {
      jest.useRealTimers();
    }
  });
});

describe("§3 sıfır kart", () => {
  it("'-' saklıysa kart ve dönem şeridi yok, liste yerinde, düğme durur", async () => {
    pref({ surum: 1, sutunlar: ["-"], siralama: null, suzgec: { kartlar: "-" } });
    render(<Shipments />);
    await flush();
    for (const id of KARTLAR) expect(screen.queryByTestId(id)).toBeNull();
    expect(screen.queryByTestId("donem")).toBeNull();
    expect(screen.getByTestId(`kayit-${V1}`)).toBeTruthy();
    expect(screen.getByTestId("sevk-kart-sec")).toBeTruthy();
  });

  it("hepsini kapatıp yalnız 'Tamamlanan sipariş'i açmak fabrikanın sayısını gösterir", async () => {
    render(<Shipments />);
    await flush();
    fireEvent.press(screen.getByTestId("sevk-kart-sec"));
    for (const k of ["metre", "top", "tamamlanan"]) fireEvent.press(screen.getByTestId(`sevk-kart-secici-${k}`));
    await flush();
    expect(screen.queryByTestId("kpi-sevk-metre")).toBeNull();
    expect(screen.getAllByText("6").length).toBeGreaterThan(0);
  });
});
