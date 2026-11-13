// E1 (Pano · Üretim · Sevkiyat): izinsiz kart çizilmez · finans/sağlık anlığı istenmez ·
// çalışan hesabında "Görebildiğin alanlar" · Üretim sade (anlık, dönemsiz) · kayıt rozeti tonu = anlam.
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react-native";
import type React from "react";
import { createCache } from "../src/state/cache";

function mockMem() {
  const m = new Map<string, string>();
  return {
    get: async (k: string) => m.get(k) ?? null,
    set: async (k: string, v: string) => void m.set(k, v),
    remove: async (k: string) => void m.delete(k),
    keys: async () => [...m.keys()],
    removeMany: async (ks: readonly string[]) => ks.forEach((k) => m.delete(k)),
  };
}

const FIXTURES: Record<string, unknown> = {
  "ozet.siparis": { acikKalem: 12, karsilanmaYuzde: 64, gecikenKalem: 0 },
  "ozet.uretim": { bugunTamamlananToplam: 142, kolonlar: [] },
  "ozet.fason": { bugun: { acikMiktar: 1500, acikKalem: 2 }, buAy: { acikMiktar: 23120, acikKalem: 19 } },
  "uretim-akisi": {
    kolonlar: [
      { anahtar: "hamStok", etiket: "Ham Stok", adet: 342 }, { anahtar: "yariMamul", etiket: "Yarı Mamul", adet: 0 },
      { anahtar: "fason", etiket: "Fason'da", adet: 294 }, { anahtar: "kursun", etiket: "Kurşun Bekleyen", adet: 110 },
      { anahtar: "tambur", etiket: "Tambur Bekleyen", adet: 20 }, { anahtar: "depo", etiket: "Depo", adet: 2359 },
      { anahtar: "sevk", etiket: "Sevk", adet: 4 },
    ],
    istasyonlar: [
      { id: "s1", kod: "KK1", ad: "KK1", tur: "RAW_QC", kuyruk: 0, aktif: 0, bugunTamamlanan: 80, bugunSevk: 0 },
      { id: "s2", kod: "KRS", ad: "Kurşun", tur: "PROCESS_QC", kuyruk: 110, aktif: 0, bugunTamamlanan: 60, bugunSevk: 0 },
    ],
  },
};

const mockApi = {
  snapshot: jest.fn(async (p: string) => ({ projeksiyon: p, veri: FIXTURES[p] ?? {}, surum: "1" })),
  list: jest.fn(async (_p: string, _o?: unknown) => ({ kayitlar: [] as unknown[], sonraki: null })),
  refresh: jest.fn(async () => ({ zil: false, sonrakiMs: 60_000 })),
};
const mockSession = {
  api: mockApi,
  cache: null as ReturnType<typeof createCache> | null,
  markOnline: jest.fn(),
  refresh: jest.fn(async () => undefined),
  permissions: [] as string[],
  facility: null as unknown,
  facilities: [] as unknown[],
  facilityId: null as string | null,
  switchError: null as string | null,
  switchFacility: jest.fn(async () => true),
  factoryStamp: null as string | null,
  feedMode: "kapali",
  offline: false,
  offlineSince: null as string | null,
};
const mockRouter = { navigate: jest.fn(), push: jest.fn(), back: jest.fn(), canGoBack: () => false, replace: jest.fn() };
jest.mock("../src/state/session", () => ({ useSession: () => mockSession }));
jest.mock("../src/state/store", () => ({ plainStore: mockMem(), secretStore: mockMem(), legacyPlainStore: null }));
jest.mock("expo-router", () => ({
  useRouter: () => mockRouter,
  usePathname: () => "/pano",
  useFocusEffect: (cb: () => unknown) => require("react").useEffect(() => cb(), [cb]),
}));
jest.mock("react-native-safe-area-context", () => ({ useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }) }));

