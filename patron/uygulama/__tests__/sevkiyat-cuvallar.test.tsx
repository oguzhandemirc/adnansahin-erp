// Sevkiyat ayrıntısı "Çuvallar" bölümü (2026-11-19, kayıt `sevkiyat-icerigi`): §1 saf okuma — özet parçaları fabrikanın
// sayısı, gelmeyen parça yazılmaz, eksik alan çökertmez · §2 ekran: künyenin altında tek satır özet + çuval tablosu;
// çuvala dokununca topları yerinde açılır (ortak `CuvalToplari`), iade/hayalet işaretli, çuvalsız ayrı grup · §3 durumlar:
// 404 sakin boş durum (hata değil), ağ hatası tekrar dene, iptal edilmiş sevkiyat boş kayıt · §4 izin: `bulut:sevkiyat:oku`
// yoksa bölüm yok ve uç çağrılmaz · §5 uzun liste artımlı çizilir · §6 örnek veri.
// NEGATİF SONDA (2026-11-19, kırmızı verdi, geri alındı): `sevkTopIsaretleri`nde iade koşulu `t.iade` yerine `false`
// → §2 "iade ve hayalet işaretli" ✗.
import { act, fireEvent, render, screen, within } from "@testing-library/react-native";
import type { ReactElement } from "react";
import { ApiError } from "../src/api/client";

const mockRecord = jest.fn();
const mockCache = { load: jest.fn(async (_k: string, f: () => Promise<unknown>) => ({ data: await f(), offline: false, savedAt: "" })), peek: jest.fn(async () => null) };
const mockSession = {
  api: { record: mockRecord },
  cache: mockCache, markOnline: jest.fn(),
  permissions: ["bulut:oturum", "bulut:sevkiyat:oku"] as string[], offline: false, offlineSince: null as string | null, facility: null as unknown, switchError: null as string | null,
};
const mockRouter = { push: jest.fn(), replace: jest.fn(), back: jest.fn(), navigate: jest.fn(), canGoBack: () => true };
let mockParams: Record<string, string> = {};
jest.mock("../src/state/session", () => ({ useSession: () => mockSession }));
jest.mock("expo-router", () => ({ useRouter: () => mockRouter, usePathname: () => "/sevkiyat", useLocalSearchParams: () => mockParams }));
jest.mock("react-native-safe-area-context", () => ({ useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }) }));

const RecordDetail = (require("../app/(app)/kayit/[projeksiyon]/[id]") as { default: () => ReactElement }).default;
const lib = require("../src/lib/sevkiyat-icerigi") as typeof import("../src/lib/sevkiyat-icerigi");
const B = require("../src/ui/sevkiyat/CuvalBolumu") as typeof import("../src/ui/sevkiyat/CuvalBolumu");

const ID = "33333333-3333-4333-8333-333333333333";
const sid = (n: number) => `22222222-2222-4222-8222-${String(n).padStart(12, "0")}`;
const tid = (n: number) => `44444444-4444-4444-8444-${String(n).padStart(12, "0")}`;
const SEVK = { sevkNo: "SVK-0042", durum: "DISPATCHED", musteriAdi: "MISRA TEKSTİL", toplamMetre: "3386.4", topSayisi: 142, cuvalSayisi: 12, toplamKg: "680" };
const topu = (n: number, o: Record<string, unknown> = {}) => ({
  id: tid(n), topNo: `T-${n}`, urun: "ÖRNEK SATEN", renk: "KREM", en: "280", metre: "40.5", kg: null, etiketMusteri: null,
  iade: false, iadeTarihi: null, iadeSebebi: null, yok: false, ...o,
});
const ICERIK = {
  id: ID, sevkNo: "SVK-0042", durum: "DISPATCHED",
  ozet: { cuval: 12, top: 142, metre: "3386.4", kg: "680", tartiliCuval: 9, iadeTop: 1, iadeMetre: "40.5", kartela: 0 },
  cuvallar: [
    { id: sid(1), cuvalNo: "CV1811260001234", sira: "1", kg: "48.5", top: 3, metre: "121.5", iadeTop: 1, iadeMetre: "40.5", kartela: 0,
      toplar: [topu(1, { etiketMusteri: "ALFA TEKSTİL", kg: "12" }), topu(2, { iade: true, iadeTarihi: "2026-11-18T10:00:00.000Z", iadeSebebi: "Renk farkı" }), topu(3, { yok: true })] },
    { id: sid(2), cuvalNo: "CV1811260002", sira: "2", kg: null, top: 1, metre: "40.5", iadeTop: 0, iadeMetre: "0", kartela: 0, toplar: [topu(4)] },
  ],
  cuvalsizToplar: [topu(5, { urun: "DENEME KETEN", renk: "GRİ", en: "150" })],
};

