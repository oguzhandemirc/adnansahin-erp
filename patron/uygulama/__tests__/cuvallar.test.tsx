// Çuvallar (anlık `cuval-deposu`, fabrika 2.12.4; kullanıcı isteği 2026-11-17): §1 saf okuma — özet/döküm fabrikadan,
// etiket farkı fabrikanın işareti, eksik alan çökertmez · §2 süzgeç/arama/sıralama (istemcide, stok listesi deseni) ·
// §3 menü: Operasyon grubunda Sevkiyat'ın yanında, yalnız `bulut:sevkiyat:oku` ile · §4 ekran: kartlar fabrika sayısı,
// cari dökümüne dokunmak süzer, çuvala dokunmak içeriği açar, farklı etiketli top işaretli, hiçbir yazma düğmesi yok ·
// §5 eski fabrika/bulut (404): anlaşılır boş durum, çökme yok.
// NEGATİF SONDA (2026-11-17, ikisi de kırmızı verdi, geri alındı): `gorunenCuvallar`da cari satırı kaldırıldı → §2 "cari
// süzgeci" ve §4 "döküme dokununca süzer" ✗; içerikte rozet koşulu `x.etiketFarkli` yerine `!!x.etiketMusteri` → §4
// "yalnız farklı etiketli top işaretli" ✗.
import AsyncStorage from "@react-native-async-storage/async-storage";
import { act, fireEvent, render, screen, within } from "@testing-library/react-native";
import type React from "react";
import { StyleSheet } from "react-native";
import { ApiError } from "../src/api/client";
import * as lib from "../src/lib/cuval-deposu";
import { moduleVisible } from "../src/lib/access";
import { NAV_GROUPS } from "../src/ui/tabs";
import { CUVAL_SUTUNLARI, cuvalHucresi } from "../src/ui/cuval/gorunum";
import { ORNEK_CUVAL_DEPOSU, ORNEK_STOK_KALEM } from "../src/ornek/veri";

const mockApi = { snapshot: jest.fn(), list: jest.fn(), record: jest.fn(), viewPref: jest.fn(), viewPrefSet: jest.fn() };
const mockCache = {
  load: jest.fn(async (_k: string, f: () => Promise<unknown>) => ({ data: await f(), offline: false, savedAt: "2026-11-17T09:00:00.000Z" })),
  peek: jest.fn(async () => null),
};
const mockSession = {
  api: mockApi, cache: mockCache, markOnline: jest.fn(), permissions: ["bulut:sevkiyat:oku"] as string[], offline: false, offlineSince: null,
  facility: { tesis: { id: "t1" }, hesap: { id: "h1" }, liste: { siralama: {} } } as Record<string, unknown>, facilities: [], switchError: null, factoryStamp: "2026-11-17T08:55:00Z",
};
jest.mock("../src/state/session", () => ({ useSession: () => mockSession }));
jest.mock("expo-router", () => ({
  useRouter: () => ({ push: jest.fn(), replace: jest.fn(), back: jest.fn(), navigate: jest.fn(), canGoBack: () => true }),
  usePathname: () => "/cuvallar",
  useLocalSearchParams: () => ({}),
  useFocusEffect: (cb: () => void | (() => void)) => (require("react") as typeof import("react")).useEffect(() => cb(), [cb]),
}));
jest.mock("react-native-safe-area-context", () => ({ useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }) }));

const Cuvallar = (require("../app/(app)/cuvallar") as { default: () => React.ReactElement; CUVAL_BOS: string }).default;
const { CUVAL_BOS } = require("../app/(app)/cuvallar") as { CUVAL_BOS: string };

