// Çuvalın sevk partisi + üretim parti no (fabrika 2.13.2; kullanıcı isteği 2026-11-20: "parti no'yu telefonda görmemiz
// lazım; çuval ve çuvalın içeriği filtrelenebilir ve aranabilir olsun"):
// §1 Çuvallar (SAF): okuma · Parti süzgeci (kod anahtarlı, aynı ad kodla ayrılır, Partisiz) · arama (ad/kod/ambalaj/top
//    parti no) · alt şerit toplamı · eski tercihe Parti BİR KEZ eklenir · alan yoksa parti sütunu/süzgeci yok.
// §2 Çuvalın topları (SAF): süzgeç alanları veride ne varsa (Kumaş · Renk · Parti no · Etiket), arama, boş sütun gizli.
// §3 Sevkiyat çuvalları (SAF): parti/ambalaj okunur, sütun yalnız veride varsa, arama + Parti süzgeci.
// §4 Ekran: Parti sütunu varsayılan görünür, aramada süzülür, alt şerit "Toplam"/"Süzülen"; eski fabrika verisinde
//    Parti sütunu yok, hata yok; açılan çuvalın topları tablo + arama + süzgeç.
// NEGATİF SONDA (2026-11-20, ikisi de kırmızı verdi, geri alındı): `gorunenCuvallar`da parti satırı kaldırıldı → §1
// "Parti süzgeci" ✗; `doluSutunlar` süzmeyi bıraktı (keys aynen) → §1 + §4 "eski fabrika: Parti sütunu yok" ✗.
import AsyncStorage from "@react-native-async-storage/async-storage";
import { act, fireEvent, render, screen, within } from "@testing-library/react-native";
import type React from "react";
import * as lib from "../src/lib/cuval-deposu";
import { gorunenToplar, STOK_ETIKETI, topSuzgecGruplari } from "../src/lib/cuval-toplari";
import { sevkIcerigi } from "../src/lib/sevkiyat-icerigi";
import { CUVAL_VARSAYILAN_SUTUN, cuvalTemizle, doluSutunlar, PARTI_EKLENDI } from "../src/ui/cuval/gorunum";
import { topSutunlari } from "../src/ui/cuval/CuvalToplari";
import { cuvalToplamMetni } from "../src/ui/cuval/CuvalToplamSatiri";
import { gorunenSevkCuvallari, sevkCuvalSutunlari } from "../src/ui/sevkiyat/CuvalBolumu";
import { ORNEK_CUVAL_DEPOSU } from "../src/ornek/veri";

const mockApi = { snapshot: jest.fn(), list: jest.fn(), record: jest.fn(), viewPref: jest.fn(), viewPrefSet: jest.fn() };
const mockCache = {
  load: jest.fn(async (_k: string, f: () => Promise<unknown>) => ({ data: await f(), offline: false, savedAt: "2026-11-20T09:00:00.000Z" })),
  peek: jest.fn(async () => null),
};
const mockSession = {
  api: mockApi, cache: mockCache, markOnline: jest.fn(), permissions: ["bulut:sevkiyat:oku"] as string[], offline: false, offlineSince: null,
  facility: { tesis: { id: "t1" }, hesap: { id: "h1" }, liste: { siralama: {} } } as Record<string, unknown>, facilities: [], switchError: null, factoryStamp: "2026-11-20T08:55:00Z",
};
jest.mock("../src/state/session", () => ({ useSession: () => mockSession }));
jest.mock("expo-router", () => ({
  useRouter: () => ({ push: jest.fn(), replace: jest.fn(), back: jest.fn(), navigate: jest.fn(), canGoBack: () => true }),
  usePathname: () => "/cuvallar",
  useLocalSearchParams: () => ({}),
  useFocusEffect: (cb: () => void | (() => void)) => (require("react") as typeof import("react")).useEffect(() => cb(), [cb]),
}));
jest.mock("react-native-safe-area-context", () => ({ useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }) }));

const Cuvallar = (require("../app/(app)/cuvallar") as { default: () => React.ReactElement }).default;

