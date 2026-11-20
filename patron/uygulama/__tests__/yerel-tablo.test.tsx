// Yerel veri tablosu bekçisi (2026-11-20, kullanıcı kuralı: "datatable olan her yerde tablo özelleştirilebilmeli ve
// arama ve filtre özelliği olmalı ve sütunlardan sıralama yapılabilmeli"). Saf model: sayı/tarih DEĞER olarak sıralanır
// (metin olarak değil), boş hep sonda, varsayılan sıra korunur; süzgeç alan içi VEYA / alanlar arası VE; arama Türkçe
// katlamalı ve gizli sütunda da arar. Çizim: kısa tabloda araçlar küçük simge satırı, başlıktan sıralama, sütun seçimi
// cihazda kalıcı. Cari kartının sunucu sayfalı sekmeleri sıralamayı SUNUCUYA gönderir (yarım küme yerelde sıralanmaz).
import AsyncStorage from "@react-native-async-storage/async-storage";
import { act, fireEvent, render, screen, within } from "@testing-library/react-native";
import type { ReactElement } from "react";

const mockList = jest.fn();
const mockSession = {
  api: { list: mockList, record: jest.fn(), snapshot: jest.fn(), customerSummary: jest.fn(), viewPref: jest.fn(async () => null), listOptions: jest.fn(), listTotals: jest.fn() },
  cache: { load: jest.fn(async (_k: string, f: () => Promise<unknown>) => ({ data: await f(), offline: false, savedAt: "" })), peek: jest.fn(async () => null) },
  markOnline: jest.fn(),
  permissions: [] as string[], offline: false, offlineSince: null as string | null, facility: null as unknown, switchError: null as string | null,
  factoryStamp: null as string | null,
};
const mockRouter = { push: jest.fn(), replace: jest.fn(), back: jest.fn(), navigate: jest.fn(), canGoBack: () => true };
jest.mock("../src/state/session", () => ({ useSession: () => mockSession }));
jest.mock("expo-router", () => ({ useRouter: () => mockRouter, usePathname: () => "/cariler", useLocalSearchParams: () => ({}) }));
jest.mock("react-native-safe-area-context", () => ({ useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }) }));

const Y = require("../src/ui/tablo/yerelTablo") as typeof import("../src/ui/tablo/yerelTablo");
const { KisaTablo } = require("../src/ui/tablo/KisaTablo") as typeof import("../src/ui/tablo/KisaTablo");
const { CariSiparisTablosu } = require("../src/ui/cari/CariListeTablolari") as typeof import("../src/ui/cari/CariListeTablolari");
const { LIST_ID_FILTERS, LIST_SEARCH, LIST_SORT } = require("../src/api/wire") as typeof import("../src/api/wire");

type Satir = { readonly id: string; readonly no: string; readonly musteri: string; readonly metre: string; readonly tarih: string; readonly not: string };
const S = (id: string, no: string, musteri: string, metre: string, tarih: string, not = ""): Satir => ({ id, no, musteri, metre, tarih, not });
const SATIRLAR: readonly Satir[] = [
  S("a", "T10", "İPEK TEKSTİL", "999", "02.01.2026"),
  S("b", "T2", "Çınar Örme", "1.234,5", "31.12.2025", "acil"),
  S("c", "T7", "İPEK TEKSTİL", "—", "15.06.2026"),
  S("d", "T1", "Akın Boya", "12", "—"),
];
const SUTUNLAR: readonly import("../src/ui/tablo/yerelTablo").YerelSutun<Satir>[] = [
  { key: "no", baslik: "Top no", agirlik: 1, kirpilmaz: 4, hucre: (r) => r.no },
  { key: "musteri", baslik: "Müşteri", agirlik: 1.5, suzgec: true, hucre: (r) => r.musteri },
  { key: "metre", baslik: "Metre", agirlik: 1, sayi: true, hucre: (r) => r.metre },
  { key: "tarih", baslik: "Tarih", agirlik: 1, hucre: (r) => r.tarih },
  { key: "not", baslik: "Not", agirlik: 1, hucre: (r) => r.not || "—" },
];
const ids = (xs: readonly Satir[]) => xs.map((r) => r.id).join("");

async function settle() {
  for (let i = 0; i < 4; i++) await act(async () => undefined);
}

beforeEach(async () => {
  await AsyncStorage.clear();
  mockList.mockReset();
});

