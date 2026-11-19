// "İptaller hariç" süzgeci (bulut 2026-11-19 `IPTAL_HARIC`, ters eşitlik): seçenek YALNIZ `/oturum` `liste.suzgecDegerleri`
// onu beyan ediyorsa çizilir ve gönderilir — eski bulut tanımadığı değere 400 döner (FAIL-CLOSED). §1 saf — sipariş ve
// sevkiyat beyanı · §2 ekran — Siparişler süzgecinde seçenek, sunucuya `suzgec=IPTAL_HARIC`, saklı seçim yeniden açılışta
// gönderilir · NEGATİF: eski bulutta seçenek yok ve saklı seçim GÖNDERİLMEZ; varsayılan (seçim yok) bugünkü gibi hepsi.
import { act, fireEvent, render, screen } from "@testing-library/react-native";
import type { ReactElement } from "react";

const mockList = jest.fn();
const mockViewPref = jest.fn();
const mockCache = { load: jest.fn(async (_k: string, f: () => Promise<unknown>) => ({ data: await f(), offline: false, savedAt: "" })), peek: jest.fn(async () => null) };
const mockSession = {
  api: { list: mockList, snapshot: jest.fn(async () => ({ projeksiyon: "ozet.siparis", veri: {}, surum: "x" })), viewPref: mockViewPref, viewPrefSet: jest.fn(async (anahtar: string, deger: unknown) => ({ anahtar, deger, guncelleme: "x" })) },
  cache: mockCache, markOnline: jest.fn(),
  permissions: ["bulut:oturum", "bulut:siparis:oku", "bulut:cari:oku"] as string[], offline: false, offlineSince: null as string | null, facility: null as unknown, switchError: null as string | null,
};
jest.mock("../src/state/session", () => ({ useSession: () => mockSession }));
jest.mock("expo-router", () => ({
  useRouter: () => ({ push: jest.fn(), replace: jest.fn(), back: jest.fn(), navigate: jest.fn(), canGoBack: () => true }),
  usePathname: () => "/siparisler", useLocalSearchParams: () => ({}),
}));
jest.mock("react-native-safe-area-context", () => ({ useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }) }));

const Orders = (require("../app/(app)/(tabs)/siparisler/index") as { default: () => ReactElement }).default;
const { listCapability } = require("../src/ui/siparis/capabilities") as typeof import("../src/ui/siparis/capabilities");
const { LIST_ID_FILTERS, LIST_SEARCH, LIST_SORT } = require("../src/api/wire") as typeof import("../src/api/wire");
type Facility = import("../src/api/wire").FacilityStatus;

const degerler = (p: string) => {
  const s = LIST_SEARCH[p]!;
  return [...(s.suzgec?.secenekler ?? []), ...(s.ekSuzgecler ?? []).flatMap((g) => g.secenekler)].map((o) => o.deger);
};
const TABAN = { kimlikSuzgecleri: LIST_ID_FILTERS, aranabilir: Object.keys(LIST_SEARCH), siralama: Object.fromEntries(Object.entries(LIST_SORT).map(([p, a]) => [p, Object.keys(a)])) };
const YENI = { tesis: { id: "t1" }, hesap: { id: "h1" }, liste: { ...TABAN, suzgecDegerleri: { siparis: degerler("siparis"), sevkiyat: degerler("sevkiyat") } } };
const ESKI = { tesis: { id: "t1" }, hesap: { id: "h1" }, liste: TABAN };
const ana = (f: unknown, p: string) => listCapability(f as Facility).search(p)?.suzgec?.secenekler.map((o) => o.deger) ?? [];

async function settle() {
  for (let i = 0; i < 3; i++) await act(async () => undefined);
}

beforeEach(() => {
  mockSession.facility = YENI;
  mockList.mockReset();
  mockList.mockResolvedValue({ kayitlar: [], sonraki: null });
  mockViewPref.mockReset();
  mockViewPref.mockResolvedValue({ anahtar: "tablo.siparis", deger: null, guncelleme: null });
});

