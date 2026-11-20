// İş emri bekçisi (soru-cevap tasarımı §3.3): görünüm fabrikanın alanlarını yalnız etikete çevirir (siparişsiz,
// aşama, aşama sayıları, fason günü); liste açık/kapanan + aşama + üyelik süzgecini SUNUCUYA parametre olarak gönderir,
// kapananlarda "son 30 gün" penceresi dışını çizmez; ayrıntı sipariş ve fason firmasına götürür; termin/gecikme yok.
import { act, fireEvent, render, screen, within } from "@testing-library/react-native";
import type { ReactElement } from "react";

const mockList = jest.fn();
const mockRecord = jest.fn();
const mockViewPref = jest.fn();
const mockCache = { load: jest.fn(async (_k: string, f: () => Promise<unknown>) => ({ data: await f(), offline: false, savedAt: "" })), peek: jest.fn(async () => null) };
const mockSession = {
  api: { list: mockList, record: mockRecord, viewPref: mockViewPref, viewPrefSet: jest.fn(), snapshot: jest.fn() },
  cache: mockCache, markOnline: jest.fn(),
  permissions: ["bulut:oturum", "bulut:uretim:oku", "bulut:cari:oku", "bulut:siparis:oku"] as string[], offline: false, offlineSince: null as string | null, facility: null as unknown, switchError: null as string | null,
};
const mockRouter = { push: jest.fn(), replace: jest.fn(), back: jest.fn(), navigate: jest.fn(), setParams: jest.fn(), canGoBack: () => true };
let mockParams: Record<string, string> = {};
jest.mock("../src/state/session", () => ({ useSession: () => mockSession }));
jest.mock("expo-router", () => ({ useRouter: () => mockRouter, usePathname: () => "/is-emirleri", useLocalSearchParams: () => mockParams }));
jest.mock("react-native-safe-area-context", () => ({ useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }) }));

const List = (require("../app/(app)/is-emirleri/index") as { default: () => ReactElement }).default;
const Detail = (require("../app/(app)/is-emirleri/[id]") as { default: () => ReactElement }).default;
const Production = (require("../app/(app)/(tabs)/uretim") as { default: () => ReactElement }).default;
const G = require("../src/ui/is-emri/gorunum") as typeof import("../src/ui/is-emri/gorunum");
const { buyukHarf } = require("../src/ui/ortak") as typeof import("../src/ui/ortak");
const { LIST_ID_FILTERS, LIST_MEMBER_FILTERS, LIST_SEARCH, LIST_SORT } = require("../src/api/wire") as typeof import("../src/api/wire");

const GUN = 86_400_000;
const once = (gun: number) => new Date(Date.now() - gun * GUN).toISOString();
const rec = (id: string, kayit: Record<string, unknown>) => ({ id, kayit, surum: "2026-11-13T09:00:00.000Z" });
const page = (...kayitlar: unknown[]) => ({ kayitlar, sonraki: null });
const YETENEK = {
  tesis: { id: "t1" }, hesap: { id: "h1" },
  liste: {
    kimlikSuzgecleri: LIST_ID_FILTERS, aranabilir: Object.keys(LIST_SEARCH),
    siralama: Object.fromEntries(Object.entries(LIST_SORT).map(([p, a]) => [p, Object.keys(a)])),
    uyelikSuzgecleri: Object.fromEntries(Object.entries(LIST_MEMBER_FILTERS).map(([k, p]) => [k, Object.keys(p)])),
  },
};
const FASONDA = {
  isEmriNo: "IE-2026-0318", acik: true, asama: "fason", musteriAdi: "Örnek Tekstil A.Ş.", cariKartIdleri: ["c1"], siparisIdleri: ["s1"], siparisNolari: ["SIP-2026-0451"],
  urunAdi: "Örnek Saten 280 cm", renkAdi: "Krem", topSayisi: 18, metre: 2160,
  asamaTop: [{ anahtar: "fason", top: 14, metre: 1690 }, { anahtar: "kursun", top: 0, metre: 0 }, { anahtar: "depo", top: 4, metre: 470 }],
  fasonFirmaIdleri: ["f1"], fasonFirmaAdi: "Örnek Boyahane", fasonGonderim: once(6),
};

