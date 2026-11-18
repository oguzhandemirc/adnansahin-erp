// Cari ayrıntısı bekçisi (2026-11-19): Siparişler/Sevkiyatlar sekmeleri ortak tablonun SOLA dayalı sütunlarıyla çizilir
// (sipariş listesiyle aynı tanımlar, `durum.ts` rozetleri), sekme adını yineleyen bölüm başlığı yok, Tümü/Açık kompakt
// seçimle sunucu süzgecini değiştirir, sevk no kırpılmaz, alttaki "Fabrika verisi" damgası kaydın `surum`undan DEĞİL son
// paket ufkundan (`factoryStamp`) gelir.
import { act, fireEvent, render, screen, within } from "@testing-library/react-native";
import type { ReactElement } from "react";
import { StyleSheet } from "react-native";

const mockList = jest.fn();
const mockRecord = jest.fn();
const mockSummary = jest.fn();
const mockCache = { load: jest.fn(async (_k: string, f: () => Promise<unknown>) => ({ data: await f(), offline: false, savedAt: "" })), peek: jest.fn(async () => null) };
const mockSession = {
  api: { list: mockList, record: mockRecord, snapshot: jest.fn(), customerSummary: mockSummary, viewPref: jest.fn(async () => null) },
  cache: mockCache, markOnline: jest.fn(),
  permissions: [] as string[], offline: false, offlineSince: null as string | null, facility: null as unknown, switchError: null as string | null,
  factoryStamp: "2026-11-18T21:10:00.000Z" as string | null,
};
const mockRouter = { push: jest.fn(), replace: jest.fn(), back: jest.fn(), navigate: jest.fn(), canGoBack: () => true };
jest.mock("../src/state/session", () => ({ useSession: () => mockSession }));
jest.mock("expo-router", () => ({ useRouter: () => mockRouter, usePathname: () => "/cariler", useLocalSearchParams: () => ({ id: "0b7c5a1e-4f2d-4c8e-9a51-3d6f2e8b1c40" }) }));
jest.mock("react-native-safe-area-context", () => ({ useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }) }));

const CustomerDetail = (require("../app/(app)/(tabs)/cariler/[id]") as { default: () => ReactElement }).default;
const { LIST_ID_FILTERS, LIST_SEARCH } = require("../src/api/wire") as typeof import("../src/api/wire");
const { siparisDurumu } = require("../src/ui/siparis/durum") as typeof import("../src/ui/siparis/durum");
const { sevkDurumu } = require("../src/ui/sevkiyat/durum") as typeof import("../src/ui/sevkiyat/durum");

const ID = "0b7c5a1e-4f2d-4c8e-9a51-3d6f2e8b1c40";
// Kaydın sürümü ESKİ (cari kartı 16.11'den beri değişmedi); fabrika verisi 19.11 00:10 (İstanbul).
const rec = (id: string, kayit: Record<string, unknown>) => ({ id, kayit, surum: "2026-11-15T21:09:00.000Z" });
const page = (...kayitlar: unknown[]) => ({ kayitlar, sonraki: null });
const AC = { siparisSayisi: 1, kalemSayisi: 1, acikMiktar: [] };
const URUN = { urunId: "u1", urunAdi: "PANOS", renkId: "r1", renkAdi: "03-KREM", birim: "MT", miktar: 15500, siparisSayisi: 9 };
const DONEM = { siparisSayisi: 2, kalemSayisi: 2, siparisMiktari: [], sevk: { metre: 0, top: 0, kg: 0, tartiliCuval: 0, cuval: 0 }, iade: { adet: 0, metre: 0 }, enCokUrun: [URUN] };
const OZET = { cariKartId: ID, son12AyBaslangic: null, surum: "2026-11-18T21:10:00.000Z", ozet: { tumZamanlar: DONEM, son12Ay: DONEM, acik: AC, sonSiparisTarihi: "2026-11-18", sonSevkTarihi: "2026-11-17" } };

const SIP = rec("s1", { siparisNo: "SIP1811260003", durum: "APPROVED", acik: true, cariKartId: ID, siparisTarihi: "2026-11-18", sevkMiktari: "120", toplamMiktar: "1377", termin: "2026-12-01" });
const SIP2 = rec("s2", { siparisNo: "SIP1611260005", durum: "PARTIAL_SHIPPED", acik: true, cariKartId: ID, siparisTarihi: "2026-11-16", sevkMiktari: "100", toplamMiktar: "270", termin: null });
const SEVK = rec("v1", { sevkNo: "SVK1811260003", durum: "DISPATCHED", cariKartId: ID, cikisTarihi: "2026-11-18T08:00:00.000Z", topSayisi: 12, toplamMetre: "1377.5", toplamKg: "310", cuvalSayisi: 3 });
const SEVK_IPTAL = rec("v2", { sevkNo: "SVK1611260001", durum: "CANCELLED", cariKartId: ID, olusturulma: "2026-11-16T08:00:00.000Z", topSayisi: 0, toplamMetre: "0", toplamKg: "0", cuvalSayisi: 0 });

