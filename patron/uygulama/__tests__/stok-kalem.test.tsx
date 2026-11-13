// Stok › kalem listesi (anlık `stok-kalem`): §1 saf okuma — kalem adı, Türkçe katlamalı arama, süzgeç grupları, yaş kovası,
// boş değer sonda sıralama · §2 ekran — varsayılan Bitmiş + Kalem bazında; Ham segmenti; kaleme dokununca topları; Top
// bazında; arama; eski fabrika (anlık yok) boş durum, kutular yerinde · §3 görünüm hesap yapmaz (rakam fabrikanınki).
import { act, fireEvent, render, screen } from "@testing-library/react-native";
import type React from "react";

const mockApi = { snapshot: jest.fn(), list: jest.fn(), record: jest.fn(), viewPref: jest.fn(), viewPrefSet: jest.fn() };
const mockCache = {
  load: jest.fn(async (_k: string, f: () => Promise<unknown>) => ({ data: await f(), offline: false, savedAt: "2026-11-13T09:00:00.000Z" })),
  peek: jest.fn(async () => null),
};
const mockSession = {
  api: mockApi, cache: mockCache, markOnline: jest.fn(), permissions: ["bulut:stok:oku"] as string[], offline: false, offlineSince: null,
  facility: null, facilities: [], switchError: null, factoryStamp: "2026-11-13T08:55:00Z",
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
const lib = require("../src/lib/stok-kalem") as typeof import("../src/lib/stok-kalem");
const { ApiError } = require("../src/api/client") as typeof import("../src/api/client");

const K1 = "a|330|b|4-KAT";
const K2 = "c|280|d|";
const KALEM = {
  ham: {
    toplamTop: 3, toplamMetre: 410.5,
    kalemler: [{ anahtar: "h1", urun: "ÖRNEK HAM İPEK", en: null, renk: null, kat: null, top: 3, metre: 410.5, kg: null, enEskiGun: 40 }],
    toplar: [
      { id: "11111111-1111-4111-8111-000000000001", topNo: "H-1", kalem: "h1", metre: 200, kg: null, parti: null, depo: "Merkez", gun: 40 },
      { id: "11111111-1111-4111-8111-000000000002", topNo: "H-2", kalem: "h1", metre: 110.5, kg: null, parti: null, depo: "Merkez", gun: 12 },
      { id: "11111111-1111-4111-8111-000000000003", topNo: "H-3", kalem: "h1", metre: 100, kg: null, parti: null, depo: "Merkez", gun: 3 },
    ],
  },
  bitmis: {
    toplamTop: 4, toplamMetre: 151.2,
    kalemler: [
      { anahtar: K1, urun: "ÖRNEK PANOS", en: 330, renk: "BEYAZ", kat: "4 Kat", top: 3, metre: 101.2, kg: null, enEskiGun: 95 },
      { anahtar: K2, urun: "ÖRNEK SATEN", en: 280, renk: "KREM", kat: null, top: 1, metre: 50, kg: null, enEskiGun: null },
    ],
    toplar: [
      { id: "22222222-2222-4222-8222-000000000001", topNo: "T-001", kalem: K1, metre: 40, kg: null, parti: "P07", depo: "Merkez", gun: 95 },
      { id: "22222222-2222-4222-8222-000000000002", topNo: "T-002", kalem: K1, metre: 31.2, kg: null, parti: "P07", depo: "Merkez", gun: 20 },
      { id: "22222222-2222-4222-8222-000000000003", topNo: "T-003", kalem: K1, metre: 30, kg: null, parti: "P08", depo: "Merkez", gun: 2 },
      { id: "22222222-2222-4222-8222-000000000004", topNo: "T-004", kalem: K2, metre: 50, kg: null, parti: null, depo: null, gun: null },
    ],
  },
};
const KARNE = {
  ozet: { bitmisMiktar: 151.2, bitmisAdet: 4, hamMiktar: 410.5, hamAdet: 3, yariMamulMiktar: 0, yariMamulAdet: 0, yasliMiktar: 40, oluMiktar: 0, oluStokGun: 90, yassizAdet: 1, yassizMiktar: 50 },
  yasKovalari: [], urunler: [],
};
let DATA: Record<string, unknown> = {};

async function flush() {
  await act(async () => undefined);
  await act(async () => undefined);
}

beforeEach(() => {
  DATA = { "stok-karnesi": KARNE, "stok-kalem": KALEM };
  for (const f of Object.values(mockApi)) f.mockReset();
  mockApi.snapshot.mockImplementation(async (p: string) => {
    if (!(p in DATA)) throw new ApiError(404, "BULUNAMADI", "Anlık görüntü bulunamadı");
    return { projeksiyon: p, veri: DATA[p], surum: "2026-11-13T08:55:00.000Z" };
  });
  mockApi.list.mockImplementation(async () => ({ kayitlar: [], sonraki: null }));
});

describe("§1 saf okuma", () => {
  it("kalem adı: ürün + en + renk (+kat); ham yalnız ürün", () => {
    expect(lib.kalemEtiketi({ urun: "PANOS", en: 330, renk: "BEYAZ", kat: null })).toBe("PANOS 330 · BEYAZ");
    expect(lib.kalemEtiketi({ urun: "PANOS", en: 152.5, renk: "BEYAZ", kat: "4 Kat" })).toBe("PANOS 152,5 · BEYAZ · 4 Kat");
    expect(lib.kalemEtiketi({ urun: "HAM İPEK", en: null, renk: null, kat: null })).toBe("HAM İPEK");
  });

  it("arama Türkçe harfleri katlar, kelime sırası serbest", () => {
    expect(lib.aramaKatla("İPEK Kırmızı ŞAL")).toBe("ipek kirmizi sal");
    expect(lib.eslesir("ÖRNEK PANOS 330 · BEYAZ", "panos beyaz")).toBe(true);
    expect(lib.eslesir("ÖRNEK PANOS 330 · BEYAZ", "beyaz 330 ornek")).toBe(true);
    expect(lib.eslesir("KIRMIZI", "kirmizi")).toBe(true);
    expect(lib.eslesir("ÖRNEK PANOS", "saten")).toBe(false);
  });

  it("süzgeç grupları veriden; ham bölümde en/renk grubu yok; yaş kovası 7/30/90", () => {
    const b = lib.stokBolumu(KALEM, "bitmis");
    const g = lib.stokSuzgecGruplari(b);
    expect(g.map((x) => x.anahtar)).toEqual(["urun", "renk", "en", "yas"]);
    expect(g.find((x) => x.anahtar === "yas")!.secenekler.map((o) => o.deger)).toEqual(["90+", "yok"]);
    expect(lib.stokSuzgecGruplari(lib.stokBolumu(KALEM, "ham")).map((x) => x.anahtar)).toEqual(["urun", "yas"]);
    expect([0, 7, 8, 30, 31, 90, 91].map(lib.yasKovasi)).toEqual(["0-7", "0-7", "8-30", "8-30", "31-90", "31-90", "90+"]);
    expect(lib.gorunenKalemler(b, "", { renk: "KREM" }, null).map((k) => k.urun)).toEqual(["ÖRNEK SATEN"]);
    expect(lib.gorunenToplar(b, "", { en: "330" }, null).map((t) => t.topNo)).toEqual(["T-001", "T-002", "T-003"]);
  });

  it("sıralama: boş değer her iki yönde sonda; eşitlikte fabrikanın sırası", () => {
    const b = lib.stokBolumu(KALEM, "bitmis");
    expect(lib.gorunenKalemler(b, "", {}, { alan: "gun", yon: "artan" }).map((k) => k.enEskiGun)).toEqual([95, null]);
    expect(lib.gorunenKalemler(b, "", {}, { alan: "gun", yon: "azalan" }).map((k) => k.enEskiGun)).toEqual([95, null]);
    expect(lib.gorunenToplar(b, "", {}, { alan: "metre", yon: "azalan" }).map((t) => t.topNo)).toEqual(["T-004", "T-001", "T-002", "T-003"]);
  });

  it("eksik alan çökmez: boş/eski veri boş bölüm", () => {
    expect(lib.stokBolumu(undefined, "ham")).toEqual({ toplamTop: 0, toplamMetre: 0, kalemler: [], toplar: [] });
  });
});

describe("§2 ekran", () => {
  it("varsayılan Bitmiş + Kalem bazında; rakamlar fabrikanınki", async () => {
    render(<Stock />);
    await flush();
    expect(screen.getByTestId("stok-kalem-bolumu")).toBeTruthy();
    expect(screen.getByText("ÖRNEK PANOS 330 · BEYAZ · 4 Kat")).toBeTruthy();
    expect(screen.getByText("ÖRNEK SATEN 280 · KREM")).toBeTruthy();
    expect(screen.getByTestId("stok-kalem-ozet").props.children).toBe("4 top · 151,2 m");
    expect(screen.getByText("101,2")).toBeTruthy();
    // Kutular yerinde.
    expect(screen.getByTestId("kpi-bitmis")).toBeTruthy();
  });

  it("kaleme dokununca o kalemin topları açılır, yeniden dokununca kapanır", async () => {
    render(<Stock />);
    await flush();
    fireEvent.press(screen.getByTestId(`stok-kalem-satir-${K1}`));
    const acik = screen.getByTestId(`stok-kalem-toplar-${K1}`);
    expect(acik).toBeTruthy();
    expect(screen.getByText("T-001")).toBeTruthy();
    expect(screen.getByText("T-003")).toBeTruthy();
    expect(screen.queryByText("T-004")).toBeNull();
    fireEvent.press(screen.getByTestId(`stok-kalem-satir-${K1}`));
    expect(screen.queryByTestId(`stok-kalem-toplar-${K1}`)).toBeNull();
  });

  it("Ham segmenti ham kalemleri, Top bazında topları tek tek gösterir; arama süzer", async () => {
    render(<Stock />);
    await flush();
    fireEvent.press(screen.getByTestId("stok-bolum-ham"));
    await flush();
    expect(screen.getByText("ÖRNEK HAM İPEK")).toBeTruthy();
    expect(screen.queryByText("ÖRNEK PANOS 330 · BEYAZ · 4 Kat")).toBeNull();
    fireEvent.press(screen.getByTestId("stok-bolum-bitmis"));
    fireEvent.press(screen.getByTestId("stok-gorunum-top"));
    await flush();
    for (const no of ["T-001", "T-002", "T-003", "T-004"]) expect(screen.getByTestId(`stok-top-satir-22222222-2222-4222-8222-00000000000${no.slice(-1)}`)).toBeTruthy();
    fireEvent.changeText(screen.getByTestId("stok-kalem-ara"), "saten");
    await flush();
    expect(screen.queryByText("T-001")).toBeNull();
    expect(screen.getByText("T-004")).toBeTruthy();
  });

  it("eski fabrika (anlık yok): kalem bölümü boş durum, kutular çizilir", async () => {
    delete DATA["stok-kalem"];
    render(<Stock />);
    await flush();
    expect(screen.getByTestId("stok-kalem-bos")).toBeTruthy();
    expect(screen.getByTestId("kpi-ham")).toBeTruthy();
  });
});
