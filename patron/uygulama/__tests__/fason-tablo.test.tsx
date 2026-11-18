// Fason ekranı TEK veri tablosu (2026-11-19, kullanıcı: "sekmeleri kaldırıp filtre koy, data table yap, toplamlar en
// altta şerit"): satır = fasonda topu olan açık iş emri; İşlem/Fasoncu/Müşteri/Kumaş/Renk/İş emri/Sipariş süzgeç alanı;
// ön seçim rotadan (`islem` · `firma`), çip kaldırılabilir; alt şerit fabrikanın toplamı ya da satırların fabrika
// sayılarının toplamı — iki firmaya bölünmüş iş emri firma süzgecindeyse yalnız adet.
import { act, fireEvent, render, screen, within } from "@testing-library/react-native";
import type React from "react";

const mockApi = { snapshot: jest.fn(), list: jest.fn(), record: jest.fn() };
const mockCache = {
  load: jest.fn(async (_k: string, f: () => Promise<unknown>) => ({ data: await f(), offline: false, savedAt: "2026-11-19T09:00:00.000Z" })),
  peek: jest.fn(async () => null),
};
const mockSession = {
  api: mockApi, cache: mockCache, markOnline: jest.fn(), permissions: ["bulut:uretim:oku"] as string[], offline: false, offlineSince: null,
  facility: null, facilities: [], switchError: null, factoryStamp: "2026-11-19T08:55:00Z",
};
const mockRouter = { push: jest.fn(), replace: jest.fn(), back: jest.fn(), navigate: jest.fn(), canGoBack: () => true };
let mockParams: Record<string, string> = {};
jest.mock("../src/state/session", () => ({ useSession: () => mockSession }));
jest.mock("expo-router", () => ({
  useRouter: () => mockRouter,
  usePathname: () => "/fason",
  useLocalSearchParams: () => mockParams,
  useFocusEffect: (cb: () => void | (() => void)) => (require("react") as typeof import("react")).useEffect(() => cb(), [cb]),
}));
jest.mock("react-native-safe-area-context", () => ({ useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }) }));

const Fason = (require("../app/(app)/fason/index") as { default: () => React.ReactElement }).default;
const T = require("../src/ui/fason/tablo") as typeof import("../src/ui/fason/tablo");
const { toplamMetni } = require("../src/ui/fason/FasonToplamSatiri") as typeof import("../src/ui/fason/FasonToplamSatiri");
const { locationRoute } = require("../src/ui/uretim/nerede") as typeof import("../src/ui/uretim/nerede");

