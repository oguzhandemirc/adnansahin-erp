// Süzgeç yeniden tasarımı (2026-11-19): §1 saf — seçenek araması Türkçe katlamalı, seçili olanlar başta, çoklu/tek seçim ·
// §2 sayfa — ALAN LİSTESİ (eski çip yığını yok) → alanın seçenekleri (arama yalnız eşleşeni gösterir) → taslak →
// "Uygula" / "Sonuçları göster (N)"; dışarı dokunmak vazgeçer · §3 Stok ekranı — uygulanınca yalnız uyan satırlar, çip
// "Kumaş: …" ✕ kaldırır, rozet, sonuç yok durumu + "Süzgeci temizle".
import { act, fireEvent, render, screen, within } from "@testing-library/react-native";
import type React from "react";

const mockApi = { snapshot: jest.fn(), list: jest.fn(), record: jest.fn(), viewPref: jest.fn(), viewPrefSet: jest.fn() };
const mockCache = {
  load: jest.fn(async (_k: string, f: () => Promise<unknown>) => ({ data: await f(), offline: false, savedAt: "2026-11-13T09:00:00.000Z" })),
  peek: jest.fn(async () => null),
};
const mockSession = {
  api: mockApi, cache: mockCache, markOnline: jest.fn(), permissions: ["bulut:stok:oku"] as string[], offline: false, offlineSince: null,
  facility: null, facilities: [], switchError: null, factoryStamp: "2026-11-13T08:55:00Z",
};
jest.mock("../src/state/session", () => ({ useSession: () => mockSession }));
jest.mock("expo-router", () => ({
  useRouter: () => ({ push: jest.fn(), replace: jest.fn(), back: jest.fn(), navigate: jest.fn(), canGoBack: () => true }),
  usePathname: () => "/",
  useLocalSearchParams: () => ({}),
  useFocusEffect: (cb: () => void | (() => void)) => (require("react") as typeof import("react")).useEffect(() => cb(), [cb]),
}));
jest.mock("react-native-safe-area-context", () => ({ useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }) }));

const M = require("../src/ui/tablo/model") as typeof import("../src/ui/tablo/model");
const { katla } = require("../src/ses/metin") as typeof import("../src/ses/metin");
const { SuzgecSayfasi, EtkinSuzgecler } = require("../src/ui/tablo/Suzgec") as typeof import("../src/ui/tablo/Suzgec");
const Stock = (require("../app/(app)/(tabs)/stok") as { default: () => React.ReactElement }).default;

const RENKLER = ["BEYAZ", "KIRMIZI", "KIRMIZI ŞAL", "İPEK SARI", "LACİVERT", "GRİ", "SİYAH", "ÇAĞLA", "ÖRDEK", "YEŞİL"];
const RENK: import("../src/ui/tablo/model").SuzgecGrubu = { anahtar: "renk", etiket: "Renk", coklu: true, secenekler: RENKLER.map((r) => ({ deger: r, etiket: r })) };
const DURUM: import("../src/ui/tablo/model").SuzgecGrubu = { anahtar: "ana", etiket: "Durum", secenekler: [{ deger: "ACIK", etiket: "Açık" }, { deger: "KAPANAN", etiket: "Kapanan" }] };

describe("§1 saf", () => {
  it("arama Türkçe harf katlamalı; her kelime geçmeli; seçili olanlar başta", () => {
    expect(M.secenekleriSuz(RENK, [], "kirmizi", katla).map((o) => o.deger)).toEqual(["KIRMIZI", "KIRMIZI ŞAL"]);
    expect(M.secenekleriSuz(RENK, [], "sal kirmizi", katla).map((o) => o.deger)).toEqual(["KIRMIZI ŞAL"]);
    expect(M.secenekleriSuz(RENK, [], "ipek", katla).map((o) => o.deger)).toEqual(["İPEK SARI"]);
    expect(M.secenekleriSuz(RENK, ["YEŞİL", "GRİ"], "", katla).slice(0, 2).map((o) => o.deger)).toEqual(["GRİ", "YEŞİL"]);
  });
  it("çoklu seçim ekler/çıkarır, tek seçim değiştirir/kaldırır; saklı biçim eski tek değeri okur", () => {
    expect(M.secenekDegistir(RENK, ["BEYAZ"], "GRİ")).toEqual(["BEYAZ", "GRİ"]);
    expect(M.secenekDegistir(RENK, ["BEYAZ", "GRİ"], "BEYAZ")).toEqual(["GRİ"]);
    expect(M.secenekDegistir(DURUM, ["ACIK"], "KAPANAN")).toEqual(["KAPANAN"]);
    expect(M.secenekDegistir(DURUM, ["ACIK"], "ACIK")).toEqual([]);
    expect(M.secimOzeti(RENK, "BEYAZ")).toBe("BEYAZ");
    expect(M.secimOzeti(RENK, M.secimYaz(["BEYAZ", "GRİ"]))).toBe("BEYAZ, GRİ");
    expect(M.secimOzeti(RENK, undefined)).toBe("Tümü");
    // Seçeneği kalmamış değer süzmez; tek seçimli alanda fazlası düşer.
    expect(M.gecerliSecim([RENK, DURUM], { renk: M.secimYaz(["YOK-RENK", "GRİ"]), ana: M.secimYaz(["ACIK", "KAPANAN"]) })).toEqual({ renk: "GRİ", ana: "ACIK" });
  });
});

