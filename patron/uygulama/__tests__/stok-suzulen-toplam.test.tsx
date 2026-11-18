// Stok alt şeridi süzülen toplam (fabrika 2.13.1 top başına hazır katkı): §1 saf — katkı okuma, binde bir tamsayı toplamı,
// yarım küme toplanmaz · §2 ekran — süzgeç/arama etkinken "Süzülen: Depoda X top Y m · Çuvalda X top Y m" (yalnız süzülen
// TOP satırlarının katkısı), kalem görünümünde yalnız Depoda (kalem satırı raf toplarıyla birebir), süzgeçsiz bölüm toplamı,
// eski fabrika (katkı yok) → satır sayısı.
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
const { suzulenParcalari } = require("../src/ui/stok/StokToplamSatiri") as typeof import("../src/ui/stok/StokToplamSatiri");
const { ApiError } = require("../src/api/client") as typeof import("../src/api/client");

const K1 = "a|330|b|4-KAT";
const K2 = "c|280|d|";
const raf = (m: number) => ({ depodaTop: 1, depodaMetre: m, cuvaldaTop: 0, cuvaldaMetre: 0 });
const cuv = (m: number) => ({ depodaTop: 0, depodaMetre: 0, cuvaldaTop: 1, cuvaldaMetre: m });
const TOPLAR = [
  { id: "t1", topNo: "T-001", kalem: K1, metre: 40.1, kg: null, parti: "P07", depo: "Merkez", gun: 95, etiketMusteri: null, cuvalNo: null, cuvalCari: null, ...raf(40.1) },
  { id: "t2", topNo: "T-002", kalem: K1, metre: 30.2, kg: null, parti: "P07", depo: "Merkez", gun: 20, etiketMusteri: null, cuvalNo: null, cuvalCari: null, ...raf(30.2) },
  { id: "t3", topNo: "T-003", kalem: K2, metre: 50, kg: null, parti: null, depo: null, gun: 3, etiketMusteri: null, cuvalNo: null, cuvalCari: null, ...raf(50) },
];
const CUVALDA = [
  { id: "c1", topNo: "CV-1", kalem: K1, metre: 44.45, kg: null, parti: null, depo: "Merkez", gun: 2, etiketMusteri: "ELİZA", cuvalNo: "CV1", cuvalCari: "ELİZA",
    urun: "ÖRNEK PANOS", en: 330, renk: "BEYAZ", kat: "4 Kat", ...cuv(44.45) },
];
const kalemler = [
  { anahtar: K1, urun: "ÖRNEK PANOS", en: 330, renk: "BEYAZ", kat: "4 Kat", top: 2, metre: 70.3, kg: null, enEskiGun: 95 },
  { anahtar: K2, urun: "ÖRNEK SATEN", en: 280, renk: "KREM", kat: null, top: 1, metre: 50, kg: null, enEskiGun: 3 },
];
const YENI = {
  ham: { toplamTop: 0, toplamMetre: 0, kalemler: [], toplar: [] },
  bitmis: { toplamTop: 3, toplamMetre: 120.3, kalemler, toplar: TOPLAR, cuvaldaTop: 1, cuvaldaMetre: 44.45, cuvaldakiToplar: CUVALDA },
};
// Eski fabrika: aynı belge, katkı alanları YOK.
const katkisiz = <T extends Record<string, unknown>>(t: T) => {
  const { depodaTop: _a, depodaMetre: _b, cuvaldaTop: _c, cuvaldaMetre: _d, ...rest } = t;
  return rest;
};
const ESKI = { ...YENI, bitmis: { ...YENI.bitmis, toplar: TOPLAR.map(katkisiz), cuvaldakiToplar: CUVALDA.map(katkisiz) } };
const KARNE = { ozet: { bitmisMiktar: 120.3, bitmisAdet: 3, hamMiktar: 0, hamAdet: 0, yariMamulMiktar: 0, yariMamulAdet: 0, yasliMiktar: 0, oluMiktar: 0, oluStokGun: 90, yassizAdet: 0, yassizMiktar: 0 }, yasKovalari: [], urunler: [] };
let KALEM: unknown = YENI;

async function flush() {
  await act(async () => undefined);
  await act(async () => undefined);
}

beforeEach(() => {
  KALEM = YENI;
  for (const f of Object.values(mockApi)) f.mockReset();
  mockApi.snapshot.mockImplementation(async (p: string) => {
    const veri = p === "stok-kalem" ? KALEM : p === "stok-karnesi" ? KARNE : undefined;
    if (veri === undefined) throw new ApiError(404, "BULUNAMADI", "yok");
    return { projeksiyon: p, veri, surum: "2026-11-13T08:55:00.000Z" };
  });
  mockApi.list.mockImplementation(async () => ({ kayitlar: [], sonraki: null }));
});