const F1 = "22222222-2222-4222-8222-222222222221";
const F2 = "22222222-2222-4222-8222-222222222222";
const once = (gun: number) => new Date(Date.now() - gun * 86_400_000 - 3_600_000).toISOString();
const ANLIK = {
  acikSevk: 4, kalanMiktar: "3456.000", acikTop: 30, boyahanedeTop: 22, isEmriSayisi: 4, musteriSayisi: 2,
  kategoriler: [
    { kod: "BOYA", ad: "Boyahane", acikTop: 22, kalanMiktar: "2000.000" },
    { kod: "APRE", ad: "Apre", acikTop: 8, kalanMiktar: "1456.000" },
    { kod: "BASKI", ad: "Baskı", acikTop: 0, kalanMiktar: "0.000" },
  ],
  firmalar: [
    { fasonFirmaId: F1, etiket: "Boyahane A", acikSevk: 2, kalanMiktar: "2000.000", acikTop: 22, kategoriler: ["Boyahane"], enEskiGonderim: once(9), isEmriSayisi: 3, musteriler: [], urunler: [] },
    { fasonFirmaId: F2, etiket: "Apre B", acikSevk: 2, kalanMiktar: "1456.000", acikTop: 8, kategoriler: ["Apre"], enEskiGonderim: once(4), isEmriSayisi: 2, musteriler: [], urunler: [] },
  ],
};
const ie = (id: string, o: Record<string, unknown>) => ({ id, surum: "1", kayit: { acik: true, asama: "fason", ...o } });
const fason = (top: number, metre: number) => [{ anahtar: "fason", top, metre }, { anahtar: "depo", top: 1, metre: 100 }];
const W1 = ie("w1", { isEmriNo: "IE-0001", musteriAdi: "Akın Tekstil", siparisIdleri: ["s1"], siparisNolari: ["SIP-0001"], urunAdi: "Saten", renkAdi: "Krem", asamaTop: fason(15, 1400), fasonFirmaIdleri: [F1], fasonFirmaAdi: "Boyahane A", fasonKategoriler: ["Boyahane"], fasonGonderim: once(9) });
const W2 = ie("w2", { isEmriNo: "IE-0002", musteriAdi: null, siparisIdleri: [], siparisNolari: [], urunAdi: "Saten", renkAdi: "Beyaz", asamaTop: fason(7, 600), fasonFirmaIdleri: [F1], fasonFirmaAdi: "Boyahane A", fasonKategoriler: ["Boyahane"], fasonGonderim: once(3) });
const W3 = ie("w3", { isEmriNo: "IE-0003", musteriAdi: "Akın Tekstil", siparisIdleri: ["s3"], siparisNolari: ["SIP-0003"], urunAdi: "Keten", renkAdi: "Krem", asamaTop: fason(5, 900), fasonFirmaIdleri: [F2], fasonFirmaAdi: "Apre B", fasonKategoriler: ["Apre"], fasonGonderim: once(4) });
// İki firmaya bölünmüş: topları hem F1 hem F2'de (satırın sayısı firma firma ayrılmaz).
const W4 = ie("w4", { isEmriNo: "IE-0004", musteriAdi: "Bora Mensucat", siparisIdleri: ["s4"], siparisNolari: ["SIP-0004"], urunAdi: "Keten", renkAdi: "Gri", asamaTop: fason(3, 556), fasonFirmaIdleri: [F1, F2], fasonFirmaAdi: "Apre B", fasonKategoriler: ["Apre"], fasonGonderim: once(2) });
const W5 = ie("w5", { isEmriNo: "IE-0005", musteriAdi: "Akın Tekstil", asama: "kursun", asamaTop: [{ anahtar: "kursun", top: 4, metre: 400 }], fasonFirmaIdleri: [] });
const W6 = ie("w6", { isEmriNo: "IE-0006", acik: false, asama: null, asamaTop: [{ anahtar: "fason", top: 2, metre: 100 }], fasonFirmaIdleri: [F1] });
const HEPSI = [W1, W2, W3, W4, W5, W6];

async function flush() {
  for (let i = 0; i < 4; i++) await act(async () => undefined);
}

function serve(sayfalar: unknown[][] = [HEPSI]) {
  mockApi.snapshot.mockImplementation(async (p: string) => ({ projeksiyon: p, veri: ANLIK, surum: "2026-11-19T08:55:00.000Z" }));
  mockApi.list.mockImplementation(async (_p: string, q: { imlec?: string }) => {
    const i = q.imlec ? Number(q.imlec) : 0;
    return { kayitlar: sayfalar[i], sonraki: i + 1 < sayfalar.length ? String(i + 1) : null };
  });
}

const satirlar = () => screen.queryAllByTestId(/^fason-satir-/).map((x) => String(x.props.testID).replace("fason-satir-", "")).sort();
const serit = () => screen.getByTestId("fason-toplam-satiri").props.accessibilityLabel as string;

beforeEach(() => {
  for (const f of Object.values(mockApi)) f.mockReset();
  mockRouter.push.mockReset();
  mockSession.permissions = ["bulut:uretim:oku"];
  mockParams = {};
  serve();
});

