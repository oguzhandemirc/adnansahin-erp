// Cariler › KART VE SÜTUN SEÇİMİ (2026-11-17, kullanıcı: "koyabildiğin her şeyi koy, biz eleriz"): §1 saklı tercih yokken
// cari kartı BUGÜNKÜ kartları/blokları çizer, yeni kartlar KAPALI · §2 "-" hiç kart: toplamlar, dönem düğmesi ve bloklar
// yok, seçici düğmesi durur · §3 yeni kartlar açılınca telin değerini aynen gösterir (tarih biçimi; gün farkı yok) ·
// §4 seçiciden açmak `tablo.cari-kart`a yazılır, liste sütunlarını ezmez · §5 liste: varsayılan sütunlar aynı, yeni
// sütunlar telin alanı (kişisel alt satır dahil) · §6 aynı anahtarı tutan iki açık kanca birbirini ezmez · §7 süzgeç
// "Temizle" kart seçimini silmez. Para alanı hiçbir yüzeyde yok.
import AsyncStorage from "@react-native-async-storage/async-storage";
import { act, fireEvent, render, screen } from "@testing-library/react-native";
import type { ReactElement } from "react";
import { Text } from "react-native";

const ID = "0b7c5a1e-4f2d-4c8e-9a51-3d6f2e8b1c40";
const mockApi = { list: jest.fn(), record: jest.fn(), snapshot: jest.fn(), customerSummary: jest.fn(), viewPref: jest.fn(), viewPrefSet: jest.fn() };
const mockCache = { load: jest.fn(async (_k: string, f: () => Promise<unknown>) => ({ data: await f(), offline: false, savedAt: "" })), peek: jest.fn(async () => null) };
const mockSession = {
  api: mockApi, cache: mockCache, markOnline: jest.fn(),
  permissions: ["bulut:oturum", "bulut:siparis:oku", "bulut:sevkiyat:oku", "bulut:cari:oku"] as string[], offline: false, offlineSince: null as string | null,
  facility: null as unknown, switchError: null as string | null,
};
const mockRouter = { push: jest.fn(), replace: jest.fn(), back: jest.fn(), navigate: jest.fn(), canGoBack: () => true };
jest.mock("../src/state/session", () => ({ useSession: () => mockSession }));
jest.mock("expo-router", () => ({ useRouter: () => mockRouter, usePathname: () => "/cariler", useLocalSearchParams: () => ({ id: ID }) }));
jest.mock("react-native-safe-area-context", () => ({ useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }) }));

const CustomerDetail = (require("../app/(app)/(tabs)/cariler/[id]") as { default: () => ReactElement }).default;
const Customers = (require("../app/(app)/(tabs)/cariler/index") as { default: () => ReactElement }).default;
const { LIST_ID_FILTERS, LIST_SEARCH, LIST_SORT } = require("../src/api/wire") as typeof import("../src/api/wire");
const { CARI_SUTUNLARI, CARI_VARSAYILAN_SUTUN, cariTemizle } = require("../src/ui/cari/sutunlar") as typeof import("../src/ui/cari/sutunlar");
const { useTabloTercihi } = require("../src/ui/tablo/useTabloTercihi") as typeof import("../src/ui/tablo/useTabloTercihi");

const SIRALI = {
  tesis: { id: "t1" }, hesap: { id: "h1" },
  liste: { kimlikSuzgecleri: LIST_ID_FILTERS, aranabilir: Object.keys(LIST_SEARCH), siralama: Object.fromEntries(Object.entries(LIST_SORT).map(([p, a]) => [p, Object.keys(a)])) },
};
const rec = (id: string, kayit: Record<string, unknown>, kisisel?: Record<string, unknown>) => ({ id, kayit, ...(kisisel ? { kisisel } : {}), surum: "2026-11-12T09:00:00.000Z" });
const page = (...kayitlar: unknown[]) => ({ kayitlar, sonraki: null });
const DONEM = {
  siparisSayisi: 48, kalemSayisi: 51, siparisMiktari: [{ birim: "MT", miktar: 84250.5 }],
  sevk: { metre: 61230.4, top: 1712, kg: 18450.5, tartiliCuval: 210, cuval: 224 }, iade: { adet: 6, metre: 412.5 },
  enCokUrun: [{ urunId: "u1", urunAdi: "ÖRNEK KREP", renkId: null, renkAdi: null, birim: "MT", miktar: 12000, siparisSayisi: 4 }],
};
const OZET = {
  cariKartId: ID, son12AyBaslangic: "2025-11-11T21:00:00.000Z", surum: "2026-11-12T09:35:12.118Z",
  ozet: { tumZamanlar: DONEM, son12Ay: DONEM, acik: { siparisSayisi: 7, kalemSayisi: 9, acikMiktar: [{ birim: "MT", miktar: 15480.2 }] }, sonSiparisTarihi: "2026-11-03T10:00:00.000Z", sonSevkTarihi: null },
};
const IADE = rec("i1", { iadeNo: "IA-1", metre: "62.50", iptalTarihi: null });
const ACIK = rec("s1", { siparisNo: "SP-0101", durum: "APPROVED", acik: true, cariKartId: ID });
const TEMEL = ["cari-toplam-siparis", "cari-toplam-acik", "cari-toplam-sevk", "cari-toplam-iade", "cari-acik", "cari-urunler", "cari-iade"];
const YENI = ["cari-toplam-kalem", "cari-toplam-sevkKg", "cari-toplam-sonSiparis", "cari-toplam-sonSevk"];
const tercih = (suzgec: Record<string, string>, sutunlar: readonly string[] = ["ad", "il", "rol"]) => ({ surum: 1, sutunlar, siralama: null, suzgec });

