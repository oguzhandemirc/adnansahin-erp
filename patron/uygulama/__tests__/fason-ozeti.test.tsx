// Fason anlığı: §1 Stok emanet bölümü çizmez (Adnan'da emanet modülü kapalı, anlık bulutta yok) · §2 Üretim ›
// fasondaki işler (F10 kokpit özeti) · §4 pano stok satırı yalnız fabrikanın sayısı.
import { act, fireEvent, render, screen } from "@testing-library/react-native";
import type React from "react";

const mockApi = { snapshot: jest.fn(), list: jest.fn(), record: jest.fn() };
const mockCache = {
  load: jest.fn(async (_k: string, f: () => Promise<unknown>) => ({ data: await f(), offline: false, savedAt: "2026-11-08T09:00:00.000Z" })),
  peek: jest.fn(async () => null),
};
const mockSession = {
  api: mockApi, cache: mockCache, markOnline: jest.fn(), permissions: [] as string[], offline: false, offlineSince: null,
  facility: null, facilities: [], switchError: null, factoryStamp: "2026-11-08T08:55:00Z",
};
const mockRouter = { push: jest.fn(), replace: jest.fn(), back: jest.fn(), navigate: jest.fn(), canGoBack: () => true };
jest.mock("../src/state/session", () => ({ useSession: () => mockSession }));
jest.mock("expo-router", () => ({
  useRouter: () => mockRouter,
  usePathname: () => "/",
  useLocalSearchParams: () => ({}),
  useFocusEffect: (cb: () => void | (() => void)) => (require("react") as typeof import("react")).useEffect(() => cb(), [cb]),
}));
jest.mock("react-native-safe-area-context", () => ({ useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }) }));

const Stock = (require("../app/(app)/(tabs)/stok") as { default: () => React.ReactElement }).default;
const Subcontract = (require("../app/(app)/fason/index") as { default: () => React.ReactElement }).default;
const Firm = (require("../app/(app)/fason/[firmaId]") as { default: () => React.ReactElement }).default;
const { areaSummary } = require("../src/ui/pano/read") as typeof import("../src/ui/pano/read");
const { ApiError } = require("../src/api/client") as typeof import("../src/api/client");

const C1 = "11111111-1111-4111-8111-111111111111";
const F1 = "22222222-2222-4222-8222-222222222222";
const KARNE = {
  ozet: {
    bitmisMiktar: 5000, bitmisAdet: 50, hamMiktar: 2000, hamAdet: 20, yariMamulMiktar: 0, yariMamulAdet: 0, yasliMiktar: 0, oluMiktar: 0, oluStokGun: 90, yassizAdet: 0, yassizMiktar: 0,
  },
  yasKovalari: [], urunler: [],
};
const FASON = {
  acikSevk: 7, kalanMiktar: "3456.000", acikTop: 30, boyahanedeTop: 22, isEmriSayisi: 4, musteriSayisi: 3,
  kategoriler: [{ kod: "BOYAHANE", ad: "Boyahane", acikTop: 22, kalanMiktar: "2000.000" }, { kod: "APRE", ad: "Apre", acikTop: 0, kalanMiktar: "0" }],
  firmalar: [{
    fasonFirmaId: F1, etiket: "Boyahane A", acikSevk: 4, kalanMiktar: "2000.000", acikTop: 22, kategoriler: ["Boyahane"],
    enEskiGonderim: new Date(Date.now() - 9 * 86_400_000 - 3_600_000).toISOString(), isEmriSayisi: 2,
    musteriler: [{ cariKartId: C1, ad: "Akın Tekstil", top: 15, metre: 1400 }, { cariKartId: null, ad: null, top: 7, metre: 600 }],
    urunler: [{ urunId: null, urunAdi: "Saten 280", renkId: null, renkAdi: "Krem", top: 22, metre: 2000 }],
  }],
};
const DATA: Record<string, unknown> = { "stok-karnesi": KARNE, "fason-acik": FASON };

async function flush() {
  await act(async () => undefined);
  await act(async () => undefined);
}

function serve(missing: readonly string[] = []) {
  mockApi.snapshot.mockImplementation(async (p: string) => {
    if (missing.includes(p) || !(p in DATA)) throw new ApiError(404, "BULUNAMADI", "Anlık görüntü bulunamadı");
    return { projeksiyon: p, veri: DATA[p], surum: "2026-11-08T08:55:00.000Z" };
  });
}

beforeEach(() => {
  for (const f of Object.values(mockApi)) f.mockReset();
  mockApi.list.mockImplementation(async () => ({ kayitlar: [], sonraki: null }));
  serve();
  mockSession.permissions = [];
});

describe("§1 Stok › emanet bölümü yok", () => {
  it("emanet anlığı istenmez, bölüm çizilmez, çökme yok", async () => {
    mockSession.permissions = ["bulut:stok:oku"];
    render(<Stock />);
    await flush();
    expect(screen.getByTestId("kpi-bitmis")).toBeTruthy();
    expect(screen.queryByTestId("emanet-bolumu")).toBeNull();
    expect(mockApi.snapshot).not.toHaveBeenCalledWith("emanet-bakiye");
  });
});