const ALFA = "11111111-1111-4111-8111-000000000001";
const BETA = "11111111-1111-4111-8111-000000000002";
const sid = (n: number) => `22222222-2222-4222-8222-${String(n).padStart(12, "0")}`;
const tid = (n: number) => `33333333-3333-4333-8333-${String(n).padStart(12, "0")}`;
const topu = (n: number, o: Record<string, unknown> = {}) => ({
  id: tid(n), topNo: `T-${n}`, urun: "ÖRNEK SATEN", renk: "KREM", en: 280, kat: null, kalite: "1. Kalite", metre: 40, kg: null, etiketMusteri: null, etiketFarkli: false, ...o,
});
// Sayılar fabrikanın gönderdiği gibidir (bilerek satırlardan farklı tutulan kg yok; özet istemcide toplanmaz).
const VERI = {
  ozet: { cuval: 3, top: 4, metre: 160, kg: 48.5, tartiliCuval: 1, sevkeAtanan: 1 },
  cariler: [
    { cariKartId: null, ad: "Müşterisiz (genel stok)", cuval: 1, top: 1, metre: 40, kg: null },
    { cariKartId: ALFA, ad: "ALFA TEKSTİL", cuval: 1, top: 2, metre: 80, kg: 48.5 },
    { cariKartId: BETA, ad: "BETA ÖRME", cuval: 1, top: 1, metre: 40, kg: null },
  ],
  cuvallar: [
    { id: sid(1), cuvalNo: "CV1711260001", cariKartId: ALFA, cari: "ALFA TEKSTİL", sube: "Merkez", durum: "DEPODA", sevkiyatNo: null, kg: 48.5, top: 2, metre: 80, olusturulma: "2026-11-17",
      toplar: [topu(1, { etiketMusteri: "ALFA TEKSTİL" }), topu(2, { etiketMusteri: "BETA ÖRME", etiketFarkli: true })] },
    { id: sid(2), cuvalNo: "CV1611260002", cariKartId: BETA, cari: "BETA ÖRME", sube: null, durum: "SEVKE_ATANDI", sevkiyatNo: "SVK-0042", kg: null, top: 1, metre: 40, olusturulma: "2026-11-16",
      toplar: [topu(3, { urun: "DENEME KETEN", renk: "GRİ", en: 150, etiketMusteri: "BETA ÖRME" })] },
    { id: sid(3), cuvalNo: "CV1511260003", cariKartId: null, cari: null, sube: null, durum: "DEPODA", sevkiyatNo: null, kg: null, top: 1, metre: 40, olusturulma: "2026-11-15",
      toplar: [topu(4, { etiketMusteri: "ALFA TEKSTİL" })] },
  ],
};

describe("§1 okuma", () => {
  it("özet ve döküm fabrikadan; etiket farkı fabrikanın işareti", () => {
    const d = lib.cuvalDeposu(VERI);
    expect(d.ozet).toEqual(VERI.ozet);
    expect(d.cariler.map((c) => [lib.cariAnahtari(c), c.cuval])).toEqual([[lib.MUSTERISIZ, 1], [ALFA, 1], [BETA, 1]]);
    expect(d.cuvallar.map((c) => c.farkVar)).toEqual([true, false, false]);
    // Müşterisiz çuvaldaki etiketli top işaretsiz kalır (fabrika işaretlemedi; istemci ad karşılaştırmaz).
    expect(d.cuvallar[2]!.toplar[0]!.etiketFarkli).toBe(false);
    expect(lib.topKalemi(d.cuvallar[1]!.toplar[0]!)).toBe("DENEME KETEN · 150 cm · GRİ");
  });
  it("eksik/bozuk tel çökertmez", () => {
    const d = lib.cuvalDeposu({ cuvallar: [{ toplar: [{}] }] });
    expect(d.ozet).toMatchObject({ cuval: 0, kg: null });
    expect(d.cuvallar[0]).toMatchObject({ cuvalNo: "—", durum: "DEPODA", top: 0, farkVar: false });
    expect(lib.cuvalDeposu(null).cuvallar).toEqual([]);
  });
});