async function settle() {
  for (let i = 0; i < 3; i++) await act(async () => undefined);
}

const sagaYasli = (el: { props: { style?: unknown } }) => (StyleSheet.flatten(el.props.style as never) as { textAlign?: string } | undefined)?.textAlign === "right";

beforeEach(() => {
  mockList.mockReset();
  mockRouter.push.mockReset();
  mockSession.facility = { liste: { kimlikSuzgecleri: LIST_ID_FILTERS, aranabilir: Object.keys(LIST_SEARCH) } };
  mockSession.factoryStamp = "2026-11-18T21:10:00.000Z";
  mockSession.permissions = ["bulut:oturum", "bulut:siparis:oku", "bulut:sevkiyat:oku", "bulut:cari:oku"];
  mockRecord.mockResolvedValue(rec(ID, { ad: "SMHTEX TEKSTİL", kod: "MUS1707260012", musteriRolu: true }));
  mockSummary.mockResolvedValue(OZET);
  mockList.mockImplementation((p: string, q: Record<string, unknown>) => {
    if (p === "siparis") return Promise.resolve(q.suzgec === "ACIK" ? page(SIP) : page(SIP, SIP2));
    if (p === "sevkiyat") return Promise.resolve(page(SEVK, SEVK_IPTAL));
    return Promise.resolve(page());
  });
});

describe("Siparişler sekmesi", () => {
  it("sütunlu ve sola dayalı: No · Tarih · Sevk / Toplam · Termin · Durum; rozet durum.ts'den; yinelenen başlık yok", async () => {
    render(<CustomerDetail />);
    await settle();
    fireEvent.press(screen.getByTestId("cari-sekme-siparisler"));
    await settle();
    const baslik = screen.getByTestId("cari-siparis-tumu-baslik");
    for (const b of ["No", "Tarih", "Sevk / Toplam", "Termin", "Durum"]) expect(within(baslik).getByText(b)).toBeTruthy();
    const satir = screen.getByTestId("cari-siparis-tumu-satir-s1");
    expect(within(satir).getByText("SIP1811260003")).toBeTruthy();
    expect(within(satir).getByText("18.11.2026")).toBeTruthy();
    expect(within(satir).getByText("120 / 1.377")).toBeTruthy();
    expect(within(satir).getByText("01.12.2026")).toBeTruthy();
    expect(within(satir).getByText(siparisDurumu("APPROVED").kisa)).toBeTruthy();
    expect(within(screen.getByTestId("cari-siparis-tumu-satir-s2")).getByText(siparisDurumu("PARTIAL_SHIPPED").kisa)).toBeTruthy();
    // Hiçbir başlık ya da hücre sağa yaslı değil.
    expect(within(baslik).UNSAFE_queryAllByType(require("react-native").Text).filter(sagaYasli)).toHaveLength(0);
    expect(within(satir).UNSAFE_queryAllByType(require("react-native").Text).filter(sagaYasli)).toHaveLength(0);
    expect(screen.queryByText("SİPARİŞLER")).toBeNull();
    fireEvent.press(satir);
    expect(mockRouter.push).toHaveBeenCalledWith({ pathname: "/siparisler/[id]", params: { id: "s1" } });
  });

  it("kompakt seçim: Açık → sunucu süzgeci ACIK ve açık tablo", async () => {
    render(<CustomerDetail />);
    await settle();
    fireEvent.press(screen.getByTestId("cari-sekme-siparisler"));
    await settle();
    expect(screen.getByTestId("cari-siparis-gorunum-secim")).toBeTruthy();
    expect(screen.queryByTestId("cari-siparis-acik-satir-s1")).toBeNull();
    fireEvent.press(screen.getByTestId("cari-siparis-gorunum-ACIK"));
    await settle();
    expect(mockList).toHaveBeenCalledWith("siparis", expect.objectContaining({ cariKartId: ID, suzgec: "ACIK" }));
    expect(screen.getByTestId("cari-siparis-acik-satir-s1")).toBeTruthy();
    expect(screen.queryByTestId("cari-siparis-acik-satir-s2")).toBeNull();
  });
});