const sid = (n: number) => `22222222-2222-4222-8222-${String(n).padStart(12, "0")}`;
const tid = (n: number) => `33333333-3333-4333-8333-${String(n).padStart(12, "0")}`;
const topu = (n: number, o: Record<string, unknown> = {}) => ({
  id: tid(n), topNo: `T-${n}`, urun: "ÖRNEK SATEN", renk: "KREM", en: 280, kat: null, kalite: null, metre: 40, kg: null, etiketMusteri: null, etiketFarkli: false, parti: null, ...o,
});
const cuval = (n: number, o: Record<string, unknown>, toplar: unknown[]) => ({
  id: sid(n), cuvalNo: `CV20112600${n}`, cariKartId: null, cari: null, sube: null, durum: "DEPODA", sevkiyatNo: null, kg: null, top: toplar.length, metre: 40 * toplar.length,
  olusturulma: "2026-11-20", toplar, partiAdi: null, partiKodu: null, partiDurumu: null, ambalajNo: null, depo: "Ana Depo", ...o,
});
// Yeni fabrika (2.13.2): iki partide aynı ad "P-1" (biri kapalı), bir partisiz çuval; toplarda üretim parti no.
const YENI = {
  ozet: { cuval: 4, top: 7, metre: 280, kg: 50.25, tartiliCuval: 2, sevkeAtanan: 0 },
  cariler: [],
  cuvallar: [
    cuval(1, { partiAdi: "DNZ-084", partiKodu: "PRT-2611-0020", partiDurumu: "OPEN", ambalajNo: 2, kg: 20.125 },
      [topu(1, { parti: "P57" }), topu(2, { parti: "P58", renk: "EKRU" }), topu(3, { parti: "P57", etiketMusteri: "ALFA" })]),
    cuval(2, { partiAdi: "P-1", partiKodu: "PRT-2611-0018", partiDurumu: "OPEN", ambalajNo: 1, kg: 30.125 }, [topu(4, { parti: "P54" })]),
    cuval(3, { partiAdi: "P-1", partiKodu: "PRT-2610-0003", partiDurumu: "CLOSED", ambalajNo: 1 }, [topu(5), topu(6)]),
    cuval(4, {}, [topu(7)]),
  ],
};
// Eski fabrika (2.13.1): parti/ambalaj/depo/top parti alanları HİÇ yok.
const ESKI = {
  ozet: { cuval: 1, top: 1, metre: 40, kg: null, tartiliCuval: 0, sevkeAtanan: 0 },
  cariler: [],
  cuvallar: [{ id: sid(9), cuvalNo: "CV1711260009", cariKartId: null, cari: null, sube: null, durum: "DEPODA", sevkiyatNo: null, kg: null, top: 1, metre: 40, olusturulma: "2026-11-17",
    toplar: [{ id: tid(9), topNo: "T-9", urun: "ÖRNEK SATEN", renk: "KREM", en: 280, kat: null, kalite: null, metre: 40, kg: null, etiketMusteri: null, etiketFarkli: false }] }],
};