async function settle() {
  for (let i = 0; i < 4; i++) await act(async () => undefined);
}

beforeEach(() => {
  mockParams = {};
  mockSession.facility = YETENEK;
  mockList.mockReset();
  mockRecord.mockReset();
  mockRouter.push.mockReset();
  mockRouter.setParams.mockReset();
  mockViewPref.mockResolvedValue({ anahtar: "tablo.is-emri", deger: null, guncelleme: null });
});

describe("§1 görünüm (saf)", () => {
  it("siparişsiz iş emri 'Siparişsiz' yazar, müşterisi varsa adıyla; alan hiç yoksa '—'", () => {
    expect(G.musteriMetni({ siparisIdleri: [], musteriAdi: null })).toBe("Siparişsiz");
    expect(G.musteriMetni({ siparisIdleri: [], musteriAdi: "Deneme Kumaş" })).toBe("Deneme Kumaş (siparişsiz)");
    expect(G.musteriMetni({ siparisIdleri: ["s1"], musteriAdi: "Deneme Kumaş" })).toBe("Deneme Kumaş");
    expect(G.musteriMetni({})).toBe("—");
  });

  it("aşama fabrikanın kodundan; kapanan 'Kapandı'; aşama sayılarında sıfır satır yok, bilinmeyen anahtar kendi adıyla", () => {
    expect(G.asamaMetni({ acik: true, asama: "kursun" })).toBe("Kurşun");
    expect(G.asamaMetni({ acik: false, asama: null })).toBe("Kapandı");
    const s = G.asamaSayilari({ asamaTop: [...FASONDA.asamaTop, { anahtar: "yeniAsama", top: 2, metre: null }] });
    expect(s.map((x) => [x.anahtar, x.etiket, x.top])).toEqual([["fason", "Fasonda", 14], ["depo", "Depoda", 4], ["yeniAsama", "yeniAsama", 2]]);
  });

  it("fason günü yalnız bilgi: tam gün, gelecekteki tarih 0; kapanan penceresi 30 gün", () => {
    const simdi = Date.parse("2026-11-13T12:00:00Z");
    expect(G.fasonGunu({ fasonGonderim: "2026-11-07T08:00:00Z" }, simdi)).toBe(6);
    expect(G.fasonGunu({ fasonGonderim: "2026-11-14T08:00:00Z" }, simdi)).toBe(0);
    expect(G.fasonGunu({}, simdi)).toBeNull();
    expect(G.gunMetni(6)).toBe("6 gündür");
    expect(G.sonOtuzGunde({ kapanisTarihi: "2026-10-20T00:00:00Z" }, simdi)).toBe(true);
    expect(G.sonOtuzGunde({ kapanisTarihi: "2026-10-10T00:00:00Z" }, simdi)).toBe(false);
    expect(G.sonOtuzGunde({}, simdi)).toBe(false);
  });
});