describe("Fason ekranı › tek veri tablosu", () => {
  it("süzgeçsiz: fasonda topu olan AÇIK iş emirleri; sekme ve özet kartı yok; şerit fabrikanın toplamı", async () => {
    render(<Fason />);
    await flush();
    expect(mockApi.list).toHaveBeenCalledWith("is-emri", expect.objectContaining({ suzgec: "ACIK", limit: 200 }));
    expect(satirlar()).toEqual(["w1", "w2", "w3", "w4"]);
    expect(screen.queryByTestId("fason-top")).toBeNull();
    expect(screen.queryByText("Müşteriler")).toBeNull();
    expect(screen.queryByText("Kumaşlar")).toBeNull();
    expect(serit()).toBe("Fasonda: 30 top · 3.456 m · 4 iş emri");
    // Varsayılan sıra: fasonda en uzun bekleyen önce; satır hücreleri (müşterisiz iş emri "Siparişsiz").
    const ilk = screen.queryAllByTestId(/^fason-satir-/)[0]!;
    expect(ilk.props.testID).toBe("fason-satir-w1");
    expect(within(screen.getByTestId("fason-satir-w2")).getByText("Siparişsiz")).toBeTruthy();
    expect(within(screen.getByTestId("fason-satir-w4")).getByText("Apre B +1")).toBeTruthy();
    fireEvent.press(screen.getByTestId("fason-satir-w3"));
    expect(mockRouter.push).toHaveBeenCalled();
  });

  it("liste bütün sayfalarıyla yüklenir (süzgeç tam kümede çalışır)", async () => {
    serve([[W1, W2], [W3, W5], [W4, W6]]);
    render(<Fason />);
    await flush();
    expect(mockApi.list).toHaveBeenCalledTimes(3);
    expect(satirlar()).toEqual(["w1", "w2", "w3", "w4"]);
  });

  it("işlem ön seçili (boyahane): o işlemdeki firmaların iş emirleri, çip kaldırılabilir; şerit fabrikanın kategori toplamı", async () => {
    mockParams = { islem: "BOYA" };
    render(<Fason />);
    await flush();
    expect(screen.getByTestId("fason-suzgec-etkin-islem").props.accessibilityLabel).toBe("İşlem: Boyahane süzgecini kaldır");
    expect(satirlar()).toEqual(["w1", "w2", "w4"]);
    expect(serit()).toBe("Süzülen: 22 top · 2.000 m · 3 iş emri");
    fireEvent.press(screen.getByTestId("fason-suzgec-etkin-islem"));
    expect(satirlar()).toEqual(["w1", "w2", "w3", "w4"]);
    expect(serit()).toBe("Fasonda: 30 top · 3.456 m · 4 iş emri");
  });

  it("fasoncu ön seçili (eski /fason/[firmaId] rotası da buraya): şerit fabrikanın firma toplamı", async () => {
    mockParams = { firma: F2 };
    render(<Fason />);
    await flush();
    expect(screen.getByTestId("fason-suzgec-etkin-firma").props.accessibilityLabel).toBe("Fasoncu: Apre B süzgecini kaldır");
    expect(satirlar()).toEqual(["w3", "w4"]);
    expect(serit()).toBe("Süzülen: 8 top · 1.456 m · 2 iş emri");
  });

  it("arama: satırların fabrika sayıları toplanır", async () => {
    render(<Fason />);
    await flush();
    fireEvent.changeText(screen.getByTestId("fason-ara"), "keten");
    await flush();
    expect(satirlar()).toEqual(["w3", "w4"]);
    expect(serit()).toBe("Süzülen: 8 top · 1.456 m · 2 iş emri");
  });

  it("süzgeç sayfası: alan listesi veriden (İşlem · Fasoncu · Müşteri · Kumaş · Renk · İş emri · Sipariş), müşteri seçilince süzer", async () => {
    render(<Fason />);
    await flush();
    fireEvent.press(screen.getByTestId("fason-suzgec"));
    for (const a of ["islem", "firma", "musteri", "kumas", "renk", "isEmri", "siparis"]) expect(screen.getByTestId(`fason-suzgec-secici-alan-${a}`)).toBeTruthy();
    // Topu olmayan işlem (Baskı) seçenek değildir.
    fireEvent.press(screen.getByTestId("fason-suzgec-secici-alan-islem"));
    expect(screen.queryByTestId("fason-suzgec-secici-islem-BASKI")).toBeNull();
    fireEvent.press(screen.getByTestId("fason-suzgec-secici-geri"));
    fireEvent.press(screen.getByTestId("fason-suzgec-secici-alan-musteri"));
    fireEvent.press(screen.getByTestId("fason-suzgec-secici-musteri-Akın Tekstil"));
    fireEvent.press(screen.getByTestId("fason-suzgec-secici-geri"));
    fireEvent.press(screen.getByTestId("fason-suzgec-secici-uygula"));
    await flush();
    expect(satirlar()).toEqual(["w1", "w3"]);
    expect(serit()).toBe("Süzülen: 20 top · 2.300 m · 2 iş emri");
  });

  it("sütun aç/kapa: İş emri no sütunu eklenir ve kırpılmaz numara olarak çizilir", async () => {
    render(<Fason />);
    await flush();
    expect(screen.queryByTestId("fason-sutun-isEmri")).toBeNull();
    fireEvent.press(screen.getByTestId("fason-sutunlar"));
    fireEvent.press(screen.getByTestId("fason-sutun-secici-isEmri"));
    await flush();
    expect(screen.getByTestId("fason-sutun-isEmri")).toBeTruthy();
    expect(within(screen.getByTestId("fason-satir-w1")).getByText("IE-0001")).toBeTruthy();
  });

  it("izinsiz hesapta ne anlık ne liste istenir", async () => {
    mockSession.permissions = [];
    render(<Fason />);
    await flush();
    expect(mockApi.snapshot).not.toHaveBeenCalled();
    expect(mockApi.list).not.toHaveBeenCalled();
  });
});

