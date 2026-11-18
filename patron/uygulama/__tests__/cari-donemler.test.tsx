// Cari özeti hazır dönemleri ve ek alanlar (fabrika 2.13.1 + bulut `uretimGunu`/`donemler`): §1 saf — veride olan dönemler,
// aralık metni, ek satırlar · §2 ekran — 8 dönem açılır seçimle, olmayan dönem seçenek değil, aralık küçük yazıyla, kısa
// dönemde "en çok alınan" yerine tek satır (Son 12 ay'a geçirir), ürün tablosunda Son sipariş sütunu · NEGATİF: eski
// fabrika (iki dönem, yeni alan yok) bugünkü bölmeli seçim, ek satır ve Son sipariş sütunu YOK.
import { act, fireEvent, render, screen, within } from "@testing-library/react-native";
import type { ReactElement } from "react";

const mockList = jest.fn();
const mockRecord = jest.fn();
const mockSummary = jest.fn();
const mockCache = { load: jest.fn(async (_k: string, f: () => Promise<unknown>) => ({ data: await f(), offline: false, savedAt: "" })), peek: jest.fn(async () => null) };
const mockSession = {
  api: { list: mockList, record: mockRecord, snapshot: jest.fn(), customerSummary: mockSummary, viewPref: jest.fn(async () => null) },
  cache: mockCache, markOnline: jest.fn(),
  permissions: ["bulut:oturum", "bulut:siparis:oku", "bulut:cari:oku"] as string[], offline: false, offlineSince: null as string | null, facility: null as unknown,
  switchError: null as string | null, factoryStamp: "2026-11-18T21:10:00.000Z" as string | null,
};
jest.mock("../src/state/session", () => ({ useSession: () => mockSession }));
jest.mock("expo-router", () => ({
  useRouter: () => ({ push: jest.fn(), replace: jest.fn(), back: jest.fn(), navigate: jest.fn(), canGoBack: () => true }),
  usePathname: () => "/cariler",
  useLocalSearchParams: () => ({ id: "0b7c5a1e-4f2d-4c8e-9a51-3d6f2e8b1c40" }),
}));
jest.mock("react-native-safe-area-context", () => ({ useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }) }));

const CustomerDetail = (require("../app/(app)/cariler/[id]") as { default: () => ReactElement }).default;
const O = require("../src/ui/cari/OzetBolumleri") as typeof import("../src/ui/cari/OzetBolumleri");
const { LIST_ID_FILTERS, LIST_SEARCH } = require("../src/api/wire") as typeof import("../src/api/wire");
type Yanit = import("../src/api/wire").CustomerSummaryResponse;

const ID = "0b7c5a1e-4f2d-4c8e-9a51-3d6f2e8b1c40";
const sayilar = (n: number) => ({ siparisSayisi: n, kalemSayisi: n, siparisMiktari: [], sevk: { metre: 0, top: 0, kg: 0, tartiliCuval: 0, cuval: 0 }, iade: { adet: 0, metre: 0 } });
const URUN = { urunId: "u1", urunAdi: "PANOS", renkId: "r1", renkAdi: "03-KREM", birim: "MT", miktar: 15500, siparisSayisi: 9 };
const ESKI: Yanit = {
  cariKartId: ID, son12AyBaslangic: null, surum: "2026-11-18T21:10:00.000Z",
  ozet: { tumZamanlar: { ...sayilar(48), enCokUrun: [URUN] }, son12Ay: { ...sayilar(20), enCokUrun: [URUN] }, acik: { siparisSayisi: 1, kalemSayisi: 1, acikMiktar: [] }, sonSiparisTarihi: null, sonSevkTarihi: null },
};
const YENI: Yanit = {
  ...ESKI,
  uretimGunu: "2026-11-19",
  donemler: {
    tumZamanlar: { baslangic: null, bitis: null },
    son12Ay: { baslangic: "2025-11-18T21:00:00.000Z", bitis: null },
    buAy: { baslangic: "2026-10-31T21:00:00.000Z", bitis: null },
    gecenAy: { baslangic: "2026-09-30T21:00:00.000Z", bitis: "2026-10-31T20:59:59.999Z" },
    buYil: { baslangic: "2025-12-31T21:00:00.000Z", bitis: null },
  },
  ozet: {
    ...ESKI.ozet!,
    tumZamanlar: { ...sayilar(48), enCokUrun: [{ ...URUN, sonSiparisTarihi: "2026-11-10T09:00:00.000Z" }] },
    // son3Ay/son6Ay/gecenYil YOK → seçenek olarak çıkmaz.
    buAy: sayilar(3), gecenAy: sayilar(5), buYil: sayilar(31),
    acik: { siparisSayisi: 1, kalemSayisi: 1, acikMiktar: [], enEskiSiparisTarihi: "2026-09-12T09:00:00.000Z", enEskiSiparisYasGun: 68 },
    depodakiMal: { depodaTop: 12, depodaMetre: 486.5, cuvaldaTop: 3, cuvaldaMetre: 141.25 },
  },
};

async function settle() {
  for (let i = 0; i < 3; i++) await act(async () => undefined);
}

beforeEach(() => {
  mockSession.facility = { liste: { kimlikSuzgecleri: LIST_ID_FILTERS, aranabilir: Object.keys(LIST_SEARCH) } };
  mockRecord.mockResolvedValue({ id: ID, kayit: { ad: "SMHTEX TEKSTİL", musteriRolu: true }, surum: "2026-11-15T21:09:00.000Z" });
  mockList.mockResolvedValue({ kayitlar: [], sonraki: null });
  mockSummary.mockResolvedValue(YENI);
});