describe("§2 sayfa", () => {
  function Sayfa(p: { onUygula: jest.Mock; onClose?: jest.Mock; sayac?: (t: Readonly<Record<string, string>>) => number; secim?: Record<string, string> }) {
    return <SuzgecSayfasi visible gruplar={[RENK, DURUM]} secim={p.secim ?? {}} onUygula={p.onUygula} onClose={p.onClose ?? jest.fn()} sayac={p.sayac} testID="sz" />;
  }

  it("ilk düzey yalnız alan listesi (eski çip yığını yok): ad + 'Tümü' özeti; seçenek çizilmez", () => {
    render(<Sayfa onUygula={jest.fn()} />);
    expect(screen.getByTestId("sz-alan-renk")).toBeTruthy();
    expect(screen.getByTestId("sz-alan-ana")).toBeTruthy();
    expect(screen.getByTestId("sz-alan-renk-ozet")).toHaveTextContent("Tümü");
    expect(screen.queryByTestId("sz-renk-BEYAZ")).toBeNull();
    expect(screen.queryByTestId("sz-ana-ACIK")).toBeNull();
    expect(screen.queryByTestId("sz-renk-ara")).toBeNull();
    // Sonuç sayısı verilmeyen (sunucu listesi) sayfada düğme "Uygula".
    expect(screen.getByTestId("sz-uygula")).toHaveTextContent("Uygula");
  });

  it("alana dokununca seçenekler + arama; arama yalnız eşleşeni gösterir; çoklu seçim → özet → Uygula", () => {
    const onUygula = jest.fn();
    render(<Sayfa onUygula={onUygula} sayac={(t) => M.secimDegerleri(t.renk).length * 10} />);
    expect(screen.getByTestId("sz-uygula")).toHaveTextContent("Sonuçları göster (0)");
    fireEvent.press(screen.getByTestId("sz-alan-renk"));
    expect(screen.queryByTestId("sz-alan-ana")).toBeNull();
    expect(screen.getByTestId("sz-renk-ara").props.autoFocus).toBe(true);
    fireEvent.changeText(screen.getByTestId("sz-renk-ara"), "kirmizi");
    expect(screen.getByTestId("sz-renk-KIRMIZI")).toBeTruthy();
    expect(screen.getByTestId("sz-renk-KIRMIZI ŞAL")).toBeTruthy();
    expect(screen.queryByTestId("sz-renk-BEYAZ")).toBeNull();
    expect(screen.queryByTestId("sz-renk-YEŞİL")).toBeNull();
    fireEvent.press(screen.getByTestId("sz-renk-KIRMIZI"));
    expect(screen.getByTestId("sz-renk-KIRMIZI").props.accessibilityState).toMatchObject({ checked: true });
    fireEvent.changeText(screen.getByTestId("sz-renk-ara"), "çağla");
    expect(screen.getByTestId("sz-renk-ÇAĞLA")).toBeTruthy();
    fireEvent.press(screen.getByTestId("sz-renk-ÇAĞLA"));
    fireEvent.changeText(screen.getByTestId("sz-renk-ara"), "zzz");
    expect(screen.getByTestId("sz-renk-eslesme-yok")).toBeTruthy();
    fireEvent.press(screen.getByTestId("sz-geri"));
    expect(screen.getByTestId("sz-alan-renk-ozet")).toHaveTextContent("KIRMIZI, ÇAĞLA");
    expect(screen.getByTestId("sz-uygula")).toHaveTextContent("Sonuçları göster (20)");
    expect(onUygula).not.toHaveBeenCalled(); // taslak
    fireEvent.press(screen.getByTestId("sz-uygula"));
    expect(onUygula).toHaveBeenCalledWith({ renk: M.secimYaz(["KIRMIZI", "ÇAĞLA"]) });
  });

  it("tek seçimli alan: seçince alan listesine döner; ekran okuyucu 'seçili'; Temizle taslağı boşaltır", () => {
    const onUygula = jest.fn();
    render(<Sayfa onUygula={onUygula} secim={{ ana: "ACIK" }} />);
    expect(screen.getByTestId("sz-alan-ana-ozet")).toHaveTextContent("Açık");
    fireEvent.press(screen.getByTestId("sz-alan-ana"));
    expect(screen.queryByTestId("sz-ana-ara")).toBeNull(); // iki seçenekte arama yok
    expect(screen.getByTestId("sz-ana-ACIK").props.accessibilityState).toMatchObject({ selected: true });
    fireEvent.press(screen.getByTestId("sz-ana-KAPANAN"));
    expect(screen.getByTestId("sz-alan-ana-ozet")).toHaveTextContent("Kapanan");
    fireEvent.press(screen.getByTestId("sz-temizle"));
    expect(screen.getByTestId("sz-alan-ana-ozet")).toHaveTextContent("Tümü");
    fireEvent.press(screen.getByTestId("sz-uygula"));
    expect(onUygula).toHaveBeenCalledWith({});
  });

  it("dışarı dokunmak vazgeçer: taslak işlenmez", () => {
    const onUygula = jest.fn();
    const onClose = jest.fn();
    render(<Sayfa onUygula={onUygula} onClose={onClose} />);
    fireEvent.press(screen.getByTestId("sz-alan-ana"));
    fireEvent.press(screen.getByTestId("sz-ana-ACIK"));
    fireEvent.press(screen.getByTestId("sz-vazgec"));
    expect(onClose).toHaveBeenCalled();
    expect(onUygula).not.toHaveBeenCalled();
  });

  it("etkin süzgeç çipleri: 'Renk: KIRMIZI, GRİ' ✕ kaldırır; birden çoksa sonda Temizle; yoksa hiç çizilmez", () => {
    const onKaldir = jest.fn();
    const onTemizle = jest.fn();
    const v = render(<EtkinSuzgecler gruplar={[RENK, DURUM]} secim={{ renk: M.secimYaz(["KIRMIZI", "GRİ"]), ana: "ACIK" }} onKaldir={onKaldir} onTemizle={onTemizle} testID="c" />);
    expect(screen.getByTestId("c-etkin-renk")).toHaveTextContent("Renk: KIRMIZI, GRİ");
    expect(screen.getByTestId("c-etkin-ana")).toHaveTextContent("Durum: Açık");
    fireEvent.press(screen.getByTestId("c-etkin-renk"));
    expect(onKaldir).toHaveBeenCalledWith("renk");
    fireEvent.press(screen.getByTestId("c-etkin-temizle"));
    expect(onTemizle).toHaveBeenCalled();
    v.rerender(<EtkinSuzgecler gruplar={[RENK, DURUM]} secim={{ ana: "ACIK" }} onKaldir={onKaldir} onTemizle={onTemizle} testID="c" />);
    expect(screen.queryByTestId("c-etkin-temizle")).toBeNull();
    v.rerender(<EtkinSuzgecler gruplar={[RENK, DURUM]} secim={{}} onKaldir={onKaldir} onTemizle={onTemizle} testID="c" />);
    expect(screen.queryByTestId("c-etkin")).toBeNull();
  });
});

