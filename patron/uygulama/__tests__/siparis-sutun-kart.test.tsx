// Siparişler › EK SÜTUN + KART SEÇİMİ (2026-11-17, kullanıcı: "koyabildiğin her şeyi koy, biz eleriz"):
// §1 varsayılan görünüm değişmedi (sütunlar + 3 özet kartı); yeni sütun/kartlar seçicide KAPALI · §2 ek sütunlar telin
// kendi alanını biçimler (hesap yok; sevk brüt fabrika sayısı) · §3 sıfır kart: "-" hiç kart çizdirmez, seçiciden hepsini
// kapatmak "-" yazar ve sütun seçimini korur; "en çok açık" bloğu açılınca fabrikanın listesi · §4 ayrıntı: varsayılan
// önceki ekran, ek kart/satır KAPALI; seçim cihazda saklanır, hepsi kapatılabilir.
import AsyncStorage from "@react-native-async-storage/async-storage";
import { act, fireEvent, render, screen, within } from "@testing-library/react-native";
import type { ReactElement } from "react";
import { StyleSheet } from "react-native";
import type { TabloTercihi } from "../src/ui/tablo/model";

const mockList = jest.fn();
const mockRecord = jest.fn();
const mockSnapshot = jest.fn();
const mockViewPref = jest.fn();
const mockViewPrefSet = jest.fn();
const mockCache = { load: jest.fn(async (_k: string, f: () => Promise<unknown>) => ({ data: await f(), offline: false, savedAt: "" })), peek: jest.fn(async () => null) };
const mockSession = {
  api: { list: mockList, record: mockRecord, snapshot: mockSnapshot, viewPref: mockViewPref, viewPrefSet: mockViewPrefSet },
  cache: mockCache, markOnline: jest.fn(),
  permissions: ["bulut:oturum", "bulut:siparis:oku", "bulut:ozet:oku"] as string[], offline: false, offlineSince: null as string | null, facility: null as unknown, switchError: null as string | null,
};
const mockRouter = { push: jest.fn(), replace: jest.fn(), back: jest.fn(), navigate: jest.fn(), canGoBack: () => true };
jest.mock("../src/state/session", () => ({ useSession: () => mockSession }));
jest.mock("expo-router", () => ({ useRouter: () => mockRouter, usePathname: () => "/siparisler", useLocalSearchParams: () => ({ id: "11111111-1111-4111-8111-111111111111" }) }));
jest.mock("react-native-safe-area-context", () => ({ useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }) }));

const Orders = (require("../app/(app)/(tabs)/siparisler/index") as { default: () => ReactElement }).default;
const OrderDetail = (require("../app/(app)/siparisler/[id]") as { default: () => ReactElement }).default;
const { LIST_ID_FILTERS, LIST_SEARCH, LIST_SORT } = require("../src/api/wire") as typeof import("../src/api/wire");

const ID1 = "11111111-1111-4111-8111-111111111111";
const SIP = {
  siparisNo: "SIP-2026-0451", musteriAdi: "Örnek Tekstil A.Ş.", durum: "PARTIAL_SHIPPED", yon: "DOMESTIC",
  siparisTarihi: "2026-11-02", termin: "2026-11-30", acikMiktar: 1250, sevkMiktari: 3750, toplamMiktar: 5000, kalemSayisi: 3,
  tamamlanma: null, iptalTarihi: null, olusturulma: "2026-11-02T07:30:00Z", uretim: { tur: "KURSUN", metin: "Kurşunda" },
};
const OZET = { acikKalem: 24, acikMiktar: 52300, karsilanmaYuzde: 61.5, karsilanmayanMiktar: 20130, enCokCari: [{ etiket: "Örnek Tekstil A.Ş.", miktar: 18400 }] };
const FACILITY = {
  tesis: { id: "t1" }, hesap: { id: "h1" },
  liste: { kimlikSuzgecleri: LIST_ID_FILTERS, aranabilir: Object.keys(LIST_SEARCH), siralama: Object.fromEntries(Object.entries(LIST_SORT).map(([p, a]) => [p, Object.keys(a)])) },
};
const VARSAYILAN_BASLIK = ["No", "Müşteri", "Sevk / Toplam", "Üretim", "Durum"];
const EK_SUTUN = ["acik", "sevk", "toplam", "termin", "tamam", "iptal", "kayit"];

async function settle() {
  for (let i = 0; i < 4; i++) await act(async () => undefined);
}
const pref = (deger: unknown) => mockViewPref.mockResolvedValue({ anahtar: "tablo.siparis", deger, guncelleme: null });
const isaretli = (id: string) => screen.getByTestId(id).props.accessibilityState?.checked;