const kayitlar = (icerik: () => Promise<unknown>) => (p: string) => (p === "sevkiyat" ? Promise.resolve({ id: ID, kayit: SEVK, surum: "" }) : icerik());

async function settle() {
  await act(async () => undefined);
  await act(async () => undefined);
  await act(async () => undefined);
}

beforeEach(() => {
  mockRecord.mockReset();
  mockParams = { projeksiyon: "sevkiyat", id: ID };
  mockSession.permissions = ["bulut:oturum", "bulut:sevkiyat:oku"];
});

describe("§1 saf okuma", () => {
  it("özet tek satır: çuval · top · metre · kg · tartılı · iade (fabrikanın sayısı)", () => {
    expect(lib.icerikOzeti(lib.sevkIcerigi(ICERIK))).toEqual(["12 çuval", "142 top", "3.386 m", "680 kg", "9/12 tartılı", "1 iade top"]);
  });
  it("gelmeyen/sıfır parça yazılmaz; eksik alan çökertmez", () => {
    const d = lib.sevkIcerigi({ ozet: { cuval: 2, top: 5, kg: "0", tartiliCuval: 0, iadeTop: 0 } });
    expect(lib.icerikOzeti(d)).toEqual(["2 çuval", "5 top", "0/2 tartılı"]);
    const bos = lib.sevkIcerigi(null);
    expect(lib.icerikBos(bos)).toBe(true);
    expect(lib.icerikOzeti(bos)).toEqual([]);
  });
  it("iade alınmış top hayalet sayılmaz; çuval no hücresi kırpılmaz, notu altında", () => {
    const d = lib.sevkIcerigi({ cuvallar: [{ cuvalNo: "CV-UZUN-NUMARA-0001", iadeTop: 1, toplar: [topu(1, { iade: true, yok: true }), topu(2, { yok: true })] }] });
    expect(d.cuvallar[0]!.toplar.map((t) => t.yok)).toEqual([false, true]);
    expect(B.sevkCuvalHucresi(d.cuvallar[0]!)).toBe("CV-UZUN-NUMARA-0001\n1 iade · Eksik top");
    expect(B.SEVK_CUVAL_SUTUNLARI.find((c) => c.key === "cuval")!.satir).toBeGreaterThanOrEqual(2);
  });
});

describe("§2 ekran", () => {
  it("künyenin altında özet + tablo; çuvala dokununca toplar açılır, iade ve hayalet işaretli; çuvalsız ayrı grup", async () => {
    mockRecord.mockImplementation(kayitlar(async () => ({ id: ID, kayit: ICERIK, surum: "" })));
    render(<RecordDetail />);
    await settle();
    expect(mockRecord).toHaveBeenCalledWith("sevkiyat-icerigi", ID);
    expect(screen.getByTestId("sevk-cuval-ozet")).toHaveTextContent("12 çuval  ·  142 top  ·  3.386 m  ·  680 kg  ·  9/12 tartılı  ·  1 iade top");
    expect(screen.getAllByTestId(/^sevk-cuval-satir-/)).toHaveLength(2);
    expect(screen.getByTestId(`sevk-cuval-satir-${sid(1)}`).props.accessibilityLabel).toBe("Çuval no: CV1811260001234\n1 iade · Eksik top, Top sayısı: 3, Metre: 121,5, Brüt kg (tartı): 48,5");
    expect(screen.queryByTestId(`sevk-icerik-${sid(1)}`)).toBeNull();

    await act(async () => { fireEvent.press(screen.getByTestId(`sevk-cuval-satir-${sid(1)}`)); });
    const ic = screen.getByTestId(`sevk-icerik-${sid(1)}`);
    expect(within(ic).getByText("Sıra 1 · 48,5 kg brüt")).toBeTruthy();
    expect(within(ic).getByText("T-1")).toBeTruthy();
    // 2026-11-20: toplar tablo — Kumaş · Renk · En · Kg · Etiket · Not ayrı sütun.
    expect(within(ic).getAllByText("ÖRNEK SATEN")).toHaveLength(3);
    expect(within(ic).getAllByText("280 cm")).toHaveLength(3);
    expect(within(ic).getByText("ALFA TEKSTİL")).toBeTruthy();
    expect(within(ic).getByText("İade 18.11.2026: Renk farkı")).toBeTruthy();
    expect(screen.getByTestId(`sevk-topsatir-${tid(1)}`).props.accessibilityLabel).toContain("Kg: 12");
    expect(screen.getByTestId(`sevk-top-iade-${tid(2)}`)).toHaveTextContent("İade");
    expect(screen.getByTestId(`sevk-top-yok-${tid(3)}`)).toHaveTextContent("Çuvalda yok");
    expect(screen.queryByTestId(`sevk-top-iade-${tid(1)}`)).toBeNull();
    expect(screen.queryByTestId(`sevk-top-yok-${tid(1)}`)).toBeNull();

    const cs = screen.getByTestId("sevk-cuvalsiz");
    expect(within(cs).getByText("Çuvalsız  ·  1 top")).toBeTruthy();
    expect(within(cs).getByText("DENEME KETEN")).toBeTruthy();
    expect(within(cs).getByText("150 cm")).toBeTruthy();

    // İkinci çuval açılınca birincisi kapanır; aynı satıra ikinci dokunuş kapatır.
    await act(async () => { fireEvent.press(screen.getByTestId(`sevk-cuval-satir-${sid(2)}`)); });
    expect(screen.queryByTestId(`sevk-icerik-${sid(1)}`)).toBeNull();
    expect(within(screen.getByTestId(`sevk-icerik-${sid(2)}`)).getByText("Sıra 2 · Tartılmadı")).toBeTruthy();
    await act(async () => { fireEvent.press(screen.getByTestId(`sevk-cuval-satir-${sid(2)}`)); });
    expect(screen.queryByTestId(`sevk-icerik-${sid(2)}`)).toBeNull();
  });
});