describe("altToplam (SAF) — hesap yok: fabrikanın toplamı ya da satır sayılarının toplamı", () => {
  const satir = T.fasonSatirlari(HEPSI, ANLIK);
  const gs = T.fasonGruplari(satir, ANLIK);
  const hesap = (secim: Record<string, string>, ara = "", tam = true) =>
    T.altToplam({ anlik: ANLIK, gruplar: gs, secim, ara, suzulen: T.fasonSuz(satir, gs, secim, ara), tam });

  it("bölünmüş iş emri firma süzgecinde: top/metre yazılmaz, yalnız adet", () => {
    expect(hesap({ firma: F1, musteri: "Bora Mensucat" })).toEqual({ etiket: "Süzülen", top: null, metre: null, isEmri: 1 });
    expect(toplamMetni({ etiket: "Süzülen", top: null, metre: null, isEmri: 1 })).toBe("1 iş emri");
  });

  it("bölünmemiş satırlarda firma + müşteri: satırların fabrika sayıları toplanır", () => {
    expect(hesap({ firma: F1, musteri: "Akın Tekstil" })).toEqual({ etiket: "Süzülen", top: 15, metre: 1400, isEmri: 1 });
  });

  it("liste tam değilken süzülen toplam/adet yazılmaz; süzgeçsiz fabrikanın toplamı yine yazılır", () => {
    expect(hesap({ musteri: "Akın Tekstil" }, "", false)).toBeNull();
    expect(hesap({}, "", false)).toEqual({ etiket: "Fasonda", top: 30, metre: 3456, isEmri: 4 });
  });

  it("satırda fason sayısı gelmediyse toplam yazılmaz", () => {
    const eksik = T.fasonSatirlari([ie("x", { isEmriNo: "IE-9", musteriAdi: "Akın Tekstil", asamaTop: [], fasonFirmaIdleri: [F1], fasonFirmaAdi: "Boyahane A" })], ANLIK);
    const g = T.fasonGruplari(eksik, ANLIK);
    expect(T.altToplam({ anlik: ANLIK, gruplar: g, secim: { musteri: "Akın Tekstil" }, ara: "", suzulen: eksik, tam: true })).toEqual({ etiket: "Süzülen", top: null, metre: null, isEmri: 1 });
  });

  it("çoklu seçim alan içinde VEYA, alanlar arası VE", () => {
    const sec = { kumas: "Saten\nKeten", renk: "Krem" };
    expect(T.fasonSuz(satir, gs, sec, "").map((r) => r.id).sort()).toEqual(["w1", "w3"]);
  });
});

