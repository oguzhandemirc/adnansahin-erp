// Sevkiyat › KART SEÇİMİ + SÜTUNLU TABLO (2026-11-17 kartlar; 2026-11-19 liste sola dayalı veri tablosu):
// §1 varsayılan: iki kart + dönem şeridi başlık alt satırında; tablo Sevk no · Tarih · Müşteri · Tür · Top · Metre · Durum;
// numara kırpılmaz; iptal rozeti kırmızı (tek kaynak `sevkiyat/durum`); eski "Satırda göster" alanları sütun seçicide KAPALI
// · §2 ek sütun telin kendi alanını biçimler (değer yoksa "—") ve `tablo.sevkiyat`a yazılır · §3 sıfır kart: başlık alt
// satırı HİÇ çizilmez (üstte boş bant kalmaz), tablo yerinde; "Tamamlanan sipariş" kartı açılınca fabrikanın sayısı.
import AsyncStorage from "@react-native-async-storage/async-storage";
import { act, fireEvent, render, screen, within } from "@testing-library/react-native";
import type React from "react";
import { StyleSheet } from "react-native";
import { sevkDurumu } from "../src/ui/sevkiyat/durum";
import { SEVKIYAT_SUTUNLARI, SEVK_LISTE_VARSAYILAN } from "../src/ui/sevkiyat/sutunlar";
import { sutunGenisligi, type TabloTercihi } from "../src/ui/tablo/model";