describe("§3 durumlar", () => {
  it("404 (eski fabrika/bulut): sakin boş durum, hata kutusu yok", async () => {
    mockRecord.mockImplementation(kayitlar(() => Promise.reject(new ApiError(404, "NOT_FOUND", "Kayıt bulunamadı"))));
    render(<RecordDetail />);
    await settle();
    expect(screen.getByTestId("sevk-cuval-yok")).toHaveTextContent(B.SEVK_ICERIK_YOK);
    expect(screen.queryByText(/bulunamadı/i)).toBeNull();
    expect(screen.queryByText("Tekrar dene")).toBeNull();
    expect(screen.getByTestId("sevk-kunye-ozet")).toBeTruthy();
  });

  it("ağ hatası: tekrar dene; basınca yeniden çeker ve çizer", async () => {
    let kez = 0;
    mockRecord.mockImplementation(kayitlar(() => (kez++ === 0 ? Promise.reject(new ApiError(0, "AG", "Bağlantı yok")) : Promise.resolve({ id: ID, kayit: ICERIK, surum: "" }))));
    render(<RecordDetail />);
    await settle();
    expect(screen.queryByTestId("sevk-cuval-ozet")).toBeNull();
    await act(async () => { fireEvent.press(screen.getByText("Tekrar dene")); });
    await settle();
    expect(screen.getByTestId("sevk-cuval-ozet")).toBeTruthy();
  });

  it("iptal edilmiş sevkiyat: kayıt boş gelir → çuvalların depoya döndüğü söylenir; iptal dışı boş kayıt ayrı cümle", async () => {
    mockRecord.mockImplementation(kayitlar(async () => ({ id: ID, kayit: { durum: "CANCELLED", ozet: { cuval: 0, top: 0, metre: "0", kg: "0", tartiliCuval: 0 }, cuvallar: [], cuvalsizToplar: [] }, surum: "" })));
    const { unmount } = render(<RecordDetail />);
    await settle();
    expect(screen.getByTestId("sevk-cuval-bos")).toHaveTextContent(B.SEVK_ICERIK_IPTAL);
    expect(screen.queryByTestId("sevk-cuval-ozet")).toBeNull();
    unmount();
    mockRecord.mockImplementation(kayitlar(async () => ({ id: ID, kayit: { durum: "PLANNED", cuvallar: [], cuvalsizToplar: [] }, surum: "" })));
    render(<RecordDetail />);
    await settle();
    expect(screen.getByTestId("sevk-cuval-bos")).toHaveTextContent(B.SEVK_ICERIK_BOS);
  });
});

