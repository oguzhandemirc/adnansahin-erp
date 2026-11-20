// İş emri ↔ sipariş PAYLAŞTIRMA gösterimi (2026-11-20; fabrika 2.13.2 `is-emri.siparisPaylari` · `siparis-kalemi.
// isEmriPaylari`). §1 iş emri ayrıntısı: bağlı sipariş satırında fabrikanın `gosterilenMetre`si; paylaştırma girilmişse
// "Paylaştırılan · siparişin 1.000 m'sinden"; aynı siparişin iki kalemi kumaş/renkle ayrılır; sipariş sayısı tekil
// sipariş · §2 alan yoksa (eski fabrika) bugünkü görünüm: yalnız no, metre yok · §3 sipariş kalemi altında
// "IE-…: bu iş emrinden X m"; alan yoksa satır yok · §4 saf okuyucular (bozuk değer uydurulmaz) · §5 örnek veri iki
// tarafı tutarlı. Telefon türev sayı üretmez: gösterilen her metre fabrikanın alanıdır.
// NEGATİF SONDA (2026-11-20, koşuldu, ısırdı): `siparisPayiSatiri` `paylastirilanMetre` koşulunu atınca §1a+§1b;
// `isEmriPayiMetni` `paylastirilanMetre` gösterince §3 kırmızı.
import { act, fireEvent, render, screen, within } from "@testing-library/react-native";
import type { ReactElement } from "react";
import type { ProjectionRecord } from "../src/api/wire";
import type { RemoteList } from "../src/ui/siparis/useRemoteList";

const mockRecord = jest.fn();
const mockCache = { load: jest.fn(async (_k: string, f: () => Promise<unknown>) => ({ data: await f(), offline: false, savedAt: "" })), peek: jest.fn(async () => null) };
const mockSession = {
  api: { record: mockRecord, list: jest.fn(), snapshot: jest.fn(), viewPref: jest.fn(), viewPrefSet: jest.fn() },
  cache: mockCache, markOnline: jest.fn(),
  permissions: ["bulut:oturum", "bulut:uretim:oku", "bulut:cari:oku", "bulut:siparis:oku"] as string[], offline: false, offlineSince: null, facility: null, switchError: null,
};
const mockRouter = { push: jest.fn(), replace: jest.fn(), back: jest.fn(), navigate: jest.fn(), setParams: jest.fn(), canGoBack: () => true };
jest.mock("../src/state/session", () => ({ useSession: () => mockSession }));
jest.mock("expo-router", () => ({ useRouter: () => mockRouter, usePathname: () => "/is-emirleri", useLocalSearchParams: () => ({ id: "w1" }) }));
jest.mock("react-native-safe-area-context", () => ({ useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }) }));

const Detail = (require("../app/(app)/is-emirleri/[id]") as { default: () => ReactElement }).default;
const { OrderLines } = require("../src/ui/siparis/OrderLines") as typeof import("../src/ui/siparis/OrderLines");
const P = require("../src/ui/is-emri/paylar") as typeof import("../src/ui/is-emri/paylar");
const { ORNEK_LISTE } = require("../src/ornek/veri") as typeof import("../src/ornek/veri");

const TEMEL = {
  isEmriNo: "IE-2026-0311", acik: true, asama: "kursun", musteriAdi: "Örnek Tekstil A.Ş.", cariKartIdleri: ["c1"],
  siparisIdleri: ["s1", "s2"], siparisNolari: ["SIP-1", "SIP-2"], urunAdi: "Numune Tül 320 cm", renkAdi: "Gri",
};
const PAY = (o: Record<string, unknown>) => ({ siparisId: "s1", siparisNo: "SIP-1", siparisKalemiId: "k1", musteriAdi: "Örnek Tekstil A.Ş.", urunAdi: "Numune Tül 320 cm", renkAdi: "Gri", siparisMetre: 1000, paylastirilanMetre: null, gosterilenMetre: 1000, ...o });
const rec = (kayit: Record<string, unknown>) => ({ id: "w1", kayit, surum: "2026-11-20T09:00:00.000Z" });