describe("§1 Çuvallar — sevk partisi", () => {
  const d = lib.cuvalDeposu(YENI);
  const g = (s: Record<string, string>, ara = "") => lib.gorunenCuvallar(d, ara, s, null).map((c) => c.id);
  it("okuma: parti adı/kodu/durumu, ambalaj, depo; top üretim parti no", () => {
    expect(d.cuvallar[0]).toMatchObject({ partiAdi: "DNZ-084", partiKodu: "PRT-2611-0020", partiDurumu: "OPEN", ambalajNo: 2, depo: "Ana Depo" });
    expect(d.cuvallar[0]!.toplar.map((t) => t.parti)).toEqual(["P57", "P58", "P57"]);
    expect(d.cuvallar[3]).toMatchObject({ partiAdi: null, partiKodu: null, ambalajNo: null });
  });
  it("Parti süzgeci: kod anahtarlı, aynı ad kodla ayrılır, Partisiz sonda; ilk grup", () => {
    const gr = lib.cuvalSuzgecGruplari(d);
    expect(gr[0]!.anahtar).toBe("parti");
    expect(gr[0]!.secenekler).toEqual([
      { deger: "PRT-2611-0020", etiket: "DNZ-084" },
      { deger: "PRT-2610-0003", etiket: "P-1 · PRT-2610-0003" },
      { deger: "PRT-2611-0018", etiket: "P-1 · PRT-2611-0018" },
      { deger: lib.PARTISIZ, etiket: "Partisiz" },
    ]);
    // Tek depo → Depo süzgeci yok (seçecek bir şey yok).
    expect(gr.some((x) => x.anahtar === "depo")).toBe(false);
  });
  it("Parti süzgeci çoklu (VEYA) + Partisiz", () => {
    expect(g({ parti: "PRT-2611-0018" })).toEqual([sid(2)]);
    expect(g({ parti: `PRT-2611-0020\n${lib.PARTISIZ}` })).toEqual([sid(1), sid(4)]);
  });
  it("arama: parti adı, kalıcı kod, top üretim parti no", () => {
    expect(g({}, "dnz")).toEqual([sid(1)]);
    expect(g({}, "prt-2610")).toEqual([sid(3)]);
    expect(g({}, "p54")).toEqual([sid(2)]);
  });
  it("alt şerit: görünen satırların fabrika sayıları (metre/kg binde bir tamsayıyla), kg yalnız tartılı", () => {
    expect(lib.cuvalToplami(d.cuvallar)).toEqual({ cuval: 4, top: 7, metre: 280, kg: 50.25 });
    expect(lib.cuvalToplami(lib.gorunenCuvallar(d, "", { parti: "PRT-2610-0003" }, null))).toEqual({ cuval: 1, top: 2, metre: 80, kg: null });
    expect(cuvalToplamMetni({ etiket: "Süzülen", sayilar: { cuval: 1, top: 2, metre: 80, kg: null } })).toBe("1 çuval · 2 top · 80 m");
  });
  it("alan yok (eski fabrika): parti süzgeci yok, parti/ambalaj/depo sütunları düşer, çökme yok", () => {
    const e = lib.cuvalDeposu(ESKI);
    expect(e.cuvallar[0]).toMatchObject({ partiAdi: null, ambalajNo: null, depo: null });
    expect(e.cuvallar[0]!.toplar[0]!.parti).toBeNull();
    expect(lib.cuvalSuzgecGruplari(e).map((x) => x.anahtar)).toEqual(["durum"]);
    expect(doluSutunlar(["cuval", "parti", "partiKodu", "ambalaj", "depo", "top"], e.cuvallar)).toEqual(["cuval", "top"]);
    expect(doluSutunlar(["cuval", "parti", "top"], d.cuvallar)).toEqual(["cuval", "parti", "top"]);
  });
  it("tercih: varsayılanda Parti var; eski kayda Parti BİR KEZ eklenir, kapatılınca geri gelmez", () => {
    const temizle = cuvalTemizle(Infinity);
    expect(CUVAL_VARSAYILAN_SUTUN).toContain("parti");
    const eski = temizle({ surum: 1, sutunlar: ["cuval", "cari", "top"], siralama: null, suzgec: {} });
    expect(eski.sutunlar).toEqual(["cuval", "parti", "cari", "top"]);
    expect(eski.suzgec[PARTI_EKLENDI]).toBe("1");
    const kapali = temizle({ ...eski, sutunlar: ["cuval", "cari", "top"] });
    expect(kapali.sutunlar).toEqual(["cuval", "cari", "top"]);
  });
  it("örnek veri yeni alanları taşır", () => {
    const o = lib.cuvalDeposu(ORNEK_CUVAL_DEPOSU());
    expect(o.cuvallar.some((c) => c.partiAdi === "DNZ-084" && c.ambalajNo !== null)).toBe(true);
    expect(o.cuvallar.some((c) => c.partiAdi === null)).toBe(true);
    expect(o.cuvallar.flatMap((c) => c.toplar).some((t) => t.parti === "P57")).toBe(true);
  });
});

describe("§2 Çuvalın topları — arama + süzgeç", () => {
  const toplar = lib.cuvalDeposu(YENI).cuvallar[0]!.toplar;
  it("gruplar: yalnız iki+ değerli alanlar (Renk · Parti no · Etiket); tek kumaş süzgeç değil", () => {
    expect(topSuzgecGruplari(toplar).map((x) => x.anahtar)).toEqual(["renk", "parti", "etiket"]);
    expect(topSuzgecGruplari(toplar).find((x) => x.anahtar === "etiket")!.secenekler.map((x) => x.deger)).toEqual(["ALFA", STOK_ETIKETI]);
  });
  it("süzgeç + arama", () => {
    expect(gorunenToplar(toplar, "", { parti: "P57" }).map((t) => t.topNo)).toEqual(["T-1", "T-3"]);
    expect(gorunenToplar(toplar, "", { etiket: STOK_ETIKETI }).map((t) => t.topNo)).toEqual(["T-1", "T-2"]);
    expect(gorunenToplar(toplar, "ekru", {}).map((t) => t.topNo)).toEqual(["T-2"]);
    expect(gorunenToplar(toplar, "p58", {}).map((t) => t.topNo)).toEqual(["T-2"]);
  });
  it("sütunlar: Parti no veride varsa; eski fabrikada yok", () => {
    expect(topSutunlari(toplar, { onEk: "x" }).map((c) => c.key)).toEqual(["topNo", "metre", "urun", "renk", "parti", "en", "etiket"]);
    const eski = lib.cuvalDeposu(ESKI).cuvallar[0]!.toplar;
    expect(topSutunlari(eski, { onEk: "x" }).map((c) => c.key)).not.toContain("parti");
    expect(topSuzgecGruplari(eski)).toEqual([]);
  });
});

