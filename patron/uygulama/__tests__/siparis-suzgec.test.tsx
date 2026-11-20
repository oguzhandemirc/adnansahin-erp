// Siparişler › GENİŞ SÜZGEÇ + ALT ŞERİT (2026-11-20): sevkiyattaki ortak düzen sipariş listesinde. §1 eski bulut →
// tarih/değer alanı ve şerit yok, istek yeni parametre taşımaz · §2 yeni bulut: alan sırası sipariş tarihi · termin ·
// görünüm · müşteri · yön · kumaş · renk · en (fabrikanın göndermediği alan çizilmez) · §3 termin "Bu hafta" + müşteri
// seçimi doğru `aralik`/`secim` ile gider, toplam ucu aynı süzgeçle · §4 şerit YALNIZ sipariş sayısı (miktar toplanmaz).
// NEGATİF SONDA (2026-11-20, koşuldu, ısırdı): ekrandan `footer` kaldırılınca §4; `useVeriTablosu`da müşteri grubu
// öne alınmayınca (sıra bozulunca) §2 kırmızı.
import AsyncStorage from "@react-native-async-storage/async-storage";
import { act, fireEvent, render, screen } from "@testing-library/react-native";
import type React from "react";
import { factoryDayKey } from "../src/lib/factory-time";
import { tarihAraligi } from "../src/ui/tablo/genisSuzgec";

const { LIST_DATE_RANGES, LIST_ID_FILTERS, LIST_SEARCH, LIST_SORT, LIST_TOTALS, LIST_VALUE_FILTERS } = require("../src/api/wire") as typeof import("../src/api/wire");
const mockApi = {
  snapshot: jest.fn(), list: jest.fn(), record: jest.fn(), viewPref: jest.fn(), viewPrefSet: jest.fn(),
  listOptions: jest.fn(), listTotals: jest.fn(),
};
const mockCache = {
  load: jest.fn(async (_k: string, f: () => Promise<unknown>) => ({ data: await f(), offline: false, savedAt: "2026-11-20T09:00:00.000Z" })),
  peek: jest.fn(async () => null),
};
const ESKI_LISTE = { kimlikSuzgecleri: LIST_ID_FILTERS, aranabilir: Object.keys(LIST_SEARCH), siralama: Object.fromEntries(Object.entries(LIST_SORT).map(([p, a]) => [p, Object.keys(a)])) };
const beyan = (r: Readonly<Record<string, readonly { alan: string }[]>>) => Object.fromEntries(Object.entries(r).map(([p, xs]) => [p, xs.map((x) => x.alan)]));
const YENI_LISTE = { ...ESKI_LISTE, degerSuzgecleri: beyan(LIST_VALUE_FILTERS), tarihAraliklari: beyan(LIST_DATE_RANGES), toplamlar: LIST_TOTALS };
const mockSession = {
  api: mockApi, cache: mockCache, markOnline: jest.fn(), permissions: ["bulut:siparis:oku"] as string[], offline: false, offlineSince: null,
  facility: { tesis: { id: "t1" }, hesap: { id: "h1" }, liste: ESKI_LISTE } as Record<string, unknown>,
  facilities: [], switchError: null, factoryStamp: "2026-11-20T08:55:00Z",
};
jest.mock("../src/state/session", () => ({ useSession: () => mockSession }));
jest.mock("expo-router", () => ({
  useRouter: () => ({ push: jest.fn(), replace: jest.fn(), back: jest.fn(), navigate: jest.fn(), canGoBack: () => true }),
  usePathname: () => "/siparisler",
  useLocalSearchParams: () => ({}),
  useFocusEffect: (cb: () => void | (() => void)) => (require("react") as typeof import("react")).useEffect(() => cb(), [cb]),
}));
jest.mock("react-native-safe-area-context", () => ({ useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }) }));

const Orders = (require("../app/(app)/(tabs)/siparisler/index") as { default: () => React.ReactElement }).default;

const SIPARISLER = [{ id: "s1", surum: "x", kayit: { siparisNo: "SIP-1", musteriAdi: "Örnek Tekstil", durum: "APPROVED", kalemSayisi: 2 } }];
const SECENEK = {
  alanlar: {
    musteriAdi: { degerler: ["Deneme Kumaş", "Örnek Tekstil"], kesildi: false },
    urunAdlari: { degerler: ["KREP"], kesildi: false },
    renkAdlari: { degerler: ["Lacivert"], kesildi: false },
    enler: { degerler: [], kesildi: false },
  },
};