describe("Sevkiyatlar sekmesi", () => {
  it("sütunlu: Sevk no (kırpılmaz) · Tarih · Top · Metre · Kg · Çuval · Durum; iptal kırmızı", async () => {
    render(<CustomerDetail />);
    await settle();
    fireEvent.press(screen.getByTestId("cari-sekme-sevkiyatlar"));
    await settle();
    const baslik = screen.getByTestId("cari-sevk-tumu-baslik");
    for (const b of ["Sevk no", "Tarih", "Top", "Metre", "Kg", "Çuval", "Durum"]) expect(within(baslik).getByText(b)).toBeTruthy();
    const satir = screen.getByTestId("cari-sevk-tumu-satir-v1");
    expect(within(satir).getByText("SVK1811260003")).toBeTruthy();
    expect(within(satir).getByText("12")).toBeTruthy();
    expect(within(satir).getByText("Sevk edildi")).toBeTruthy();
    expect(within(screen.getByTestId("cari-sevk-tumu-satir-v2")).getByText("İptal")).toBeTruthy();
    expect(screen.queryByText("SEVKİYATLAR")).toBeNull();
    expect(sevkDurumu("CANCELLED").ton).toBe("danger");
    expect(sevkDurumu("DISPATCHED").ton).toBe("success");
    expect(sevkDurumu("PLANNED").ton).toBe("warning");
  });
});

describe("Fabrika verisi damgası", () => {
  it("kaydın eski surum'u değil son paket ufku (her sekmede aynı, başlıktaki göstergeyle aynı an)", async () => {
    render(<CustomerDetail />);
    await settle();
    expect(screen.getByTestId("fabrika-veri-ani").props.children).toBe("Fabrika verisi 19.11.2026 00:10");
    fireEvent.press(screen.getByTestId("cari-sekme-siparisler"));
    await settle();
    expect(screen.getByTestId("fabrika-veri-ani").props.children).toBe("Fabrika verisi 19.11.2026 00:10");
  });

  it("eşitleme hiç gelmediyse damga çizilmez (uydurma an yok)", async () => {
    mockSession.factoryStamp = null;
    render(<CustomerDetail />);
    await settle();
    expect(screen.queryByTestId("fabrika-veri-ani")).toBeNull();
  });
});

describe("Özet sekmesi (2026-11-19 düzeni)", () => {
  it("dönem kompakt seçim; açık siparişler tablo (en eski önce); son siparişler YİNELENMEZ; son sevkiyatlar tablo; öne çıkanlar", async () => {
    mockSession.facility = { liste: { kimlikSuzgecleri: LIST_ID_FILTERS, aranabilir: Object.keys(LIST_SEARCH), siralama: { siparis: ["siparisTarihi"] } } };
    render(<CustomerDetail />);
    await settle();
    expect(screen.getByTestId("cari-donem-secim")).toBeTruthy();
    expect(mockList).toHaveBeenCalledWith("siparis", expect.objectContaining({ suzgec: "ACIK", sirala: "siparisTarihi", yon: "artan" }));
    const acikBaslik = screen.getByTestId("cari-acik-tablo-baslik");
    for (const b of ["No", "Tarih", "Sevk / Toplam", "Termin", "Durum"]) expect(within(acikBaslik).getByText(b)).toBeTruthy();
    expect(screen.queryByTestId("cari-siparisler")).toBeNull();
    const sevkBaslik = screen.getByTestId("cari-sevkiyatlar-baslik");
    for (const b of ["Tarih", "Sevk no", "Top", "Metre", "Durum"]) expect(within(sevkBaslik).getByText(b)).toBeTruthy();
    expect(within(screen.getByTestId("cari-sevkiyatlar-satir-v1")).getByText("SVK1811260003")).toBeTruthy();
    expect(screen.getByTestId("cari-one-cikanlar").props.children).toBe("Son sipariş 18.11.2026 · Son sevk 17.11.2026");
    const urunBaslik = screen.getByTestId("cari-urun-baslik");
    for (const b of ["Ürün", "Renk", "Sipariş", "Miktar"]) expect(within(urunBaslik).getByText(b)).toBeTruthy();
    expect(within(screen.getByTestId("cari-urun-satir-u1:r1:MT")).getByText("15.500 m")).toBeTruthy();
  });

  it("dönem değişince kompakt seçim durumu değişir", async () => {
    render(<CustomerDetail />);
    await settle();
    expect(screen.getByTestId("cari-donem-tumZamanlar").props.accessibilityState).toEqual({ selected: true });
    fireEvent.press(screen.getByTestId("cari-donem-son12Ay"));
    await settle();
    expect(screen.getByTestId("cari-donem-son12Ay").props.accessibilityState).toEqual({ selected: true });
  });
});