// mock'lar kurulduktan SONRA yüklenir.
const Dashboard = (require("../app/(app)/(tabs)/pano") as { default: () => React.ReactElement }).default;
const Production = (require("../app/(app)/(tabs)/uretim") as { default: () => React.ReactElement }).default;
const { areaSummary } = require("../src/ui/pano/read") as typeof import("../src/ui/pano/read");
const L = require("../src/lib/labels/uretim") as typeof import("../src/lib/labels/uretim");

beforeEach(() => {
  mockSession.cache = createCache(mockMem(), "t1:h1", () => new Date("2026-10-22T09:00:00Z"));
  mockApi.snapshot.mockClear();
  mockApi.list.mockClear();
});

describe("Pano", () => {
  it("§1 izinsiz kutu çizilmez ve verisi istenmez", async () => {
    mockSession.permissions = ["bulut:oturum", "bulut:ozet:oku", "bulut:siparis:oku"];
    render(<Dashboard />);
    expect(await screen.findByTestId("kutu-siparis")).toBeTruthy();
    expect(screen.queryByTestId("kutu-uretim")).toBeNull();
    await waitFor(() => expect(mockApi.snapshot).toHaveBeenCalledWith("ozet.siparis"));
    expect(mockApi.snapshot).not.toHaveBeenCalledWith("ozet-finans");
    expect(mockApi.snapshot).not.toHaveBeenCalledWith("saglik");
    expect(mockApi.snapshot).not.toHaveBeenCalledWith("ozet.uretim");
  });

  it("§3 çalışan (özet izni yok): 'Görebildiğin alanlar', kutu ve istek yok", async () => {
    mockSession.permissions = ["bulut:oturum", "bulut:siparis:oku"];
    render(<Dashboard />);
    expect(screen.getByTestId("gorebildigin-alanlar")).toBeTruthy();
    expect(screen.getByTestId("kisayol-siparisler")).toBeTruthy();
    expect(screen.queryByTestId("pano-kutular")).toBeNull();
    await act(async () => undefined);
    expect(mockApi.snapshot).not.toHaveBeenCalled();
  });
});

describe("Üretim", () => {
  it("§4 üç soru, hepsi anlık: dönem şeridi, fason fire, makine kartı ve eski iş emri listesi yok", async () => {
    mockSession.permissions = ["bulut:oturum", "bulut:ozet:oku", "bulut:uretim:oku"];
    render(<Production />);
    expect(within(await screen.findByTestId("kpi-bugun-tamamlanan")).getByText("142")).toBeTruthy();
    expect(within(screen.getByTestId("kpi-ham-giris")).getByText("80")).toBeTruthy();
    for (const id of ["donem-bugun", "kpi-fasonda", "kpi-fason-fire", "bolum-akis", "bolum-istasyonlar", "is-emirleri"]) expect(screen.queryByTestId(id)).toBeNull();
    expect(mockApi.snapshot).not.toHaveBeenCalledWith("ozet.fason");
    expect(mockApi.snapshot).not.toHaveBeenCalledWith("fason-acik");
  });

  it("§5 'Mal şu an nerede?' dikey liste: birim kolonun ölçtüğü şey; sıfır yarı mamul ve sevk kolonu çizilmez", async () => {
    mockSession.permissions = ["bulut:oturum", "bulut:uretim:oku"];
    render(<Production />);
    await screen.findByTestId("nerede-hamStok");
    expect(within(screen.getByTestId("nerede-hamStok")).getByText("342 top")).toBeTruthy();
    expect(within(screen.getByTestId("nerede-fason")).getByText("294 top")).toBeTruthy();
    expect(within(screen.getByTestId("nerede-kursun")).getByText("110 iş emri")).toBeTruthy();
    expect(within(screen.getByTestId("nerede-depo")).getByText("2.359 top")).toBeTruthy();
    expect(screen.queryByTestId("nerede-yariMamul")).toBeNull();
    expect(screen.queryByTestId("nerede-sevk")).toBeNull();
    // Özet izni yoksa "Bugün ne bitti?" özet anlığı istenmez.
    expect(mockApi.snapshot).not.toHaveBeenCalledWith("ozet.uretim");
    fireEvent.press(screen.getByTestId("nerede-fason"));
    expect(mockRouter.push).toHaveBeenCalledWith("/fason");
  });

  it("§6 görünüm sınıflamaz: bilinmeyen kod ve bozuk alan rozet çizmez", () => {
    const { shipReadinessView } = require("../src/lib/ship-readiness") as typeof import("../src/lib/ship-readiness");
    expect(shipReadinessView({})).toBeNull();
    expect(shipReadinessView({ sevkeHazir: "HAZIR" })).toBeNull();
    expect(shipReadinessView({ sevkeHazir: { durum: "YENI", hazirTop: 5 } })).toBeNull();
    // Görünüm sayılardan durum çıkarmaz: fabrika KISMEN dediyse metre ne olursa olsun KISMEN kalır.
    expect(shipReadinessView({ sevkeHazir: { durum: "KISMEN", hazirTop: 99, hazirMetre: 99999 } })?.label).toBe("Kısmen hazır");
  });
});

