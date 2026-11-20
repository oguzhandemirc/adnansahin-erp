// Dört liste → dört özellikli tablo (2026-11-20, kullanıcı: "Dördünü de çevir"): §1 sipariş kalemleri · §2 siparişin
// iş emirleri · §3 cari iadeleri · §4 iş emri aşama sayıları. Her biri sütun seçimi + arama + süzgeç + başlıktan
// sıralama; satıra dokunma davranışı ve mevcut bilgi (kalemin altındaki iş emri payı) korunur. Sıralama yalnız gösterim
// sırasıdır (sayı DEĞER olarak). Yarım küme (sunucuda devamı var) sayı başlığında yazılmaz.
// NEGATİF SONDALAR: iptal kalemi yokken Durum sütunu varsayılanda YOK; aramaya uymayan terim boş durumu gösterir;
// bitmemiş liste "N kalem" demez; bağlı iş emri yokken tablo değil "İş emri yok".
import AsyncStorage from "@react-native-async-storage/async-storage";
import { act, fireEvent, render, screen } from "@testing-library/react-native";
import type { ProjectionRecord } from "../src/api/wire";
import type { RemoteList } from "../src/ui/siparis/useRemoteList";

const mockRouter = { push: jest.fn(), replace: jest.fn(), back: jest.fn(), navigate: jest.fn(), setParams: jest.fn(), canGoBack: () => true };
jest.mock("../src/state/session", () => ({ useSession: () => ({ facility: null, permissions: [] }) }));
jest.mock("expo-router", () => ({ useRouter: () => mockRouter }));
jest.mock("react-native-safe-area-context", () => ({ useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }) }));

const { OrderLines, KALEM_SUTUNLARI, kalemVarsayilan } = require("../src/ui/siparis/OrderLines") as typeof import("../src/ui/siparis/OrderLines");
const { OrderWorkOrders } = require("../src/ui/siparis/OrderWorkOrders") as typeof import("../src/ui/siparis/OrderWorkOrders");
const { IADE_SUTUNLARI } = require("../src/ui/cari/OzetBolumleri") as typeof import("../src/ui/cari/OzetBolumleri");
const { ASAMA_SUTUNLARI } = require("../app/(app)/is-emirleri/[id]") as typeof import("../app/(app)/is-emirleri/[id]");
const { yerelSirala, yerelSiralanabilir } = require("../src/ui/tablo/yerelTablo") as typeof import("../src/ui/tablo/yerelTablo");

const rec = (id: string, kayit: Record<string, unknown>): ProjectionRecord => ({ id, kayit, surum: "2026-11-20T09:00:00.000Z" }) as ProjectionRecord;
function liste(items: ProjectionRecord[], o: Partial<RemoteList> & { tam?: boolean } = {}): RemoteList & { tam?: boolean } {
  return {
    items, loading: false, refreshing: false, loadingMore: false, hasMore: false, error: null, forbidden: false, notFound: false,
    offline: false, stale: false, savedAt: null, reload: jest.fn(), loadMore: jest.fn(), ...o,
  } as unknown as RemoteList & { tam?: boolean };
}
async function settle() {
  for (let i = 0; i < 4; i++) await act(async () => undefined);
}
const sira = (onek: string) => screen.getAllByTestId(new RegExp(`^${onek}[^-]+$`)).map((x) => String(x.props.testID).slice(onek.length)).join(",");

beforeEach(async () => {
  await AsyncStorage.clear();
  mockRouter.push.mockReset();
});

const K1 = rec("k1", { urunAdi: "Numune Tül", renkAdi: "Ekru", miktar: "999", birim: "MT", acikMiktar: "999", isEmriPaylari: [{ isEmriId: "w1", isEmriNo: "IE-2026-0311", paylastirilanMetre: 300, gosterilenMetre: 300 }] });
const K2 = rec("k2", { urunAdi: "Deneme Keten", renkAdi: "Antrasit", miktar: "1234.5", birim: "MT", sevkMiktari: "200", acikMiktar: "1034.5" });
const K3 = rec("k3", { urunAdi: "Örnek Saten", renkAdi: "Krem", miktar: "50", birim: "MT", acikMiktar: "50" });

describe("§1 sipariş kalemleri tablosu", () => {
  it("sütunlar, arama (iş emri no dahil), süzgeç ve Miktar başlığından DEĞER sıralaması; iş emri payı satırın altında kalır", async () => {
    render(<OrderLines list={liste([K1, K2, K3], { tam: true })} />);
    await settle();
    const t = "siparis-kalem-tablo";
    for (const ek of ["-ara-ac", "-suzgec", "-sutunlar"]) expect(screen.getByTestId(t + ek)).toBeTruthy();
    expect(sira("kalem-")).toBe("k1,k2,k3");
    fireEvent.press(screen.getByTestId(`${t}-sutun-miktar`));
    await settle();
    expect(sira("kalem-")).toBe("k3,k1,k2"); // 50 < 999 < 1.234,5 (metin olsaydı "1.234,5" < "50" < "999")
    fireEvent.press(screen.getByTestId(`${t}-sutun-miktar`));
    await settle();
    expect(sira("kalem-")).toBe("k2,k1,k3");
    expect(screen.getByTestId("kalem-k1-is-emri-0")).toBeTruthy();
    fireEvent.press(screen.getByTestId(`${t}-ara-ac`));
    fireEvent.changeText(screen.getByTestId(`${t}-ara`), "IE-2026-0311");
    await settle();
    expect(sira("kalem-")).toBe("k1");
    fireEvent.changeText(screen.getByTestId(`${t}-ara`), "kadife");
    await settle();
    expect(screen.queryAllByTestId(/^kalem-k\d$/)).toHaveLength(0);
    expect(screen.getByTestId(`${t}-bos-arama`)).toBeTruthy();
  });

  it("NEGATİF: iptal kalem yoksa Durum, veride yoksa En/Parça/Müşteride varsayılanda YOK; varsa görünür", () => {
    expect(kalemVarsayilan([K1, K2])).toEqual(["urun", "renk", "miktar", "sevk", "acik"]);
    const iptal = rec("k9", { urunAdi: "X", miktar: "5", birim: "MT", iptalTarihi: "2026-01-01", en: "280", musteriUrunAdi: "Saten A" });
    expect(kalemVarsayilan([K1, iptal])).toEqual(["urun", "renk", "miktar", "sevk", "acik", "durum", "en", "musteride"]);
    // Bütün sütunlar sıralanır; iş emri listesi sütunu yalnız süzgeç/arama içindir.
    expect(yerelSiralanabilir(KALEM_SUTUNLARI)).not.toContain("isEmri");
  });

  it("NEGATİF: liste bitmemişse (sunucuda devamı var) başlık sayı yazmaz ve yükleniyor görünür", async () => {
    render(<OrderLines list={liste([K1, K2], { tam: false, hasMore: true })} />);
    await settle();
    expect(screen.getByTestId("siparis-kalem-yukleniyor")).toBeTruthy();
    expect(screen.queryByText(/ {2}2$/)).toBeNull();
    expect(screen.queryByTestId("daha-fazla")).toBeNull(); // sayfa düğmesi yok: devamı kendiliğinden yüklenir
  });
});

