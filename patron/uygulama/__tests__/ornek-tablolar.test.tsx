// Örnek veri kipinde (EXPO_PUBLIC_ORNEK_VERI=1 + __DEV__) tablolar DOLU açılır ve dört özelliğin araçları görünür
// (2026-11-20): Stok ürün + kalem topları · Üretim istasyonları · konum listesi · Çuvallar · cari özet tabloları.
// Veri sahte sunucudan (`createOrnekClient`) gelir; ağa çıkılmaz. Tercihler örnek kipte yalnız yereldedir.
import AsyncStorage from "@react-native-async-storage/async-storage";
import { act, fireEvent, render, screen } from "@testing-library/react-native";
import type { ReactElement } from "react";

const { createOrnekClient } = jest.requireActual("../src/ornek/istemci") as typeof import("../src/ornek/istemci");
const { createApi } = require("../src/api/endpoints") as typeof import("../src/api/endpoints");
const { ornekOturum, ORNEK_ANLIK, ORNEK_LISTE } = require("../src/ornek/veri") as typeof import("../src/ornek/veri");

const mockOturum = ornekOturum();
const mockSession = {
  api: createApi(createOrnekClient()),
  cache: { load: jest.fn(async (_k: string, f: () => Promise<unknown>) => ({ data: await f(), offline: false, savedAt: "" })), peek: jest.fn(async () => null) },
  markOnline: jest.fn(), permissions: mockOturum.hesap.izinler, offline: false, offlineSince: null, facility: mockOturum, facilities: [], switchError: null,
  factoryStamp: mockOturum.esitleme?.ufuk ?? null,
};
let mockParams: Record<string, string> = {};
jest.mock("../src/state/session", () => ({ useSession: () => mockSession }));
jest.mock("expo-router", () => ({
  useRouter: () => ({ push: jest.fn(), replace: jest.fn(), back: jest.fn(), navigate: jest.fn(), setParams: jest.fn(), canGoBack: () => true }),
  usePathname: () => "/",
  useLocalSearchParams: () => mockParams,
  useFocusEffect: (cb: () => void | (() => void)) => (require("react") as typeof import("react")).useEffect(() => cb(), [cb]),
}));
jest.mock("react-native-safe-area-context", () => ({ useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }) }));

const ekran = (yol: string) => (require(yol) as { default: () => ReactElement }).default;
const g = globalThis as { __DEV__?: boolean };

// Sahte sunucu her yanıtı GECIKME_MS (350 ms) sonra verir: her tur gerçek süre bekler (zincirli istekler için birkaç tur).
async function settle(n = 6) {
  for (let i = 0; i < Math.ceil(n / 2); i++) {
    await act(async () => { await new Promise((r) => setTimeout(r, 380)); });
  }
}
const kacir = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const satirSayisi = (onek: string) => screen.queryAllByTestId(new RegExp(`^${kacir(onek)}`)).length;

beforeEach(async () => {
  g.__DEV__ = true;
  process.env.EXPO_PUBLIC_ORNEK_VERI = "1";
  mockParams = {};
  await AsyncStorage.clear();
});
afterAll(() => {
  delete process.env.EXPO_PUBLIC_ORNEK_VERI;
});

