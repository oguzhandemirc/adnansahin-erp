// Üretim › KART VE SÜTUN SEÇİMİ (2026-11-17, kullanıcı: "koyabildiğin her şeyi koy, biz eleriz"): §1 saklı tercih yokken
// bugünkü bloklar çizilir, eklenenler (akış · istasyonlar · fason özeti · kategoriler) KAPALI · §2 "-" hiç blok, seçici
// düğmesi durur, iş emri listesi istenmez · §3 eklenenler açılınca telin değerlerini aynen gösterir (birim fabrikanın
// kolon anlamından; toplama yok) · §4 seçim `tablo.is-emri`ye yazılır, iş emri liste sütunlarını ezmez · §5 istasyon
// sütunları: varsayılan dört, seçilen sıra saklanır · §6 iş emri listesi: varsayılan sütunlar aynı, yeniler KAPALI.
import AsyncStorage from "@react-native-async-storage/async-storage";
import { act, fireEvent, render, screen } from "@testing-library/react-native";
import type { ReactElement } from "react";
import { StyleSheet, Text } from "react-native";

const mockApi = { list: jest.fn(), record: jest.fn(), snapshot: jest.fn(), viewPref: jest.fn(), viewPrefSet: jest.fn() };
const mockCache = { load: jest.fn(async (_k: string, f: () => Promise<unknown>) => ({ data: await f(), offline: false, savedAt: "" })), peek: jest.fn(async () => null) };
const mockSession = {
  api: mockApi, cache: mockCache, markOnline: jest.fn(),
  permissions: ["bulut:oturum", "bulut:uretim:oku", "bulut:ozet:oku"] as string[], offline: false, offlineSince: null as string | null,
  facility: null as unknown, switchError: null as string | null, factoryStamp: "2026-11-17T08:55:00Z",
};
const mockRouter = { push: jest.fn(), replace: jest.fn(), back: jest.fn(), navigate: jest.fn(), canGoBack: () => true };
jest.mock("../src/state/session", () => ({ useSession: () => mockSession }));
jest.mock("expo-router", () => ({
  useRouter: () => mockRouter, usePathname: () => "/uretim", useLocalSearchParams: () => ({}),
  useFocusEffect: (cb: () => void | (() => void)) => (require("react") as typeof import("react")).useEffect(() => cb(), [cb]),
}));
jest.mock("react-native-safe-area-context", () => ({ useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }) }));

const Production = (require("../app/(app)/(tabs)/uretim") as { default: () => ReactElement }).default;
const { LIST_ID_FILTERS, LIST_SEARCH, LIST_SORT } = require("../src/api/wire") as typeof import("../src/api/wire");
const { IS_EMRI_SUTUNLARI, IS_EMRI_VARSAYILAN_SUTUN } = require("../src/ui/is-emri/sutunlar") as typeof import("../src/ui/is-emri/sutunlar");
const { ISTASYON_SUTUNLARI, ISTASYON_VARSAYILAN, istasyonSutunYaz, istasyonSutunlari } = require("../src/ui/uretim/kartlar") as typeof import("../src/ui/uretim/kartlar");