describe("§1 saf", () => {
  it("katkı binde bir tamsayıyla toplanır (kayan nokta kayması yok), 1 haneye yuvarlanır", () => {
    const b = lib.stokBolumu(YENI, "bitmis");
    expect(b.toplar[0]!.katki).toEqual({ depodaTop: 1, depodaMetreBinde: 40100, cuvaldaTop: 0, cuvaldaMetreBinde: 0 });
    expect(lib.katkiVar(b)).toBe(true);
    // 40,1 + 30,2 = 70,3 (düz kayan nokta 70,30000000000001 verirdi); çuval 44,45 → 44,5.
    expect(lib.katkiToplami(lib.tumToplar(b))).toEqual({ depoTop: 3, depoMetre: 120.3, cuvalTop: 1, cuvalMetre: 44.5 });
  });

  it("NEGATİF: katkısı olmayan tek top bile varsa toplam yok (yarım küme uydurulmaz) → satır sayısı", () => {
    const yarim = { ...YENI, bitmis: { ...YENI.bitmis, toplar: [katkisiz(TOPLAR[0]!), ...TOPLAR.slice(1)] } };
    const b = lib.stokBolumu(yarim, "bitmis");
    expect(lib.katkiVar(b)).toBe(false);
    expect(lib.katkiToplami(lib.tumToplar(b))).toBeNull();
    const d = lib.stokSuzgecDurumu(b, "top", { urun: "ÖRNEK PANOS" }, {});
    expect(lib.suzulenOzet(b, "top", d, "")).toEqual({ tur: "adet", adet: 3 });
  });

  it("top görünümü raf + çuval; kalem görünümü süzülen kalemlerin raf topları, yalnız Depoda", () => {
    const b = lib.stokBolumu(YENI, "bitmis");
    const top = lib.suzulenOzet(b, "top", lib.stokSuzgecDurumu(b, "top", { urun: "ÖRNEK PANOS" }, {}), "");
    expect(suzulenParcalari(top, "top")).toEqual([
      { key: "depo", etiket: "Depoda", deger: "2 top 70,3 m" },
      { key: "cuval", etiket: "Çuvalda", deger: "1 top 44,5 m" },
    ]);
    const kalem = lib.suzulenOzet(b, "kalem", lib.stokSuzgecDurumu(b, "kalem", { urun: "ÖRNEK PANOS" }, {}), "");
    expect(suzulenParcalari(kalem, "kalem")).toEqual([{ key: "depo", etiket: "Depoda", deger: "2 top 70,3 m" }]);
    // Arama da aynı helper'dan geçer.
    expect(suzulenParcalari(lib.suzulenOzet(b, "top", lib.stokSuzgecDurumu(b, "top", {}, {}), "T-003"), "top")).toEqual([
      { key: "depo", etiket: "Depoda", deger: "1 top 50 m" },
      { key: "cuval", etiket: "Çuvalda", deger: "0 top 0 m" },
    ]);
  });
});

describe("§2 ekran (görünüm tercihi modül deposunda kalır: Top'a geçen test EN SONDA)", () => {
  it("süzgeçsiz bölüm toplamı; aramada kalem görünümü 'Süzülen: Depoda …' (Çuvalda yok)", async () => {
    render(<Stock />);
    await flush();
    expect(screen.getByTestId("stok-toplam-depo-deger").props.children).toBe("3 top · 120,3 m");
    expect(screen.queryByTestId("stok-toplam-suzulen")).toBeNull();
    fireEvent.changeText(screen.getByTestId("stok-kalem-ara"), "saten");
    await flush();
    expect(screen.getByTestId("stok-toplam-suzulen-depo-deger").props.children).toBe("1 top 50 m");
    expect(screen.queryByTestId("stok-toplam-suzulen-cuval")).toBeNull();
    expect(screen.getByTestId("stok-toplam-satiri").props.accessibilityLabel).toBe("Süzülen: Depoda 1 top 50 m");
    fireEvent.changeText(screen.getByTestId("stok-kalem-ara"), "");
    await flush();
    expect(screen.getByTestId("stok-toplam-depo-deger").props.children).toBe("3 top · 120,3 m");
  });

  it("NEGATİF (eski fabrika, katkı yok): süzgeç etkinken bugünkü satır sayısı metni", async () => {
    KALEM = ESKI;
    render(<Stock />);
    await flush();
    fireEvent.changeText(screen.getByTestId("stok-kalem-ara"), "panos");
    await flush();
    expect(screen.getByTestId("stok-toplam-suzulen-deger").props.children).toBe("1 kalem");
    expect(screen.queryByTestId("stok-toplam-suzulen-depo")).toBeNull();
  });

  it("top görünümünde süzgeç: Depoda + Çuvalda, yalnız süzülen topların katkısı", async () => {
    render(<Stock />);
    await flush();
    fireEvent.press(screen.getByTestId("stok-gorunum-top"));
    await flush();
    fireEvent.press(screen.getByTestId("stok-kalem-suzgec"));
    fireEvent.press(screen.getByTestId("stok-kalem-suzgec-secici-alan-urun"));
    fireEvent.press(screen.getByTestId("stok-kalem-suzgec-secici-urun-ÖRNEK PANOS"));
    fireEvent.press(screen.getByTestId("stok-kalem-suzgec-secici-uygula"));
    await flush();
    expect(screen.getByTestId("stok-toplam-suzulen-depo-deger").props.children).toBe("2 top 70,3 m");
    expect(screen.getByTestId("stok-toplam-suzulen-cuval-deger").props.children).toBe("1 top 44,5 m");
    expect(screen.queryByTestId("stok-toplam-depo")).toBeNull();
  });
});