describe("§2 liste: süzgeç SUNUCUDA", () => {
  it("varsayılan açık: `suzgec=ACIK`; dört sütun Müşteri · Kumaş · Top · Aşama", async () => {
    mockList.mockResolvedValue(page(rec("w1", FASONDA)));
    render(<List />);
    await settle();
    expect(mockList).toHaveBeenCalledWith("is-emri", expect.objectContaining({ suzgec: "ACIK" }));
    const satir = await screen.findByTestId("is-emri-satir-w1");
    for (const metin of ["Örnek Tekstil A.Ş.", "Örnek Saten 280 cm · Krem", "18", "Fasonda"]) expect(within(satir).getByText(metin)).toBeTruthy();
    fireEvent.press(satir);
    expect(mockRouter.push).toHaveBeenCalledWith({ pathname: "/is-emirleri/[id]", params: { id: "w1" } });
  });

  it("rota aşaması ve fason firması sunucu parametresi olur; çip parametreyi kaldırır", async () => {
    mockParams = { asama: "FASON", fasonFirmaId: "f1", firma: "Örnek Boyahane" };
    mockList.mockResolvedValue(page());
    render(<List />);
    await settle();
    expect(mockList).toHaveBeenCalledWith("is-emri", expect.objectContaining({ suzgec: "ACIK,FASON", fasonFirmaId: "f1" }));
    fireEvent.press(screen.getByTestId("is-emri-cip-firma"));
    expect(mockRouter.setParams).toHaveBeenCalledWith({ fasonFirmaId: undefined, firma: undefined });
  });

  it("eski sunucu üyelik süzgecini beyan etmezse parametre gönderilmez (süzülmemiş listeyi süzülmüş sanmamak için)", async () => {
    mockParams = { cariKartId: "c1", musteri: "Örnek" };
    mockSession.facility = { ...YETENEK, liste: { ...YETENEK.liste, uyelikSuzgecleri: undefined } };
    mockList.mockResolvedValue(page());
    render(<List />);
    await settle();
    expect(mockList.mock.calls.every(([, q]) => (q as { cariKartId?: string }).cariKartId === undefined)).toBe(true);
    expect(screen.queryByTestId("is-emri-cip-cari")).toBeNull();
  });

  it("Kapanan (30 gün): `KAPANAN` + kapanış tarihine göre azalan; pencere dışı satır çizilmez", async () => {
    mockParams = { durum: "kapanan" };
    mockList.mockResolvedValue(page(rec("k1", { ...FASONDA, acik: false, asama: null, kapanisTarihi: once(3) }), rec("k2", { ...FASONDA, acik: false, asama: null, kapanisTarihi: once(45) })));
    render(<List />);
    await settle();
    expect(mockList).toHaveBeenCalledWith("is-emri", expect.objectContaining({ suzgec: "KAPANAN", sirala: "kapanisTarihi", yon: "azalan" }));
    expect(await screen.findByTestId("is-emri-satir-k1")).toBeTruthy();
    expect(screen.queryByTestId("is-emri-satir-k2")).toBeNull();
  });
});