describe("§4 izin", () => {
  it("`bulut:sevkiyat:oku` yoksa bölüm yok ve içerik ucu çağrılmaz; 403'te de bölüm yok", async () => {
    mockSession.permissions = ["bulut:oturum"];
    mockRecord.mockImplementation(kayitlar(async () => ({ id: ID, kayit: ICERIK, surum: "" })));
    const { unmount } = render(<RecordDetail />);
    await settle();
    expect(screen.queryByTestId("sevk-cuvallar")).toBeNull();
    expect(mockRecord.mock.calls.map((c) => c[0])).not.toContain("sevkiyat-icerigi");
    unmount();
    mockSession.permissions = ["bulut:oturum", "bulut:sevkiyat:oku"];
    mockRecord.mockImplementation(kayitlar(() => Promise.reject(new ApiError(403, "FORBIDDEN", "Yetki yok"))));
    render(<RecordDetail />);
    await settle();
    expect(screen.queryByTestId("sevk-cuvallar")).toBeNull();
  });

  it("sevkiyat dışı kayıtta bölüm yok", async () => {
    mockParams = { projeksiyon: "is-emri", id: ID };
    mockRecord.mockResolvedValue({ id: ID, kayit: { isEmriNo: "IE-1" }, surum: "" });
    render(<RecordDetail />);
    await settle();
    expect(screen.queryByTestId("sevk-cuvallar")).toBeNull();
    expect(mockRecord.mock.calls.map((c) => c[0])).toEqual(["is-emri"]);
  });
});

describe("§5 uzun liste", () => {
  it("çuvallar ve toplar artımlı çizilir (ilk 50; Daha fazla açar)", async () => {
    const cok = {
      ...ICERIK,
      cuvallar: Array.from({ length: 60 }, (_, i) => ({
        id: sid(100 + i), cuvalNo: `CV-${i}`, sira: null, kg: null, top: i === 0 ? 120 : 1, metre: "40", iadeTop: 0,
        toplar: i === 0 ? Array.from({ length: 120 }, (_, k) => topu(1000 + k)) : [topu(5000 + i)],
      })),
      cuvalsizToplar: [],
    };
    mockRecord.mockImplementation(kayitlar(async () => ({ id: ID, kayit: cok, surum: "" })));
    render(<RecordDetail />);
    await settle();
    expect(screen.getAllByTestId(/^sevk-cuval-satir-/)).toHaveLength(50);
    expect(screen.getByTestId("sevk-cuval-daha")).toHaveTextContent("Daha fazla çuval (10 kaldı)");
    await act(async () => { fireEvent.press(screen.getByTestId("sevk-cuval-daha")); });
    expect(screen.getAllByTestId(/^sevk-cuval-satir-/)).toHaveLength(60);
    await act(async () => { fireEvent.press(screen.getByTestId(`sevk-cuval-satir-${sid(100)}`)); });
    const ic = screen.getByTestId(`sevk-icerik-${sid(100)}`);
    expect(within(ic).getAllByTestId(/^sevk-top-4444/)).toHaveLength(50);
    await act(async () => { fireEvent.press(screen.getByTestId(`sevk-top-daha-${sid(100)}`)); });
    expect(within(screen.getByTestId(`sevk-icerik-${sid(100)}`)).getAllByTestId(/^sevk-top-4444/)).toHaveLength(100);
  });
});

describe("§6 örnek veri", () => {
  it("v2: iade + hayalet + çuvalsız, sayılar sevkiyat kaydıyla tutarlı; v1 kaydı yok (404 → boş durum)", async () => {
    const { createOrnekClient } = jest.requireActual("../src/ornek/istemci") as typeof import("../src/ornek/istemci");
    const { createApi } = require("../src/api/endpoints") as typeof import("../src/api/endpoints");
    const { ORNEK_LISTE } = require("../src/ornek/veri") as typeof import("../src/ornek/veri");
    const api = createApi(createOrnekClient());
    const d = lib.sevkIcerigi((await api.record("sevkiyat-icerigi", "v2")).kayit);
    expect(d.cuvallar[0]!.toplar.some((t) => t.iade)).toBe(true);
    expect(d.cuvallar[0]!.toplar.some((t) => t.yok)).toBe(true);
    expect(d.cuvalsizToplar).toHaveLength(1);
    await expect(api.record("sevkiyat-icerigi", "v1")).rejects.toMatchObject({ status: 404 });
    const L = ORNEK_LISTE();
    for (const r of L["sevkiyat-icerigi"]!) {
      const s = L.sevkiyat!.find((x) => x.id === r.id)!.kayit as Record<string, unknown>;
      const o = lib.sevkIcerigi(r.kayit).ozet;
      expect([o.cuval, o.top, o.metre, o.kg]).toEqual([s.cuvalSayisi, s.topSayisi, s.toplamMetre, s.toplamKg]);
      const c = lib.sevkIcerigi(r.kayit);
      expect(c.cuvallar.reduce((a, x) => a + x.top, 0) + c.cuvalsizToplar.length).toBe(o.top);
    }
  });
});