async function settle() {
  for (let i = 0; i < 4; i++) await act(async () => undefined);
}
const metinler = () => screen.UNSAFE_root.findAll((n: { type: unknown }) => n.type === Text).map((n: { props: { children?: unknown } }) => ([] as unknown[]).concat(n.props.children).join("")).join("|");

beforeEach(async () => {
  await AsyncStorage.clear();
  for (const f of Object.values(mockApi)) f.mockReset();
  mockSession.facility = SIRALI;
  mockApi.record.mockResolvedValue(rec(ID, { ad: "Örnek Tekstil A.Ş.", kod: "ORN-001", musteriRolu: true, olusturulma: "2024-03-05T08:00:00.000Z" }));
  mockApi.customerSummary.mockResolvedValue(OZET);
  mockApi.list.mockImplementation(async (p: string, q: Record<string, unknown>) => (p === "iade" ? page(IADE) : p === "siparis" && q.suzgec === "ACIK" ? page(ACIK) : page()));
  mockApi.viewPref.mockResolvedValue({ anahtar: "tablo.cari-kart", deger: null, guncelleme: null });
  mockApi.viewPrefSet.mockResolvedValue({});
});

describe("§1 varsayılan görünüm değişmedi", () => {
  it("tercih yokken bugünkü dört kart + bloklar çizilir; yeni kartlar KAPALI", async () => {
    render(<CustomerDetail />);
    await settle();
    for (const id of TEMEL) expect(screen.getByTestId(id)).toBeTruthy();
    for (const id of YENI) expect(screen.queryByTestId(id)).toBeNull();
    expect(screen.getByTestId("cari-donem-tumZamanlar")).toBeTruthy();
    expect(screen.getByTestId("cari-kart-sec")).toBeTruthy();
  });

  it("Bilgi sekmesinde kayıt tarihi varsayılan KAPALI; açılınca fabrikanın tarihi", async () => {
    render(<CustomerDetail />);
    await settle();
    fireEvent.press(screen.getByTestId("cari-sekme-bilgi"));
    expect(metinler()).not.toContain("Kayıt tarihi");
    fireEvent.press(screen.getByTestId("cari-kart-sec"));
    fireEvent.press(screen.getByTestId("cari-kart-secici-kayitTarihi"));
    await settle();
    expect(metinler()).toContain("Kayıt tarihi");
    expect(metinler()).toContain("05.03.2024");
  });
});

describe("§2 hiç kart", () => {
  it("'-' saklıysa toplam kartları, dönem düğmesi ve bloklar yok; seçici düğmesi durur", async () => {
    mockApi.viewPref.mockResolvedValue({ anahtar: "tablo.cari-kart", deger: tercih({ detayKartlar: "-" }), guncelleme: null });
    render(<CustomerDetail />);
    await settle();
    for (const id of [...TEMEL, ...YENI, "cari-toplamlar", "cari-siparisler", "cari-sevkiyatlar"]) expect(screen.queryByTestId(id)).toBeNull();
    expect(screen.queryByTestId("cari-donem-tumZamanlar")).toBeNull();
    expect(screen.getByTestId("cari-kart-sec")).toBeTruthy();
  });
});

describe("§3 yeni kartlar telin değerini aynen gösterir", () => {
  it("kalem · kg · son sipariş tarihi · son sevk yoksa 'sevk yok'", async () => {
    mockApi.viewPref.mockResolvedValue({ anahtar: "tablo.cari-kart", deger: tercih({ detayKartlar: "kalem,sevkKg,sonSiparis,sonSevk" }), guncelleme: null });
    render(<CustomerDetail />);
    await settle();
    for (const id of YENI) expect(screen.getByTestId(id)).toBeTruthy();
    for (const id of TEMEL) expect(screen.queryByTestId(id)).toBeNull();
    const m = metinler();
    expect(m).toContain("51");
    expect(m).toContain("18.450,5");
    expect(m).toContain("210/224 çuval tartılı");
    expect(m).toContain("03.11.2026");
    expect(m).toContain("sevk yok");
    expect(m).not.toMatch(/₺|TRY|Bakiye|Tutar|gün önce/);
  });
});

