// M2b bekçisi: cari kartı Özet bölümleri doğru uca doğru parametreyle gider (`/cari-ozeti/:id`, `iade?cariKartId=`,
// `siparis?cariKartId=&suzgec=ACIK`); "henüz gelmedi" (404) ≠ "hareketi yok" (`ozet: null`) ≠ "iadesi yok" (boş liste);
// bir bölümün hatası diğerlerini düşürmez; para çizilmez; birimler toplanmaz (ayrı değer); dönem değişince sayılar değişir.
import { act, fireEvent, render, screen } from "@testing-library/react-native";
import type { ReactElement } from "react";

const mockList = jest.fn();
const mockRecord = jest.fn();
const mockSummary = jest.fn();
const mockCache = { load: jest.fn(async (_k: string, f: () => Promise<unknown>) => ({ data: await f(), offline: false, savedAt: "" })), peek: jest.fn(async () => null) };
const mockSession = {
  api: { list: mockList, record: mockRecord, snapshot: jest.fn(), customerSummary: mockSummary },
  cache: mockCache, markOnline: jest.fn(),
  permissions: [] as string[], offline: false, offlineSince: null as string | null, facility: null as unknown, switchError: null as string | null,
};
const mockRouter = { push: jest.fn(), replace: jest.fn(), back: jest.fn(), navigate: jest.fn(), canGoBack: () => true };
jest.mock("../src/state/session", () => ({ useSession: () => mockSession }));
jest.mock("expo-router", () => ({ useRouter: () => mockRouter, usePathname: () => "/cariler", useLocalSearchParams: () => ({ id: "0b7c5a1e-4f2d-4c8e-9a51-3d6f2e8b1c40" }) }));
jest.mock("react-native-safe-area-context", () => ({ useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }) }));

const CustomerDetail = (require("../app/(app)/(tabs)/cariler/[id]") as { default: () => ReactElement }).default;
const { ApiError } = require("../src/api/client") as typeof import("../src/api/client");
const { LIST_ID_FILTERS, LIST_SEARCH } = require("../src/api/wire") as typeof import("../src/api/wire");
const { toplamKartlari } = require("../src/ui/cari/OzetBolumleri") as typeof import("../src/ui/cari/OzetBolumleri");

const ID = "0b7c5a1e-4f2d-4c8e-9a51-3d6f2e8b1c40";
const rec = (id: string, kayit: Record<string, unknown>) => ({ id, kayit, surum: "2026-11-12T09:00:00.000Z" });
const page = (...kayitlar: unknown[]) => ({ kayitlar, sonraki: null });
const YENI_SUNUCU = { liste: { kimlikSuzgecleri: LIST_ID_FILTERS, aranabilir: Object.keys(LIST_SEARCH) } };

const DONEM = (n: number) => ({
  siparisSayisi: n, kalemSayisi: n + 3,
  siparisMiktari: [{ birim: "KG", miktar: 350 }, { birim: "MT", miktar: 84250.5 }],
  sevk: { metre: 61230.4, top: 1712, kg: 18450.5, tartiliCuval: 210, cuval: 224 },
  iade: { adet: 6, metre: 412.5 },
  enCokUrun: n > 30 ? [
    { urunId: "u1", urunAdi: "ÖRNEK KREP", renkId: "r1", renkAdi: "10-EKRU", birim: "MT", miktar: 12000, siparisSayisi: 4 },
    { urunId: "u2", urunAdi: "DENEME SATEN", renkId: null, renkAdi: null, birim: "KG", miktar: 350, siparisSayisi: 3 },
  ] : [],
});
const OZET = {
  cariKartId: ID, son12AyBaslangic: "2025-11-11T21:00:00.000Z", surum: "2026-11-12T09:35:12.118Z",
  ozet: {
    tumZamanlar: DONEM(48), son12Ay: DONEM(20),
    acik: { siparisSayisi: 7, kalemSayisi: 9, acikMiktar: [{ birim: "KG", miktar: 120 }, { birim: "MT", miktar: 15480.2 }] },
    sonSiparisTarihi: null, sonSevkTarihi: null,
  },
};
const IADE = rec("i1", { iadeNo: "IA-2026-0042", cariKartId: ID, urunAdi: "ÖRNEK KREP", renkAdi: "10-EKRU", metre: "62.50", sebepAdi: "Renk farkı", iptalTarihi: null });
const IADE_IPTAL = rec("i2", { iadeNo: "IA-2026-0041", cariKartId: ID, urunAdi: "ÖRNEK KREP", metre: "40.00", iptalTarihi: "2026-10-22T08:00:00.000Z" });
const ACIK = rec("s1", { siparisNo: "SP-0101", durum: "APPROVED", acik: true, cariKartId: ID });

type Lists = Partial<Record<string, () => Promise<unknown>>>;
const byProjection = (l: Lists) => (p: string, q: Record<string, unknown>) => {
  const key = p === "siparis" && q.suzgec === "ACIK" ? "acik" : p;
  return (l[key] ?? (() => Promise.resolve(page())))();
};