describe("örnek veri: tablolar dolu açılır", () => {
  it("Stok: ürün tablosu her ürünü çizer (simgeler başlıkta); kaleme dokununca toplar tablosu araçlarıyla açılır", async () => {
    { const E = ekran("../app/(app)/(tabs)/stok"); render(<E />); }
    await settle();
    const urunler = (ORNEK_ANLIK()["stok-karnesi"] as { urunler: unknown[] }).urunler;
    expect(satirSayisi("stok-satir-")).toBe(urunler.length);
    for (const id of ["stok-ara-ac", "stok-suzgec", "stok-sutunlar", "stok-sutun-miktar"]) expect(screen.getByTestId(id)).toBeTruthy();
    const ilk = screen.getAllByTestId(/^stok-kalem-satir-/)[0]!;
    const anahtar = String(ilk.props.testID).slice("stok-kalem-satir-".length);
    fireEvent.press(ilk);
    await settle(2);
    const t = `stok-kalem-toplar-${anahtar}`;
    expect(satirSayisi(`${t}-satir-`)).toBeGreaterThan(0);
    for (const ek of ["-ara-ac", "-sutunlar", "-sutun-metre"]) expect(screen.getByTestId(t + ek)).toBeTruthy();
  });

  it("Üretim: istasyon tablosu (kart açıkken) bütün istasyonları çizer", async () => {
    const anahtar = `tablo-tercihi:${mockOturum.tesis.id}:${mockOturum.hesap.id}:tablo.is-emri`;
    await AsyncStorage.setItem(anahtar, JSON.stringify({ deger: { surum: 1, sutunlar: ["musteri", "kumas", "top", "asama"], siralama: null, suzgec: { uretimKartlar: "istasyonlar" } }, kirli: false }));
    { const E = ekran("../app/(app)/(tabs)/uretim"); render(<E />); }
    await settle();
    const ist = (ORNEK_ANLIK()["uretim-akisi"] as { istasyonlar: unknown[] }).istasyonlar;
    expect(satirSayisi("istasyon-satir-")).toBe(ist.length);
    for (const id of ["istasyon-ara-ac", "istasyon-suzgec", "istasyon-sutunlar", "istasyon-sutun-kuyruk"]) expect(screen.getByTestId(id)).toBeTruthy();
  });

  it("Konum (Kurşun): açık iş emirleri tablo olarak; sıralanabilir başlık", async () => {
    mockParams = { asama: "KURSUN" };
    { const E = ekran("../app/(app)/is-emirleri/konum"); render(<E />); }
    await settle(10);
    expect(satirSayisi("konum-w")).toBeGreaterThanOrEqual(3);
    for (const id of ["konum-tablo-ara-ac", "konum-tablo-suzgec", "konum-tablo-sutunlar", "konum-tablo-sutun-metre"]) expect(screen.getByTestId(id)).toBeTruthy();
  });

  it("Çuvallar: çuval tablosu dolu, araçlar görünür", async () => {
    { const E = ekran("../app/(app)/cuvallar"); render(<E />); }
    await settle();
    expect(satirSayisi("cuval-satir-")).toBeGreaterThan(0);
    for (const id of ["cuval-ara", "cuval-suzgec", "cuval-sutunlar"]) expect(screen.getByTestId(id)).toBeTruthy();
  });

  // Açık siparişler bölümü görünürken "Son siparişler" çizilmez (2026-11-19) → sipariş kısa tablosu açık siparişlerdir.
  it("Cari ayrıntısı (c1): son sevkiyatlar + açık siparişler kısa tabloları dolu", async () => {
    mockParams = { id: "c1" };
    { const E = ekran("../app/(app)/cariler/[id]"); render(<E />); }
    await settle(10);
    expect(satirSayisi("cari-sevkiyatlar-satir-")).toBeGreaterThan(0);
    expect(satirSayisi("cari-acik-tablo-satir-")).toBeGreaterThan(0);
  });

  // 2026-11-20 ("dördünü de çevir"): listeden tabloya çevrilen dört yüzey örnek kipte dolu ve araçlı açılır.
  it("Cari ayrıntısı (c1): iadeler tablosu dolu (iptal dahil), araçlar görünür", async () => {
    mockParams = { id: "c1" };
    { const E = ekran("../app/(app)/cariler/[id]"); render(<E />); }
    await settle(10);
    const iadeler = (ORNEK_LISTE().iade ?? []).filter((r) => (r.kayit as { cariKartId?: string }).cariKartId === "c1");
    expect(satirSayisi("cari-iade-i")).toBe(Math.min(iadeler.length, 5));
    for (const id of ["cari-iade-tablo-ara-ac", "cari-iade-tablo-suzgec", "cari-iade-tablo-sutunlar", "cari-iade-tablo-sutun-metre"]) expect(screen.getByTestId(id)).toBeTruthy();
  });

  it("Sipariş ayrıntısı (s3): kalemler (iş emri payıyla) ve siparişin iş emirleri tabloları dolu", async () => {
    mockParams = { id: "s3" };
    { const E = ekran("../app/(app)/siparisler/[id]"); render(<E />); }
    await settle(10);
    const L = ORNEK_LISTE();
    const kalemler = L["siparis-kalemi"]!.filter((r) => (r.kayit as { siparisId?: string }).siparisId === "s3");
    expect(kalemler.length).toBeGreaterThan(1);
    for (const r of kalemler) expect(screen.getByTestId(`kalem-${r.id}`)).toBeTruthy();
    expect(satirSayisi(`kalem-${kalemler[0]!.id}-is-emri-`)).toBeGreaterThan(0);
    const ieler = L["is-emri"]!.filter((r) => ((r.kayit as { siparisIdleri?: string[] }).siparisIdleri ?? []).includes("s3"));
    for (const r of ieler) expect(screen.getByTestId(`siparis-is-emri-${r.id}`)).toBeTruthy();
    for (const t of ["siparis-kalem-tablo", "siparis-is-emri-tablo"]) for (const ek of ["-ara-ac", "-suzgec", "-sutunlar"]) expect(screen.getByTestId(t + ek)).toBeTruthy();
  });

  it("İş emri ayrıntısı (w1): 'Üretim ayrıntıları' açılınca aşama sayıları tablosu", async () => {
    mockParams = { id: "w1" };
    { const E = ekran("../app/(app)/is-emirleri/[id]"); render(<E />); }
    await settle(4);
    fireEvent.press(screen.getByTestId("is-emri-ayrinti-basligi"));
    await settle(2);
    expect(screen.getByTestId("is-emri-asama-fason")).toBeTruthy();
    expect(screen.getByTestId("is-emri-asama-depo")).toBeTruthy();
    expect(screen.queryByTestId("is-emri-asama-kursun")).toBeNull(); // sıfır toplu aşama çizilmez
    for (const ek of ["-ara-ac", "-suzgec", "-sutunlar", "-sutun-top"]) expect(screen.getByTestId(`is-emri-asama-tablo${ek}`)).toBeTruthy();
  });
});