describe("§2 Fason ekranı › fasonda ne var, kimde", () => {
  it("toplam top/metre, iş emri/müşteri sayısı, kategoriler 0'lılar dahil, firma 'X gündür' (gecikme/termin yok)", async () => {
    mockSession.permissions = ["bulut:uretim:oku"];
    render(<Subcontract />);
    await flush();
    expect(screen.getByTestId("fason-top")).toHaveTextContent("30", { exact: false });
    expect(screen.getByTestId("fason-metre")).toHaveTextContent("3.456", { exact: false });
    expect(screen.getByTestId("fason-kimler")).toHaveTextContent("4 iş emri · 3 müşteri", { exact: false });
    expect(screen.getByTestId("fason-kategori-APRE")).toHaveTextContent("0 top", { exact: false });
    expect(screen.getByTestId(`fason-firma-${F1}`)).toHaveTextContent("9 gündür", { exact: false });
    expect(screen.queryByText(/gecik|termin/i)).toBeNull();
    fireEvent.press(screen.getByTestId(`fason-firma-${F1}`));
    expect(mockRouter.push).toHaveBeenCalledWith({ pathname: "/fason/[firmaId]", params: { firmaId: F1, ad: "Boyahane A" } });
  });

  it("firma ayrıntısı: müşteriler (müşterisiz satır adıyla) ve kumaşlar fabrikanın kırılımı; eski sunucuda İş emirleri sekmesi yok", async () => {
    mockSession.permissions = ["bulut:uretim:oku"];
    jest.spyOn(require("expo-router") as { useLocalSearchParams: () => unknown }, "useLocalSearchParams").mockReturnValue({ firmaId: F1, ad: "Boyahane A" });
    render(<Firm />);
    await flush();
    expect(screen.getByTestId("fason-firma-bilgi")).toHaveTextContent("Boyahane · 2 iş emri · en eskisi 9 gündür", { exact: false });
    expect(screen.getByTestId("fason-musteri-0")).toHaveTextContent("Akın Tekstil", { exact: false });
    expect(screen.getByTestId("fason-musteri-1")).toHaveTextContent("Müşterisiz", { exact: false });
    expect(screen.queryByText("İş emirleri")).toBeNull();
    fireEvent.press(screen.getByText("Kumaşlar"));
    expect(screen.getByTestId("fason-kumas-0")).toHaveTextContent("Saten 280 · Krem", { exact: false });
  });

  it("izinsiz hesapta istenmez; eski fabrika (kırılımsız şekil) çökmez", async () => {
    mockSession.permissions = [];
    const first = render(<Subcontract />);
    await flush();
    expect(mockApi.snapshot).not.toHaveBeenCalledWith("fason-acik");
    first.unmount();
    mockSession.permissions = ["bulut:uretim:oku"];
    DATA["fason-acik"] = { acikSevk: 7, kalanMiktar: "3456.000", firmalar: [] };
    render(<Subcontract />);
    await flush();
    expect(screen.getByText("Fabrika güncellenince gelir")).toBeTruthy();
    DATA["fason-acik"] = FASON;
  });
});

describe("§4 pano stok satırı", () => {
  it("yalnız serbest ve ölü stok; emanet eki yazılmaz", () => {
    expect(areaSummary("ozet.stok", { bitmisMiktar: 100, oluMiktar: 0 })).toBe("Serbest stok 100 m · ölü 0 m");
    expect(areaSummary("ozet.stok", { bitmisMiktar: 100, oluMiktar: 0, emanet: { adet: 3, miktar: 250 } })).toBe("Serbest stok 100 m · ölü 0 m");
  });
});

describe("stok ↔ akış etiketleri", () => {
  const { FlowStrip } = require("../src/ui/pano/production") as typeof import("../src/ui/pano/production");
  it("akıştaki depo çuvaldakileri de saydığını söyler; diğer kolonlar not taşımaz", () => {
    render(<FlowStrip data={{ kolonlar: [{ anahtar: "hamStok", etiket: "Ham stok", adet: 10 }, { anahtar: "depo", etiket: "Depo", adet: 2359 }] }} />);
    expect(screen.getByTestId("akis-not-depo")).toHaveTextContent("çuvaldakiler dahil");
    expect(screen.queryByTestId("akis-not-hamStok")).toBeNull();
  });
  it("stoktaki bitmiş sayı serbest stok olarak adlanır", async () => {
    mockSession.permissions = ["bulut:stok:oku"];
    serve([]);
    render(<Stock />);
    await flush();
    expect(screen.getByText("Serbest stok")).toBeTruthy();
    expect(screen.getByText("50 top · çuvalsız")).toBeTruthy();
  });
});
