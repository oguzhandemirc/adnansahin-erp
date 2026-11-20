// Sevkiyat › GENİŞ SÜZGEÇ + ALT ŞERİT (2026-11-20): bulutun değer süzgeci (`?secim=`), tarih aralığı (`?aralik=`) ve
// toplam ucu (`/liste/sevkiyat/toplam`). §1 eski bulut (beyan yok) → tarih/kumaş alanı ve şerit ÇİZİLMEZ, istek yeni
// parametre taşımaz, seçenek/toplam ucu çağrılmaz · §2 yeni bulut + eski fabrika (seçenek boş) → kumaş alanı yok, tarih
// alanı var · §3 kumaş çoklu seçimi `secim` JSON'u, "Bu ay" `aralik` fabrika günleriyle; toplam ucu aynı süzgeçle ·
// §4 şerit "Toplam/Süzülen N sevkiyat · X top · Y m" · §5 `genisSuzgec` saf: dönemler, gün okuma, sorgu çevirisi.
// NEGATİF SONDA (2026-11-20, koşuldu, ısırdı): `genisSorgu`da `secim` dalı kaldırılınca §3a; `listCapability.valueFilters`
// beyansızken tanımı döndürünce §1; `ListeToplamSatiri` `suzulmus` yerine hep "Toplam" yazınca §4b kırmızı.
import AsyncStorage from "@react-native-async-storage/async-storage";
import { act, fireEvent, render, screen } from "@testing-library/react-native";
import type React from "react";
import { factoryDayKey } from "../src/lib/factory-time";
import { aralikYaz, genisSorgu, gunOku, tarihAraligi, tarihOzeti, tarihSecimiGecerli, degerGrubu, tarihGrubu } from "../src/ui/tablo/genisSuzgec";
import { listeToplamMetni } from "../src/ui/tablo/ListeToplamSatiri";

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
  api: mockApi, cache: mockCache, markOnline: jest.fn(), permissions: ["bulut:ozet:oku", "bulut:sevkiyat:oku"] as string[], offline: false, offlineSince: null,
  facility: { tesis: { id: "t1" }, hesap: { id: "h1" }, liste: ESKI_LISTE } as Record<string, unknown>,
  facilities: [], switchError: null, factoryStamp: "2026-11-20T08:55:00Z",
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
const SEVKLER = [
  { id: "v1", surum: "x", kayit: { sevkNo: "SVK1", musteriAdi: "Örnek Tekstil", durum: "DISPATCHED", toplamMetre: 1800, topSayisi: 15, cikisTarihi: "2026-11-16T08:00:00Z" } },
];
const SECENEK = { alanlar: { musteriAdi: { degerler: ["Örnek Tekstil"], kesildi: false }, urunAdlari: { degerler: ["KREP", "PANOS"], kesildi: false }, renkAdlari: { degerler: [], kesildi: false } } };
const BOS_SECENEK = { alanlar: Object.fromEntries(LIST_VALUE_FILTERS.sevkiyat!.map((f) => [f.alan, { degerler: [], kesildi: false }])) };

async function flush() {
  for (let i = 0; i < 5; i++) await act(async () => undefined);
}
const sonListe = () => mockApi.list.mock.calls[mockApi.list.mock.calls.length - 1]![1] as Record<string, unknown>;
const sonToplam = () => mockApi.listTotals.mock.calls[mockApi.listTotals.mock.calls.length - 1]![1] as Record<string, unknown>;

beforeEach(async () => {
  await AsyncStorage.clear();
  for (const f of Object.values(mockApi)) f.mockReset();
  mockSession.facility = { tesis: { id: "t1" }, hesap: { id: "h1" }, liste: ESKI_LISTE };
  mockApi.snapshot.mockResolvedValue({ projeksiyon: "ozet.sevkiyat", veri: OZET, surum: "2026-11-20T08:55:00.000Z" });
  mockApi.list.mockResolvedValue({ kayitlar: SEVKLER, sonraki: null });
  mockApi.viewPref.mockResolvedValue({ anahtar: "tablo.sevkiyat", deger: null, guncelleme: null });
  mockApi.viewPrefSet.mockImplementation(async (anahtar: string, deger: unknown) => ({ anahtar, deger, guncelleme: "x" }));
  mockApi.listOptions.mockResolvedValue(SECENEK);
  mockApi.listTotals.mockResolvedValue({ adet: 586, toplamlar: { topSayisi: "12340", toplamMetre: "456789.5" } });
});

