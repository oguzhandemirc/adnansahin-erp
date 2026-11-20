// Cari özeti "Özel aralık" (fabrika 2.13.2, rapor isteği `customer/summary`): §1 saf — üç beyanın kesişimi, "Rapor iste"
// listesinden dışlama, sonucun cari + aralık eşleşmesi · §2 ekran — seçenek → iki tarih → istek (cari + iki gün AYNEN),
// beklerken kart yok, HAZIR'da kartlar + en çok alınan fabrikanın sonucundan, HATA'da neden + tekrar, form denetimi.
// NEGATİF: eski bulut (`raporAnahtarlari` yok) · rapor izni yok · eski fabrika (katalogda yok / iki dönem) → seçenek YOK ve
// katalog ya da rapor isteği atılmaz; başka carinin sonucu gösterilmez.
import { act, fireEvent, render, screen, within } from "@testing-library/react-native";
import type { ReactElement } from "react";

const mockList = jest.fn();
const mockRecord = jest.fn();
const mockSummary = jest.fn();
const mockSnapshot = jest.fn();
const mockReportCreate = jest.fn();
const mockReportGet = jest.fn();
const mockCache = { load: jest.fn(async (_k: string, f: () => Promise<unknown>) => ({ data: await f(), offline: false, savedAt: "" })), peek: jest.fn(async () => null) };
const mockSession = {
  api: { list: mockList, record: mockRecord, snapshot: mockSnapshot, customerSummary: mockSummary, reportCreate: mockReportCreate, reportGet: mockReportGet, viewPref: jest.fn(async () => null) },
  cache: mockCache, markOnline: jest.fn(),
  permissions: [] as string[], offline: false, offlineSince: null as string | null, facility: null as unknown,
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
const R = require("../src/lib/reports") as typeof import("../src/lib/reports");
const Z = require("../src/ui/cari/OzelAralik") as typeof import("../src/ui/cari/OzelAralik");
const { LIST_ID_FILTERS, LIST_SEARCH } = require("../src/api/wire") as typeof import("../src/api/wire");
type Yanit = import("../src/api/wire").CustomerSummaryResponse;

const ID = "0b7c5a1e-4f2d-4c8e-9a51-3d6f2e8b1c40";
const KEY = "customer/summary";
const IZINLER = ["bulut:oturum", "bulut:siparis:oku", "bulut:cari:oku", "bulut:rapor:oku"];
const sayilar = (n: number) => ({ siparisSayisi: n, kalemSayisi: n, siparisMiktari: [], sevk: { metre: 0, top: 0, kg: 0, tartiliCuval: 0, cuval: 0 }, iade: { adet: 0, metre: 0 } });
const URUN = { urunId: "u1", urunAdi: "PANOS", renkId: "r1", renkAdi: "03-KREM", birim: "MT", miktar: 15500, siparisSayisi: 9 };
const ESKI: Yanit = {
  cariKartId: ID, son12AyBaslangic: null, surum: "2026-11-18T21:10:00.000Z",
  ozet: { tumZamanlar: { ...sayilar(48), enCokUrun: [URUN] }, son12Ay: { ...sayilar(20), enCokUrun: [URUN] }, acik: { siparisSayisi: 1, kalemSayisi: 1, acikMiktar: [] }, sonSiparisTarihi: null, sonSevkTarihi: null },
};
const YENI: Yanit = {
  ...ESKI,
  uretimGunu: "2026-11-19",
  donemler: { tumZamanlar: { baslangic: null, bitis: null }, son12Ay: { baslangic: "2025-11-18T21:00:00.000Z", bitis: null }, buAy: { baslangic: "2026-10-31T21:00:00.000Z", bitis: null } },
  ozet: { ...ESKI.ozet!, buAy: sayilar(3), gecenAy: sayilar(5), buYil: sayilar(31) },
};
const KATALOG = { veri: { raporlar: [{ anahtar: KEY, baslik: "Cari Özeti (Özel Aralık)", aile: "customer", izin: "bulut:siparis:oku", parametreler: ["cariKartId", "dateFrom", "dateTo"] }] } };
const OZEL_URUN = { urunId: "u9", urunAdi: "SATEN", renkId: null, renkAdi: null, birim: "MT", miktar: 820, siparisSayisi: 2, sonSiparisTarihi: "2026-09-14T09:00:00.000Z" };
const sonucVerisi = (cari = ID) => ({ cariKartId: cari, baslangicGunu: "2026-09-01", bitisGunu: "2026-09-30", baslangic: "2026-08-31T21:00:00.000Z", bitis: "2026-09-30T20:59:59.999Z", uretimGunu: "2026-11-20", donem: { ...sayilar(7), enCokUrun: [OZEL_URUN] } });
const istek = (durum: string, g: { veri?: unknown; hataKodu?: string } = {}) => ({
  id: "r-1", raporAnahtari: KEY, aile: "customer", parametreler: {}, durum, hataKodu: g.hataKodu ?? null, olusturulma: "2026-11-20T10:00:00.000Z", tamamlanma: null,
  sonuc: g.veri ? { veri: g.veri, hesaplandi: "2026-11-20T10:00:05.000Z", kaynakUfuk: null } : null,
});

async function settle() {
  for (let i = 0; i < 4; i++) await act(async () => undefined);
}
async function bekle(ms: number) {
  await act(async () => { await new Promise((r) => setTimeout(r, ms)); });
}
async function aralikSec(bas: string, son: string) {
  fireEvent.press(screen.getByTestId("cari-donem-dugme"));
  fireEvent.press(screen.getByTestId("cari-donem-ozel"));
  await bekle(400);
  expect(screen.getByTestId("cari-ozel-sayfa")).toBeTruthy();
  fireEvent.changeText(screen.getByTestId("cari-ozel-bas"), bas);
  fireEvent.changeText(screen.getByTestId("cari-ozel-son"), son);
  fireEvent.press(screen.getByTestId("cari-ozel-aralik"));
  await settle();
}

beforeEach(() => {
  jest.clearAllMocks();
  mockSession.permissions = [...IZINLER];
  mockSession.facility = { liste: { kimlikSuzgecleri: LIST_ID_FILTERS, aranabilir: Object.keys(LIST_SEARCH) }, raporAnahtarlari: ["customer/scorecard", KEY] };
  mockRecord.mockResolvedValue({ id: ID, kayit: { ad: "SMHTEX TEKSTİL", musteriRolu: true }, surum: "2026-11-15T21:09:00.000Z" });
  mockList.mockResolvedValue({ kayitlar: [], sonraki: null });
  mockSummary.mockResolvedValue(YENI);
  mockSnapshot.mockResolvedValue(KATALOG);
  mockReportCreate.mockResolvedValue(istek("BEKLIYOR"));
  mockReportGet.mockResolvedValue(istek("HAZIR", { veri: sonucVerisi() }));
});

describe("§1 saf", () => {
  it("seçenek yalnız üç beyan birden varken: bulut anahtarı · rapor + sipariş izni · fabrika kataloğu", () => {
    expect(R.customerRangeSupported([KEY], IZINLER, KATALOG.veri)).toBe(true);
    expect(R.customerRangeSupported(undefined, IZINLER, KATALOG.veri)).toBe(false);
    expect(R.customerRangeSupported(["customer/scorecard"], IZINLER, KATALOG.veri)).toBe(false);
    expect(R.customerRangeSupported([KEY], ["bulut:siparis:oku"], KATALOG.veri)).toBe(false);
    expect(R.customerRangeSupported([KEY], ["bulut:rapor:oku", "bulut:sevkiyat:oku"], KATALOG.veri)).toBe(false);
    expect(R.customerRangeSupported([KEY], IZINLER, { raporlar: [{ anahtar: "customer/scorecard", baslik: "x" }] })).toBe(false);
    expect(R.customerRangeSupported([KEY], IZINLER, null)).toBe(false);
  });

  it("\"Rapor iste\" listesi ekranlı raporu göstermez; karneler değişmez", () => {
    expect(R.requestable(KEY, IZINLER)).toBe(true);
    expect(R.listedForRequest(KEY, IZINLER)).toBe(false);
    expect(R.listedForRequest("customer/scorecard", IZINLER)).toBe(true);
  });

  it("sonuç yalnız bu cari + bu aralıkla eşleşirse okunur; bozuk biçim null", () => {
    const a = { bas: "2026-09-01", son: "2026-09-30" };
    expect(Z.ozelSonucu(sonucVerisi(), ID, a)?.siparisSayisi).toBe(7);
    expect(Z.ozelSonucu(sonucVerisi("11111111-1111-4111-8111-111111111111"), ID, a)).toBeNull();
    expect(Z.ozelSonucu(sonucVerisi(), ID, { bas: "2026-09-02", son: "2026-09-30" })).toBeNull();
    expect(Z.ozelSonucu({ ...sonucVerisi(), donem: { siparisSayisi: "7" } }, ID, a)).toBeNull();
    expect(Z.aralikOku("2026-09-01..2026-09-30")).toEqual(a);
    expect(Z.aralikOku("..2026-09-30")).toBeNull();
    expect(Z.gunAraligiYazisi(a)).toBe("01.09.2026 – 30.09.2026");
  });
});

describe("§2 ekran", () => {
  it("⭐ özel aralık: istek cari + iki fabrika günüyle gider; kartlar ve en çok alınan fabrikanın sonucundan", async () => {
    render(<CustomerDetail />);
    await settle();
    await aralikSec("01.09.2026", "30.09.2026");
    expect(mockReportCreate).toHaveBeenCalledTimes(1);
    const [token, anahtar, params] = mockReportCreate.mock.calls[0] as [string, string, Record<string, unknown>];
    expect(typeof token).toBe("string");
    expect(anahtar).toBe(KEY);
    expect(params).toEqual({ cariKartId: ID, dateFrom: "2026-09-01", dateTo: "2026-09-30" });
    expect(mockReportGet).toHaveBeenCalledWith("r-1");
    expect(screen.getByTestId("cari-donem-dugme")).toHaveTextContent("Dönem: Özel aralık");
    expect(screen.getByTestId("cari-donem-aralik")).toHaveTextContent("01.09.2026 – 30.09.2026");
    expect(within(screen.getByTestId("cari-toplam-siparis")).getByText("7")).toBeTruthy();
    expect(screen.getByTestId("cari-urunler")).toBeTruthy();
    expect(screen.getByText("SATEN")).toBeTruthy();
    // Hazır döneme dönünce anlığın sayıları.
    fireEvent.press(screen.getByTestId("cari-donem-dugme"));
    fireEvent.press(screen.getByTestId("cari-donem-buAy"));
    await settle();
    expect(within(screen.getByTestId("cari-toplam-siparis")).getByText("3")).toBeTruthy();
  });

  it("fabrika hesaplarken kartlar çizilmez, \"hesaplıyor\" satırı görünür", async () => {
    mockReportGet.mockResolvedValue(istek("HESAPLANIYOR"));
    render(<CustomerDetail />);
    await settle();
    await aralikSec("01.09.2026", "30.09.2026");
    expect(screen.getByTestId("cari-ozel-bekliyor")).toHaveTextContent("Fabrika bu aralığı hesaplıyor…");
    expect(screen.queryByTestId("cari-toplam-siparis")).toBeNull();
    expect(screen.queryByTestId("cari-urunler")).toBeNull();
  });

  it("fabrika RET'i: Türkçe neden + Tekrar dene (yeni istek); kart yok", async () => {
    mockReportGet.mockResolvedValue(istek("HATA", { hataKodu: "PARAMETRE_GECERSIZ" }));
    render(<CustomerDetail />);
    await settle();
    await aralikSec("01.09.2026", "30.09.2026");
    expect(screen.getByTestId("cari-ozel-durum-hata")).toHaveTextContent(/^Seçilen dönem ya da ayar bu rapor için geçerli değil\. Tekrar dene$/);
    expect(screen.queryByTestId("cari-toplam-siparis")).toBeNull();
    fireEvent.press(screen.getByTestId("cari-ozel-tekrar"));
    await settle();
    expect(mockReportCreate).toHaveBeenCalledTimes(2);
  });

  it("NEGATİF: başka carinin sonucu gösterilmez", async () => {
    mockReportGet.mockResolvedValue(istek("HAZIR", { veri: sonucVerisi("11111111-1111-4111-8111-111111111111") }));
    render(<CustomerDetail />);
    await settle();
    await aralikSec("01.09.2026", "30.09.2026");
    expect(screen.getByTestId("cari-ozel-durum-hata")).toHaveTextContent(/^Fabrikanın sonucu okunamadı\./);
    expect(screen.queryByTestId("cari-toplam-siparis")).toBeNull();
  });

  it("form: bitiş < başlangıç ve tek uç reddedilir, istek atılmaz", async () => {
    render(<CustomerDetail />);
    await settle();
    await aralikSec("30.09.2026", "01.09.2026");
    expect(screen.getByTestId("cari-ozel-hata")).toHaveTextContent("Başlangıç bitişten sonra olamaz");
    fireEvent.changeText(screen.getByTestId("cari-ozel-son"), "");
    fireEvent.press(screen.getByTestId("cari-ozel-aralik"));
    await settle();
    expect(screen.getByTestId("cari-ozel-hata")).toHaveTextContent("Başlangıç ve bitiş tarihini yazın");
    expect(mockReportCreate).not.toHaveBeenCalled();
  });

  const seceneksiz = async () => {
    render(<CustomerDetail />);
    await settle();
    const dugme = screen.queryByTestId("cari-donem-dugme");
    if (dugme) fireEvent.press(dugme);
    expect(screen.queryByTestId("cari-donem-ozel")).toBeNull();
    expect(mockReportCreate).not.toHaveBeenCalled();
  };

  it("NEGATİF eski bulut (`raporAnahtarlari` yok): seçenek yok, katalog bile istenmez", async () => {
    mockSession.facility = { liste: { kimlikSuzgecleri: LIST_ID_FILTERS, aranabilir: Object.keys(LIST_SEARCH) } };
    await seceneksiz();
    expect(mockSnapshot).not.toHaveBeenCalled();
  });

  it("NEGATİF rapor izni yok: seçenek yok, katalog istenmez", async () => {
    mockSession.permissions = IZINLER.filter((p) => p !== "bulut:rapor:oku");
    await seceneksiz();
    expect(mockSnapshot).not.toHaveBeenCalled();
  });

  it("NEGATİF eski fabrika (katalogda `customer/summary` yok): seçenek yok", async () => {
    mockSnapshot.mockResolvedValue({ veri: { raporlar: [{ anahtar: "customer/scorecard", baslik: "Müşteri Karnesi" }] } });
    await seceneksiz();
  });

  it("NEGATİF 2.13.1 öncesi fabrika (iki dönem): bugünkü bölmeli seçim, özel aralık yok", async () => {
    mockSummary.mockResolvedValue(ESKI);
    await seceneksiz();
    expect(screen.getByTestId("cari-donem-secim")).toBeTruthy();
  });
});
