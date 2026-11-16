// Stok › kalem/top EK SÜTUNLARI (2026-11-17): §1 top satırı kaleminin ürün · en · renk · kat alanını taşır (tel
// anahtarıyla eşleme, hesap yok); ham topta en/renk/kat boş · §2 varsayılan sütunlar değişmedi, yeni sütunlar seçicide
// KAPALI · §3 sığandan fazla sütun seçilince başlık + gövde yatay kaydırılır; sığarsa kaydırıcı yok · §4 10 sütuna kadar.
import { act, fireEvent, render, screen } from "@testing-library/react-native";
import type React from "react";
import { stokBolumu, TOP_SIRALAMA } from "../src/lib/stok-kalem";
import { KALEM_SUTUNLARI, TOP_SUTUNLARI, VARSAYILAN_SUTUN } from "../src/ui/stok/sutunlar";

const mockApi = { snapshot: jest.fn(), list: jest.fn(), record: jest.fn(), viewPref: jest.fn(), viewPrefSet: jest.fn() };
const mockCache = {
  load: jest.fn(async (_k: string, f: () => Promise<unknown>) => ({ data: await f(), offline: false, savedAt: "2026-11-13T09:00:00.000Z" })),
  peek: jest.fn(async () => null),
};
const mockSession = {
  api: mockApi, cache: mockCache, markOnline: jest.fn(), permissions: ["bulut:stok:oku"] as string[], offline: false, offlineSince: null,
  facility: { tesis: { id: "t1" }, hesap: { id: "h1" }, liste: { siralama: {} } } as Record<string, unknown>, facilities: [], switchError: null, factoryStamp: "2026-11-13T08:55:00Z",
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

const K1 = "a|330|b|4-KAT";
const VERI = {
  ham: {
    toplamTop: 1, toplamMetre: 200,
    kalemler: [{ anahtar: "h1", urun: "ÖRNEK HAM", en: null, renk: null, kat: null, top: 1, metre: 200, kg: null, enEskiGun: 4 }],
    toplar: [{ id: "11111111-1111-4111-8111-000000000001", topNo: "H-1", kalem: "h1", metre: 200, kg: null, parti: null, depo: "Merkez", gun: 4 }],
  },
  bitmis: {
    toplamTop: 1, toplamMetre: 40,
    kalemler: [{ anahtar: K1, urun: "ÖRNEK PANOS", en: 152.5, renk: "BEYAZ", kat: "4 Kat", top: 1, metre: 40, kg: 12.5, enEskiGun: 9 }],
    toplar: [{ id: "22222222-2222-4222-8222-000000000001", topNo: "T-001", kalem: K1, metre: 40, kg: 12.5, parti: "P07", depo: "Merkez", gun: 9 }],
  },
};
const KARNE = { ozet: {}, yasKovalari: [], urunler: [] };

async function flush() {
  for (let i = 0; i < 3; i++) await act(async () => undefined);
}
const hucre = (cols: typeof TOP_SUTUNLARI, key: string) => cols.find((c) => c.key === key)!;

beforeEach(() => {
  for (const f of Object.values(mockApi)) f.mockReset();
  mockApi.snapshot.mockImplementation(async (p: string) => ({ projeksiyon: p, veri: p === "stok-karnesi" ? KARNE : VERI, surum: "2026-11-13T08:55:00.000Z" }));
});

describe("§1 top satırı kalem alanları", () => {
  it("bitmiş top ürün/en/renk/kat taşır; ham topta en/renk/kat boş; sıralama alanları var", () => {
    const b = stokBolumu(VERI, "bitmis").toplar[0]!;
    expect(b).toMatchObject({ urun: "ÖRNEK PANOS", en: 152.5, renk: "BEYAZ", kat: "4 Kat" });
    expect(hucre(TOP_SUTUNLARI, "en").hucre(b)).toBe("152,5");
    expect(hucre(TOP_SUTUNLARI, "kat").hucre(b)).toBe("4 Kat");
    const h = stokBolumu(VERI, "ham").toplar[0]!;
    expect(h).toMatchObject({ urun: "ÖRNEK HAM", en: null, renk: null, kat: null });
    expect(hucre(TOP_SUTUNLARI, "renk").hucre(h)).toBe("—");
    for (const k of ["urun", "en", "renk", "kat"]) expect(TOP_SIRALAMA[k]).toBeDefined();
  });
  it("kalemi bilinmeyen top çökmez, alanlar boş", () => {
    const v = { bitmis: { ...VERI.bitmis, toplar: [{ ...VERI.bitmis.toplar[0], kalem: "yok" }] } };
    expect(stokBolumu(v, "bitmis").toplar[0]).toMatchObject({ kalemEtiket: "—", urun: null, en: null });
  });
});

describe("§2 varsayılan sade", () => {
  it("varsayılan sütunlar bugünküyle aynı; yeni sütunlar varsayılanda yok", () => {
    expect(VARSAYILAN_SUTUN.kalem).toEqual(["kalem", "top", "metre", "gun"]);
    expect(VARSAYILAN_SUTUN.top).toEqual(["topNo", "kalem", "metre", "gun"]);
    expect(KALEM_SUTUNLARI.map((c) => c.key)).toEqual(expect.arrayContaining(["urun", "en", "renk", "kat"]));
    expect(TOP_SUTUNLARI.map((c) => c.key)).toEqual(expect.arrayContaining(["parti", "depo", "kg", "urun", "en", "renk", "kat"]));
  });
});

describe("§3–§4 ekran", () => {
  const pref = (sutunlar: string[]) => async (k: string) =>
    k === "stok.gorunum"
      ? { anahtar: k, deger: { surum: 1, sutunlar: ["-"], siralama: null, suzgec: { bolum: "bitmis", gorunum: "top" } }, guncelleme: null }
      : k === "tablo.stok-top"
        ? { anahtar: k, deger: { surum: 1, sutunlar, siralama: null, suzgec: {} }, guncelleme: null }
        : { anahtar: k, deger: null, guncelleme: null };

  it("negatif sonda: 4 sütunda yatay kaydırıcı yok", async () => {
    mockApi.viewPref.mockImplementation(pref(["topNo", "kalem", "metre", "gun"]));
    render(<Stock />);
    await flush();
    expect(screen.getByTestId("stok-top-satir-22222222-2222-4222-8222-000000000001")).toBeTruthy();
    expect(screen.queryByTestId("stok-top-govde-kaydirma")).toBeNull();
  });

  it("11 sütun saklıysa 10'u çizilir, başlık ve gövde yatay kaydırılır; seçicide 11. kilitli", async () => {
    const hepsi = TOP_SUTUNLARI.map((c) => c.key);
    expect(hepsi.length).toBe(11);
    mockApi.viewPref.mockImplementation(pref(hepsi));
    render(<Stock />);
    await flush();
    expect(screen.getByTestId("stok-top-govde-kaydirma")).toBeTruthy();
    expect(screen.getByTestId("stok-kalem-baslik-kaydirma")).toBeTruthy();
    expect(screen.getByTestId("stok-kalem-sutun-renk")).toBeTruthy();
    expect(screen.queryByTestId("stok-kalem-sutun-kat")).toBeNull();
    fireEvent.press(screen.getByTestId("stok-kalem-sutunlar"));
    await flush();
    expect(screen.getByTestId("stok-kalem-sutun-secici-kat").props.accessibilityState).toMatchObject({ checked: false, disabled: true });
  });
});