// ── §3 Stok ekranı ──────────────────────────────────────────────────────────────────────────────────────────────────
const K1 = "a|330|b|4-KAT";
const K2 = "c|280|d|";
const KALEM = {
  ham: { toplamTop: 0, toplamMetre: 0, kalemler: [], toplar: [] },
  bitmis: {
    toplamTop: 4, toplamMetre: 151.2,
    kalemler: [
      { anahtar: K1, urun: "ÖRNEK PANOS", en: 330, renk: "BEYAZ", kat: "4 Kat", top: 3, metre: 101.2, kg: null, enEskiGun: 95 },
      { anahtar: K2, urun: "ÖRNEK SATEN", en: 280, renk: "KREM", kat: null, top: 1, metre: 50, kg: null, enEskiGun: null },
    ],
    toplar: [
      { id: "22222222-2222-4222-8222-000000000001", topNo: "T-001", kalem: K1, metre: 40, kg: null, parti: "P07", depo: "Merkez", gun: 95 },
      { id: "22222222-2222-4222-8222-000000000004", topNo: "T-004", kalem: K2, metre: 50, kg: null, parti: null, depo: null, gun: null },
    ],
  },
};

const KARNE = {
  ozet: { bitmisMiktar: 151.2, bitmisAdet: 4, hamMiktar: 0, hamAdet: 0, yariMamulMiktar: 0, yariMamulAdet: 0, yasliMiktar: 40, oluMiktar: 0, oluStokGun: 90, yassizAdet: 1, yassizMiktar: 50 },
  yasKovalari: [], urunler: [],
};