const W = (id: string, no: string, durum: string, asama: string | null, top: number, metre: number) =>
  rec(id, { isEmriNo: no, durum, acik: asama !== null, asama, topSayisi: top, metre });

describe("§2 siparişin iş emirleri tablosu", () => {
  it("satıra dokunmak iş emrini açar; Metre başlığı sıralar; iptal çizilmez; Durum süzgeci var", async () => {
    const xs = [W("w1", "IE-1", "IN_PROGRESS", "kursun", 3, 2000), W("w2", "IE-2", "IN_PROGRESS", "tambur", 9, 150), W("w0", "IE-0", "CANCELLED", "kursun", 1, 10)];
    render(<OrderWorkOrders list={{ ...liste(xs, { tam: true }), acik: true }} />);
    await settle();
    const t = "siparis-is-emri-tablo";
    expect(screen.queryByTestId("siparis-is-emri-w0")).toBeNull();
    fireEvent.press(screen.getByTestId(`${t}-sutun-metre`));
    await settle();
    expect(sira("siparis-is-emri-w")).toBe("2,1");
    fireEvent.press(screen.getByTestId("siparis-is-emri-w1"));
    expect(mockRouter.push).toHaveBeenCalledWith({ pathname: "/is-emirleri/[id]", params: { id: "w1" } });
    fireEvent.press(screen.getByTestId(`${t}-suzgec`));
    expect(screen.getByTestId(`${t}-suzgec-secici`)).toBeTruthy();
  });

  it("NEGATİF: bağlı iş emri yoksa (hepsi iptal) tablo değil 'İş emri yok'", async () => {
    render(<OrderWorkOrders list={{ ...liste([W("w0", "IE-0", "CANCELLED", "kursun", 1, 10)], { tam: true }), acik: true }} />);
    await settle();
    expect(screen.getByTestId("siparis-is-emri-yok")).toBeTruthy();
    expect(screen.queryByTestId("siparis-is-emri-tablo")).toBeNull();
  });
});

describe("§3 cari iade sütunları (SAF)", () => {
  const I = (id: string, metre: string, iptal: boolean) => rec(id, { iadeNo: `IA-${id}`, urunAdi: "Saten", metre, sebepAdi: "Renk farkı", iptalTarihi: iptal ? "2026-11-01" : null, olusturulma: "2026-11-02T08:00:00Z" });
  it("metre DEĞER olarak sıralanır, durum süzgeci İptal/Geçerli ayırır, her sütun sıralanabilir", () => {
    const xs = [I("a", "62.50", false), I("b", "1200.00", false), I("c", "8.00", true)];
    expect(yerelSirala(xs, IADE_SUTUNLARI, { alan: "metre", yon: "artan" }).map((r) => r.id).join("")).toBe("cab");
    const durum = IADE_SUTUNLARI.find((c) => c.key === "durum")!;
    expect(xs.map((r) => (durum.suzgec as (r: ProjectionRecord) => string[])(r)[0])).toEqual(["Geçerli", "Geçerli", "İptal"]);
    expect(yerelSiralanabilir(IADE_SUTUNLARI)).toEqual(IADE_SUTUNLARI.map((c) => c.key));
  });
});

describe("§4 aşama sayıları sütunları (SAF)", () => {
  it("Top ve Metre değerle sıralanır; metresi gelmeyen aşama sonda", () => {
    const xs = [
      { id: "fason", anahtar: "fason", etiket: "Fasonda", icon: "color-fill-outline", ton: "orange", top: 14, metre: 1690 },
      { id: "depo", anahtar: "depo", etiket: "Depoda", icon: "cube-outline", ton: "green", top: 4, metre: null },
      { id: "kursun", anahtar: "kursun", etiket: "Kurşun", icon: "flask-outline", ton: "violet", top: 20, metre: 200 },
    ] as never[];
    expect(yerelSirala(xs, ASAMA_SUTUNLARI, { alan: "top", yon: "azalan" }).map((a: { id: string }) => a.id)).toEqual(["kursun", "fason", "depo"]);
    expect(yerelSirala(xs, ASAMA_SUTUNLARI, { alan: "metre", yon: "azalan" }).map((a: { id: string }) => a.id)).toEqual(["fason", "kursun", "depo"]);
  });
});