async function settle() {
  for (let i = 0; i < 3; i++) await act(async () => undefined);
}

beforeEach(() => {
  mockList.mockReset();
  mockSummary.mockReset();
  mockRouter.push.mockReset();
  mockSession.facility = YENI_SUNUCU;
  mockSession.permissions = ["bulut:oturum", "bulut:siparis:oku", "bulut:sevkiyat:oku", "bulut:cari:oku"];
  mockRecord.mockResolvedValue(rec(ID, { ad: "Örnek Tekstil A.Ş.", kod: "ORN-001", musteriRolu: true }));
  mockSummary.mockResolvedValue(OZET);
  mockList.mockImplementation(byProjection({ iade: () => Promise.resolve(page(IADE, IADE_IPTAL)), acik: () => Promise.resolve(page(ACIK)) }));
});

describe("§1 doğru uç + doğru parametre", () => {
  it("özet `/cari-ozeti/:id`, iade `cariKartId`, açık sipariş `cariKartId + suzgec=ACIK`", async () => {
    render(<CustomerDetail />);
    await settle();
    expect(mockSummary).toHaveBeenCalledWith(ID);
    expect(mockList).toHaveBeenCalledWith("iade", expect.objectContaining({ cariKartId: ID, limit: 5 }));
    expect(mockList).toHaveBeenCalledWith("siparis", expect.objectContaining({ cariKartId: ID, suzgec: "ACIK" }));
    expect(screen.getByTestId("cari-toplamlar")).toBeTruthy();
    expect(screen.getByText("SP-0101")).toBeTruthy();
    expect(screen.getByText("IA-2026-0042")).toBeTruthy();
    expect(screen.getByText("İptal")).toBeTruthy(); // iptal edilen iade rozetle, sayıma özetten girmez
    expect(screen.getByTestId("cari-iade-ozet").props.children).toBe("6 top · 412,5 m");
  });

  it("sevkiyat izni yoksa iade istenmez ve bölüm çizilmez", async () => {
    mockSession.permissions = ["bulut:oturum", "bulut:siparis:oku"];
    render(<CustomerDetail />);
    await settle();
    expect(mockList).not.toHaveBeenCalledWith("iade", expect.anything());
    expect(screen.queryByTestId("cari-iade")).toBeNull();
    expect(screen.queryByTestId("cari-iade-gelmedi")).toBeNull();
  });

  it("açık sipariş 'Tümü' → Siparişler sekmesi 'Açık' görünümüyle (sunucu süzgeci)", async () => {
    render(<CustomerDetail />);
    await settle();
    fireEvent.press(screen.getByTestId("cari-acik-tumu"));
    await settle();
    expect(screen.getByTestId("cari-siparis-acik")).toBeTruthy();
    expect(screen.getByTestId("cari-siparis-gorunum-ACIK")).toBeTruthy();
  });
});

describe("§2 boş ≠ henüz gelmedi", () => {
  it("özet 404 → Toplamlar 'henüz gelmedi'; diğer bölümler yerinde", async () => {
    mockSummary.mockRejectedValue(new ApiError(404, "BULUNAMADI", "yok"));
    render(<CustomerDetail />);
    await settle();
    expect(screen.getByTestId("cari-toplamlar-gelmedi")).toBeTruthy();
    expect(screen.queryByTestId("cari-toplamlar-bos")).toBeNull();
    expect(screen.getByTestId("cari-iade")).toBeTruthy();
    expect(screen.getByTestId("cari-acik")).toBeTruthy();
  });

  it("`ozet: null` → 'henüz hareketi yok' (henüz gelmedi DEĞİL); ürün bloğu yok", async () => {
    mockSummary.mockResolvedValue({ ...OZET, ozet: null });
    render(<CustomerDetail />);
    await settle();
    expect(screen.getByText("Bu müşterinin henüz hareketi yok")).toBeTruthy();
    expect(screen.queryByTestId("cari-toplamlar-gelmedi")).toBeNull();
    expect(screen.queryByTestId("cari-urunler")).toBeNull();
  });

  it("boş iade listesi → 'iadesi yok'; iade projeksiyonu 404 → 'henüz gelmedi'", async () => {
    mockList.mockImplementation(byProjection({}));
    const a = render(<CustomerDetail />);
    await settle();
    expect(screen.getByText("Bu müşterinin iadesi yok")).toBeTruthy();
    expect(screen.queryByTestId("cari-iade-gelmedi")).toBeNull();
    expect(screen.getByText("Açık sipariş yok")).toBeTruthy();
    a.unmount();
    mockList.mockImplementation(byProjection({ iade: () => Promise.reject(new ApiError(404, "BULUNAMADI", "yok")) }));
    render(<CustomerDetail />);
    await settle();
    expect(screen.getByTestId("cari-iade-gelmedi")).toBeTruthy();
    expect(screen.queryByText("Bu müşterinin iadesi yok")).toBeNull();
  });

  it("bulut iade süzgecini beyan etmiyorsa (eski bulut) iade istenmez, 'henüz gelmedi'", async () => {
    mockSession.facility = { liste: { kimlikSuzgecleri: { cariKartId: ["siparis"] }, aranabilir: ["siparis"] } };
    render(<CustomerDetail />);
    await settle();
    expect(mockList).not.toHaveBeenCalledWith("iade", expect.anything());
    expect(screen.getByTestId("cari-iade-gelmedi")).toBeTruthy();
  });
});