const FACILITY = {
  tesis: { id: "t1" }, hesap: { id: "h1" },
  liste: { kimlikSuzgecleri: LIST_ID_FILTERS, aranabilir: Object.keys(LIST_SEARCH), siralama: Object.fromEntries(Object.entries(LIST_SORT).map(([p, a]) => [p, Object.keys(a)])) },
};
const AKIS = {
  kolonlar: [
    { anahtar: "hamStok", etiket: "Ham Stok", adet: 310 }, { anahtar: "yariMamul", etiket: "Yarı Mamul", adet: 126 }, { anahtar: "fason", etiket: "Fason'da", adet: 46 },
    { anahtar: "kursun", etiket: "Kurşun Bekleyen", adet: 3 }, { anahtar: "tambur", etiket: "Tambur Bekleyen", adet: 2 }, { anahtar: "depo", etiket: "Depo", adet: 240 },
    { anahtar: "sevk", etiket: "Sevk", adet: 4 },
  ],
  istasyonlar: [
    { id: "i1", kod: "KK1", ad: "Ham kontrol", tur: "RAW_QC", kuyruk: 46, aktif: 4, bugunTamamlanan: 118, bugunSevk: 0 },
    { id: "i4", kod: "FSN", ad: "Boyahane", tur: "SUBCONTRACTOR", kuyruk: 18, aktif: 0, bugunTamamlanan: 41, bugunSevk: 12 },
  ],
};
const FASON = {
  acikSevk: 5, kalanMiktar: "5460.000", acikTop: 46, boyahanedeTop: 40, isEmriSayisi: 4, musteriSayisi: 3,
  kategoriler: [{ kod: "BOYAHANE", ad: "Boyahane", acikTop: 40, kalanMiktar: "4800.000" }, { kod: "APRE", ad: "Apre", acikTop: 6, kalanMiktar: "660.000" }],
  firmalar: [],
};
const VARSAYILAN_BLOK = ["bolum-nerede", "kpi-bugun-tamamlanan", "kpi-ham-giris", "bolum-is-emirleri"];
const YENI_BLOK = ["bolum-akis", "bolum-istasyonlar", "bolum-fason-ozet", "bolum-fason-kategori"];
const tercih = (suzgec: Record<string, string>, sutunlar: readonly string[] = IS_EMRI_VARSAYILAN_SUTUN) => ({ surum: 1 as const, sutunlar, siralama: null, suzgec });

async function settle() {
  for (let i = 0; i < 4; i++) await act(async () => undefined);
}
const metinler = () => screen.UNSAFE_root.findAll((n: { type: unknown }) => n.type === Text).map((n: { props: { children?: unknown } }) => ([] as unknown[]).concat(n.props.children).join("")).join("|");
const isEmriIstegi = () => mockApi.list.mock.calls.some((c) => c[0] === "is-emri");

beforeEach(async () => {
  await AsyncStorage.clear();
  for (const f of Object.values(mockApi)) f.mockReset();
  mockSession.facility = FACILITY;
  mockApi.snapshot.mockImplementation(async (p: string) => ({
    projeksiyon: p, surum: "2026-11-17T08:55:00.000Z",
    veri: p === "uretim-akisi" ? AKIS : p === "fason-acik" ? FASON : { bugunTamamlananToplam: 159, kolonlar: [], istasyonlar: [] },
  }));
  mockApi.list.mockResolvedValue({ kayitlar: [{ id: "w1", kayit: { musteriAdi: "Örnek Tekstil", asama: "kursun", topSayisi: 3 }, surum: "2026-11-17T08:55:00.000Z" }], sonraki: null });
  mockApi.viewPref.mockResolvedValue({ anahtar: "tablo.is-emri", deger: null, guncelleme: null });
  mockApi.viewPrefSet.mockResolvedValue({});
});

describe("§1 varsayılan görünüm değişmedi", () => {
  it("bugünkü bloklar çizilir; eklenenler KAPALI", async () => {
    render(<Production />);
    await settle();
    for (const id of VARSAYILAN_BLOK) expect(screen.getByTestId(id)).toBeTruthy();
    for (const id of YENI_BLOK) expect(screen.queryByTestId(id)).toBeNull();
    expect(screen.getByTestId("uretim-kart-sec")).toBeTruthy();
  });
});