async function flush() {
  for (let i = 0; i < 5; i++) await act(async () => undefined);
}
const sonListe = () => mockApi.list.mock.calls[mockApi.list.mock.calls.length - 1]![1] as Record<string, unknown>;
const sonToplam = () => mockApi.listTotals.mock.calls[mockApi.listTotals.mock.calls.length - 1]![1] as Record<string, unknown>;
const alanlar = () => screen.getByTestId("siparis-suzgec-secici-alanlar").findAll((n: { props: { testID?: unknown }; type: unknown }) => typeof n.props.testID === "string" && /^siparis-suzgec-secici-alan-[^-]+$/.test(n.props.testID) && typeof n.type === "string").map((n: { props: { testID?: unknown } }) => String(n.props.testID).slice("siparis-suzgec-secici-alan-".length));

beforeEach(async () => {
  await AsyncStorage.clear();
  for (const f of Object.values(mockApi)) f.mockReset();
  mockSession.facility = { tesis: { id: "t1" }, hesap: { id: "h1" }, liste: ESKI_LISTE };
  mockApi.snapshot.mockResolvedValue({ projeksiyon: "ozet.siparis", veri: {}, surum: "2026-11-20T08:55:00.000Z" });
  mockApi.list.mockResolvedValue({ kayitlar: SIPARISLER, sonraki: null });
  mockApi.viewPref.mockResolvedValue({ anahtar: "tablo.siparis", deger: null, guncelleme: null });
  mockApi.viewPrefSet.mockImplementation(async (anahtar: string, deger: unknown) => ({ anahtar, deger, guncelleme: "x" }));
  mockApi.listOptions.mockResolvedValue(SECENEK);
  mockApi.listTotals.mockResolvedValue({ adet: 1234, toplamlar: {} });
});

describe("§1 eski bulut", () => {
  it("tarih/değer alanı ve şerit yok; istek yeni parametre taşımaz", async () => {
    render(<Orders />);
    await flush();
    expect(sonListe().secim).toBeUndefined();
    expect(sonListe().aralik).toBeUndefined();
    expect(mockApi.listOptions).not.toHaveBeenCalled();
    expect(mockApi.listTotals).not.toHaveBeenCalled();
    expect(screen.queryByTestId("siparis-toplam")).toBeNull();
    fireEvent.press(screen.getByTestId("siparis-suzgec"));
    expect(alanlar()).toEqual(["ana", "yon"]);
  });
});

describe("§2-§4 yeni bulut", () => {
  beforeEach(() => {
    mockSession.facility = { tesis: { id: "t1" }, hesap: { id: "h1" }, liste: YENI_LISTE };
  });

  it("§2 alan sırası; boş seçenekli en çizilmez", async () => {
    render(<Orders />);
    await flush();
    fireEvent.press(screen.getByTestId("siparis-suzgec"));
    expect(alanlar()).toEqual(["t.siparisTarihi", "t.termin", "ana", "d.musteriAdi", "yon", "d.urunAdlari", "d.renkAdlari"]);
  });

  it("§3 termin \"Bu hafta\" + müşteri → aralik/secim; toplam aynı süzgeçle", async () => {
    render(<Orders />);
    await flush();
    fireEvent.press(screen.getByTestId("siparis-suzgec"));
    fireEvent.press(screen.getByTestId("siparis-suzgec-secici-alan-t.termin"));
    fireEvent.press(screen.getByTestId("siparis-suzgec-secici-t.termin-buHafta"));
    fireEvent.press(screen.getByTestId("siparis-suzgec-secici-alan-d.musteriAdi"));
    fireEvent.press(screen.getByTestId("siparis-suzgec-secici-d.musteriAdi-Örnek Tekstil"));
    fireEvent.press(screen.getByTestId("siparis-suzgec-secici-uygula"));
    await flush();
    expect(JSON.parse(String(sonListe().aralik))).toEqual({ termin: tarihAraligi("buHafta", factoryDayKey()) });
    expect(JSON.parse(String(sonListe().secim))).toEqual({ musteriAdi: ["Örnek Tekstil"] });
    expect(sonToplam().aralik).toBe(sonListe().aralik);
    expect(sonToplam().secim).toBe(sonListe().secim);
  });

  it("§4 şerit yalnız sipariş sayısı", async () => {
    render(<Orders />);
    await flush();
    expect(screen.getByTestId("siparis-toplam").props.accessibilityLabel).toBe("Toplam: 1.234 sipariş");
  });
});