describe("firma payı (fabrika 2.13.1 `fasonFirmaPayi`) — firma/işlem süzgecinde satırın seçime düşen payı", () => {
  const PAY = [
    { fasonFirmaId: F1, kategoriKodlari: ["BOYA"], top: 1, metre: 300 },
    { fasonFirmaId: F2, kategoriKodlari: ["APRE"], top: 2, metre: 256 },
  ];
  const W4P = ie("w4", { ...(W4.kayit as Record<string, unknown>), fasonFirmaPayi: PAY });
  // Topları F2'de ama firma payı tamamen F1'de olmayan satır: F1 süzgecinde pay düzeyinde düşer.
  const W7P = ie("w7", { isEmriNo: "IE-0007", musteriAdi: "Bora Mensucat", asamaTop: fason(4, 400), fasonFirmaIdleri: [F1, F2], fasonFirmaPayi: [{ fasonFirmaId: F2, kategoriKodlari: ["APRE"], top: 4, metre: 400 }] });
  const HEPSI_P = [W1, W2, W3, W4P, W5, W6, W7P];
  const satir = T.fasonSatirlari(HEPSI_P, ANLIK);
  const gs = T.fasonGruplari(satir, ANLIK);
  const hesap = (secim: Record<string, string>, ara = "") =>
    T.altToplam({ anlik: ANLIK, gruplar: gs, secim, ara, suzulen: T.fasonSuz(satir, gs, secim, ara), tam: true });

  it("bölünmüş iş emri firma süzgecinde: şerit seçili firmanın payını toplar (yalnız adet DEĞİL)", () => {
    expect(hesap({ firma: F1, musteri: "Bora Mensucat" })).toEqual({ etiket: "Süzülen", top: 1, metre: 300, isEmri: 1 });
    expect(hesap({ firma: F2, musteri: "Bora Mensucat" })).toEqual({ etiket: "Süzülen", top: 6, metre: 656, isEmri: 2 });
  });

  it("işlem süzgeci payın kategori kodlarıyla; çoklu firma seçimi payları birleştirir; satırın Top/Metre'si pay", () => {
    expect(hesap({ islem: "APRE", musteri: "Bora Mensucat" })).toEqual({ etiket: "Süzülen", top: 6, metre: 656, isEmri: 2 });
    const r = T.fasonSuz(satir, gs, { firma: `${F1}\n${F2}`, musteri: "Bora Mensucat" }, "").find((x) => x.id === "w4")!;
    expect([r.top, r.metre]).toEqual([3, 556]);
    const tek = T.fasonSuz(satir, gs, { firma: F1, islem: "APRE" }, "");
    expect(tek.map((x) => x.id)).toEqual([]);
  });

  it("süzgeçsizken ve firma dışı süzgeçte satır fabrikanın tüm fason sayısını gösterir", () => {
    const r = T.fasonSuz(satir, gs, { musteri: "Bora Mensucat" }, "").find((x) => x.id === "w4")!;
    expect([r.top, r.metre]).toEqual([3, 556]);
    expect(hesap({ musteri: "Bora Mensucat" })).toEqual({ etiket: "Süzülen", top: 7, metre: 956, isEmri: 2 });
  });

  it("bozuk pay girdisi → pay yok sayılır (eski davranış: bölünmüş satırda yalnız adet)", () => {
    const bozuk = T.fasonSatirlari([ie("w4", { ...(W4.kayit as Record<string, unknown>), fasonFirmaPayi: [{ fasonFirmaId: F1, top: "x", metre: 1 }] })], ANLIK);
    expect(bozuk[0]!.paylar).toBeNull();
    const g = T.fasonGruplari(bozuk, ANLIK);
    expect(T.altToplam({ anlik: ANLIK, gruplar: g, secim: { firma: F1, musteri: "Bora Mensucat" }, ara: "", suzulen: T.fasonSuz(bozuk, g, { firma: F1, musteri: "Bora Mensucat" }, ""), tam: true }))
      .toEqual({ etiket: "Süzülen", top: null, metre: null, isEmri: 1 });
  });

  it("ekran: fasoncu ön seçiliyken bölünmüş satırın Top/Metre hücresi o firmanın payı", async () => {
    serve([HEPSI_P]);
    mockParams = { firma: F1 };
    render(<Fason />);
    await flush();
    expect(satirlar()).toEqual(["w1", "w2", "w4"]);
    const w4 = within(screen.getByTestId("fason-satir-w4"));
    expect(w4.getByText("300")).toBeTruthy();
    expect(w4.queryByText("556")).toBeNull();
    expect(serit()).toBe("Süzülen: 22 top · 2.000 m · 3 iş emri");
  });
});

describe("giriş noktaları", () => {
  it("Üretim › nerede: fason satırları fason tablosuna (firma ön seçili), kurşun/tambur konum listesine", () => {
    expect(locationRoute({ location: "fason", params: { asama: "FASON" } })).toEqual({ pathname: "/fason", params: {} });
    expect(locationRoute({ location: "fason", params: { fasonFirmaId: F1, firma: "Boyahane A" } })).toEqual({ pathname: "/fason", params: { firma: F1 } });
    expect(locationRoute({ location: "tambur", params: { asama: "TAMBUR" } })).toEqual({ pathname: "/is-emirleri/konum", params: { asama: "TAMBUR" } });
  });
});