describe("§2 hiç blok", () => {
  it("'-' saklıysa hiçbir blok yok, iş emri listesi istenmez; düğme durur", async () => {
    const deger = tercih({ uretimKartlar: "-" });
    await AsyncStorage.setItem("tablo-tercihi:t1:h1:tablo.is-emri", JSON.stringify({ deger, kirli: false }));
    mockApi.viewPref.mockResolvedValue({ anahtar: "tablo.is-emri", deger, guncelleme: null });
    render(<Production />);
    await settle();
    for (const id of [...VARSAYILAN_BLOK, ...YENI_BLOK, "bolum-bugun"]) expect(screen.queryByTestId(id)).toBeNull();
    expect(isEmriIstegi()).toBe(false);
    expect(screen.getByTestId("uretim-kart-sec")).toBeTruthy();
  });

  it("negatif sonda: tercih yokken iş emri listesi istenir", async () => {
    render(<Production />);
    await settle();
    expect(isEmriIstegi()).toBe(true);
  });
});

// §2b (2026-11-19, kullanıcı: kartlar kapalıyken başlığın altında boş bant): ekranın İLK görünür bloğu üst pay almaz
// (ekran zaten üst dolgu verir); sonrakiler bloklar arası boşlukla ayrılır. Hangi blok ilkse o.
describe("§2b ilk blok üst pay almaz", () => {
  const ustPay = (id: string) => (StyleSheet.flatten(screen.getByTestId(id).props.style) as { marginTop?: number } | undefined)?.marginTop ?? 0;
  const ile = async (kartlar: string) => {
    mockApi.viewPref.mockResolvedValue({ anahtar: "tablo.is-emri", deger: tercih({ uretimKartlar: kartlar }), guncelleme: null });
    render(<Production />);
    await settle();
  };

  it("varsayılan: 'nerede' ilk (0), sonrakiler ayrık", async () => {
    await ile("nerede,bugunBiten,hamGiris,isEmirleri");
    expect(ustPay("bolum-nerede-blok")).toBe(0);
    expect(ustPay("bolum-bugun-blok")).toBeGreaterThan(0);
    expect(ustPay("bolum-is-emirleri-blok")).toBeGreaterThan(0);
  });

  it("'nerede' kapalı: 'bugün' ilk (0)", async () => {
    await ile("bugunBiten,isEmirleri");
    expect(screen.queryByTestId("bolum-nerede")).toBeNull();
    expect(ustPay("bolum-bugun-blok")).toBe(0);
    expect(ustPay("bolum-is-emirleri-blok")).toBeGreaterThan(0);
  });

  it("yalnız sonradan eklenen bloklar: ilk görünen (akış) 0, istasyonlar ayrık", async () => {
    await ile("akis,istasyonlar");
    expect(ustPay("bolum-akis-blok")).toBe(0);
    expect(ustPay("bolum-istasyonlar-blok")).toBeGreaterThan(0);
    expect(screen.queryByTestId("bolum-bugun-blok")).toBeNull();
  });
});

describe("§3 eklenen bloklar telin değerini aynen gösterir", () => {
  it("akış kolonları birimiyle · istasyon tablosu · fason özeti · kategoriler", async () => {
    mockApi.viewPref.mockResolvedValue({ anahtar: "tablo.is-emri", deger: tercih({ uretimKartlar: "akis,istasyonlar,fasonOzet,fasonKategori" }), guncelleme: null });
    render(<Production />);
    await settle();
    for (const id of YENI_BLOK) expect(screen.getByTestId(id)).toBeTruthy();
    for (const id of VARSAYILAN_BLOK) expect(screen.queryByTestId(id)).toBeNull();
    const m = metinler();
    expect(m).toContain("310 top");
    expect(m).toContain("3 iş emri");
    expect(m).toContain("4 sevkiyat");
    expect(m).toContain("çuvaldakiler dahil");
    expect(screen.getByTestId("istasyon-satir-i1")).toBeTruthy();
    expect(m).toContain("118");
    expect(m).toContain("5 sevk");
    expect(m).toContain("5.460 m");
    expect(m).toContain("3 müşteri");
    expect(m).toContain("4.800 m");
    // Ekran toplamaz: kategorilerin toplamı (46) ayrı bir satır olarak uydurulmaz; yalnız fabrikanın acikTop'u.
    expect(screen.queryByTestId("fason-kategori-toplam")).toBeNull();
  });
});

