// Pano kutu düzeni: saf işlemler (temizle/ekle/çıkar/taşı/paketle) · YALNIZ ekli kutunun verisi istenir (çıkarılan
// kutu ve düzenleme kipi istek atmaz) · düzen cihazda `patron.pano.kutular` anahtarında kalıcı · termin kutusu yok.
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react-native";
import type React from "react";
import { createCache } from "../src/state/cache";

function mockMem() {
  const m = new Map<string, string>();
  return {
    map: m,
    get: async (k: string) => m.get(k) ?? null,
    set: jest.fn(async (k: string, v: string) => void m.set(k, v)),
    remove: async (k: string) => void m.delete(k),
    keys: async () => [...m.keys()],
    removeMany: async (ks: readonly string[]) => ks.forEach((k) => m.delete(k)),
  };
}

const mockPlain = mockMem();
const mockApi = {
  snapshot: jest.fn(async (p: string) => ({ projeksiyon: p, veri: { bugunTamamlananToplam: 7, buAy: { sevkMiktari: 10 } }, surum: "1" })),
  list: jest.fn(async (_p: string, _o?: unknown) => ({ kayitlar: [] as unknown[], sonraki: null })),
  refresh: jest.fn(async () => ({ zil: false, sonrakiMs: 60_000 })),
};
const TUM = ["bulut:ozet:oku", "bulut:siparis:oku", "bulut:sevkiyat:oku", "bulut:uretim:oku", "bulut:stok:oku", "bulut:cari-bakiye:oku", "bulut:rapor:oku"];
const mockSession = {
  api: mockApi,
  cache: null as ReturnType<typeof createCache> | null,
  markOnline: jest.fn(),
  refresh: jest.fn(async () => undefined),
  permissions: TUM,
  facility: null as unknown,
  facilities: [] as unknown[],
  facilityId: null,
  switchError: null,
  factoryStamp: null,
  feedMode: "kapali",
  offline: false,
  offlineSince: null,
};
const mockRouter = { navigate: jest.fn(), push: jest.fn(), back: jest.fn(), canGoBack: () => false, replace: jest.fn() };
jest.mock("../src/state/session", () => ({ useSession: () => mockSession }));
jest.mock("../src/state/store", () => ({ plainStore: mockPlain, secretStore: mockPlain, legacyPlainStore: null }));
jest.mock("expo-router", () => ({
  useRouter: () => mockRouter,
  usePathname: () => "/pano",
  useFocusEffect: (cb: () => unknown) => require("react").useEffect(() => cb(), [cb]),
}));
jest.mock("react-native-safe-area-context", () => ({ useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }) }));

const Dashboard = (require("../app/(app)/(tabs)/pano") as { default: () => React.ReactElement }).default;
const D = require("../src/ui/pano/duzen") as typeof import("../src/ui/pano/duzen");
const K = require("../src/ui/pano/kutular") as typeof import("../src/ui/pano/kutular");

beforeEach(() => {
  mockPlain.map.clear();
  mockSession.cache = createCache(mockMem(), "t1:h1", () => new Date("2026-11-12T09:00:00Z"));
  mockSession.permissions = TUM;
});

const istenen = () => mockApi.snapshot.mock.calls.map((c) => c[0]).filter((p) => p !== "saglik");