describe("§3 ayrıntı", () => {
  it("dört net satır: kimin → cari · iş emrinin siparişi → sipariş · ne · nerede (boyahane firması + kaç gündür; termin/gecikme yok)", async () => {
    mockParams = { id: "w1" };
    mockRecord.mockResolvedValue(rec("w1", { ...FASONDA, fasonKategoriler: ["Boyahane"] }));
    render(<Detail />);
    await settle();
    expect(within(await screen.findByTestId("is-emri-musteri")).getByText("Örnek Tekstil A.Ş.")).toBeTruthy();
    expect(screen.getByText(buyukHarf("İş emrinin siparişi"))).toBeTruthy();
    expect(within(screen.getByTestId("is-emri-kumas")).getByText("Örnek Saten 280 cm · Krem")).toBeTruthy();
    const yer = screen.getByTestId("is-emri-fason-firma");
    expect(within(yer).getByText("Örnek Boyahane")).toBeTruthy();
    expect(within(yer).getByText("14 top")).toBeTruthy();
    expect(within(yer).getByText("Boyahanede · 1.690 m · 6 gündür")).toBeTruthy();
    expect(screen.queryByText(/gecik|termin/i)).toBeNull();
    fireEvent.press(screen.getByTestId("is-emri-musteri"));
    expect(mockRouter.push).toHaveBeenCalledWith({ pathname: "/cariler/[id]", params: { id: "c1" } });
    fireEvent.press(screen.getByTestId("is-emri-siparis-0"));
    expect(mockRouter.push).toHaveBeenCalledWith({ pathname: "/siparisler/[id]", params: { id: "s1" } });
    fireEvent.press(yer);
    expect(mockRouter.push).toHaveBeenCalledWith({ pathname: "/fason", params: { firma: "f1" } });
  });

  it("'Üretim ayrıntıları' KAPALI başlar; dokununca aşama başına top · metre ve üretim alanları görünür", async () => {
    mockParams = { id: "w1" };
    mockRecord.mockResolvedValue(rec("w1", { ...FASONDA, tur: "ORDER_PRODUCTION", durum: "IN_PROGRESS", hedefMiktar: "2400.00", en: "280.00", girenMetre: 2200, uretilenMetre: 470, olusturulma: "2026-11-01T08:00:00Z" }));
    render(<Detail />);
    await settle();
    await screen.findByTestId("is-emri-ayrinti");
    expect(screen.getByTestId("is-emri-ayrinti-basligi").props.accessibilityState).toEqual(expect.objectContaining({ expanded: false }));
    expect(screen.queryByTestId("is-emri-asama-fason")).toBeNull();
    expect(screen.queryByTestId("is-emri-bilgi-hedef")).toBeNull();
    fireEvent.press(screen.getByTestId("is-emri-ayrinti-basligi"));
    await settle();
    expect(screen.getByTestId("is-emri-ayrinti-basligi").props.accessibilityState).toEqual(expect.objectContaining({ expanded: true }));
    expect(within(screen.getByTestId("is-emri-asama-fason")).getByText("14 top · 1.690 m")).toBeTruthy();
    expect(screen.queryByTestId("is-emri-asama-kursun")).toBeNull();
    expect(within(screen.getByTestId("is-emri-bilgi-tur")).getByText("Siparişe üretim")).toBeTruthy();
    expect(within(screen.getByTestId("is-emri-bilgi-hedef")).getByText("2.400 m")).toBeTruthy();
    expect(within(screen.getByTestId("is-emri-bilgi-en")).getByText("280 cm")).toBeTruthy();
    expect(within(screen.getByTestId("is-emri-bilgi-uretilen")).getByText("470 m")).toBeTruthy();
  });

  it("siparişsiz iş emri 'Siparişsiz (stok)'; çok siparişli iş emrinde her sipariş ayrı satır", async () => {
    mockParams = { id: "w5" };
    mockRecord.mockResolvedValue(rec("w5", { ...FASONDA, siparisIdleri: [], siparisNolari: [], cariKartIdleri: [], musteriAdi: null, fasonFirmaAdi: null, asama: "kursun" }));
    const { unmount } = render(<Detail />);
    await settle();
    expect(within(await screen.findByTestId("is-emri-siparissiz")).getByText("Siparişsiz (stok)")).toBeTruthy();
    expect(within(screen.getByTestId("is-emri-musteri")).getByText("Stok için üretim")).toBeTruthy();
    expect(within(screen.getByTestId("is-emri-yer")).getByText("Kurşun + KK2")).toBeTruthy();
    expect(screen.queryByTestId("is-emri-fason-firma")).toBeNull();
    unmount();
    mockRecord.mockResolvedValue(rec("w8", { ...FASONDA, siparisIdleri: ["s1", "s2", "s3"], siparisNolari: ["SIP-1", "SIP-2", "SIP-3"] }));
    render(<Detail />);
    await settle();
    expect(await screen.findByTestId("is-emri-siparis-2")).toBeTruthy();
    fireEvent.press(screen.getByTestId("is-emri-siparis-2"));
    expect(mockRouter.push).toHaveBeenCalledWith({ pathname: "/siparisler/[id]", params: { id: "s3" } });
  });
});