describe("§1 saf kapı", () => {
  it("yeni bulut beyan ediyorsa sipariş + sevkiyat 'İptaller hariç' seçeneği var", () => {
    expect(ana(YENI, "siparis")).toContain("IPTAL_HARIC");
    expect(ana(YENI, "sevkiyat")).toContain("IPTAL_HARIC");
    expect(listCapability(YENI as unknown as Facility).search("sevkiyat")?.suzgec?.secenekler.find((o) => o.deger === "IPTAL_HARIC")?.etiket).toBe("İptaller hariç");
  });

  it("NEGATİF: beyan etmeyen eski bulutta ters eşitlik seçeneği yok, eski değerler aynen", () => {
    expect(ana(ESKI, "siparis")).not.toContain("IPTAL_HARIC");
    expect(ana(ESKI, "sevkiyat")).not.toContain("IPTAL_HARIC");
    expect(ana(ESKI, "siparis")).toEqual(degerler("siparis").filter((d) => d !== "IPTAL_HARIC" && LIST_SEARCH.siparis!.suzgec!.secenekler.some((o) => o.deger === d)));
    // Beyan varsa yalnız beyanlı değerler (bulut bir değeri bırakırsa uygulama da bırakır).
    const kismi = { ...YENI, liste: { ...TABAN, suzgecDegerleri: { sevkiyat: ["PLANLI", "IPTAL"] } } };
    expect(ana(kismi, "sevkiyat")).toEqual(["PLANLI", "IPTAL"]);
    // Kopya kararlı (kancalar kimliğe göre yeniden hesaplar).
    expect(listCapability(ESKI as unknown as Facility).search("siparis")).toBe(listCapability(ESKI as unknown as Facility).search("siparis"));
  });
});

describe("§2 Siparişler ekranı", () => {
  it("varsayılan seçim yok (hepsi görünür); 'İptaller hariç' seçilince sunucuya `suzgec=IPTAL_HARIC`", async () => {
    render(<Orders />);
    await settle();
    expect(mockList).toHaveBeenLastCalledWith("siparis", expect.objectContaining({ suzgec: undefined }));
    fireEvent.press(screen.getByTestId("siparis-suzgec"));
    fireEvent.press(screen.getByTestId("siparis-suzgec-secici-alan-ana"));
    fireEvent.press(screen.getByTestId("siparis-suzgec-secici-ana-IPTAL_HARIC"));
    fireEvent.press(screen.getByTestId("siparis-suzgec-secici-uygula"));
    await settle();
    expect(mockList).toHaveBeenLastCalledWith("siparis", expect.objectContaining({ suzgec: "IPTAL_HARIC" }));
    expect(screen.getByTestId("siparis-suzgec-etkin-ana")).toHaveTextContent("İptaller hariç", { exact: false });
  });

  it("saklı seçim yeniden açılışta gönderilir (tercih hatırlanır)", async () => {
    mockViewPref.mockResolvedValue({ anahtar: "tablo.siparis", deger: { surum: 1, sutunlar: [], siralama: null, suzgec: { ana: "IPTAL_HARIC" } }, guncelleme: "x" });
    render(<Orders />);
    await settle();
    expect(mockList).toHaveBeenLastCalledWith("siparis", expect.objectContaining({ suzgec: "IPTAL_HARIC" }));
  });

  it("NEGATİF: eski bulutta seçenek çizilmez ve saklı 'İptaller hariç' GÖNDERİLMEZ (400 yerine süzgeçsiz liste)", async () => {
    mockSession.facility = ESKI;
    mockViewPref.mockResolvedValue({ anahtar: "tablo.siparis", deger: { surum: 1, sutunlar: [], siralama: null, suzgec: { ana: "IPTAL_HARIC" } }, guncelleme: "x" });
    render(<Orders />);
    await settle();
    expect(mockList).toHaveBeenCalled();
    for (const c of mockList.mock.calls) expect(String((c[1] as { suzgec?: string }).suzgec ?? "")).not.toContain("IPTAL_HARIC");
    fireEvent.press(screen.getByTestId("siparis-suzgec"));
    fireEvent.press(screen.getByTestId("siparis-suzgec-secici-alan-ana"));
    expect(screen.queryByTestId("siparis-suzgec-secici-ana-IPTAL_HARIC")).toBeNull();
    expect(screen.getByTestId("siparis-suzgec-secici-ana-IPTAL")).toBeTruthy();
  });
});