async function settle() {
  for (let i = 0; i < 4; i++) await act(async () => undefined);
}
const liste = (items: ProjectionRecord[]): RemoteList => ({
  items, loading: false, refreshing: false, error: null, notFound: false, forbidden: false, stale: false, offline: false, savedAt: null,
  hasMore: false, loadingMore: false, loadMore: jest.fn(), reload: jest.fn(),
});

beforeEach(() => {
  mockRecord.mockReset();
  mockRouter.push.mockReset();
});

describe("§1 iş emri ayrıntısı: bağlı siparişte fabrikanın metresi", () => {
  it("§1a paylaştırma girilmemiş: değer gösterilen metre, alt satır yok; dokununca sipariş", async () => {
    mockRecord.mockResolvedValue(rec({ ...TEMEL, siparisIdleri: ["s1"], siparisNolari: ["SIP-1"], siparisPaylari: [PAY({})] }));
    render(<Detail />);
    await settle();
    const r = within(await screen.findByTestId("is-emri-siparis-0"));
    expect(r.getByText("SIP-1")).toBeTruthy();
    expect(r.getByText("1.000 m")).toBeTruthy();
    expect(r.queryByText(/Paylaştırılan/)).toBeNull();
    fireEvent.press(screen.getByTestId("is-emri-siparis-0"));
    expect(mockRouter.push).toHaveBeenCalledWith({ pathname: "/siparisler/[id]", params: { id: "s1" } });
  });

  it("§1b paylaştırma girilmiş: \"300 m\" + \"Paylaştırılan · siparişin 1.000 m'sinden\"; aynı siparişin iki kalemi kumaşla ayrılır", async () => {
    mockRecord.mockResolvedValue(rec({
      ...TEMEL,
      siparisPaylari: [
        PAY({ paylastirilanMetre: 300, gosterilenMetre: 300 }),
        PAY({ siparisKalemiId: "k2", renkAdi: "Ekru", siparisMetre: 800, paylastirilanMetre: 200, gosterilenMetre: 200 }),
        PAY({ siparisId: "s2", siparisNo: "SIP-2", siparisKalemiId: "k9", siparisMetre: 1200, gosterilenMetre: 1200 }),
      ],
    }));
    render(<Detail />);
    await settle();
    const a = within(await screen.findByTestId("is-emri-siparis-0"));
    expect(a.getByText("300 m")).toBeTruthy();
    expect(a.getByText("Numune Tül 320 cm Gri · Paylaştırılan · siparişin 1.000 m'sinden")).toBeTruthy();
    expect(within(screen.getByTestId("is-emri-siparis-1")).getByText("Numune Tül 320 cm Ekru · Paylaştırılan · siparişin 800 m'sinden")).toBeTruthy();
    const c = within(screen.getByTestId("is-emri-siparis-2"));
    expect(c.getByText("1.200 m")).toBeTruthy();
    expect(c.queryByText(/Paylaştırılan|Numune/)).toBeNull();
    // Sayı tekil sipariş (iki sipariş), kalem sayısı değil.
    expect(within(screen.getByTestId("is-emri-siparisler-blok")).getByText("2")).toBeTruthy();
  });
});

describe("§2 eski fabrika (alan yok)", () => {
  it("bugünkü görünüm: yalnız sipariş no, metre yok", async () => {
    mockRecord.mockResolvedValue(rec(TEMEL));
    render(<Detail />);
    await settle();
    const r = within(await screen.findByTestId("is-emri-siparis-1"));
    expect(r.getByText("SIP-2")).toBeTruthy();
    expect(r.queryByText(/ m$/)).toBeNull();
  });

  it("boş dizi (bağ yok) siparişsiz görünüme düşer", async () => {
    mockRecord.mockResolvedValue(rec({ ...TEMEL, siparisIdleri: [], siparisNolari: [], siparisPaylari: [] }));
    render(<Detail />);
    await settle();
    expect(await screen.findByTestId("is-emri-siparissiz")).toBeTruthy();
  });
});