async function flush() {
  await act(async () => undefined);
  await act(async () => undefined);
}

beforeEach(() => {
  for (const f of Object.values(mockApi)) f.mockReset();
  mockApi.snapshot.mockImplementation(async (p: string) => {
    const veri = p === "stok-kalem" ? KALEM : p === "stok-karnesi" ? KARNE : undefined;
    if (veri === undefined) throw new (require("../src/api/client").ApiError)(404, "BULUNAMADI", "yok");
    return { projeksiyon: p, veri, surum: "2026-11-13T08:55:00.000Z" };
  });
  mockApi.list.mockImplementation(async () => ({ kayitlar: [], sonraki: null }));
});

describe("§3 Stok ekranı", () => {
  it("Kumaş seçilince yalnız uyan satır; çip ✕ kaldırır; rozet etkin süzgeç sayısı", async () => {
    render(<Stock />);
    await flush();
    expect(screen.getByTestId(`stok-kalem-satir-${K1}`)).toBeTruthy();
    expect(screen.queryByTestId("stok-kalem-suzgec-etkin")).toBeNull();
    fireEvent.press(screen.getByTestId("stok-kalem-suzgec"));
    // Alan adları: Kumaş · Renk · En · Kat · yaş (seçenekleri tam anlıktan).
    for (const a of ["urun", "renk", "en", "kat", "yas"]) expect(screen.getByTestId(`stok-kalem-suzgec-secici-alan-${a}`)).toBeTruthy();
    expect(screen.getByTestId("stok-kalem-suzgec-secici-alan-urun")).toHaveTextContent("Kumaş", { exact: false });
    fireEvent.press(screen.getByTestId("stok-kalem-suzgec-secici-alan-urun"));
    fireEvent.press(screen.getByTestId("stok-kalem-suzgec-secici-urun-ÖRNEK SATEN"));
    fireEvent.press(screen.getByTestId("stok-kalem-suzgec-secici-geri"));
    expect(screen.getByTestId("stok-kalem-suzgec-secici-uygula")).toHaveTextContent("Sonuçları göster (1)");
    fireEvent.press(screen.getByTestId("stok-kalem-suzgec-secici-uygula"));
    await flush();
    expect(screen.queryByTestId(`stok-kalem-satir-${K1}`)).toBeNull();
    expect(screen.getByTestId(`stok-kalem-satir-${K2}`)).toBeTruthy();
    expect(screen.getByTestId("stok-kalem-suzgec-etkin-urun")).toHaveTextContent("Kumaş: ÖRNEK SATEN");
    expect(within(screen.getByTestId("stok-kalem-suzgec-rozet")).getByText("1")).toBeTruthy();
    fireEvent.press(screen.getByTestId("stok-kalem-suzgec-etkin-urun"));
    await flush();
    expect(screen.getByTestId(`stok-kalem-satir-${K1}`)).toBeTruthy();
    expect(screen.queryByTestId("stok-kalem-suzgec-etkin")).toBeNull();
  });

  it("iki kumaş birden (VEYA) iki satır; uymayan renkle sonuç yok → 'Bu süzgece uyan kayıt yok' + Süzgeci temizle", async () => {
    render(<Stock />);
    await flush();
    fireEvent.press(screen.getByTestId("stok-kalem-suzgec"));
    fireEvent.press(screen.getByTestId("stok-kalem-suzgec-secici-alan-urun"));
    fireEvent.press(screen.getByTestId("stok-kalem-suzgec-secici-urun-ÖRNEK SATEN"));
    fireEvent.press(screen.getByTestId("stok-kalem-suzgec-secici-urun-ÖRNEK PANOS"));
    fireEvent.press(screen.getByTestId("stok-kalem-suzgec-secici-geri"));
    expect(screen.getByTestId("stok-kalem-suzgec-secici-uygula")).toHaveTextContent("Sonuçları göster (2)");
    fireEvent.press(screen.getByTestId("stok-kalem-suzgec-secici-alan-renk"));
    fireEvent.press(screen.getByTestId("stok-kalem-suzgec-secici-renk-KREM"));
    fireEvent.press(screen.getByTestId("stok-kalem-suzgec-secici-geri"));
    expect(screen.getByTestId("stok-kalem-suzgec-secici-uygula")).toHaveTextContent("Sonuçları göster (1)");
    fireEvent.press(screen.getByTestId("stok-kalem-suzgec-secici-alan-en"));
    fireEvent.press(screen.getByTestId("stok-kalem-suzgec-secici-en-330"));
    fireEvent.press(screen.getByTestId("stok-kalem-suzgec-secici-geri"));
    expect(screen.getByTestId("stok-kalem-suzgec-secici-uygula")).toHaveTextContent("Sonuçları göster (0)");
    fireEvent.press(screen.getByTestId("stok-kalem-suzgec-secici-uygula"));
    await flush();
    expect(screen.getByTestId("stok-kalem-bos-suzgec")).toHaveTextContent("Bu süzgece uyan kayıt yok", { exact: false });
    expect(screen.getByTestId("stok-kalem-suzgec-etkin-temizle")).toBeTruthy();
    fireEvent.press(screen.getByTestId("stok-kalem-bos-suzgec-eylem"));
    await flush();
    expect(screen.getByTestId(`stok-kalem-satir-${K1}`)).toBeTruthy();
    expect(screen.getByTestId(`stok-kalem-satir-${K2}`)).toBeTruthy();
  });
});