describe("saf model", () => {
  it("hücre metninden değer: Türkçe sayı (birimli) · tarih · boş · metin", () => {
    expect(Y.metinDegeri("1.234,5 m")).toBe(1234.5);
    expect(Y.metinDegeri("12 cm")).toBe(12);
    expect(Y.metinDegeri("120 / 1.377")).toBe(120);
    expect(Y.metinDegeri("%40")).toBe(40);
    expect(Y.metinDegeri("—")).toBeNull();
    expect(Y.metinDegeri("29.09.2026")).toBe(Date.UTC(2026, 8, 29));
    // Tarih sayıdan önce: "12.09.2026" 12 değildir.
    expect(Y.metinDegeri("12.09.2026")).toBe(Date.UTC(2026, 8, 12));
    expect(Y.metinDegeri("SIP-2026-0451 +2")).toBe("SIP-2026-0451 +2");
  });

  it("sayı DEĞER olarak sıralanır; boş her iki yönde sonda", () => {
    expect(ids(Y.yerelSirala(SATIRLAR, SUTUNLAR, { alan: "metre", yon: "artan" }))).toBe("dabc");
    expect(ids(Y.yerelSirala(SATIRLAR, SUTUNLAR, { alan: "metre", yon: "azalan" }))).toBe("badc");
  });

  it("NEGATİF SONDA: metin karşılaştırması '999' > '1.234,5' der — model bunu yapmaz", () => {
    expect("999".localeCompare("1.234,5", "tr")).toBeGreaterThan(0);
    const sirali = Y.yerelSirala(SATIRLAR, SUTUNLAR, { alan: "metre", yon: "artan" }).map((r) => r.metre);
    expect(sirali.indexOf("999")).toBeLessThan(sirali.indexOf("1.234,5"));
  });

  it("tarih yıl sınırında doğru (31.12.2025 < 02.01.2026); NEGATİF SONDA: metin sırası tersini verirdi", () => {
    expect("31.12.2025".localeCompare("02.01.2026", "tr")).toBeGreaterThan(0);
    expect(ids(Y.yerelSirala(SATIRLAR, SUTUNLAR, { alan: "tarih", yon: "artan" }))).toBe("bacd");
  });

  it("metin Türkçe ve sayı duyarlı (T2 < T7 < T10); seçim yok/bilinmeyen alan → geliş sırası aynen", () => {
    expect(ids(Y.yerelSirala(SATIRLAR, SUTUNLAR, { alan: "no", yon: "artan" }))).toBe("dbca");
    expect(ids(Y.yerelSirala(SATIRLAR, SUTUNLAR, { alan: "musteri", yon: "artan" }))).toBe("dbac");
    expect(ids(Y.yerelSirala(SATIRLAR, SUTUNLAR, null))).toBe("abcd");
    expect(ids(Y.yerelSirala(SATIRLAR, SUTUNLAR, { alan: "yok", yon: "azalan" }))).toBe("abcd");
  });

  it("siraDegeri: false sütun sıralanamaz", () => {
    const xs = [...SUTUNLAR, { key: "x", baslik: "X", agirlik: 1, siraDegeri: false as const, hucre: () => "" }];
    expect(Y.yerelSiralanabilir(xs)).toEqual(["no", "musteri", "metre", "tarih", "not"]);
  });

  it("süzgeç alanları sütunlardan (tekil, Türkçe sıra); tek değerli alan çizilmez", () => {
    const gs = Y.sutunGruplari(SUTUNLAR, SATIRLAR);
    expect(gs.map((g) => g.anahtar)).toEqual(["musteri"]);
    expect(gs[0]!.secenekler.map((o) => o.deger)).toEqual(["Akın Boya", "Çınar Örme", "İPEK TEKSTİL"]);
    expect(Y.sutunGruplari(SUTUNLAR, SATIRLAR.slice(2, 3))).toEqual([]);
  });

  it("süzgeç alan içinde VEYA, arama her kelime; Türkçe katlama; gizli sütun da aranır", () => {
    const gs = Y.sutunGruplari(SUTUNLAR, SATIRLAR);
    expect(ids(Y.yerelSuz(SATIRLAR, SUTUNLAR, gs, { musteri: "İPEK TEKSTİL\nAkın Boya" }, ""))).toBe("acd");
    expect(ids(Y.yerelSuz(SATIRLAR, SUTUNLAR, gs, {}, "ipek t7"))).toBe("c");
    expect(ids(Y.yerelSuz(SATIRLAR, SUTUNLAR, gs, {}, "ACİL"))).toBe("b");
    // Tanınmayan değer süzmez (kalmamış seçim "kayıt yok" demez).
    expect(ids(Y.yerelSuz(SATIRLAR, SUTUNLAR, gs, { musteri: "Yok A.Ş." }, ""))).toBe("abcd");
  });
});