describe("§1 eski bulut (beyan yok)", () => {
  it("tarih/kumaş alanı ve şerit çizilmez; istek secim/aralik taşımaz; seçenek ve toplam ucu çağrılmaz", async () => {
    render(<Shipments />);
    await flush();
    expect(mockApi.list).toHaveBeenCalled();
    expect(sonListe()).not.toHaveProperty("secim", expect.anything());
    expect(sonListe()).not.toHaveProperty("aralik", expect.anything());
    expect(mockApi.listOptions).not.toHaveBeenCalled();
    expect(mockApi.listTotals).not.toHaveBeenCalled();
    expect(screen.queryByTestId("sevk-toplam")).toBeNull();
    fireEvent.press(screen.getByTestId("sevk-suzgec"));
    expect(screen.queryByTestId("sevk-suzgec-secici-alan-t.cikisTarihi")).toBeNull();
    expect(screen.queryByTestId("sevk-suzgec-secici-alan-d.urunAdlari")).toBeNull();
    // Eski ipucu.
    expect(screen.getByPlaceholderText("Sevk no ya da müşteri")).toBeTruthy();
  });
});

describe("§2 yeni bulut + eski fabrika (seçenekler boş)", () => {
  it("değer alanları çizilmez; tarih alanı ve şerit var", async () => {
    mockSession.facility = { tesis: { id: "t1" }, hesap: { id: "h1" }, liste: YENI_LISTE };
    mockApi.listOptions.mockResolvedValue(BOS_SECENEK);
    render(<Shipments />);
    await flush();
    expect(mockApi.listOptions).toHaveBeenCalledWith("sevkiyat");
    fireEvent.press(screen.getByTestId("sevk-suzgec"));
    expect(screen.getByTestId("sevk-suzgec-secici-alan-t.cikisTarihi")).toBeTruthy();
    for (const f of LIST_VALUE_FILTERS.sevkiyat!) expect(screen.queryByTestId(`sevk-suzgec-secici-alan-d.${f.alan}`)).toBeNull();
    expect(screen.getByTestId("sevk-toplam")).toBeTruthy();
  });
});