describe("düzen işlemleri (saf)", () => {
  it("bilinmeyen, tekrarlanan ve izinsiz anahtar düşer; bozuk kayıt varsayılana döner", () => {
    expect(D.temizle(["uretim", "uretim", "yok", 3, "alacak"], ["bulut:ozet:oku", "bulut:uretim:oku"])).toEqual(["uretim"]);
    expect(D.oku("{bozuk", TUM)).toEqual(K.VARSAYILAN_DUZEN.filter((a) => K.kutuIzinli(TUM, K.kutu(a))));
    expect(D.oku(null, TUM)).toEqual(D.oku("{bozuk", TUM));
    expect(D.oku("[]", TUM)).toEqual([]);
  });

  it("ekle sona ekler (tekrar etmez), çıkar siler, taşı komşuyla yer değiştirir ve uçta değişmez", () => {
    expect(D.ekle(["uretim"], "sevk")).toEqual(["uretim", "sevk"]);
    expect(D.ekle(["uretim"], "uretim")).toEqual(["uretim"]);
    expect(D.cikar(["uretim", "sevk"], "uretim")).toEqual(["sevk"]);
    expect(D.tasi(["uretim", "sevk", "stok"], "stok", -1)).toEqual(["uretim", "stok", "sevk"]);
    expect(D.tasi(["uretim", "sevk"], "uretim", -1)).toEqual(["uretim", "sevk"]);
    expect(D.tasi(["uretim", "sevk"], "sevk", 1)).toEqual(["uretim", "sevk"]);
  });

  it("ardışık göstergeler ikişer paketlenir, tek kalan tam genişlik; kaynaklar tekilleşir", () => {
    expect(K.satirlar(["uretim", "sevk", "stok", "hizliIslemler", "siparis"])).toEqual([["uretim", "sevk"], ["stok"], ["hizliIslemler"], ["siparis"]]);
    const k = K.istenenKaynaklar(["uretimIstasyon", "uretimAkisi", "hizliIslemler", "sonSevkler"]);
    expect([...k.anlik]).toEqual(["uretim-akisi"]);
    expect([...k.liste]).toEqual(["sevkiyat"]);
  });

  it("katalogda termin/gecikme kutusu yok; varsayılan düzen şartnamedeki sırada", () => {
    expect(K.KUTULAR.some((k) => /termin|gecik|vade/i.test(`${k.anahtar} ${k.baslik} ${k.aciklama}`))).toBe(false);
    expect(K.VARSAYILAN_DUZEN).toEqual(["uretim", "sevk", "siparis", "fasonTop", "hizliIslemler", "uretimIstasyon", "stokDagilim", "sonSevkler", "sonSiparisler"]);
  });
});

describe("Pano verisi yalnız ekli kutudan", () => {
  it("yalnız 'uretim' ekliyken yalnız onun anlığı istenir, liste istenmez", async () => {
    mockPlain.map.set(D.DUZEN_ANAHTARI, JSON.stringify(["uretim"]));
    render(<Dashboard />);
    expect(await screen.findByTestId("kutu-uretim")).toBeTruthy();
    await waitFor(() => expect(istenen()).toEqual(["ozet.uretim"]));
    expect(mockApi.list).not.toHaveBeenCalled();
    expect(screen.queryByTestId("kutu-sevk")).toBeNull();
  });

  it("düzenleme kipinde istek yok; çıkar/sırala/ekle kalıcı yazılır; eklenen kutu Bitti'de veri ister", async () => {
    mockPlain.map.set(D.DUZEN_ANAHTARI, JSON.stringify(["uretim", "stok"]));
    render(<Dashboard />);
    await screen.findByTestId("kutu-uretim");
    await waitFor(() => expect(istenen().sort()).toEqual(["ozet.stok", "ozet.uretim"]));
    mockApi.snapshot.mockClear();

    fireEvent.press(screen.getByTestId("pano-duzenle"));
    expect(screen.getByTestId("duzen-listesi")).toBeTruthy();
    fireEvent.press(screen.getByTestId("duzen-asagi-uretim"));
    expect(JSON.parse(mockPlain.map.get(D.DUZEN_ANAHTARI)!)).toEqual(["stok", "uretim"]);
    fireEvent.press(screen.getByTestId("duzen-cikar-stok"));
    expect(JSON.parse(mockPlain.map.get(D.DUZEN_ANAHTARI)!)).toEqual(["uretim"]);

    fireEvent.press(screen.getByTestId("kutu-ekle"));
    expect(screen.queryByTestId("katalog-alacak")).toBeTruthy();
    fireEvent.press(screen.getByTestId("katalog-sevk"));
    expect(JSON.parse(mockPlain.map.get(D.DUZEN_ANAHTARI)!)).toEqual(["uretim", "sevk"]);
    fireEvent.press(screen.getByTestId("kutu-ekle-kapat"));
    await act(async () => undefined);
    expect(istenen()).toEqual([]);

    fireEvent.press(screen.getByTestId("duzen-bitti"));
    await waitFor(() => expect(istenen()).toContain("ozet.sevkiyat"));
    expect(istenen()).not.toContain("ozet.stok");
    expect(await screen.findByTestId("kutu-sevk")).toBeTruthy();
  });

  it("izinsiz kutu katalogda görünmez", async () => {
    mockSession.permissions = ["bulut:ozet:oku", "bulut:uretim:oku"];
    render(<Dashboard />);
    await screen.findByTestId("kutu-uretim");
    fireEvent.press(screen.getByTestId("pano-duzenle"));
    fireEvent.press(screen.getByTestId("kutu-ekle"));
    expect(screen.getByTestId("katalog-fason")).toBeTruthy();
    expect(screen.queryByTestId("katalog-alacak")).toBeNull();
    expect(screen.queryByTestId("katalog-sevk")).toBeNull();
  });
});