describe("§2 süzgeç · arama · sıralama", () => {
  const d = lib.cuvalDeposu(VERI);
  const g = (s: Record<string, string>, ara = "", sira: { alan: string; yon: "artan" | "azalan" } | null = null) => lib.gorunenCuvallar(d, ara, s, sira).map((c) => c.cuvalNo);
  it("gruplar: cari (döküm sırası) · durum · etiket", () => {
    expect(lib.cuvalSuzgecGruplari(d).map((x) => x.anahtar)).toEqual(["cari", "durum", "fark"]);
  });
  it("cari süzgeci (müşterisiz dahil) · durum · etiket farkı", () => {
    expect(g({ cari: ALFA })).toEqual(["CV1711260001"]);
    expect(g({ cari: lib.MUSTERISIZ })).toEqual(["CV1511260003"]);
    expect(g({ durum: "SEVKE_ATANDI" })).toEqual(["CV1611260002"]);
    expect(g({ fark: "evet" })).toEqual(["CV1711260001"]);
  });
  it("arama Türkçe katlamalı: top no, ürün, etiket müşterisi, sevkiyat no", () => {
    expect(g({}, "t-3")).toEqual(["CV1611260002"]);
    expect(g({}, "gri")).toEqual(["CV1611260002"]);
    expect(g({}, "svk-0042")).toEqual(["CV1611260002"]);
    expect(g({}, "alfa")).toEqual(["CV1711260001", "CV1511260003"]);
  });
  it("sıralama sütunla; yoksa fabrikanın sırası", () => {
    expect(g({})).toEqual(["CV1711260001", "CV1611260002", "CV1511260003"]);
    expect(g({}, "", { alan: "top", yon: "artan" })[2]).toBe("CV1711260001");
    expect(g({}, "", { alan: "cuval", yon: "artan" })).toEqual(["CV1511260003", "CV1611260002", "CV1711260001"]);
  });
  it("çuval hücresi sevke atanmışlığı ve etiket farkını söyler; sütunlar telin alanı", () => {
    expect(cuvalHucresi(d.cuvallar[0]!)).toBe("CV1711260001\nEtiket farklı");
    expect(cuvalHucresi(d.cuvallar[1]!)).toBe("CV1611260002\nSevke atandı");
    expect(CUVAL_SUTUNLARI.find((c) => c.key === "cari")!.hucre(d.cuvallar[2]!)).toBe("Müşterisiz");
  });
});

describe("§3 menü ve izin", () => {
  it("Operasyon grubunda Sevkiyat'ın yanında; yalnız sevkiyat okuma izniyle", () => {
    expect(NAV_GROUPS.find((x) => x.title === "Operasyon")!.modules).toEqual(["sevkiyat", "cuvallar"]);
    expect(moduleVisible(["bulut:sevkiyat:oku"], "cuvallar")).toBe(true);
    expect(moduleVisible(["bulut:stok:oku", "bulut:ozet:oku"], "cuvallar")).toBe(false);
  });
});

async function flush() {
  for (let i = 0; i < 4; i++) await act(async () => undefined);
}
const veriIle = (veri: unknown) => async (p: string) => {
  if (p !== "cuval-deposu") throw new ApiError(404, "BULUNAMADI", "Anlık görüntü bulunamadı");
  return { projeksiyon: p, veri, surum: "2026-11-17T08:55:00.000Z" };
};

beforeEach(() => {
  for (const f of Object.values(mockApi)) f.mockReset();
  mockSession.permissions = ["bulut:sevkiyat:oku"];
});