const { LIST_ID_FILTERS, LIST_SEARCH, LIST_SORT } = require("../src/api/wire") as typeof import("../src/api/wire");
const mockApi = { snapshot: jest.fn(), list: jest.fn(), record: jest.fn(), viewPref: jest.fn(), viewPrefSet: jest.fn() };
const mockCache = {
  load: jest.fn(async (_k: string, f: () => Promise<unknown>) => ({ data: await f(), offline: false, savedAt: "2026-11-17T09:00:00.000Z" })),
  peek: jest.fn(async () => null),
};
const mockSession = {
  api: mockApi, cache: mockCache, markOnline: jest.fn(), permissions: ["bulut:ozet:oku", "bulut:sevkiyat:oku"] as string[], offline: false, offlineSince: null,
  facility: {
    tesis: { id: "t1" }, hesap: { id: "h1" },
    liste: { kimlikSuzgecleri: LIST_ID_FILTERS, aranabilir: Object.keys(LIST_SEARCH), siralama: Object.fromEntries(Object.entries(LIST_SORT).map(([p, a]) => [p, Object.keys(a)])) },
  } as Record<string, unknown>,
  facilities: [], switchError: null, factoryStamp: "2026-11-17T08:55:00Z",
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
const V3 = "v3";
const SEVKLER = [
  { id: V1, surum: "x", kayit: { sevkNo: "SVK1811260034", musteriAdi: "Örnek Tekstil A.Ş.", durum: "DISPATCHED", yon: "EXPORT", toplamMetre: 1800, cikisTarihi: "2026-11-16T08:00:00Z", olusturulma: "2026-11-15T08:00:00Z", topSayisi: 15, cuvalSayisi: 3, toplamKg: 512.4, disFaturaNo: "FTR-1", faturalanma: "2026-11-16T10:00:00Z" } },
  // Eski/eksik satır: türev alanlar yok → değer uydurulmaz.
  { id: V2, surum: "x", kayit: { sevkNo: "SVK1811260033", musteriAdi: "Deneme Kumaş Ltd. Şti.", durum: "CANCELLED", toplamMetre: 0, cikisTarihi: "2026-11-15T08:00:00Z" } },
  { id: V3, surum: "x", kayit: { sevkNo: "SVK1811260032", musteriAdi: "Üçüncü Tekstil", durum: "PLANNED", yon: "DOMESTIC", toplamMetre: 434, topSayisi: 4, olusturulma: "2026-11-14T08:00:00Z" } },
];
const KARTLAR = ["kpi-sevk-metre", "kpi-sevk-top"];
const VARSAYILAN_BASLIK = ["Sevk no", "Tarih", "Müşteri", "Tür", "Top", "Metre", "Durum"];
const EK_SUTUN = ["kg", "cuval", "fatura", "faturaTarihi", "kayit", "iptal"];

async function flush() {
  for (let i = 0; i < 4; i++) await act(async () => undefined);
}
const pref = (deger: unknown) => mockApi.viewPref.mockResolvedValue({ anahtar: "tablo.sevkiyat", deger, guncelleme: null });
const isaretli = (id: string) => screen.getByTestId(id).props.accessibilityState?.checked;
const satir = (id: string) => within(screen.getByTestId(`sevk-satir-${id}`));
const rozetZemini = (id: string, label: string) => {
  const r = satir(id).getByLabelText(`Durum: ${label}`);
  return (StyleSheet.flatten(r.props.style) as { backgroundColor?: string }).backgroundColor;
};

beforeEach(async () => {
  await AsyncStorage.clear();
  for (const f of Object.values(mockApi)) f.mockReset();
  mockApi.snapshot.mockResolvedValue({ projeksiyon: "ozet.sevkiyat", veri: OZET, surum: "2026-11-17T08:55:00.000Z" });
  mockApi.list.mockResolvedValue({ kayitlar: SEVKLER, sonraki: null });
  mockApi.viewPrefSet.mockImplementation(async (anahtar: string, deger: unknown) => ({ anahtar, deger, guncelleme: "x" }));
  pref(null);
});

describe("§1 varsayılan görünüm", () => {
  it("iki kart + dönem şeridi; tablo sütunları sola dayalı ve tanım sırasıyla; ek sütunlar seçicide kapalı", async () => {
    render(<Shipments />);
    await flush();
    for (const id of KARTLAR) expect(screen.getByTestId(id)).toBeTruthy();
    expect(screen.queryByTestId("kpi-sevk-tamamlanan")).toBeNull();
    expect(screen.getByTestId("donem")).toBeTruthy();
    const baslik = within(screen.getByTestId("sevk-baslik"));
    for (const b of VARSAYILAN_BASLIK) expect(baslik.getByText(b)).toBeTruthy();
    for (const b of ["Kg", "Çuval", "Fatura", "Kayıt", "İptal"]) expect(baslik.queryByText(b)).toBeNull();
    // Eski "SON SEVKLER" bölüm başlığı ve "Satırda göster" düğmesi yok: sütun seçici araç satırında.
    expect(screen.queryByText("SON SEVKLER")).toBeNull();
    expect(screen.queryByTestId("sevk-alan-sec")).toBeNull();
    expect(screen.getByTestId("sevk-sutunlar")).toBeTruthy();
    fireEvent.press(screen.getByTestId("sevk-kart-sec"));
    expect(isaretli("sevk-kart-secici-tamamlanan")).toBe(false);
    expect(isaretli("sevk-kart-secici-metre")).toBe(true);
    fireEvent.press(screen.getByTestId("sevk-sutunlar"));
    for (const k of EK_SUTUN) expect(isaretli(`sevk-sutun-secici-${k}`)).toBe(false);
  });

  it("satır: tam sevk no · tarih · müşteri · tür · top · metre · durum; iptal rozeti kırmızı", async () => {
    render(<Shipments />);
    await flush();
    const s1 = satir(V1);
    for (const v of ["SVK1811260034", "16.11.2026", "Örnek Tekstil A.Ş.", "İhracat", "15", "1.800 m", "Sevk edildi"]) expect(s1.getByText(v)).toBeTruthy();
    // Numara kırpılmaz: No sütunu 13 haneli belge numarasını taşıyacak genişlikte (eski 84 pt satır "SVK1811…" kesiyordu).
    expect(sutunGenisligi(SEVKIYAT_SUTUNLARI.find((c) => c.key === "no")!.agirlik)).toBeGreaterThanOrEqual(120);
    // Çıkışı olmayan satırda tarih kayıt anından; top gelmezse "—".
    expect(satir(V3).getByText("14.11.2026")).toBeTruthy();
    expect(satir(V2).getAllByText("—").length).toBeGreaterThan(0);
    expect(sevkDurumu("CANCELLED").ton).toBe("danger");
    const iptal = rozetZemini(V2, "İptal");
    expect(iptal).toBeTruthy();
    expect(iptal).not.toBe(rozetZemini(V1, "Sevk edildi"));
    expect(iptal).not.toBe(rozetZemini(V3, "Onay bekliyor"));
  });
});

describe("§2 ek sütunlar", () => {
  it("seçilen sütunlar telin değeriyle; değer yoksa —; tercih tablo.sevkiyat'a yazılır", async () => {
    jest.useFakeTimers();
    try {
      pref({ surum: 1, sutunlar: ["no", "kg", "cuval", "fatura", "faturaTarihi"], siralama: null, suzgec: {} });
      render(<Shipments />);
      await flush();
      const s1 = satir(V1);
      for (const v of ["512", "3", "FTR-1", "16.11.2026"]) expect(s1.getByText(v)).toBeTruthy();
      expect(satir(V2).getAllByText("—").length).toBe(4);
      fireEvent.press(screen.getByTestId("sevk-sutunlar"));
      fireEvent.press(screen.getByTestId("sevk-sutun-secici-kayit"));
      await act(async () => {
        jest.advanceTimersByTime(1_000);
      });
      const son = mockApi.viewPrefSet.mock.calls.at(-1) as [string, TabloTercihi];
      expect(son[0]).toBe("tablo.sevkiyat");
      expect(son[1].sutunlar).toEqual(["no", "kg", "cuval", "fatura", "faturaTarihi", "kayit"]);
    } finally {
      jest.useRealTimers();
    }
  });
});

describe("§3 sıfır kart", () => {
  it("'-' saklıysa kart, dönem şeridi ve başlık alt satırı yok (üstte boş bant yok); tablo yerinde, düğme durur", async () => {
    pref({ surum: 1, sutunlar: ["no", "musteri"], siralama: null, suzgec: { kartlar: "-" } });
    render(<Shipments />);
    await flush();
    for (const id of KARTLAR) expect(screen.queryByTestId(id)).toBeNull();
    expect(screen.queryByTestId("donem")).toBeNull();
    expect(screen.queryByTestId("baslik-alt-satiri")).toBeNull();
    expect(screen.getByTestId(`sevk-satir-${V1}`)).toBeTruthy();
    expect(screen.getByTestId("sevk-kart-sec")).toBeTruthy();
  });

  it("hepsini kapatmak '-' yazar, sütunlar korunur; yalnız 'Tamamlanan sipariş'i açmak fabrikanın sayısını gösterir", async () => {
    jest.useFakeTimers();
    try {
      render(<Shipments />);
      await flush();
      fireEvent.press(screen.getByTestId("sevk-kart-sec"));
      for (const k of ["metre", "top"]) fireEvent.press(screen.getByTestId(`sevk-kart-secici-${k}`));
      await act(async () => {
        jest.advanceTimersByTime(1_000);
      });
      const son = mockApi.viewPrefSet.mock.calls.at(-1) as [string, TabloTercihi];
      expect(son[1].suzgec).toEqual({ kartlar: "-" });
      expect(son[1].sutunlar).toEqual([...SEVK_LISTE_VARSAYILAN]);
      expect(screen.queryByTestId("baslik-alt-satiri")).toBeNull();
      fireEvent.press(screen.getByTestId("sevk-kart-secici-tamamlanan"));
      await flush();
      expect(screen.queryByTestId("kpi-sevk-metre")).toBeNull();
      expect(within(screen.getByTestId("kpi-sevk-tamamlanan")).getAllByText("6").length).toBeGreaterThan(0);
    } finally {
      jest.useRealTimers();
    }
  });
});