describe("§4 seçiciden açmak", () => {
  it("aynı anahtara yazılır; liste sütunları korunur", async () => {
    jest.useFakeTimers();
    try {
      mockApi.viewPref.mockResolvedValue({ anahtar: "tablo.cari-kart", deger: tercih({ ana: "MUSTERI" }, ["ad", "telefon"]), guncelleme: null });
      render(<CustomerDetail />);
      await settle();
      fireEvent.press(screen.getByTestId("cari-kart-sec"));
      fireEvent.press(screen.getByTestId("cari-kart-secici-sonSiparis"));
      await act(async () => {
        jest.advanceTimersByTime(1_000);
      });
      const son = mockApi.viewPrefSet.mock.calls.at(-1) as [string, { sutunlar: string[]; suzgec: Record<string, string> }];
      expect(son[0]).toBe("tablo.cari-kart");
      expect(son[1].sutunlar).toEqual(["ad", "telefon"]);
      expect(son[1].suzgec.ana).toBe("MUSTERI");
      expect(son[1].suzgec.detayKartlar).toContain("sonSiparis");
      expect(screen.getByTestId("cari-toplam-sonSiparis")).toBeTruthy();
    } finally {
      jest.useRealTimers();
    }
  });
});

describe("§5 liste sütunları", () => {
  it("varsayılan aynı (ad · il · rol); yeni sütunlar varsayılanda yok", () => {
    expect(CARI_VARSAYILAN_SUTUN).toEqual(["ad", "il", "rol"]);
    for (const k of ["yon", "yetkili", "telefon", "kayit"]) {
      expect(CARI_SUTUNLARI.some((c) => c.key === k)).toBe(true);
      expect(CARI_VARSAYILAN_SUTUN).not.toContain(k);
    }
  });

  it("hücreler telin alanı; kişisel alt satır gelmezse '—'", () => {
    const h = (key: string) => CARI_SUTUNLARI.find((c) => c.key === key)!.hucre;
    const r = rec("c1", { varsayilanYon: "EXPORT", olusturulma: "2024-03-05T08:00:00.000Z" }, { yetkili: "Ayşe Örnek", telefon: "0500 000 00 00" });
    expect(h("yon")(r)).toBe("İhracat");
    expect(h("yetkili")(r)).toBe("Ayşe Örnek");
    expect(h("telefon")(r)).toBe("0500 000 00 00");
    expect(h("kayit")(r)).toBe("05.03.2024");
    const yok = rec("c2", {});
    for (const k of ["yon", "yetkili", "telefon", "kayit"]) expect(h(k)(yok)).toBe("—");
  });

  it("liste ekranı yeni sütun seçilince onu çizer (kişisel alan)", async () => {
    mockApi.viewPref.mockResolvedValue({ anahtar: "tablo.cari-kart", deger: tercih({}, ["ad", "telefon"]), guncelleme: null });
    mockApi.list.mockResolvedValue(page(rec("c1", { ad: "Örnek Tekstil" }, { telefon: "0500 000 00 00" })));
    render(<Customers />);
    await settle();
    expect(screen.getByTestId("cari-baslik")).toBeTruthy();
    expect(metinler()).toContain("0500 000 00 00");
  });
});

describe("§6 aynı anahtarı tutan iki kanca", () => {
  it("birinin yazdığı ötekinde görünür; ötekinin sonraki yazımı onu ezmez", async () => {
    const kancalar: ReturnType<typeof useTabloTercihi>[] = [];
    function Iki() {
      kancalar[0] = useTabloTercihi("tablo.cari-kart", cariTemizle);
      kancalar[1] = useTabloTercihi("tablo.cari-kart", cariTemizle);
      return null;
    }
    render(<Iki />);
    await settle();
    act(() => kancalar[1]!.degistir((t) => ({ ...t, suzgec: { ...t.suzgec, detayKartlar: "-" } })));
    expect(kancalar[0]!.tercih.suzgec.detayKartlar).toBe("-");
    act(() => kancalar[0]!.degistir((t) => ({ ...t, sutunlar: ["ad", "kod"] })));
    expect(kancalar[1]!.tercih.suzgec.detayKartlar).toBe("-");
    expect(kancalar[1]!.tercih.sutunlar).toEqual(["ad", "kod"]);
  });
});

describe("§7 süzgeç Temizle", () => {
  it("yalnız süzgeç gruplarını siler; kart seçimi kalır", async () => {
    jest.useFakeTimers();
    try {
      mockApi.viewPref.mockResolvedValue({ anahtar: "tablo.cari-kart", deger: tercih({ ana: "MUSTERI", detayKartlar: "-" }), guncelleme: null });
      mockApi.list.mockResolvedValue(page());
      render(<Customers />);
      await settle();
      fireEvent.press(screen.getByTestId("cari-suzgec"));
      fireEvent.press(screen.getByTestId("cari-suzgec-secici-temizle"));
      await act(async () => {
        jest.advanceTimersByTime(1_000);
      });
      const son = mockApi.viewPrefSet.mock.calls.at(-1) as [string, { suzgec: Record<string, string> }];
      expect(son[1].suzgec).toEqual({ detayKartlar: "-" });
    } finally {
      jest.useRealTimers();
    }
  });
});
