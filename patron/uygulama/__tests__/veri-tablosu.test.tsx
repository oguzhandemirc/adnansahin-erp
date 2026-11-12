// Veri tablosu bekçisi: saf model (sıralama döngüsü, en az bir / en çok N sütun, süzgeç rozeti, sunucu sorgusu),
// ekranda sıralama ve süzgecin SUNUCUYA parametre olarak gitmesi (istemci sıralamaz/süzmez) ve görünüm tercihinin
// profile gecikmeli yazımı (tek istek, geri okuma; örnek veri kipinde ve eski sunucuda buluta hiç gitmez).
import { act, fireEvent, render, screen } from "@testing-library/react-native";
import type { ReactElement } from "react";
import { Text } from "react-native";

const mockList = jest.fn();
const mockSnapshot = jest.fn();
const mockViewPref = jest.fn();
const mockViewPrefSet = jest.fn();
const mockCache = { load: jest.fn(async (_k: string, f: () => Promise<unknown>) => ({ data: await f(), offline: false, savedAt: "" })), peek: jest.fn(async () => null) };
const mockSession = {
  api: { list: mockList, snapshot: mockSnapshot, viewPref: mockViewPref, viewPrefSet: mockViewPrefSet },
  cache: mockCache, markOnline: jest.fn(),
  permissions: ["bulut:oturum", "bulut:siparis:oku", "bulut:cari:oku"] as string[], offline: false, offlineSince: null as string | null, facility: null as unknown, switchError: null as string | null,
};
const mockRouter = { push: jest.fn(), replace: jest.fn(), back: jest.fn(), navigate: jest.fn(), canGoBack: () => true };
let mockOrnek = false;
jest.mock("../src/state/session", () => ({ useSession: () => mockSession }));
jest.mock("expo-router", () => ({ useRouter: () => mockRouter, usePathname: () => "/siparisler", useLocalSearchParams: () => ({}) }));
jest.mock("react-native-safe-area-context", () => ({ useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }) }));
jest.mock("../src/ornek/kapi", () => ({ ...jest.requireActual("../src/ornek/kapi"), ornekVeriAcik: () => mockOrnek }));

const Orders = (require("../app/(app)/(tabs)/siparisler/index") as { default: () => ReactElement }).default;
const M = require("../src/ui/tablo/model") as typeof import("../src/ui/tablo/model");
const { useTabloTercihi, TERCIH_GECIKME_MS } = require("../src/ui/tablo/useTabloTercihi") as typeof import("../src/ui/tablo/useTabloTercihi");
const { LIST_ID_FILTERS, LIST_SEARCH, LIST_SORT } = require("../src/api/wire") as typeof import("../src/api/wire");

const ID1 = "11111111-1111-4111-8111-111111111111";
const ID2 = "22222222-2222-4222-8222-222222222222";
const rec = (id: string, kayit: Record<string, unknown>) => ({ id, kayit, surum: "2026-11-13T09:00:00.000Z" });
const page = (...kayitlar: unknown[]) => ({ kayitlar, sonraki: null });
const SIRALI = {
  tesis: { id: "t1" }, hesap: { id: "h1" },
  liste: { kimlikSuzgecleri: LIST_ID_FILTERS, aranabilir: Object.keys(LIST_SEARCH), siralama: Object.fromEntries(Object.entries(LIST_SORT).map(([p, a]) => [p, Object.keys(a)])) },
};

async function settle() {
  await act(async () => undefined);
  await act(async () => undefined);
  await act(async () => undefined);
}

const memStore = () => {
  const m = new Map<string, string>();
  return { m, get: jest.fn(async (k: string) => m.get(k) ?? null), set: jest.fn(async (k: string, v: string) => void m.set(k, v)), remove: jest.fn(async (k: string) => void m.delete(k)) };
};