describe("☰ menü (Diğer sekme değil)", () => {
  it("pano başlığında menü düğmesi /diger'i açar", async () => {
    mockSession.permissions = ["bulut:oturum", "bulut:ozet:oku", "bulut:uretim:oku"];
    render(<Dashboard />);
    fireEvent.press(await screen.findByTestId("pano-menu"));
    expect(mockRouter.push).toHaveBeenCalledWith("/diger");
  });
});

describe("kayıt durumu tonu = anlam (tek kaynak `labels/uretim`)", () => {
  it("iş emri: Planlandı nötr · Üretimde etkin · Tamamlandı iyi · İptal/Devredildi sönük", () => {
    expect(Object.fromEntries(Object.entries(L.WORK_ORDER_STATUS).map(([k, v]) => [k, v.tone]))).toEqual({
      PLANNED: "notr",
      IN_PROGRESS: "etkin",
      COMPLETED: "iyi",
      CANCELLED: "sonuk",
      SUPERSEDED: "sonuk",
    });
  });
  it("sevkiyat: Onay bekliyor nötr · Sevk edildi iyi · İptal sönük", () => {
    expect(Object.fromEntries(Object.entries(L.SHIPMENT_STATUS).map(([k, v]) => [k, v.tone]))).toEqual({ PLANNED: "notr", DISPATCHED: "iyi", CANCELLED: "sonuk" });
  });
  it("fabrika arıza/gecikme durumu vermediği için iş emri ve sevkiyat sözlüklerinde uyarı/kritik yok", () => {
    const tones = [...Object.values(L.WORK_ORDER_STATUS), ...Object.values(L.SHIPMENT_STATUS)].map((e) => e.tone);
    expect(tones).not.toContain("uyari");
    expect(tones).not.toContain("kritik");
  });
  it("ölü stok uyarıdır, kritik değil; bilinmeyen durum nötr çizilir", () => {
    expect(L.DEAD_STOCK_STATUS.var.tone).toBe("uyari");
    expect(L.recordStatus(L.WORK_ORDER_STATUS, "YENI_DURUM")).toEqual({ label: "YENI_DURUM", tone: "notr" });
  });
});

describe("okuyucular", () => {
  it("areaSummary ham anahtar basmaz", () => {
    const text = areaSummary("ozet.siparis", { acikKalem: 12, karsilanmaYuzde: 64 });
    expect(text).toContain("açık kalem");
    expect(text).not.toMatch(/acikKalem|karsilanma/);
  });
  it("termin türevi gelmeyen fabrikada zamanında/geciken satırı hiç çizilmez", () => {
    const text = areaSummary("ozet.sevkiyat", { buAy: { sevkMiktari: 1200, sevkTopSayisi: 8 } });
    expect(text).toBe("Bu ay 1.200 m");
    expect(text).not.toMatch(/zamanında|—/);
    expect(areaSummary("ozet.sevkiyat", { buAy: { sevkMiktari: 1200, zamanindaYuzde: 92.4 } })).toContain("%92,4 zamanında");
  });
});