describe("kısa tablo çizimi", () => {
  const Tablo = (p: { satirlar?: readonly Satir[] }) => <KisaTablo anahtar="tablo.deneme" sutunlar={SUTUNLAR} varsayilan={["no", "musteri", "metre"]} satirlar={p.satirlar ?? SATIRLAR} aramaIpucu="Ara" testID="t" />;
  const satirSirasi = () => screen.getAllByTestId(/^t-satir-/).map((x) => String(x.props.testID).slice("t-satir-".length)).join("");

  it("az satırda araçlar küçük simge satırı (arama simgesi kutuyu açar); dört özellik erişilebilir", async () => {
    render(<Tablo />);
    await settle();
    expect(screen.getByTestId("t-simgeler")).toBeTruthy();
    expect(screen.queryByTestId("t-ara")).toBeNull();
    fireEvent.press(screen.getByTestId("t-ara-ac"));
    fireEvent.changeText(screen.getByTestId("t-ara"), "ipek");
    expect(satirSirasi()).toBe("ac");
    expect(screen.getByTestId("t-sayi")).toHaveTextContent("2 / 4 satır");
    expect(screen.getByTestId("t-suzgec")).toBeTruthy();
    expect(screen.getByTestId("t-sutunlar")).toBeTruthy();
  });

  it("başlığa dokununca artan → azalan → varsayılan; sayı değer olarak", async () => {
    render(<Tablo />);
    await settle();
    fireEvent.press(screen.getByTestId("t-sutun-metre"));
    await settle();
    expect(satirSirasi()).toBe("dabc");
    fireEvent.press(screen.getByTestId("t-sutun-metre"));
    await settle();
    expect(satirSirasi()).toBe("badc");
    fireEvent.press(screen.getByTestId("t-sutun-metre"));
    await settle();
    expect(satirSirasi()).toBe("abcd");
  });

  it("sütun seçimi varsayılanla açılır, değişiklik CİHAZDA saklanır ve yeniden açılışta okunur", async () => {
    const r = render(<Tablo />);
    await settle();
    const baslik = () => screen.getByTestId("t-baslik");
    expect(within(baslik()).queryByText("Tarih")).toBeNull();
    fireEvent.press(screen.getByTestId("t-sutunlar"));
    fireEvent.press(screen.getByTestId("t-sutun-secici-tarih"));
    await settle();
    expect(within(baslik()).getByText("Tarih")).toBeTruthy();
    r.unmount();
    render(<Tablo />);
    await settle();
    expect(within(baslik()).getByText("Tarih")).toBeTruthy();
    const keys = await AsyncStorage.getAllKeys();
    expect(keys.some((k) => k.endsWith(":tablo.deneme"))).toBe(true);
  });

  it("çok satırda tam araç şeridi (arama kutusu görünür); süzgeç sayfası kesin sonuç sayısıyla", async () => {
    const cok = Array.from({ length: 9 }, (_, i) => S(`x${i}`, `T${i}`, i % 2 ? "Akın Boya" : "Çınar Örme", String(i), "01.01.2026"));
    render(<Tablo satirlar={cok} />);
    await settle();
    expect(screen.getByTestId("t-ara")).toBeTruthy();
    expect(screen.queryByTestId("t-simgeler")).toBeNull();
    fireEvent.press(screen.getByTestId("t-suzgec"));
    expect(screen.getByTestId("t-suzgec-secici")).toBeTruthy();
  });
});

describe("cari kartı sunucu sayfalı sekme", () => {
  beforeEach(() => {
    mockSession.facility = { liste: { kimlikSuzgecleri: LIST_ID_FILTERS, aranabilir: Object.keys(LIST_SEARCH), siralama: Object.fromEntries(Object.entries(LIST_SORT).map(([p, f]) => [p, Object.keys(f)])) } };
    mockList.mockResolvedValue({ kayitlar: [{ id: "s1", kayit: { siparisNo: "SIP1", durum: "APPROVED" }, surum: "" }], sonraki: "imlec" });
  });

  it("başlıktan sıralama SUNUCUYA gider (cariKartId korunur); istemci yarım kümeyi sıralamaz", async () => {
    render(<CariSiparisTablosu cariKartId="c1" acik={false} />);
    await settle();
    fireEvent.press(screen.getByTestId("cari-siparis-tumu-sutun-tarih"));
    await settle();
    const son = mockList.mock.calls[mockList.mock.calls.length - 1]!;
    expect(son[0]).toBe("siparis");
    expect(son[1]).toMatchObject({ cariKartId: "c1", sirala: "siparisTarihi", yon: "artan" });
    expect(screen.getByTestId("cari-siparis-tumu-ara")).toBeTruthy();
    expect(screen.getByTestId("cari-siparis-tumu-sutunlar")).toBeTruthy();
  });

  it("açık görünüm: varsayılan sıra en eski önce, kullanıcı seçimi onu ezer", async () => {
    render(<CariSiparisTablosu cariKartId="c1" acik eskiOnce={{ alan: "siparisTarihi", yon: "artan" }} />);
    await settle();
    expect(mockList.mock.calls[0]![1]).toMatchObject({ suzgec: "ACIK", sirala: "siparisTarihi", yon: "artan" });
    fireEvent.press(screen.getByTestId("cari-siparis-acik-sutun-no"));
    await settle();
    expect(mockList.mock.calls[mockList.mock.calls.length - 1]![1]).toMatchObject({ suzgec: "ACIK", sirala: "siparisNo", yon: "artan" });
  });
});