describe("§3 bölüm yalıtımı", () => {
  it("özet 500 → yalnız Toplamlar hata + yeniden dene; iade ve açık sipariş çizilir", async () => {
    mockSummary.mockRejectedValue(new ApiError(500, "SUNUCU", "patladı"));
    render(<CustomerDetail />);
    await settle();
    expect(screen.getByTestId("cari-toplamlar-hata")).toBeTruthy();
    expect(screen.getByText("IA-2026-0042")).toBeTruthy();
    expect(screen.getByText("SP-0101")).toBeTruthy();
    mockSummary.mockResolvedValue(OZET);
    fireEvent.press(screen.getByText("Tekrar dene"));
    await settle();
    expect(screen.getByTestId("cari-toplamlar")).toBeTruthy();
  });

  it("iade listesi hatası Toplamlar'ı düşürmez", async () => {
    mockList.mockImplementation(byProjection({ iade: () => Promise.reject(new ApiError(500, "SUNUCU", "x")), acik: () => Promise.resolve(page(ACIK)) }));
    render(<CustomerDetail />);
    await settle();
    expect(screen.getByTestId("cari-iade-hata")).toBeTruthy();
    expect(screen.getByTestId("cari-toplamlar")).toBeTruthy();
    expect(screen.getByTestId("cari-acik")).toBeTruthy();
  });

  it("özet 403 → Toplamlar hiç çizilmez (hata da yok)", async () => {
    mockSummary.mockRejectedValue(new ApiError(403, "YETKISIZ", "yok"));
    render(<CustomerDetail />);
    await settle();
    expect(screen.queryByTestId("cari-toplamlar")).toBeNull();
    expect(screen.queryByTestId("cari-toplamlar-hata")).toBeNull();
  });
});

describe("§4 para yok · birimler toplanmaz · sevk brüt · dönem", () => {
  it("kartlarda birim başına ayrı değer; m ile kg toplanmış sayı yok; para simgesi yok", async () => {
    const kartlar = toplamKartlari(OZET.ozet, OZET.ozet.tumZamanlar);
    const acik = kartlar.find((k) => k.key === "acik")!;
    expect(acik.degerler).toEqual([{ deger: "120", birim: "kg" }, { deger: "15.480,2", birim: "m" }]);
    expect(kartlar.find((k) => k.key === "sevk")!.degerler).toEqual([{ deger: "61.230,4", birim: "m" }, { deger: "1.712", birim: "top" }]);
    render(<CustomerDetail />);
    await settle();
    const json = screen.UNSAFE_root.findAll((n: { type: unknown }) => n.type === "Text").map((n: { props: { children?: unknown } }) => ([] as unknown[]).concat(n.props.children).join("")).join("|");
    expect(json).toContain("Sevk (brüt)");
    expect(json).not.toMatch(/₺|TRY|\$|€|Bakiye|Tutar/);
    expect(json).not.toContain("15.600,2"); // 15480,2 m + 120 kg TOPLANMAZ
    expect(json).toContain("61.230,4"); // brüt sevk; iade düşülmüş 60.817,9 değil
    expect(json).not.toContain("60.817,9");
  });

  it("dönem değişimi sayıları değiştirir; o dönemde ürün yoksa blok çizilmez", async () => {
    render(<CustomerDetail />);
    await settle();
    expect(screen.getByText("48")).toBeTruthy();
    expect(screen.getByTestId("cari-urunler")).toBeTruthy();
    expect(screen.getByText("12.000 m")).toBeTruthy();
    expect(screen.getByText("350 kg")).toBeTruthy();
    fireEvent.press(screen.getByTestId("cari-donem-son12Ay"));
    await settle();
    expect(screen.getByText("20")).toBeTruthy();
    expect(screen.queryByText("48")).toBeNull();
    expect(screen.queryByTestId("cari-urunler")).toBeNull();
    expect(mockSummary).toHaveBeenCalledTimes(1); // dönem istemcide seçilir, yeni istek yok
  });

  it("Özet dışındaki sekmede yeni bölümler istenmez", async () => {
    render(<CustomerDetail />);
    await settle();
    fireEvent.press(screen.getByTestId("cari-sekme-bilgi"));
    await settle();
    mockSummary.mockClear();
    mockList.mockClear();
    fireEvent.press(screen.getByTestId("cari-sekme-sevkiyatlar"));
    await settle();
    expect(mockSummary).not.toHaveBeenCalled();
    expect(mockList).not.toHaveBeenCalledWith("iade", expect.anything());
    expect(mockList).not.toHaveBeenCalledWith("siparis", expect.objectContaining({ suzgec: "ACIK" }));
  });
});