// Görünüm tercihi (Kalem|Top) modül deposunda kalır: Top'a geçen test EN SONDA.
describe("§4 alt toplam satırı süzgece uyar (fabrika süzülen toplam göndermez → uygulama toplamaz)", () => {
  it("süzgeçsiz bölüm toplamı; süzgeç etkinken 'Süzülen: N kalem' (metre toplamı YOK); çip kaldırınca geri döner", async () => {
    render(<Stock />);
    await flush();
    expect(screen.getByTestId("stok-toplam-depo-deger").props.children).toBe("4 top · 151,2 m");
    expect(screen.queryByTestId("stok-toplam-suzulen")).toBeNull();
    fireEvent.press(screen.getByTestId("stok-kalem-suzgec"));
    fireEvent.press(screen.getByTestId("stok-kalem-suzgec-secici-alan-urun"));
    fireEvent.press(screen.getByTestId("stok-kalem-suzgec-secici-urun-ÖRNEK SATEN"));
    fireEvent.press(screen.getByTestId("stok-kalem-suzgec-secici-uygula"));
    await flush();
    expect(screen.getByTestId("stok-toplam-suzulen-deger").props.children).toBe("1 kalem");
    expect(screen.queryByTestId("stok-toplam-depo")).toBeNull();
    // Kalemin kendi metresi (50) toplam yerine yazılmaz; bölüm toplamı (151,2) de görünmez.
    expect(within(screen.getByTestId("stok-toplam-satiri")).queryByText(/151,2|50 m/)).toBeNull();
    expect(screen.getByTestId("stok-toplam-satiri").props.accessibilityLabel).toContain("Süzgeç etkin");
    fireEvent.press(screen.getByTestId("stok-kalem-suzgec-etkin-urun"));
    await flush();
    expect(screen.getByTestId("stok-toplam-depo-deger").props.children).toBe("4 top · 151,2 m");
  });
  it("top görünümünde süzülen top sayısı", async () => {
    render(<Stock />);
    await flush();
    fireEvent.press(screen.getByTestId("stok-gorunum-top"));
    await flush();
    fireEvent.press(screen.getByTestId("stok-kalem-suzgec"));
    fireEvent.press(screen.getByTestId("stok-kalem-suzgec-secici-alan-urun"));
    fireEvent.press(screen.getByTestId("stok-kalem-suzgec-secici-urun-ÖRNEK PANOS"));
    fireEvent.press(screen.getByTestId("stok-kalem-suzgec-secici-uygula"));
    await flush();
    expect(screen.getByTestId("stok-toplam-suzulen-deger").props.children).toBe("1 top");
  });
});
