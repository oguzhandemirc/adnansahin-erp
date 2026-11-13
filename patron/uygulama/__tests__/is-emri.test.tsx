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
  it("kimin malı · sipariş → sipariş ayrıntısı · aşama sayıları · fasonda kaç gündür (termin/gecikme yok)", async () => {
    mockParams = { id: "w1" };
    mockRecord.mockResolvedValue(rec("w1", FASONDA));
    render(<Detail />);
    await settle();
    expect(within(await screen.findByTestId("is-emri-musteri")).getByText("Örnek Tekstil A.Ş.")).toBeTruthy();
    expect(within(screen.getByTestId("is-emri-asama-fason")).getByText("14 top · 1.690 m")).toBeTruthy();
    expect(screen.queryByTestId("is-emri-asama-kursun")).toBeNull();
    expect(within(screen.getByTestId("is-emri-fason-firma")).getByText("6 gündür")).toBeTruthy();
    expect(screen.queryByText(/gecik|termin/i)).toBeNull();
    fireEvent.press(screen.getByTestId("is-emri-siparis-0"));
    expect(mockRouter.push).toHaveBeenCalledWith({ pathname: "/siparisler/[id]", params: { id: "s1" } });
    fireEvent.press(screen.getByTestId("is-emri-fason-firma"));
    expect(mockRouter.push).toHaveBeenCalledWith({ pathname: "/fason/[firmaId]", params: { firmaId: "f1", ad: "Örnek Boyahane" } });
  });

  it("siparişsiz iş emri sipariş satırı yerine 'Siparişsiz' çizer", async () => {
    mockParams = { id: "w5" };
    mockRecord.mockResolvedValue(rec("w5", { ...FASONDA, siparisIdleri: [], siparisNolari: [], musteriAdi: null, fasonFirmaAdi: null }));
    render(<Detail />);
    await settle();
    expect(await screen.findByTestId("is-emri-siparissiz")).toBeTruthy();
    expect(within(screen.getByTestId("is-emri-musteri")).getByText("Siparişsiz")).toBeTruthy();
    expect(screen.queryByTestId("is-emri-fason")).toBeNull();
  });
});

describe("§4 Üretim: açık iş emirleri", () => {
  beforeEach(() => {
    (mockSession.api.snapshot as jest.Mock).mockResolvedValue({ projeksiyon: "uretim-akisi", veri: { kolonlar: [{ anahtar: "kursun", etiket: "Kurşun", adet: 3 }], istasyonlar: [] }, surum: "x" });
  });

  it("ilk 10 açık iş emri (`suzgec=ACIK`, limit 10); Tümü ve Kurşun satırı İş emirleri ekranını açar", async () => {
    mockList.mockResolvedValue(page(rec("w1", FASONDA)));
    render(<Production />);
    await settle();
    expect(mockList).toHaveBeenCalledWith("is-emri", expect.objectContaining({ suzgec: "ACIK", limit: 10 }));
    expect(within(await screen.findByTestId("ie-w1")).getByText("Fasonda")).toBeTruthy();
    fireEvent.press(screen.getByTestId("is-emirleri-tumu"));
    expect(mockRouter.push).toHaveBeenCalledWith("/is-emirleri");
    fireEvent.press(screen.getByTestId("nerede-kursun"));
    expect(mockRouter.push).toHaveBeenCalledWith("/is-emirleri?asama=KURSUN");
  });

  it("is-emri aramasını beyan etmeyen eski sunucuda bölüm çizilmez, liste istenmez", async () => {
    mockSession.facility = { ...YETENEK, liste: { ...YETENEK.liste, aranabilir: [] } };
    render(<Production />);
    await settle();
    expect(mockList).not.toHaveBeenCalled();
    expect(screen.queryByTestId("bolum-is-emirleri")).toBeNull();
  });
});