beforeEach(async () => {
  await AsyncStorage.clear();
  mockSession.facility = FACILITY;
  for (const f of [mockList, mockRecord, mockSnapshot, mockViewPref, mockViewPrefSet]) f.mockReset();
  mockList.mockImplementation(async (p: string) => (p === "siparis" ? { kayitlar: [{ id: ID1, kayit: SIP, surum: "x" }], sonraki: null } : { kayitlar: [], sonraki: null }));
  mockSnapshot.mockResolvedValue({ projeksiyon: "ozet.siparis", veri: OZET, surum: "x" });
  mockRecord.mockResolvedValue({ id: ID1, kayit: SIP, surum: "2026-11-17T08:00:00.000Z" });
  mockViewPrefSet.mockImplementation(async (anahtar: string, deger: unknown) => ({ anahtar, deger, guncelleme: "x" }));
  pref(null);
});

describe("§1 varsayılan görünüm değişmedi", () => {
  it("tercih yokken bugünkü 5 sütun ve 3 özet kartı; yeni sütun ve kartlar seçicide kapalı", async () => {
    render(<Orders />);
    await settle();
    for (const b of VARSAYILAN_BASLIK) expect(screen.getAllByText(b).length).toBeGreaterThan(0);
    for (const k of ["acik", "miktar", "karsilanma"]) expect(screen.getByTestId(`siparis-ozet-${k}`)).toBeTruthy();
    expect(screen.queryByTestId("siparis-ozet-karsilanmayan")).toBeNull();
    expect(screen.queryByTestId("siparis-en-cok-cari")).toBeNull();
    fireEvent.press(screen.getByTestId("siparis-sutunlar"));
    for (const k of EK_SUTUN) expect(isaretli(`siparis-sutun-secici-${k}`)).toBe(false);
    fireEvent.press(screen.getByTestId("siparis-kart-sec"));
    expect(isaretli("siparis-kart-secici-karsilanmayan")).toBe(false);
    expect(isaretli("siparis-kart-secici-enCokCari")).toBe(false);
    expect(isaretli("siparis-kart-secici-acik")).toBe(true);
  });
});

describe("§2 ek sütunlar telin alanını biçimler", () => {
  it("açık · sevk (brüt) · toplam · termin · kayıt tarihi; boş tarih —", async () => {
    pref({ surum: 1, sutunlar: ["no", ...EK_SUTUN], siralama: null, suzgec: {} });
    render(<Orders />);
    await settle();
    const satir = within(screen.getByTestId(`siparis-satir-${ID1}`));
    for (const v of ["1.250", "3.750", "5.000", "30.11.2026", "02.11.2026"]) expect(satir.getByText(v)).toBeTruthy();
    expect(satir.getAllByText("—").length).toBe(2); // tamamlanma + iptal yok
  });

  it("negatif sonda: alan gelmezse sayı uydurulmaz (—)", async () => {
    pref({ surum: 1, sutunlar: ["no", "acik", "toplam"], siralama: null, suzgec: {} });
    mockList.mockResolvedValue({ kayitlar: [{ id: ID1, kayit: { siparisNo: "SIP-1", sevkMiktari: 10 }, surum: "x" }], sonraki: null });
    render(<Orders />);
    await settle();
    expect(within(screen.getByTestId(`siparis-satir-${ID1}`)).getAllByText("—").length).toBe(2);
  });
});

describe("§3 sıfır kart", () => {
  it("'-' saklıysa özet şeridi çizilmez; kart düğmesi durur", async () => {
    pref({ surum: 1, sutunlar: ["no", "musteri"], siralama: null, suzgec: { kartlar: "-" } });
    render(<Orders />);
    await settle();
    expect(screen.queryByTestId("siparis-ozet")).toBeNull();
    expect(screen.getByTestId("siparis-kart-sec")).toBeTruthy();
  });

  it("seçiciden hepsini kapatmak '-' yazar, sütunlar korunur; 'en çok açık' açılınca fabrikanın listesi", async () => {
    jest.useFakeTimers();
    try {
      pref({ surum: 1, sutunlar: ["no", "durum"], siralama: null, suzgec: {} });
      render(<Orders />);
      await settle();
      fireEvent.press(screen.getByTestId("siparis-kart-sec"));
      for (const k of ["acik", "miktar", "karsilanma"]) fireEvent.press(screen.getByTestId(`siparis-kart-secici-${k}`));
      await act(async () => {
        jest.advanceTimersByTime(1_000);
      });
      const son = mockViewPrefSet.mock.calls.at(-1) as [string, TabloTercihi];
      expect(son[0]).toBe("tablo.siparis");
      expect(son[1].suzgec).toEqual({ kartlar: "-" });
      expect(son[1].sutunlar).toEqual(["no", "durum"]);
      expect(screen.queryByTestId("siparis-ozet")).toBeNull();
      fireEvent.press(screen.getByTestId("siparis-kart-secici-enCokCari"));
      const blok = within(screen.getByTestId("siparis-en-cok-cari"));
      expect(blok.getByText("18.400 m")).toBeTruthy();
    } finally {
      jest.useRealTimers();
    }
  });
});