describe("§4 ekran", () => {
  it("kartlar fabrika sayısı; döküm; varsayılan 4 sütun; yazma düğmesi yok", async () => {
    mockApi.snapshot.mockImplementation(veriIle(VERI));
    render(<Cuvallar />);
    await flush();
    expect(mockApi.snapshot).toHaveBeenCalledWith("cuval-deposu");
    expect(within(screen.getByTestId("kpi-cuval")).getByText("3")).toBeTruthy();
    expect(within(screen.getByTestId("kpi-cuval-kg")).getByText("48,5")).toBeTruthy();
    expect(screen.getByTestId("cuval-cari-hepsi")).toBeTruthy();
    expect(screen.getByTestId(`cuval-cari-${ALFA}`)).toBeTruthy();
    expect(screen.getByTestId(`cuval-cari-${lib.MUSTERISIZ}`)).toBeTruthy();
    expect(screen.getAllByTestId(/^cuval-satir-/)).toHaveLength(3);
    for (const yaz of [/ekle/i, /çıkar/i, /sevk et/i, /yazdır/i, /sil/i]) expect(screen.queryByRole("button", { name: yaz })).toBeNull();
  });
  it("döküme dokununca o cariyi süzer, Hepsi kaldırır", async () => {
    mockApi.snapshot.mockImplementation(veriIle(VERI));
    render(<Cuvallar />);
    await flush();
    await act(async () => { fireEvent.press(screen.getByTestId(`cuval-cari-${BETA}`)); });
    await flush();
    expect(screen.getAllByTestId(/^cuval-satir-/).map((x) => x.props.testID)).toEqual([`cuval-satir-${sid(2)}`]);
    await act(async () => { fireEvent.press(screen.getByTestId("cuval-cari-hepsi")); });
    await flush();
    expect(screen.getAllByTestId(/^cuval-satir-/)).toHaveLength(3);
  });
  it("çuvala dokununca içerik açılır; yalnız farklı etiketli top işaretli", async () => {
    mockApi.snapshot.mockImplementation(veriIle(VERI));
    render(<Cuvallar />);
    await flush();
    await act(async () => { fireEvent.press(screen.getByTestId(`cuval-satir-${sid(1)}`)); });
    const ic = screen.getByTestId(`cuval-icerik-${sid(1)}`);
    expect(within(ic).getByText("T-1")).toBeTruthy();
    expect(within(ic).getAllByText("ÖRNEK SATEN · 280 cm · KREM")).toHaveLength(2);
    expect(within(ic).getByText("1. Kalite · Etiket: BETA ÖRME")).toBeTruthy();
    expect(screen.getByTestId(`cuval-top-fark-${tid(2)}`)).toBeTruthy();
    expect(screen.queryByTestId(`cuval-top-fark-${tid(1)}`)).toBeNull();
    // Kart seçimi: "Brüt kg" kapatılınca kart kaybolur (sıfır kart serbest; tercih yalnız cihazda).
    await act(async () => { fireEvent.press(screen.getByTestId("cuval-kart-sec")); });
    // "Brüt kg" hem kartta hem seçicide yazar; seçicinin öğesine kimliğiyle basılır (diğer ekranların testleri gibi).
    expect(within(screen.getByTestId("cuval-kart-secici")).getByText("Brüt kg")).toBeTruthy();
    await act(async () => { fireEvent.press(screen.getByTestId("cuval-kart-secici-kg")); });
    await flush();
    expect(screen.queryByTestId("kpi-cuval-kg")).toBeNull();
  });
  it("izin yoksa istek yok", async () => {
    mockSession.permissions = ["bulut:stok:oku"];
    mockApi.snapshot.mockImplementation(veriIle(VERI));
    render(<Cuvallar />);
    await flush();
    expect(mockApi.snapshot).not.toHaveBeenCalled();
  });
});

describe("§5 eski fabrika / bulut", () => {
  it("anlık yok (404): anlaşılır boş durum, çökme yok", async () => {
    mockApi.snapshot.mockImplementation(async () => { throw new ApiError(404, "BULUNAMADI", "Anlık görüntü bulunamadı"); });
    render(<Cuvallar />);
    await flush();
    expect(screen.getByTestId("cuval-bos")).toBeTruthy();
    expect(screen.getByText(CUVAL_BOS)).toBeTruthy();
  });
  it("depoda çuval yok: boş liste cümlesi", async () => {
    mockApi.snapshot.mockImplementation(veriIle({ ozet: { cuval: 0, top: 0, metre: 0, kg: null, tartiliCuval: 0, sevkeAtanan: 0 }, cariler: [], cuvallar: [] }));
    render(<Cuvallar />);
    await flush();
    expect(screen.getByTestId("cuval-yok")).toBeTruthy();
  });
});

