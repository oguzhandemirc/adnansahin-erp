// Stok › top KİME / NEREDE (fabrika 2.12.4, kullanıcı kararı 2026-11-17): §1 okuma — top etiket müşterisi · çuval no ·
// çuval carisi; çuvaldaki bitmiş toplar ayrı dizi, sayıları fabrikadan · §2 süzgeç (istemcide, mevcut desen): yer
// (Çuvalda/Açıkta), etiket müşterisi (+ Müşterisiz), çuval carisi, etiket ≠ çuval carisi; arama çuval no/müşteride ·
// §3 sütun hücreleri ("Müşterisiz", "Açıkta"; eski fabrika "—") · §4 ekran: "Çuvalda · Açıkta" kartı, top görünümü
// çuvaldaki topu da listeler, süzgeç grupları çizilir · §5 ESKİ fabrika (2.12.3, alan yok): sütun "—", kart ve süzgeç YOK.
// NEGATİF SONDA (2026-11-17, ikisi de kırmızı verdi, geri alındı): `kimNeredeGecer`de `fark` satırı kaldırıldı → §2
// "etiket ≠ çuval carisi" ✗; kart koşulu `yer.cuval` yerine `true` → §4 ve §5 ✗ (alan yokken kart çöker).
import { act, fireEvent, render, screen, within } from "@testing-library/react-native";
import type React from "react";
import * as lib from "../src/lib/stok-kalem";
import { TOP_SUTUNLARI } from "../src/ui/stok/sutunlar";

const mockApi = { snapshot: jest.fn(), list: jest.fn(), record: jest.fn(), viewPref: jest.fn(), viewPrefSet: jest.fn() };
const mockCache = {
  load: jest.fn(async (_k: string, f: () => Promise<unknown>) => ({ data: await f(), offline: false, savedAt: "2026-11-17T09:00:00.000Z" })),
  peek: jest.fn(async () => null),
};
const mockSession = {
  api: mockApi, cache: mockCache, markOnline: jest.fn(), permissions: ["bulut:stok:oku"] as string[], offline: false, offlineSince: null,
  facility: { tesis: { id: "t1" }, hesap: { id: "h1" }, liste: { siralama: {} } } as Record<string, unknown>, facilities: [], switchError: null, factoryStamp: "2026-11-17T08:55:00Z",
};
jest.mock("../src/state/session", () => ({ useSession: () => mockSession }));
jest.mock("expo-router", () => ({
  useRouter: () => ({ push: jest.fn(), replace: jest.fn(), back: jest.fn(), navigate: jest.fn(), canGoBack: () => true }),
  usePathname: () => "/stok",
  useLocalSearchParams: () => ({}),
  useFocusEffect: (cb: () => void | (() => void)) => (require("react") as typeof import("react")).useEffect(() => cb(), [cb]),
}));
jest.mock("react-native-safe-area-context", () => ({ useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }) }));

const Stock = (require("../app/(app)/(tabs)/stok") as { default: () => React.ReactElement }).default;

const K1 = "a|330|b|4-KAT";
const id = (n: number) => `33333333-3333-4333-8333-${String(n).padStart(12, "0")}`;
const top = (n: number, topNo: string, o: Record<string, unknown>) => ({ id: id(n), topNo, kalem: K1, metre: 40, kg: null, parti: null, depo: "Merkez", gun: 5, ...o });
const yer = (etiketMusteri: string | null, cuvalNo: string | null, cuvalCari: string | null) => ({ etiketMusteri, cuvalNo, cuvalCari });
const sackTop = (n: number, topNo: string, o: Record<string, unknown>) => ({ ...top(n, topNo, o), urun: "ÇUVAL KUMAŞI", en: 160, renk: "LACİVERT", kat: null });