describe("§4 seçiciden açmak", () => {
  it("tablo.is-emri'ye yazılır; liste sütunları ve süzgeci korunur", async () => {
    jest.useFakeTimers();
    try {
      mockApi.viewPref.mockResolvedValue({ anahtar: "tablo.is-emri", deger: tercih({ ana: "Kurşun" }, ["musteri", "no", "en"]), guncelleme: null });
      render(<Production />);
      await settle();
      fireEvent.press(screen.getByTestId("uretim-kart-sec"));
      fireEvent.press(screen.getByTestId("uretim-kart-secici-akis"));
      await act(async () => {
        jest.advanceTimersByTime(1_000);
      });
      const son = mockApi.viewPrefSet.mock.calls.at(-1) as [string, { sutunlar: string[]; suzgec: Record<string, string> }];
      expect(son[0]).toBe("tablo.is-emri");
      expect(son[1].sutunlar).toEqual(["musteri", "no", "en"]);
      expect(son[1].suzgec.ana).toBe("Kurşun");
      expect(son[1].suzgec.uretimKartlar).toContain("akis");
      expect(screen.getByTestId("bolum-akis")).toBeTruthy();
    } finally {
      jest.useRealTimers();
    }
  });
});

describe("§5 istasyon sütunları", () => {
  const T = (suzgec: Record<string, string> = {}) => tercih(suzgec);
  it("varsayılan dört; sıra saklanır; varsayılana dönünce alan silinir; tanınmayan düşer", () => {
    expect(istasyonSutunlari(T())).toEqual(ISTASYON_VARSAYILAN);
    const t = istasyonSutunYaz(T(), ["ad", "sevk", "kod"]);
    expect(t.suzgec).toEqual({ istasyonSutunlar: "ad,sevk,kod" });
    expect(istasyonSutunlari(t)).toEqual(["ad", "sevk", "kod"]);
    expect(istasyonSutunYaz(t, ISTASYON_VARSAYILAN).suzgec).toEqual({});
    expect(istasyonSutunlari(T({ istasyonSutunlar: "yok,ad" }))).toEqual(["ad"]);
  });

  it("tür hücresi fabrikanın Station.type'ını (INTERNAL/EXTERNAL) okur", () => {
    const tur = ISTASYON_SUTUNLARI.find((c) => c.key === "tur")!.hucre;
    expect(tur({ tur: "EXTERNAL" })).toBe("Dış (fason)");
    expect(tur({ tur: "INTERNAL" })).toBe("İç");
    expect(tur({ tur: "BILINMEYEN" })).toBe("BILINMEYEN");
  });
});

describe("§6 iş emri listesi sütunları", () => {
  it("varsayılan aynı; yeni sütunlar KAPALI ve telin alanı", () => {
    expect(IS_EMRI_VARSAYILAN_SUTUN).toEqual(["musteri", "kumas", "top", "asama"]);
    const h = (key: string) => IS_EMRI_SUTUNLARI.find((c) => c.key === key)!.hucre;
    const r = { id: "w1", surum: "", kayit: { en: "152.5", planBaslangic: "2026-11-01T09:00:00.000Z", planBitis: null, kapanisTarihi: "2026-11-10T09:00:00.000Z", musteriAdlari: ["A Tekstil", "B Kumaş"] } };
    for (const k of ["en", "planBaslangic", "planBitis", "kapanis", "musteriler"]) expect(IS_EMRI_VARSAYILAN_SUTUN).not.toContain(k);
    expect(h("planBaslangic")(r)).toBe("01.11.2026");
    expect(h("planBitis")(r)).toBe("—");
    expect(h("kapanis")(r)).toBe("10.11.2026");
    expect(h("musteriler")(r)).toBe("A Tekstil, B Kumaş");
  });
});