describe("§3 Sevkiyat çuvalları", () => {
  const kayit = (cuvallar: unknown[]) => sevkIcerigi({ durum: "DISPATCHED", ozet: {}, cuvallar, cuvalsizToplar: [] });
  it("parti/ambalaj okunur; sütunlar veride varsa; arama + Parti süzgeci", () => {
    const d = kayit([
      { id: sid(1), cuvalNo: "CV1", top: 1, metre: 40, partiAdi: "034", partiKodu: "PRT-2611-0019", partiDurumu: "CLOSED", ambalajNo: 1, toplar: [topu(1, { parti: "P55" })] },
      { id: sid(2), cuvalNo: "CV2", top: 1, metre: 40, toplar: [topu(2)] },
    ]);
    expect(d.cuvallar[0]).toMatchObject({ partiAdi: "034", partiKodu: "PRT-2611-0019", ambalajNo: 1 });
    expect(d.cuvallar[0]!.toplar[0]!.parti).toBe("P55");
    expect(sevkCuvalSutunlari(d.cuvallar).map((c) => c.key)).toEqual(["cuval", "parti", "ambalaj", "top", "metre", "kg"]);
    expect(gorunenSevkCuvallari(d.cuvallar, "034", {}).map((c) => c.id)).toEqual([sid(1)]);
    expect(gorunenSevkCuvallari(d.cuvallar, "", { parti: lib.PARTISIZ }).map((c) => c.id)).toEqual([sid(2)]);
  });
  it("alan yok (eski fabrika): Parti/Ambalaj sütunu yok", () => {
    const d = kayit([{ id: sid(1), cuvalNo: "CV1", top: 1, metre: 40, toplar: [topu(1)] }]);
    expect(d.cuvallar[0]!.partiAdi).toBeNull();
    expect(sevkCuvalSutunlari(d.cuvallar).map((c) => c.key)).toEqual(["cuval", "top", "metre", "kg"]);
  });
});

async function flush() {
  for (let i = 0; i < 4; i++) await act(async () => undefined);
}

describe("§4 ekran", () => {
  beforeEach(async () => {
    await AsyncStorage.clear();
    mockApi.snapshot.mockReset();
  });
  const veriIle = (veri: unknown) => async (p: string) => ({ projeksiyon: p, veri, surum: "2026-11-20T08:55:00.000Z" });
  it("Parti sütunu görünür; arama süzer; alt şerit Toplam → Süzülen", async () => {
    mockApi.snapshot.mockImplementation(veriIle(YENI));
    render(<Cuvallar />);
    await flush();
    expect(screen.getByTestId("cuval-sutun-parti")).toBeTruthy();
    expect(within(screen.getByTestId(`cuval-satir-${sid(1)}`)).getByText("DNZ-084")).toBeTruthy();
    expect(screen.getByTestId("cuval-toplam-satiri").props.accessibilityLabel).toBe("Toplam: 4 çuval · 7 top · 280 m · 50,3 kg");
    await act(async () => { fireEvent.changeText(screen.getByTestId("cuval-ara"), "dnz"); });
    await flush();
    expect(screen.getAllByTestId(/^cuval-satir-/)).toHaveLength(1);
    expect(screen.getByTestId("cuval-toplam-satiri").props.accessibilityLabel).toBe("Süzülen: 1 çuval · 3 top · 120 m · 20,1 kg");
  });
  it("açılan çuvalın topları tablo; parti no ile aranır", async () => {
    mockApi.snapshot.mockImplementation(veriIle({ ...YENI, cuvallar: [cuval(1, { partiAdi: "DNZ-084", partiKodu: "PRT-2611-0020" }, [1, 2, 3, 4, 5, 6].map((n) => topu(n, { parti: n % 2 ? "P57" : "P58" })))] }));
    render(<Cuvallar />);
    await flush();
    await act(async () => { fireEvent.press(screen.getByTestId(`cuval-satir-${sid(1)}`)); });
    const ic = screen.getByTestId(`cuval-icerik-${sid(1)}`);
    expect(within(ic).getByTestId(`cuval-toplar-${sid(1)}-sutun-parti`)).toBeTruthy();
    expect(within(ic).getAllByTestId(/^cuval-topsatir-/)).toHaveLength(6);
    await act(async () => { fireEvent.changeText(screen.getByTestId(`cuval-toplar-${sid(1)}-ara`), "p58"); });
    expect(within(screen.getByTestId(`cuval-icerik-${sid(1)}`)).getAllByTestId(/^cuval-topsatir-/)).toHaveLength(3);
    expect(screen.getByTestId(`cuval-toplar-${sid(1)}-sayi`)).toHaveTextContent("3 / 6 top");
  });
  it("eski fabrika verisi: Parti sütunu yok, ekran çalışır", async () => {
    mockApi.snapshot.mockImplementation(veriIle(ESKI));
    render(<Cuvallar />);
    await flush();
    expect(screen.getByTestId(`cuval-satir-${sid(9)}`)).toBeTruthy();
    expect(screen.queryByTestId("cuval-sutun-parti")).toBeNull();
    expect(screen.getByTestId("cuval-toplam-satiri").props.accessibilityLabel).toBe("Toplam: 1 çuval · 1 top · 40 m");
  });
});