beforeEach(() => {
  mockOrnek = false;
  mockSession.facility = SIRALI;
  mockSession.offline = false;
  mockList.mockReset();
  mockViewPref.mockReset();
  mockViewPrefSet.mockReset();
  mockViewPref.mockResolvedValue({ anahtar: "tablo.siparis", deger: null, guncelleme: null });
  mockViewPrefSet.mockImplementation(async (anahtar: string, deger: unknown) => ({ anahtar, deger, guncelleme: "x" }));
  mockSnapshot.mockResolvedValue({ projeksiyon: "ozet.siparis", veri: {}, surum: "x" });
});

describe("§1 saf model", () => {
  it("sıralama döngüsü: artan → azalan → kapalı; başka sütun yeniden artandan başlar", () => {
    const a = M.sonrakiSiralama(null, "acikMiktar");
    expect(a).toEqual({ alan: "acikMiktar", yon: "artan" });
    const b = M.sonrakiSiralama(a, "acikMiktar");
    expect(b).toEqual({ alan: "acikMiktar", yon: "azalan" });
    expect(M.sonrakiSiralama(b, "acikMiktar")).toBeNull();
    expect(M.sonrakiSiralama(b, "siparisNo")).toEqual({ alan: "siparisNo", yon: "artan" });
  });

  it("sütun seçimi: son sütun gizlenemez, azamiden fazla eklenmez; taşıma sınırda değişmez", () => {
    expect(M.sutunDegistir(["no"], "no", 4)).toEqual(["no"]);
    expect(M.sutunDegistir(["a", "b", "c", "d"], "e", 4)).toEqual(["a", "b", "c", "d"]);
    expect(M.sutunDegistir(["a", "b"], "c", 4)).toEqual(["a", "b", "c"]);
    expect(M.sutunDegistir(["a", "b"], "a", 4)).toEqual(["b"]);
    expect(M.sutunTasi(["a", "b", "c"], "a", -1)).toEqual(["a", "b", "c"]);
    expect(M.sutunTasi(["a", "b", "c"], "a", 1)).toEqual(["b", "a", "c"]);
    expect(M.azamiSutun(390)).toBe(M.TELEFON_SUTUN);
    expect(M.azamiSutun(800)).toBe(M.GENIS_SUTUN);
  });

  it("rozet etkin grup sayısıdır; aynı değere yeniden dokunmak seçimi kaldırır", () => {
    let s = M.suzgecSec({}, "ana", "ACIK");
    s = M.suzgecSec(s, "yon", "IHRACAT");
    expect(M.etkinSuzgecSayisi(s)).toBe(2);
    expect(M.etkinSuzgecSayisi(M.suzgecSec(s, "yon", "IHRACAT"))).toBe(1);
  });

  it("sunucu sorgusu bilinmeyen grup/değer ve beyansız sıralama alanı göndermez; gecikme seçeneği hariç tutulur", () => {
    const gs = M.gruplar(LIST_SEARCH.siparis!, true, ["gecikmis"]);
    expect(gs.map((g) => g.anahtar)).toEqual(["ana", "yon"]);
    expect(gs[0]!.secenekler.some((o) => o.deger === "GECIKMIS")).toBe(false);
    const t = { surum: 1 as const, sutunlar: ["no"], siralama: { alan: "termin", yon: "artan" as const }, suzgec: { ana: "ACIK", yon: "IHRACAT", eski: "X" } };
    expect(M.sunucuSorgusu(t, " sp ", gs, ["siparisNo"])).toEqual({ ara: "sp", suzgec: "ACIK,IHRACAT" });
    expect(M.sunucuSorgusu({ ...t, suzgec: { ana: "GECIKMIS" }, siralama: { alan: "siparisNo", yon: "azalan" } }, "", gs, ["siparisNo"])).toEqual({ sirala: "siparisNo", yon: "azalan" });
    // Eski sunucu: çoklu süzgeç yok → yalnız ana grup.
    expect(M.gruplar(LIST_SEARCH.siparis!, false).map((g) => g.anahtar)).toEqual(["ana"]);
  });

  it("saklı tercih güvenle okunur: bilinmeyen sütun düşer, boş kalırsa varsayılan, bozuk değer varsayılan", () => {
    const varsayilan = { surum: 1 as const, sutunlar: ["no", "musteri"], siralama: null, suzgec: {} };
    const o = { varsayilan, sutunlar: ["no", "musteri", "acik"], azami: 4 };
    expect(M.tercihiTemizle({ sutunlar: ["yok", "acik", "acik"], siralama: { alan: "x", yon: "yan" } }, o)).toEqual({ surum: 1, sutunlar: ["acik"], siralama: null, suzgec: {} });
    expect(M.tercihiTemizle({ sutunlar: ["yok"] }, o).sutunlar).toEqual(["no", "musteri"]);
    expect(M.tercihiTemizle("bozuk", o)).toBe(varsayilan);
  });
});