describe("§3 sipariş kalemi altında iş emri payı", () => {
  it("\"IE-…: bu iş emrinden X m\" her bağ için; alan yoksa satır yok", () => {
    const k1 = { id: "k1", surum: "x", kayit: { urunAdi: "Numune Tül 320 cm", miktar: 1000, birim: "m", isEmriPaylari: [{ isEmriId: "w1", isEmriNo: "IE-2026-0311", paylastirilanMetre: 300, gosterilenMetre: 300 }, { isEmriId: "w2", isEmriNo: "IE-2026-0312", paylastirilanMetre: null, gosterilenMetre: 700 }] } };
    const k2 = { id: "k2", surum: "x", kayit: { urunAdi: "Deneme Keten", miktar: 500, birim: "m" } };
    render(<OrderLines list={liste([k1, k2])} />);
    expect(within(screen.getByTestId("kalem-k1-is-emri-0")).getByText("IE-2026-0311: bu iş emrinden 300 m")).toBeTruthy();
    expect(within(screen.getByTestId("kalem-k1-is-emri-1")).getByText("IE-2026-0312: bu iş emrinden 700 m")).toBeTruthy();
    expect(screen.queryByTestId("kalem-k2-is-emri-0")).toBeNull();
    expect(screen.getByTestId("kalem-k2")).toBeTruthy();
  });
});

describe("§4 saf okuyucular", () => {
  it("alan dizi değilse null; bozuk değer uydurulmaz", () => {
    expect(P.siparisPaylari({})).toBeNull();
    expect(P.siparisPaylari({ siparisPaylari: "x" })).toBeNull();
    expect(P.isEmriPaylari({ isEmriPaylari: null })).toBeNull();
    const [p] = P.siparisPaylari({ siparisPaylari: [{ siparisNo: "", gosterilenMetre: "abc", paylastirilanMetre: "250.5" }] })!;
    expect(p).toEqual(expect.objectContaining({ siparisNo: "—", gosterilenMetre: null, paylastirilanMetre: 250.5, siparisMetre: null }));
    expect(P.siparisPayiSatiri(p!, false)).toEqual({ deger: undefined, ikincil: "Paylaştırılan" });
    expect(P.isEmriPayiMetni({ isEmriId: null, isEmriNo: "IE-1", paylastirilanMetre: null, gosterilenMetre: null })).toBe("IE-1");
  });
});

describe("§5 örnek veri", () => {
  it("kalem tarafı iş emri tarafının aynası; çok siparişli iş emrinde paylaştırma var", () => {
    const L = ORNEK_LISTE();
    const ie = L["is-emri"]!;
    const kalemPaylari = L["siparis-kalemi"]!.flatMap((k) => (P.isEmriPaylari(k.kayit as Record<string, unknown>) ?? []).map((p) => ({ kalem: k.id, ...p })));
    const iePaylari = ie.flatMap((w) => (P.siparisPaylari(w.kayit as Record<string, unknown>) ?? []).map((p) => ({ ie: w.id, ...p })));
    expect(iePaylari.length).toBeGreaterThan(0);
    expect(kalemPaylari.length).toBe(iePaylari.length);
    for (const p of iePaylari) expect(kalemPaylari).toContainEqual(expect.objectContaining({ kalem: p.siparisKalemiId, isEmriId: p.ie, gosterilenMetre: p.gosterilenMetre }));
    expect(iePaylari.some((p) => p.paylastirilanMetre !== null)).toBe(true);
    for (const w of ie) {
      const k = w.kayit as Record<string, unknown>;
      expect((P.siparisPaylari(k) ?? []).map((p) => p.siparisId)).toEqual(k.siparisIdleri);
    }
  });
});