describe("§4 sipariş ayrıntısı", () => {
  it("varsayılan: açık miktar kartı + önceki bilgi satırları; ek kart/satır yok", async () => {
    render(<OrderDetail />);
    await settle();
    expect(screen.getByTestId("siparis-acik")).toBeTruthy();
    for (const b of ["sevk", "tarih", "yon", "uretim"]) expect(screen.getByTestId(`bilgi-${b}`)).toBeTruthy();
    for (const id of ["siparis-kart-sevk", "siparis-kart-toplam", "siparis-kart-kalem", "bilgi-kayit"]) expect(screen.queryByTestId(id)).toBeNull();
    fireEvent.press(screen.getByTestId("siparis-ayrinti-sec"));
    for (const k of ["kartSevk", "kartToplam", "kartKalem", "kayit"]) expect(isaretli(`siparis-ayrinti-secici-${k}`)).toBe(false);
  });

  it("ek kart/satır açılır ve cihazda saklanır (yeniden açılışta yerinde); hepsi kapatılabilir", async () => {
    const ilk = render(<OrderDetail />);
    await settle();
    fireEvent.press(screen.getByTestId("siparis-ayrinti-sec"));
    fireEvent.press(screen.getByTestId("siparis-ayrinti-secici-kartSevk"));
    fireEvent.press(screen.getByTestId("siparis-ayrinti-secici-kayit"));
    await settle();
    expect(screen.getByText("3.750")).toBeTruthy();
    expect(screen.getByTestId("bilgi-kayit")).toBeTruthy();
    ilk.unmount();
    render(<OrderDetail />);
    await settle();
    expect(screen.getByTestId("siparis-kart-sevk")).toBeTruthy();
    expect(screen.getByTestId("bilgi-kayit")).toBeTruthy();
    expect(mockViewPrefSet).not.toHaveBeenCalled(); // bulut tercih anahtarına yazılmaz
    fireEvent.press(screen.getByTestId("siparis-ayrinti-sec"));
    for (const k of ["kartAcik", "kartSevk", "sube", "sevk", "tarih", "termin", "yon", "uretim", "doviz", "tamam", "iptal", "kayit"]) {
      const id = `siparis-ayrinti-secici-${k}`;
      if (isaretli(id)) fireEvent.press(screen.getByTestId(id));
    }
    await settle();
    expect(screen.queryByTestId("siparis-acik")).toBeNull();
    expect(screen.queryByTestId("siparis-bilgiler")).toBeNull();
    expect(screen.getByTestId("siparis-baslik")).toBeTruthy();
  });
});

// §5 (2026-11-18, cihazda görüldü): özet sonradan gelince alt satır ilk ölçümde boştur (0); eskiden kap `height: 0` +
// `overflow: hidden`a kilitleniyor, seçili kartlar o sıfır kutuda kalıyordu. Kart ağaçta olmak yetmez: hiçbir atası
// sıfır yüksekliğe kıstırılmamalı.
describe("§5 seçili kart gerçekten görünür", () => {
  const kistirilmis = (id: string): boolean => {
    type Dugum = { readonly props: { readonly style?: unknown }; readonly parent: Dugum | null };
    let n: Dugum | null = screen.getByTestId(id) as unknown as Dugum;
    while (n) {
      const st = StyleSheet.flatten(n.props.style as never) as { height?: number } | undefined;
      if (st?.height === 0) return true;
      n = n.parent;
    }
    return false;
  };

  it("özet geç gelir, alt satır önce 0 ölçülür: seçili kartlar yine sıfır kutuda kalmaz; seçilmeyen çizilmez", async () => {
    pref({ surum: 1, sutunlar: ["no", "musteri"], siralama: null, suzgec: { kartlar: "acik,enCokCari" } });
    let ozetVer: (v: unknown) => void = () => undefined;
    mockSnapshot.mockImplementation(() => new Promise((r) => { ozetVer = r; }));
    render(<Orders />);
    await settle();
    expect(screen.queryByTestId("siparis-ozet")).toBeNull();
    fireEvent(screen.getByTestId("baslik-alt-satiri-icerik"), "layout", { nativeEvent: { layout: { x: 0, y: 0, width: 600, height: 0 } } });
    await act(async () => ozetVer({ projeksiyon: "ozet.siparis", veri: OZET, surum: "x" }));
    await settle();
    expect(screen.getByTestId("siparis-ozet-acik")).toBeTruthy();
    expect(screen.getByTestId("siparis-en-cok-cari")).toBeTruthy();
    expect(kistirilmis("siparis-ozet-acik")).toBe(false);
    expect(kistirilmis("siparis-en-cok-cari")).toBe(false);
    expect(screen.queryByTestId("siparis-ozet-miktar")).toBeNull();
    expect(screen.queryByTestId("siparis-ozet-karsilanmayan")).toBeNull();
  });
});