describe("§2 ekran: sıralama ve süzgeç SUNUCUDA", () => {
  it("başlığa dokunmak `sirala/yon` gönderir (artan → azalan → kapalı); satırlar sunucunun sırasıyla kalır", async () => {
    mockList.mockResolvedValue(page(rec(ID2, { siparisNo: "SP-2", acikMiktar: 10, durum: "APPROVED" }), rec(ID1, { siparisNo: "SP-1", acikMiktar: 50, durum: "APPROVED" })));
    render(<Orders />);
    await settle();
    expect(mockList).toHaveBeenLastCalledWith("siparis", expect.objectContaining({ sirala: undefined, yon: undefined }));
    fireEvent.press(screen.getByTestId("siparis-sutun-acik"));
    await settle();
    expect(mockList).toHaveBeenLastCalledWith("siparis", expect.objectContaining({ sirala: "acikMiktar", yon: "artan" }));
    expect(screen.getByTestId("siparis-ok-acik")).toBeTruthy();
    // İstemci yeniden sıralamaz: sunucu ne döndürdüyse o sıra (10 m, 50 m — artanda da sunucunun dizisi).
    const satirlar = screen.getAllByTestId(/^siparis-satir-/).map((n) => n.props.testID as string);
    expect(satirlar).toEqual([`siparis-satir-${ID2}`, `siparis-satir-${ID1}`]);
    fireEvent.press(screen.getByTestId("siparis-sutun-acik"));
    await settle();
    expect(mockList).toHaveBeenLastCalledWith("siparis", expect.objectContaining({ sirala: "acikMiktar", yon: "azalan" }));
    fireEvent.press(screen.getByTestId("siparis-sutun-acik"));
    await settle();
    expect(mockList).toHaveBeenLastCalledWith("siparis", expect.objectContaining({ sirala: undefined }));
    expect(screen.queryByTestId("siparis-ok-acik")).toBeNull();
  });

  it("sıralanamayan sütun (durum) düğme değildir; sunucu sıralamayı beyan etmezse hiçbir başlık düğme değildir", async () => {
    mockList.mockResolvedValue(page());
    const v = render(<Orders />);
    await settle();
    expect(screen.getByTestId("siparis-sutun-durum").props.accessibilityRole).toBeUndefined();
    expect(screen.getByTestId("siparis-sutun-no").props.accessibilityRole).toBe("button");
    v.unmount();
    mockSession.facility = { ...SIRALI, liste: { ...SIRALI.liste, siralama: undefined } };
    render(<Orders />);
    await settle();
    expect(screen.getByTestId("siparis-sutun-no").props.accessibilityRole).toBeUndefined();
  });

  it("iki gruptan süzgeç: rozet 2, sunucuya `suzgec=ACIK,IHRACAT`; dönen satır istemcide süzülmez; Temizle kaldırır", async () => {
    mockList.mockResolvedValue(page(rec(ID1, { siparisNo: "SP-KAPALI", durum: "COMPLETED", yon: "DOMESTIC" })));
    render(<Orders />);
    await settle();
    expect(screen.queryByTestId("siparis-suzgec-rozet")).toBeNull();
    fireEvent.press(screen.getByTestId("siparis-suzgec"));
    expect(screen.queryByTestId("siparis-suzgec-secici-ana-GECIKMIS")).toBeNull();
    fireEvent.press(screen.getByTestId("siparis-suzgec-secici-ana-ACIK"));
    fireEvent.press(screen.getByTestId("siparis-suzgec-secici-yon-IHRACAT"));
    await settle();
    expect(mockList).toHaveBeenLastCalledWith("siparis", expect.objectContaining({ suzgec: "ACIK,IHRACAT" }));
    expect(screen.getByTestId("siparis-suzgec-rozet")).toBeTruthy();
    expect(screen.getByText("2")).toBeTruthy();
    expect(screen.getByText("SP-KAPALI")).toBeTruthy();
    fireEvent.press(screen.getByTestId("siparis-suzgec-secici-temizle"));
    await settle();
    expect(mockList).toHaveBeenLastCalledWith("siparis", expect.objectContaining({ suzgec: undefined }));
  });

  it("sütun seçimi: gizli sütun eklenir, azamiden fazlası eklenmez, son sütun gizlenemez", async () => {
    const azami = M.azamiSutun(require("react-native").Dimensions.get("window").width as number);
    mockList.mockResolvedValue(page(rec(ID1, { siparisNo: "SP-1", musteriAdi: "A", siparisTarihi: "2026-11-01", durum: "APPROVED" })));
    render(<Orders />);
    await settle();
    fireEvent.press(screen.getByTestId("siparis-sutunlar"));
    const gizli = ["tarih", "sevk", "kalem", "yon"]; // varsayılan 4 sütunun dışındakiler, tanım sırasıyla
    for (const k of gizli) fireEvent.press(screen.getByTestId(`siparis-sutun-secici-${k}`));
    const gorunen = gizli.filter((k) => screen.queryByTestId(`siparis-sutun-${k}`) !== null);
    expect(gorunen).toEqual(gizli.slice(0, Math.max(0, azami - 4))); // azamiye ulaşınca yenisi eklenmez
    for (const k of ["no", "musteri", "acik", "durum", ...gorunen.slice(1)]) fireEvent.press(screen.getByTestId(`siparis-sutun-secici-${k}`));
    const kalan = gorunen[0] ?? "durum";
    expect(screen.getByTestId(`siparis-sutun-${kalan}`)).toBeTruthy(); // son sütun gizlenemez
    expect(screen.getAllByTestId(/^siparis-sutun-(no|musteri|acik|durum|tarih|sevk|kalem|yon)$/)).toHaveLength(1);
  });
});