describe("§3 seçim doğru parametreyle gider", () => {
  beforeEach(() => {
    mockSession.facility = { tesis: { id: "t1" }, hesap: { id: "h1" }, liste: YENI_LISTE };
  });

  it("§3a kumaş çoklu seçimi → secim JSON; boş seçenekli renk alanı yok; toplam aynı süzgeçle", async () => {
    render(<Shipments />);
    await flush();
    expect(screen.getByPlaceholderText("Sevk no, müşteri, parti ya da sipariş no")).toBeTruthy();
    fireEvent.press(screen.getByTestId("sevk-suzgec"));
    expect(screen.queryByTestId("sevk-suzgec-secici-alan-d.renkAdlari")).toBeNull();
    fireEvent.press(screen.getByTestId("sevk-suzgec-secici-alan-d.urunAdlari"));
    fireEvent.press(screen.getByTestId("sevk-suzgec-secici-d.urunAdlari-PANOS"));
    fireEvent.press(screen.getByTestId("sevk-suzgec-secici-d.urunAdlari-KREP"));
    fireEvent.press(screen.getByTestId("sevk-suzgec-secici-uygula"));
    await flush();
    const secim = JSON.parse(String(sonListe().secim)) as Record<string, string[]>;
    expect(Object.keys(secim)).toEqual(["urunAdlari"]);
    expect([...secim.urunAdlari!].sort()).toEqual(["KREP", "PANOS"]);
    expect(sonListe().aralik).toBeUndefined();
    expect(sonToplam().secim).toBe(sonListe().secim);
    expect(sonToplam()).not.toHaveProperty("sirala", expect.anything());
  });

  it("§3b \"Bu ay\" → aralik [ayın 1'i, bugün] fabrika günüyle", async () => {
    render(<Shipments />);
    await flush();
    fireEvent.press(screen.getByTestId("sevk-suzgec"));
    fireEvent.press(screen.getByTestId("sevk-suzgec-secici-alan-t.cikisTarihi"));
    fireEvent.press(screen.getByTestId("sevk-suzgec-secici-t.cikisTarihi-buAy"));
    expect(screen.getByTestId("sevk-suzgec-secici-alan-t.cikisTarihi-ozet")).toHaveTextContent("Bu ay");
    fireEvent.press(screen.getByTestId("sevk-suzgec-secici-uygula"));
    await flush();
    const bugun = factoryDayKey();
    expect(JSON.parse(String(sonListe().aralik))).toEqual({ cikisTarihi: [`${bugun.slice(0, 8)}01`, bugun] });
    expect(sonListe().secim).toBeUndefined();
  });

  it("§3c elle aralık; bozuk gün hata verir, seçim yazılmaz", async () => {
    render(<Shipments />);
    await flush();
    fireEvent.press(screen.getByTestId("sevk-suzgec"));
    fireEvent.press(screen.getByTestId("sevk-suzgec-secici-alan-t.cikisTarihi"));
    fireEvent.changeText(screen.getByTestId("sevk-suzgec-secici-t.cikisTarihi-bas"), "30.02.2026");
    fireEvent.press(screen.getByTestId("sevk-suzgec-secici-t.cikisTarihi-aralik"));
    expect(screen.getByTestId("sevk-suzgec-secici-t.cikisTarihi-hata")).toBeTruthy();
    fireEvent.changeText(screen.getByTestId("sevk-suzgec-secici-t.cikisTarihi-bas"), "01.11.2026");
    fireEvent.changeText(screen.getByTestId("sevk-suzgec-secici-t.cikisTarihi-son"), "15.11.2026");
    fireEvent.press(screen.getByTestId("sevk-suzgec-secici-t.cikisTarihi-aralik"));
    fireEvent.press(screen.getByTestId("sevk-suzgec-secici-uygula"));
    await flush();
    expect(JSON.parse(String(sonListe().aralik))).toEqual({ cikisTarihi: ["2026-11-01", "2026-11-15"] });
  });
});

describe("§4 alt şerit", () => {
  it("§4a süzgeçsiz \"Toplam 586 sevkiyat · 12.340 top · 456.790 m\"", async () => {
    mockSession.facility = { tesis: { id: "t1" }, hesap: { id: "h1" }, liste: YENI_LISTE };
    render(<Shipments />);
    await flush();
    const s = screen.getByTestId("sevk-toplam");
    expect(s.props.accessibilityLabel).toMatch(/^Toplam: 586 sevkiyat · 12\.340 top · 456\.790 m$/);
  });

  it("§4b süzgeç etkinken \"Süzülen\"", async () => {
    mockSession.facility = { tesis: { id: "t1" }, hesap: { id: "h1" }, liste: YENI_LISTE };
    render(<Shipments />);
    await flush();
    fireEvent.press(screen.getByTestId("sevk-suzgec"));
    fireEvent.press(screen.getByTestId("sevk-suzgec-secici-alan-t.cikisTarihi"));
    fireEvent.press(screen.getByTestId("sevk-suzgec-secici-t.cikisTarihi-bugun"));
    mockApi.listTotals.mockResolvedValue({ adet: 3, toplamlar: { topSayisi: "40", toplamMetre: null } });
    fireEvent.press(screen.getByTestId("sevk-suzgec-secici-uygula"));
    await flush();
    expect(screen.getByTestId("sevk-toplam").props.accessibilityLabel).toBe("Süzülen: 3 sevkiyat · 40 top");
  });

  it("§4c saf metin: beyanda olmayan ya da boş toplam yazılmaz", () => {
    expect(listeToplamMetni({ adet: 2, toplamlar: {} }, "sipariş", {})).toBe("2 sipariş");
    expect(listeToplamMetni({ adet: 0, toplamlar: { topSayisi: null } }, "sevkiyat", { topSayisi: "top" })).toBe("0 sevkiyat");
  });
});