const YENI = {
  ham: { toplamTop: 0, toplamMetre: 0, kalemler: [], toplar: [] },
  bitmis: {
    toplamTop: 2, toplamMetre: 80,
    kalemler: [{ anahtar: K1, urun: "ÖRNEK PANOS", en: 330, renk: "BEYAZ", kat: "4 Kat", top: 2, metre: 80, kg: null, enEskiGun: 5 }],
    toplar: [top(1, "R-1", yer("ALFA TEKSTİL", null, null)), top(2, "R-2", yer(null, null, null))],
    cuvaldaTop: 3, cuvaldaMetre: 120,
    cuvaldakiToplar: [
      sackTop(3, "S-1", yer("ALFA TEKSTİL", "CV1711260001", "ALFA TEKSTİL")),
      sackTop(4, "S-2", yer("ALFA TEKSTİL", "CV1711260002", "BETA ÖRME")),
      sackTop(5, "S-3", yer(null, "CV1711260003", null)),
    ],
  },
};
/** 2.12.3 fabrikası: yeni alanların hiçbiri yok. */
const ESKI = {
  ham: YENI.ham,
  bitmis: { toplamTop: 2, toplamMetre: 80, kalemler: YENI.bitmis.kalemler, toplar: [top(1, "R-1", {}), top(2, "R-2", {})] },
};
const KARNE = { ozet: { bitmisMiktar: 80, bitmisAdet: 2 }, yasKovalari: [], urunler: [] };

const no = (rows: readonly lib.Top[]) => rows.map((t) => t.topNo);
const hucre = (key: string, t: lib.Top) => TOP_SUTUNLARI.find((c) => c.key === key)!.hucre(t);

describe("§1 okuma", () => {
  it("top alanları ve fabrika sayıları; çuvaldaki top kalemini kendisi taşır", () => {
    const b = lib.stokBolumu(YENI, "bitmis");
    expect(b.cuval).toEqual({ top: 3, metre: 120 });
    expect(b.toplar[0]).toMatchObject({ etiketMusteri: "ALFA TEKSTİL", cuvalNo: null, kimNerede: true });
    expect(b.cuvaldakiToplar[1]).toMatchObject({ cuvalNo: "CV1711260002", cuvalCari: "BETA ÖRME", urun: "ÇUVAL KUMAŞI", kalemEtiket: "ÇUVAL KUMAŞI 160 · LACİVERT" });
    expect(lib.tumToplar(b)).toHaveLength(5);
    // Kalemin top listesi yalnız raf (kalem satırıyla birebir).
    expect(no(lib.kaleminToplari(b, K1))).toEqual(["R-1", "R-2"]);
  });
});