/** Hook'u yalın bir bileşende sürer: tercih metni + degistir tetikleyici. */
function Prob({ store, olay }: { store: ReturnType<typeof memStore>; olay: { degistir?: (s: readonly string[]) => void } }) {
  const varsayilan = { surum: 1 as const, sutunlar: ["no"], siralama: null, suzgec: {} };
  const p = useTabloTercihi("tablo.siparis", (ham) => M.tercihiTemizle(ham, { varsayilan, sutunlar: ["no", "musteri", "acik", "tarih"], azami: 4 }), store);
  olay.degistir = (s) => p.degistir((t) => ({ ...t, sutunlar: s }));
  return <Text testID="tercih">{`${p.hazir ? "hazir" : "bekliyor"}:${p.tercih.sutunlar.join(",")}`}</Text>;
}

describe("§3 görünüm tercihi profilde", () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  it("ardışık değişiklikler gecikmeyle TEK `viewPrefSet` olur (son değer); öncesinde istek yok, yerel hemen yazılır", async () => {
    const store = memStore();
    const olay: { degistir?: (s: readonly string[]) => void } = {};
    render(<Prob store={store} olay={olay} />);
    await settle();
    act(() => olay.degistir!(["no", "musteri"]));
    act(() => olay.degistir!(["no", "musteri", "acik"]));
    expect(screen.getByTestId("tercih").props.children).toBe("hazir:no,musteri,acik");
    await act(async () => { jest.advanceTimersByTime(TERCIH_GECIKME_MS - 50); });
    expect(mockViewPrefSet).not.toHaveBeenCalled();
    expect(JSON.parse([...store.m.values()][0]!)).toEqual(expect.objectContaining({ kirli: true }));
    await act(async () => { jest.advanceTimersByTime(100); });
    await settle();
    expect(mockViewPrefSet).toHaveBeenCalledTimes(1);
    expect(mockViewPrefSet).toHaveBeenCalledWith("tablo.siparis", expect.objectContaining({ sutunlar: ["no", "musteri", "acik"] }));
    expect(JSON.parse([...store.m.values()][0]!)).toEqual(expect.objectContaining({ kirli: false }));
  });

  it("geri okuma: kirli yerel yoksa bulut değeri (başka cihazdaki seçim) gelir", async () => {
    mockViewPref.mockResolvedValue({ anahtar: "tablo.siparis", deger: { surum: 1, sutunlar: ["tarih", "no"], siralama: null, suzgec: {} }, guncelleme: "x" });
    render(<Prob store={memStore()} olay={{}} />);
    await settle();
    expect(mockViewPref).toHaveBeenCalledWith("tablo.siparis");
    expect(screen.getByTestId("tercih").props.children).toBe("hazir:tarih,no");
  });

  it("kirli yerel değer buluta üstün: açılışta bulut okunmaz, yerel gönderilir", async () => {
    const store = memStore();
    store.m.set("tablo-tercihi:t1:h1:tablo.siparis", JSON.stringify({ deger: { surum: 1, sutunlar: ["acik"], siralama: null, suzgec: {} }, kirli: true }));
    render(<Prob store={store} olay={{}} />);
    await settle();
    expect(mockViewPref).not.toHaveBeenCalled();
    expect(mockViewPrefSet).toHaveBeenCalledWith("tablo.siparis", expect.objectContaining({ sutunlar: ["acik"] }));
    expect(screen.getByTestId("tercih").props.children).toBe("hazir:acik");
  });

  it("örnek veri kipinde ve sıralama beyan etmeyen eski sunucuda buluta HİÇ gidilmez; yerel yine yazılır", async () => {
    for (const kurulum of [() => { mockOrnek = true; }, () => { mockSession.facility = { ...SIRALI, liste: { ...SIRALI.liste, siralama: undefined } }; }]) {
      mockOrnek = false;
      mockSession.facility = SIRALI;
      kurulum();
      const store = memStore();
      const olay: { degistir?: (s: readonly string[]) => void } = {};
      const v = render(<Prob store={store} olay={olay} />);
      await settle();
      act(() => olay.degistir!(["musteri"]));
      await act(async () => { jest.advanceTimersByTime(TERCIH_GECIKME_MS * 2); });
      await settle();
      expect(mockViewPref).not.toHaveBeenCalled();
      expect(mockViewPrefSet).not.toHaveBeenCalled();
      expect(JSON.parse([...store.m.values()][0]!)).toEqual({ deger: expect.objectContaining({ sutunlar: ["musteri"] }), kirli: false });
      v.unmount();
    }
  });

  it("çevrimdışıyken yazılmaz; bağlantı dönünce bekleyen değer gönderilir", async () => {
    mockSession.offline = true;
    const olay: { degistir?: (s: readonly string[]) => void } = {};
    const store = memStore();
    const v = render(<Prob store={store} olay={olay} />);
    await settle();
    act(() => olay.degistir!(["tarih"]));
    await act(async () => { jest.advanceTimersByTime(TERCIH_GECIKME_MS * 2); });
    expect(mockViewPrefSet).not.toHaveBeenCalled();
    mockSession.offline = false;
    v.rerender(<Prob store={store} olay={olay} />);
    await settle();
    expect(mockViewPrefSet).toHaveBeenCalledWith("tablo.siparis", expect.objectContaining({ sutunlar: ["tarih"] }));
  });
});