describe("§4 Üretim: üretimdeki toplar nerede? + açık iş emirleri", () => {
  const AKIS = { kolonlar: [{ anahtar: "hamStok", adet: 300 }, { anahtar: "kursun", etiket: "Kurşun", adet: 94 }, { anahtar: "tambur", adet: 22 }, { anahtar: "fason", adet: 233 }, { anahtar: "depo", adet: 900 }], istasyonlar: [] };
  const FIRMALAR = (kat: string) => ({
    acikTop: 233, kalanMiktar: "26960.000",
    firmalar: [
      { fasonFirmaId: "f1", etiket: "Örnek Boyahane", acikTop: 142, kalanMiktar: "16400.000", kategoriler: [kat], enEskiGonderim: once(93) },
      { fasonFirmaId: "f2", etiket: "Deneme Boya", acikTop: 58, kalanMiktar: "6800.000", kategoriler: ["Boyahane"], enEskiGonderim: once(103) },
      { fasonFirmaId: "f3", etiket: "Numune Boya", acikTop: 33, kalanMiktar: "3760.000", kategoriler: ["Boyahane"], enEskiGonderim: once(10) },
      { fasonFirmaId: "f4", etiket: "Boş Firma", acikTop: 0, kalanMiktar: "0", kategoriler: ["Boyahane"], enEskiGonderim: null },
    ],
  });
  beforeEach(() => {
    (mockSession.api.snapshot as jest.Mock).mockImplementation(async (p: string) => ({ projeksiyon: p, veri: p === "fason-acik" ? FIRMALAR("Boyahane") : AKIS, surum: "x" }));
  });

  it("seçici (saf): Kurşun + KK2 · Tambur iş emri sayısıyla; Boyahane top · metre · en eski gün; firma firma (boş firma yok); ham/depo yok", () => {
    const N = require("../src/ui/uretim/nerede") as typeof import("../src/ui/uretim/nerede");
    const rows = N.productionLocations({ flow: AKIS, fason: FIRMALAR("Boyahane") });
    expect(rows.map((r) => [r.key, r.label, r.value, r.detail, r.firm])).toEqual([
      ["kursun", "Kurşun + KK2", "94 iş emri", null, false],
      ["tambur", "Tambur", "22 iş emri", null, false],
      ["fason", "Boyahane", "233 top", "26.960 m · 103 gündür", false],
      ["fason:f1", "Örnek Boyahane", "142 top", "16.400 m · 93 gündür", true],
      ["fason:f2", "Deneme Boya", "58 top", "6.800 m · 103 gündür", true],
      ["fason:f3", "Numune Boya", "33 top", "3.760 m · 10 gündür", true],
    ]);
    expect(rows.find((r) => r.key === "fason:f1")!.params).toEqual({ fasonFirmaId: "f1", firma: "Örnek Boyahane" });
    // Boyahane olmayan firma varsa toplam dürüstçe "Fasonda".
    expect(N.productionLocations({ flow: AKIS, fason: FIRMALAR("Zımpara") }).find((r) => r.key === "fason")!.label).toBe("Fasonda");
    // Y2 anlığı gelirse satırlar ondan (kurşunda da top · metre · gün).
    const y2 = N.productionLocations({ snapshot: { konumlar: [{ anahtar: "kursun", etiket: "Kurşun", top: 94, metre: 54478, isEmri: 94, enEskiGun: 4 }] }, flow: AKIS, fason: null });
    expect(y2.map((r) => [r.label, r.value, r.detail])).toEqual([["Kurşun + KK2", "94 top", "54.478 m · 4 gündür"]]);
  });

  it("blok ilk sırada; firma satırına dokununca fason tablosu o firma ön seçili", async () => {
    mockList.mockResolvedValue(page());
    render(<Production />);
    await settle();
    expect(within(await screen.findByTestId("nerede-fason")).getByText("26.960 m · 103 gündür")).toBeTruthy();
    expect(within(screen.getByTestId("nerede-fason:f2")).getByText("58 top")).toBeTruthy();
    expect(screen.queryByTestId("nerede-fason:f4")).toBeNull();
    expect(screen.queryByTestId("nerede-hamStok")).toBeNull();
    fireEvent.press(screen.getByTestId("nerede-fason:f2"));
    expect(mockRouter.push).toHaveBeenCalledWith({ pathname: "/fason", params: { firma: "f2" } });
    fireEvent.press(screen.getByTestId("nerede-tambur"));
    expect(mockRouter.push).toHaveBeenCalledWith({ pathname: "/is-emirleri/konum", params: { asama: "TAMBUR" } });
  });

  it("ilk 10 açık iş emri (`suzgec=ACIK`, limit 10); Tümü İş emirleri ekranını açar", async () => {
    mockList.mockResolvedValue(page(rec("w1", FASONDA)));
    render(<Production />);
    await settle();
    expect(mockList).toHaveBeenCalledWith("is-emri", expect.objectContaining({ suzgec: "ACIK", limit: 10 }));
    expect(within(await screen.findByTestId("ie-w1")).getByText("Fasonda")).toBeTruthy();
    fireEvent.press(screen.getByTestId("is-emirleri-tumu"));
    expect(mockRouter.push).toHaveBeenCalledWith("/is-emirleri");
  });

  it("is-emri aramasını beyan etmeyen eski sunucuda bölüm çizilmez, liste istenmez", async () => {
    mockSession.facility = { ...YETENEK, liste: { ...YETENEK.liste, aranabilir: [] } };
    render(<Production />);
    await settle();
    expect(mockList).not.toHaveBeenCalled();
    expect(screen.queryByTestId("bolum-is-emirleri")).toBeNull();
  });
});