describe("§2 süzgeç (istemcide)", () => {
  const b = lib.stokBolumu(YENI, "bitmis");
  const g = (s: Record<string, string>, ara = "") => no(lib.gorunenToplar(b, ara, {}, null, s));
  it("gruplar: müşteri (etiket, + Müşterisiz) · çuval carisi (+ Carisiz) · çuval · yer · yanlış çuval", () => {
    const gs = lib.kimNeredeGruplari(b);
    expect(gs.map((x) => x.anahtar)).toEqual(["etiket", "cuvalCari", "cuval", "yer", "fark"]);
    expect(gs[0]!.etiket).toBe("Müşteri (etiket)");
    expect(gs[0]!.secenekler.map((o) => o.etiket)).toEqual(["ALFA TEKSTİL", lib.MUSTERISIZ]);
    expect(gs[1]!.secenekler.map((o) => o.etiket)).toEqual(["ALFA TEKSTİL", "BETA ÖRME", "Carisiz çuval"]);
    // Çok seçenekli alanlar çoklu seçimli; iki seçenekli Yer ve tek seçenekli fark tek seçimli.
    expect(gs.map((x) => !!x.coklu)).toEqual([true, true, true, false, false]);
  });
  it("çoklu seçim: aynı alanda VEYA, alanlar arası VE", () => {
    expect(g({ etiket: ["ALFA TEKSTİL", lib.YOK].join("\n") })).toEqual(["R-1", "R-2", "S-1", "S-2", "S-3"]);
    expect(g({ etiket: ["ALFA TEKSTİL", lib.YOK].join("\n"), yer: "acikta" })).toEqual(["R-1", "R-2"]);
  });
  it("Hepsi / Çuvalda / Açıkta", () => {
    expect(g({})).toEqual(["R-1", "R-2", "S-1", "S-2", "S-3"]);
    expect(g({ yer: "cuvalda" })).toEqual(["S-1", "S-2", "S-3"]);
    expect(g({ yer: "acikta" })).toEqual(["R-1", "R-2"]);
  });
  it("etiket müşterisi ve Müşterisiz", () => {
    expect(g({ etiket: "ALFA TEKSTİL" })).toEqual(["R-1", "S-1", "S-2"]);
    expect(g({ etiket: lib.YOK })).toEqual(["R-2", "S-3"]);
  });
  it("çuval carisi (açıktaki top hiçbir cariye uymaz)", () => {
    expect(g({ cuvalCari: "BETA ÖRME" })).toEqual(["S-2"]);
    expect(g({ cuvalCari: lib.YOK })).toEqual(["S-3"]);
  });
  it("etiket ≠ çuval carisi: yalnız ikisi de dolu ve farklı", () => {
    expect(g({ fark: "evet" })).toEqual(["S-2"]);
  });
  it("kalem süzgeci çuvaldaki topa kendi alanıyla uygulanır; arama çuval no ve müşteride", () => {
    expect(no(lib.gorunenToplar(b, "", { renk: "LACİVERT" }, null))).toEqual(["S-1", "S-2", "S-3"]);
    expect(lib.stokSuzgecGruplari(b, true).find((x) => x.anahtar === "renk")!.secenekler.map((o) => o.deger)).toContain("LACİVERT");
    expect(g({}, "260002")).toEqual(["S-2"]);
    expect(g({}, "beta")).toEqual(["S-2"]);
  });
});

describe("§3 hücreler", () => {
  it("yeni fabrika: Müşterisiz · Açıkta; eski fabrika: hepsi —", () => {
    const b = lib.stokBolumu(YENI, "bitmis");
    expect(hucre("etiket", b.toplar[1]!)).toBe(lib.MUSTERISIZ);
    expect(hucre("cuval", b.toplar[0]!)).toBe(lib.ACIKTA);
    expect(hucre("cuvalCari", b.cuvaldakiToplar[1]!)).toBe("BETA ÖRME");
    const e = lib.stokBolumu(ESKI, "bitmis");
    expect(e.cuval).toBeNull();
    expect(["etiket", "cuval", "cuvalCari"].map((k) => hucre(k, e.toplar[0]!))).toEqual(["—", "—", "—"]);
    expect(lib.kimNeredeGruplari(e)).toEqual([]);
  });
});

async function flush() {
  for (let i = 0; i < 4; i++) await act(async () => undefined);
}
const gorunumTop = async (k: string) =>
  k === "stok.gorunum"
    ? { anahtar: k, deger: { surum: 1, sutunlar: ["-"], siralama: null, suzgec: { bolum: "bitmis", gorunum: "top" } }, guncelleme: null }
    // Stok kartları 2026-11-18'den beri varsayılan KAPALI: "Çuvalda · Açıkta" kartı burada saklı seçimle açık.
    : k === "tablo.stok"
      ? { anahtar: k, deger: { surum: 1, sutunlar: ["urun"], siralama: null, suzgec: { kartlar: "cuval" } }, guncelleme: null }
      : { anahtar: k, deger: null, guncelleme: null };
const veriIle = (veri: unknown) => async (p: string) => ({ projeksiyon: p, veri: p === "stok-karnesi" ? KARNE : veri, surum: "2026-11-17T08:55:00.000Z" });