describe("§5 genisSuzgec saf", () => {
  it("dönemler: hafta pazartesi başlar, geçen ay ocakta önceki yılın aralığı", () => {
    // 2026-11-20 cuma → pazartesi 16'sı.
    expect(tarihAraligi("buHafta", "2026-11-20")).toEqual(["2026-11-16", "2026-11-20"]);
    expect(tarihAraligi("buHafta", "2026-11-16")).toEqual(["2026-11-16", "2026-11-16"]);
    // Pazar → önceki pazartesi.
    expect(tarihAraligi("buHafta", "2026-11-22")).toEqual(["2026-11-16", "2026-11-22"]);
    expect(tarihAraligi("gecenAy", "2026-01-10")).toEqual(["2025-12-01", "2025-12-31"]);
    expect(tarihAraligi("gecenAy", "2026-03-31")).toEqual(["2026-02-01", "2026-02-28"]);
    expect(tarihAraligi("buAy", "2026-11-20")).toEqual(["2026-11-01", "2026-11-20"]);
    expect(tarihAraligi("bugun", "2026-11-20")).toEqual(["2026-11-20", "2026-11-20"]);
    expect(tarihAraligi("..2026-11-05", "2026-11-20")).toEqual([null, "2026-11-05"]);
    expect(tarihAraligi("bilinmeyen", "2026-11-20")).toBeNull();
  });

  it("gün okuma ve aralık: takvimde olmayan gün, ters aralık, iki boş uç reddedilir", () => {
    expect(gunOku("30.02.2026")).toBeUndefined();
    expect(gunOku("1.3.26")).toBe("2026-03-01");
    expect(gunOku("05/11/2026")).toBe("2026-11-05");
    expect(gunOku("  ")).toBeNull();
    expect(gunOku("2026-11-05")).toBeUndefined();
    expect(aralikYaz("2026-11-10", "2026-11-01")).toBeNull();
    expect(aralikYaz(null, null)).toBeNull();
    expect(tarihSecimiGecerli("2026-11-10..2026-11-01")).toBe(false);
    expect(tarihOzeti("2026-11-01..")).toBe("01.11.2026 ve sonrası");
  });

  it("sorgu: seçenekte olmayan değer gönderilmez; grup yoksa parametre yok; en sayıca sıralı", () => {
    const urun = degerGrubu(LIST_VALUE_FILTERS.sevkiyat![1]!, ["PANOS", "KREP"]);
    const en = degerGrubu(LIST_VALUE_FILTERS.sevkiyat![3]!, ["180", "90.5", "150"]);
    expect(en.secenekler.map((o) => o.deger)).toEqual(["90.5", "150", "180"]);
    expect(en.secenekler[0]!.etiket).toBe("90,5 cm");
    const tarih = tarihGrubu(LIST_DATE_RANGES.sevkiyat![0]!);
    const t = { surum: 1 as const, sutunlar: [], siralama: null, suzgec: { "d.urunAdlari": "PANOS\nESKİ", "t.cikisTarihi": "bugun" } };
    expect(genisSorgu(t, [urun, tarih], "2026-11-20")).toEqual({
      secim: JSON.stringify({ urunAdlari: ["PANOS"] }),
      aralik: JSON.stringify({ cikisTarihi: ["2026-11-20", "2026-11-20"] }),
    });
    expect(genisSorgu(t, [], "2026-11-20")).toEqual({});
  });
});