describe("§6 örnek veri", () => {
  it("çuval deposu ile stok kalem anlığının çuvaldaki topları aynı küme; özet satırlarla tutarlı", () => {
    const d = lib.cuvalDeposu(ORNEK_CUVAL_DEPOSU());
    const kalem = ORNEK_STOK_KALEM().bitmis;
    expect(d.ozet.top).toBe(kalem.cuvaldaTop);
    expect(d.cuvallar.flatMap((c) => c.toplar.map((t) => t.id)).sort()).toEqual(kalem.cuvaldakiToplar.map((t) => t.id).sort());
    expect(d.cariler.reduce((a, c) => a + c.cuval, 0)).toBe(d.ozet.cuval);
    expect(d.cuvallar.some((c) => c.farkVar)).toBe(true);
    expect(d.cuvallar.some((c) => c.durum === "SEVKE_ATANDI")).toBe(true);
  });
});

// §7 (2026-11-19, kullanıcı: kartlar kapalıyken başlığın altında boş bant): ilk görünür blok üst pay almaz; ekran adını
// yineleyen "Çuvallar" başlığı yalnız cari dökümü üstündeyken (iki listeyi ayırmak için) çizilir.
describe("§7 kartlar kapalıyken üst boşluk", () => {
  // Kart seçimi cihazda saklanır: her test varsayılan (hepsi açık) seçimden başlar.
  beforeEach(async () => {
    await AsyncStorage.clear();
  });
  const ustPay = (id: string) => (StyleSheet.flatten(screen.getByTestId(id).props.style) as { marginTop?: number } | undefined)?.marginTop ?? 0;
  const kapat = async (anahtarlar: readonly string[]) => {
    fireEvent.press(screen.getByTestId("cuval-kart-sec"));
    for (const k of anahtarlar) await act(async () => { fireEvent.press(screen.getByTestId(`cuval-kart-secici-${k}`)); });
    await flush();
  };

  it("sayı kartları kapalı, döküm açık: döküm ilk blok (üst pay 0); Çuvallar başlığı ayırıcı olarak durur", async () => {
    mockApi.snapshot.mockImplementation(veriIle(VERI));
    render(<Cuvallar />);
    await flush();
    expect(ustPay("cuval-cariler-blok")).toBeGreaterThan(0); // kartların altında: bloklar arası boşluk
    await kapat(["cuval", "top", "metre", "kg"]);
    expect(screen.queryByTestId("kpi-cuval")).toBeNull();
    expect(ustPay("cuval-cariler-blok")).toBe(0);
    expect(screen.getByTestId("cuval-liste-baslik")).toBeTruthy();
  });

  it("hiç kart yok: kart kabı, döküm ve yineleyen başlık yok; araç satırı ve liste yerinde", async () => {
    mockApi.snapshot.mockImplementation(veriIle(VERI));
    render(<Cuvallar />);
    await flush();
    await kapat(["cuval", "top", "metre", "kg", "cariler"]);
    for (const id of ["kpi-cuval", "kpi-cuval-top", "kpi-cuval-metre", "kpi-cuval-kg", "cuval-cariler", "cuval-liste-baslik"]) expect(screen.queryByTestId(id)).toBeNull();
    expect(screen.queryByText("ÇUVALLAR")).toBeNull();
    expect(screen.getByTestId("cuval-ara")).toBeTruthy();
    expect(screen.getAllByTestId(/^cuval-satir-/)).toHaveLength(3);
  });
});