describe("§1 saf", () => {
  it("yalnız veride olan dönemler, sırası sabit; seçim veride yoksa tüm zamanlar", () => {
    expect(O.mevcutDonemler(YENI.ozet!).map((d) => d.key)).toEqual(["tumZamanlar", "son12Ay", "buAy", "gecenAy", "buYil"]);
    expect(O.mevcutDonemler(ESKI.ozet!).map((d) => d.key)).toEqual(["tumZamanlar", "son12Ay"]);
    expect(O.donemVerisi(ESKI.ozet!, "buAy").siparisSayisi).toBe(48);
    expect(O.donemVerisi(YENI.ozet!, "buAy").siparisSayisi).toBe(3);
  });

  it("aralık: açık uç = üretim günü, kapalı dönemin sonu fabrikanın sınırı; tüm zamanlar ve sınırsız dönem → null", () => {
    expect(O.donemAraligi(YENI, "buAy")).toBe("01.11.2026 – 19.11.2026");
    expect(O.donemAraligi(YENI, "gecenAy")).toBe("01.10.2026 – 31.10.2026");
    expect(O.donemAraligi(YENI, "tumZamanlar")).toBeNull();
    expect(O.donemAraligi(ESKI, "son12Ay")).toBeNull();
    expect(O.donemAraligi({ donemler: YENI.donemler, uretimGunu: undefined }, "buAy")).toBe("01.11.2026 – bugün");
  });

  it("ek satırlar fabrikanın alanlarından; alan yoksa satır yok", () => {
    expect(O.ozetEkSatirlari(YENI.ozet!)).toEqual([
      { key: "en-eski", metin: "En eski açık sipariş: 12.09.2026 · 68 gün" },
      { key: "depodaki-mal", metin: "Depoda malı: 12 top 486,5 m · Çuvalda 3 top 141,3 m" },
    ]);
    expect(O.ozetEkSatirlari(ESKI.ozet!)).toEqual([]);
  });
});

describe("§2 ekran", () => {
  it("dönem açılır seçimle; olmayan dönem yok; aralık küçük yazıyla; kartlar seçili dönemin sayısı", async () => {
    render(<CustomerDetail />);
    await settle();
    expect(screen.queryByTestId("cari-donem-secim")).toBeNull();
    expect(screen.getByTestId("cari-donem-dugme")).toHaveTextContent("Dönem: Tüm zamanlar");
    expect(screen.queryByTestId("cari-donem-aralik")).toBeNull();
    fireEvent.press(screen.getByTestId("cari-donem-dugme"));
    for (const k of ["tumZamanlar", "son12Ay", "buAy", "gecenAy", "buYil"]) expect(screen.getByTestId(`cari-donem-${k}`)).toBeTruthy();
    for (const k of ["son3Ay", "son6Ay", "gecenYil"]) expect(screen.queryByTestId(`cari-donem-${k}`)).toBeNull();
    fireEvent.press(screen.getByTestId("cari-donem-buAy"));
    await settle();
    expect(screen.getByTestId("cari-donem-dugme")).toHaveTextContent("Dönem: Bu ay");
    expect(screen.getByTestId("cari-donem-aralik")).toHaveTextContent("01.11.2026 – 19.11.2026");
    expect(within(screen.getByTestId("cari-toplam-siparis")).getByText("3")).toBeTruthy();
    // Kısa dönemde liste yok → tek satır; bağlantı Son 12 ay'a geçirir.
    expect(screen.queryByTestId("cari-urunler")).toBeNull();
    fireEvent.press(screen.getByTestId("cari-urun-son12"));
    await settle();
    expect(screen.getByTestId("cari-donem-dugme")).toHaveTextContent("Dönem: Son 12 ay");
    expect(screen.getByTestId("cari-urunler")).toBeTruthy();
  });

  it("ek satırlar ve ürün tablosunda Son sipariş sütunu", async () => {
    render(<CustomerDetail />);
    await settle();
    expect(screen.getByTestId("cari-ozet-en-eski")).toHaveTextContent("En eski açık sipariş: 12.09.2026 · 68 gün");
    expect(screen.getByTestId("cari-ozet-depodaki-mal")).toHaveTextContent("Depoda malı: 12 top 486,5 m · Çuvalda 3 top 141,3 m");
    expect(within(screen.getByTestId("cari-urun-baslik")).getByText("Son sipariş")).toBeTruthy();
    expect(within(screen.getByTestId("cari-urun-satir-u1:r1:MT")).getByText("10.11.2026")).toBeTruthy();
    // Termin/gecikme sayısı yazılmaz.
    expect(screen.queryByText(/termin|gecik/i)).toBeNull();
  });

  it("NEGATİF (eski fabrika/eski bulut): bugünkü iki seçenekli bölmeli seçim; ek satır ve Son sipariş sütunu yok", async () => {
    mockSummary.mockResolvedValue(ESKI);
    render(<CustomerDetail />);
    await settle();
    expect(screen.getByTestId("cari-donem-secim")).toBeTruthy();
    expect(screen.queryByTestId("cari-donem-dugme")).toBeNull();
    expect(screen.queryByTestId("cari-donem-buAy")).toBeNull();
    expect(screen.queryByTestId("cari-ozet-en-eski")).toBeNull();
    expect(screen.queryByTestId("cari-ozet-depodaki-mal")).toBeNull();
    expect(within(screen.getByTestId("cari-urun-baslik")).queryByText("Son sipariş")).toBeNull();
    fireEvent.press(screen.getByTestId("cari-donem-son12Ay"));
    await settle();
    expect(screen.getByTestId("cari-urunler")).toBeTruthy();
  });
});