beforeEach(() => {
  for (const f of Object.values(mockApi)) f.mockReset();
  mockApi.viewPref.mockImplementation(gorunumTop);
  mockApi.viewPrefSet.mockImplementation(async (k: string, deger: unknown) => ({ anahtar: k, deger, guncelleme: "2026-11-17T09:00:00Z" }));
});

describe("§4 ekran (yeni fabrika)", () => {
  it("kart: çuvalda 3 · açıkta 2; top görünümü 5 top; varsayılan sütunlar kime/nerede", async () => {
    mockApi.snapshot.mockImplementation(veriIle(YENI));
    render(<Stock />);
    await flush();
    const kart = screen.getByTestId("kpi-cuval");
    expect(within(kart).getByText("3")).toBeTruthy();
    expect(within(kart).getByText("top çuvalda")).toBeTruthy();
    expect(within(kart).getByText("2")).toBeTruthy();
    expect(within(kart).getByText("top açıkta")).toBeTruthy();
    expect(screen.getByTestId(`stok-top-satir-${id(4)}`)).toBeTruthy();
    expect(screen.getByTestId("stok-kalem-sutun-etiket")).toBeTruthy();
    expect(screen.getByTestId("stok-kalem-sutun-cuvalCari")).toBeTruthy();
    // Alt sabit toplam satırı aynı fabrika sayılarını etiketiyle yazar (top bazında: listedeki top sayısı).
    expect(screen.getByTestId("stok-toplam-depo")).toHaveTextContent("Depoda", { exact: false });
    expect(screen.getByTestId("stok-toplam-cuval")).toBeTruthy();
    expect(within(screen.getByTestId("stok-toplam-satiri")).queryByText(/Listede|Açıkta/)).toBeNull();
  });
  it("süzgeçte Yer › Çuvalda seçilince açıktaki top kaybolur; seçim tablo.stok-top'a yazılır", async () => {
    mockApi.snapshot.mockImplementation(veriIle(YENI));
    render(<Stock />);
    await flush();
    fireEvent.press(screen.getByTestId("stok-kalem-suzgec"));
    await flush();
    expect(screen.getByTestId("stok-kalem-suzgec-secici-alan-fark")).toBeTruthy();
    fireEvent.press(screen.getByTestId("stok-kalem-suzgec-secici-alan-yer"));
    fireEvent.press(screen.getByTestId("stok-kalem-suzgec-secici-yer-cuvalda"));
    fireEvent.press(screen.getByTestId("stok-kalem-suzgec-secici-uygula"));
    await flush();
    expect(screen.queryByTestId(`stok-top-satir-${id(1)}`)).toBeNull();
    expect(screen.getByTestId(`stok-top-satir-${id(3)}`)).toBeTruthy();
    // Buluta yazım gecikmelidir (`TERCIH_GECIKME_MS` 800).
    await act(async () => {
      await new Promise((r) => setTimeout(r, 900));
    });
    const yazilan = mockApi.viewPrefSet.mock.calls.find((c) => c[0] === "tablo.stok-top");
    expect(yazilan?.[1]).toMatchObject({ suzgec: { yer: "cuvalda" } });
  });
});

describe("§5 eski fabrika (2.12.3)", () => {
  it("kart yok, kime/nerede süzgeci yok, sütun —, hiçbir şey kırılmaz", async () => {
    mockApi.snapshot.mockImplementation(veriIle(ESKI));
    render(<Stock />);
    await flush();
    expect(screen.queryByTestId("kpi-cuval")).toBeNull();
    expect(screen.getByTestId(`stok-top-satir-${id(1)}`)).toBeTruthy();
    fireEvent.press(screen.getByTestId("stok-kalem-suzgec"));
    await flush();
    expect(screen.queryByTestId("stok-kalem-suzgec-secici-alan-yer")).toBeNull();
    expect(screen.queryByTestId("stok-kalem-suzgec-secici-alan-fark")).toBeNull();
  });
});