describe("§6 panel eşliği: liste sütunları", () => {
  it("fason firması (+N), üretilen / giren (yüzde HESAPLANMAZ), sipariş/hedef metresi, tür ve durum sözlükten", () => {
    expect(G.fasonFirmCell({ fasonFirmaAdi: "Örnek Boyahane", fasonFirmaIdleri: ["f1", "f2"] })).toBe("Örnek Boyahane +1");
    expect(G.fasonFirmCell({})).toBe("—");
    expect(G.progressCell({ uretilenMetre: 470, girenMetre: "2200.00" })).toBe("470 / 2.200");
    expect(G.progressCell({})).toBe("—");
    expect(G.meterCell("2400.00")).toBe("2.400");
    expect(G.typeLabel({ tur: "STOCK_PRODUCTION" })).toBe("Stoka üretim");
    expect(G.statusLabelOf({ durum: "IN_PROGRESS" })).toBe("Üretimde");
  });
});

describe("§5 konum listesi", () => {
  const Konum = (require("../app/(app)/is-emirleri/konum") as { default: () => ReactElement }).default;
  const COK = { ...FASONDA, siparisIdleri: ["s1", "s2", "s3"], siparisNolari: ["SIP-2026-0451", "SIP-2026-0450", "SIP-2026-0449"] };
  const STOK = { ...FASONDA, musteriAdi: null, cariKartIdleri: [], siparisIdleri: [], siparisNolari: [] };

  it("hücreler (saf): çok siparişte ilk no '+N', bağsızda 'Siparişsiz (stok)'; top/metre o konumun sayısı; gün yalnız fasonda", () => {
    expect(G.orderCell(COK)).toBe("SIP-2026-0451 +2");
    expect(G.orderCell(FASONDA)).toBe("SIP-2026-0451");
    expect(G.orderCell(STOK)).toBe("Siparişsiz (stok)");
    expect(G.orderCell({})).toBe("—");
    const simdi = Date.now();
    expect(G.locationRowText(FASONDA, "fason", simdi)).toEqual({ musteri: "Örnek Tekstil A.Ş.", kumas: "Örnek Saten 280 cm · Krem", top: "14", metre: "1.690", siparis: "SIP-2026-0451", gun: "6 gündür" });
    expect(G.locationRowText({ ...FASONDA, asama: "kursun" }, "kursun", simdi).gun).toBeNull();
    expect(G.locationRowText({ ...FASONDA, asama: "kursun" }, "kursun", simdi).top).toBe("0");
  });

  it("aşama süzgeci SUNUCUYA; satırda sipariş '+N' ve 'Siparişsiz (stok)'; dokununca iş emri ayrıntısı", async () => {
    mockParams = { asama: "KURSUN" };
    mockList.mockResolvedValue(page(rec("w8", { ...COK, asama: "kursun" }), rec("w5", { ...STOK, asama: "kursun" })));
    render(<Konum />);
    await settle();
    expect(mockList).toHaveBeenCalledWith("is-emri", expect.objectContaining({ suzgec: "ACIK,KURSUN" }));
    expect(await screen.findByText("Kurşun + KK2")).toBeTruthy();
    expect(within(screen.getByTestId("konum-w8")).getByText(/SIP-2026-0451 \+2/)).toBeTruthy();
    expect(within(screen.getByTestId("konum-w5")).getByText("Siparişsiz (stok)")).toBeTruthy();
    fireEvent.press(screen.getByTestId("konum-w8"));
    expect(mockRouter.push).toHaveBeenCalledWith(expect.objectContaining({ params: { id: "w8" } }));
  });

  it("boyahane firması: `fasonFirmaId` üyelik süzgeci (aşama süzülmez), başlık firma adı, gün görünür", async () => {
    mockParams = { fasonFirmaId: "f1", firma: "Örnek Boyahane" };
    mockList.mockResolvedValue(page(rec("w1", FASONDA)));
    render(<Konum />);
    await settle();
    expect(mockList).toHaveBeenCalledWith("is-emri", expect.objectContaining({ suzgec: "ACIK", fasonFirmaId: "f1" }));
    expect(await screen.findByText("Örnek Boyahane")).toBeTruthy();
    expect(within(screen.getByTestId("konum-w1")).getByText(/6 gündür/)).toBeTruthy();
  });

  // Dört özellik (2026-11-20): liste BÜTÜN sayfalarıyla yüklenir, sonra sıralama/süzgeç/arama tam kümede çalışır.
  // Negatif sonda: ikinci sayfa gelmeseydi "w3" (en büyük metre, ikinci sayfada) ilk sıraya çıkamazdı.
  it("bütün sayfalar yüklenir; Metre başlığı tam kümeyi sıralar; süzgeç + arama + sütun seçimi; telefonda da tablo", async () => {
    const AsyncStorage = require("@react-native-async-storage/async-storage") as { clear: () => Promise<void> };
    await AsyncStorage.clear();
    mockParams = { asama: "KURSUN" };
    const ie = (metre: number, musteri: string) => ({ ...FASONDA, asama: "kursun", musteriAdi: musteri, asamaTop: [{ anahtar: "kursun", top: 2, metre }] });
    mockList.mockImplementation(async (_p: string, q: { imlec?: string }) =>
      q.imlec === "s2"
        ? page(rec("w3", ie(9000, "Beta Tekstil")))
        : { kayitlar: [rec("w1", ie(150, "Alfa Tekstil")), rec("w2", ie(40, "Beta Tekstil"))], sonraki: "s2" });
    render(<Konum />);
    await settle();
    await settle();
    expect(mockList).toHaveBeenCalledWith("is-emri", expect.objectContaining({ imlec: "s2" }));
    const sira = () => screen.getAllByTestId(/^konum-w/).map((x) => String(x.props.testID).slice("konum-".length)).join(",");
    expect(sira()).toBe("w1,w2,w3");
    expect(screen.getByTestId("konum-tablo-govde")).toBeTruthy();
    fireEvent.press(screen.getByTestId("konum-tablo-sutun-metre"));
    await settle();
    expect(sira()).toBe("w2,w1,w3");
    fireEvent.press(screen.getByTestId("konum-tablo-sutun-metre"));
    await settle();
    expect(sira()).toBe("w3,w1,w2");
    // Arama (az satır → kompakt simge satırı, kutu simgeyle açılır).
    fireEvent.press(screen.getByTestId("konum-tablo-ara-ac"));
    fireEvent.changeText(screen.getByTestId("konum-tablo-ara"), "alfa");
    expect(sira()).toBe("w1");
    fireEvent.changeText(screen.getByTestId("konum-tablo-ara"), "");
    // Süzgeç sayfası Müşteri değerlerini tam kümeden sunar; sütun seçici açılır.
    fireEvent.press(screen.getByTestId("konum-tablo-suzgec"));
    expect(screen.getByTestId("konum-tablo-suzgec-secici")).toBeTruthy();
    fireEvent.press(screen.getByTestId("konum-tablo-sutunlar"));
    expect(screen.getByTestId("konum-tablo-sutun-secici")).toBeTruthy();
  });
});
