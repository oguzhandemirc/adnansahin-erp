// Sipariş "Üretim" bekçisi: liste sütunu fabrikanın `uretim.metin`ini AYNEN basar (eski fabrika → "—"), varsayılan
// görünümde; sipariş ayrıntısındaki "İş emirleri" bölümü `is-emri` listesini SUNUCUNUN üyelik süzgeciyle ister
// (beyan yoksa ya da üretim izni yoksa istemez, bölüm yok), iptal/devredilmiş iş emrini çizmez, satır iş emri
// ayrıntısını açar; bağlı iş emri yoksa "İş emri yok". Örnek veride sipariş cümlesi örnek iş emirleriyle tutarlı.
import { act, fireEvent, render, screen, within } from "@testing-library/react-native";
import type { ReactElement } from "react";

const mockList = jest.fn();
const mockRecord = jest.fn();
const mockCache = { load: jest.fn(async (_k: string, f: () => Promise<unknown>) => ({ data: await f(), offline: false, savedAt: "" })), peek: jest.fn(async () => null) };
const mockSession = {
  api: { list: mockList, record: mockRecord, snapshot: jest.fn(), viewPref: jest.fn(), viewPrefSet: jest.fn() },
  cache: mockCache, markOnline: jest.fn(),
  permissions: [] as string[], offline: false, offlineSince: null as string | null, facility: null as unknown, switchError: null as string | null,
};
const mockRouter = { push: jest.fn(), replace: jest.fn(), back: jest.fn(), navigate: jest.fn(), setParams: jest.fn(), canGoBack: () => true };
let mockParams: Record<string, string> = {};
jest.mock("../src/state/session", () => ({ useSession: () => mockSession }));
jest.mock("expo-router", () => ({ useRouter: () => mockRouter, usePathname: () => "/siparisler", useLocalSearchParams: () => mockParams }));
jest.mock("react-native-safe-area-context", () => ({ useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }) }));

const Orders = (require("../app/(app)/(tabs)/siparisler/index") as { default: () => ReactElement }).default;
const OrderDetail = (require("../app/(app)/siparisler/[id]") as { default: () => ReactElement }).default;
const { uretimMetni } = require("../src/ui/siparis/OrderRow") as typeof import("../src/ui/siparis/OrderRow");
const { workOrderRowText } = require("../src/ui/siparis/OrderWorkOrders") as typeof import("../src/ui/siparis/OrderWorkOrders");
const G = require("../src/ui/is-emri/gorunum") as typeof import("../src/ui/is-emri/gorunum");
const { LIST_ID_FILTERS, LIST_MEMBER_FILTERS, LIST_SEARCH, LIST_SORT } = require("../src/api/wire") as typeof import("../src/api/wire");
const { ORNEK_LISTE } = require("../src/ornek/veri") as typeof import("../src/ornek/veri");

const SID = "11111111-1111-4111-8111-111111111111";
const rec = (id: string, kayit: Record<string, unknown>) => ({ id, kayit, surum: "2026-11-13T09:00:00.000Z" });
const page = (...kayitlar: unknown[]) => ({ kayitlar, sonraki: null });
const LISTE = {
  kimlikSuzgecleri: LIST_ID_FILTERS, aranabilir: Object.keys(LIST_SEARCH),
  siralama: Object.fromEntries(Object.entries(LIST_SORT).map(([p, a]) => [p, Object.keys(a)])),
};
/** Yeni bulut: `is-emri` üyelik süzgeci beyanlı. */
const BEYANLI = { tesis: { id: "t1" }, hesap: { id: "h1" }, liste: { ...LISTE, uyelikSuzgecleri: Object.fromEntries(Object.entries(LIST_MEMBER_FILTERS).map(([k, p]) => [k, Object.keys(p)])) } };
/** Eski bulut: üyelik süzgeci beyanı yok (parametreyi yok sayıp süzülmemiş liste döndürürdü). */
const BEYANSIZ = { tesis: { id: "t1" }, hesap: { id: "h1" }, liste: LISTE };

const SIPARIS = { siparisNo: "SIP-2026-0451", musteriAdi: "Örnek Tekstil A.Ş.", durum: "APPROVED", acikMiktar: 2400, kalemSayisi: 1, siparisTarihi: "2026-11-01" };
const IE_FASON = { isEmriNo: "IE-2026-0318", durum: "IN_PROGRESS", acik: true, asama: "fason", fasonFirmaAdi: "Örnek Boyahane", topSayisi: 18, metre: 2160, siparisIdleri: [SID] };
const IE_KURSUN = { isEmriNo: "IE-2026-0317", durum: "IN_PROGRESS", acik: true, asama: "kursun", topSayisi: 9, metre: 1085, siparisIdleri: [SID] };
const IE_BITTI = { isEmriNo: "IE-2026-0312", durum: "COMPLETED", acik: false, asama: null, topSayisi: 16, metre: 1920, siparisIdleri: [SID] };
const IE_IPTAL = { isEmriNo: "IE-2026-0300", durum: "CANCELLED", acik: false, asama: null, siparisIdleri: [SID] };
const IE_DEVIR = { isEmriNo: "IE-2026-0301", durum: "SUPERSEDED", acik: false, asama: null, siparisIdleri: [SID] };

async function settle() {
  for (let i = 0; i < 4; i++) await act(async () => undefined);
}

/** `api.list` çağrılarından `is-emri` olanlar. */
const isEmriCagrilari = () => mockList.mock.calls.filter((c) => c[0] === "is-emri");

beforeEach(() => {
  mockParams = {};
  mockSession.facility = BEYANLI;
  mockSession.permissions = ["bulut:oturum", "bulut:siparis:oku", "bulut:uretim:oku"];
  mockList.mockReset();
  mockRecord.mockReset();
  mockRouter.push.mockReset();
  mockSession.api.viewPref.mockResolvedValue({ anahtar: "tablo.siparis", deger: null, guncelleme: null });
});

describe("§1 liste: Üretim sütunu", () => {
  it("hücre fabrikanın cümlesini aynen basar; alan yoksa (eski fabrika) ya da bozuksa \"—\"", () => {
    expect(uretimMetni({ uretim: { tur: "FASON", metin: "Fasonda – Örnek Boyahane · +1 yerde daha" } })).toBe("Fasonda – Örnek Boyahane · +1 yerde daha");
    expect(uretimMetni({ uretim: { tur: "TAMAMLANDI", metin: "Tamamlandı" } })).toBe("Tamamlandı");
    expect(uretimMetni({})).toBe("—");
    expect(uretimMetni({ uretim: null })).toBe("—");
    expect(uretimMetni({ uretim: { tur: "ASAMA" } })).toBe("—");
    expect(uretimMetni({ uretim: "Kurşun" })).toBe("—");
  });

  it("varsayılan görünümde: No · Müşteri · Sevk / Toplam · Üretim · Durum; yeni fabrika metni, eski fabrika \"—\"", async () => {
    mockList.mockResolvedValue(page(
      rec("s1", { ...SIPARIS, uretim: { tur: "FASON", metin: "Fasonda – Örnek Boyahane" } }),
      rec("s2", { ...SIPARIS, siparisNo: "SIP-2026-0450" }),
    ));
    render(<Orders />);
    await settle();
    for (const key of ["no", "musteri", "sevkToplam", "uretim", "durum"]) expect(screen.getByTestId(`siparis-sutun-${key}`)).toBeTruthy();
    expect(within(screen.getByTestId("siparis-sutun-uretim")).getByText("Üretim")).toBeTruthy();
    expect(screen.getByText("Fasonda – Örnek Boyahane")).toBeTruthy();
    expect(screen.getByTestId("siparis-satir-s1").props.accessibilityLabel).toContain("Üretim durumu: Fasonda – Örnek Boyahane");
    expect(screen.getByTestId("siparis-satir-s2").props.accessibilityLabel).toContain("Üretim durumu: —");
  });
});

describe("§2 ayrıntı: İş emirleri bölümü", () => {
  beforeEach(() => {
    mockParams = { id: SID };
    mockRecord.mockResolvedValue(rec(SID, { ...SIPARIS, uretim: { tur: "FASON", metin: "Fasonda – Örnek Boyahane · +1 yerde daha" } }));
  });

  it("sunucu süzgeciyle istenir; iptal ve devredilmiş çizilmez; satır no · nerede · top/metre · durum; dokununca iş emri", async () => {
    mockList.mockImplementation(async (p: string) => (p === "is-emri" ? page(rec("w1", IE_FASON), rec("w0", IE_IPTAL), rec("w2", IE_KURSUN), rec("wd", IE_DEVIR), rec("w3", IE_BITTI)) : page()));
    render(<OrderDetail />);
    await settle();
    expect(isEmriCagrilari().length).toBeGreaterThan(0);
    for (const c of isEmriCagrilari()) expect(c[1]).toMatchObject({ siparisId: SID });
    const blok = screen.getByTestId("siparis-is-emirleri");
    expect(within(blok).getByText("IE-2026-0318")).toBeTruthy();
    // 2026-11-20: dört özellikli tablo — varsayılan sütunlar no · nerede · top · metre · durum.
    expect(within(blok).getByText("Fasonda – Örnek Boyahane")).toBeTruthy();
    expect(within(blok).getByText("Kurşun")).toBeTruthy();
    for (const id of ["siparis-is-emri-tablo-ara-ac", "siparis-is-emri-tablo-suzgec", "siparis-is-emri-tablo-sutunlar", "siparis-is-emri-tablo-sutun-metre"]) expect(screen.getByTestId(id)).toBeTruthy();
    expect(within(blok).getAllByText(/^Tamamlandı/).length).toBeGreaterThan(0); // kapanmış: yer + durum rozeti
    expect(within(blok).queryByText("IE-2026-0300")).toBeNull();
    expect(within(blok).queryByText("IE-2026-0301")).toBeNull();
    expect(screen.queryByTestId("siparis-is-emri-w0")).toBeNull();
    expect(screen.queryByTestId("siparis-is-emri-wd")).toBeNull();
    expect(screen.getByTestId("siparis-is-emri-w1").props.accessibilityLabel).toBe("İş emri no: IE-2026-0318, Şu an nerede: Fasonda – Örnek Boyahane, Top: 18, Metre: 2.160, Durum: Üretimde");
    fireEvent.press(screen.getByTestId("siparis-is-emri-w2"));
    expect(mockRouter.push).toHaveBeenCalledWith({ pathname: "/is-emirleri/[id]", params: { id: "w2" } });
    // Bilgiler bloğunda siparişin üretim cümlesi.
    expect(screen.getByTestId("bilgi-uretim").props.accessibilityLabel).toBe("Üretim, Fasonda – Örnek Boyahane · +1 yerde daha");
  });

  it("bağlı iş emri yoksa (ya da hepsi iptal) \"İş emri yok\"", async () => {
    mockList.mockImplementation(async (p: string) => (p === "is-emri" ? page(rec("w0", IE_IPTAL)) : page()));
    render(<OrderDetail />);
    await settle();
    expect(within(screen.getByTestId("siparis-is-emirleri")).getByText("İş emri yok")).toBeTruthy();
    expect(screen.queryByTestId("siparis-is-emri-w0")).toBeNull();
  });

  it("üyelik süzgeci beyanı yok (eski bulut) → is-emri listesi istenmez, bölüm yok", async () => {
    mockSession.facility = BEYANSIZ;
    mockList.mockResolvedValue(page(rec("w1", IE_FASON)));
    render(<OrderDetail />);
    await settle();
    expect(screen.getByTestId("siparis-bilgiler")).toBeTruthy();
    expect(isEmriCagrilari()).toHaveLength(0);
    expect(screen.queryByTestId("siparis-is-emirleri")).toBeNull();
    expect(screen.queryByText("İş emri yok")).toBeNull();
  });

  it("üretim okuma izni yok → istenmez, bölüm yok", async () => {
    mockSession.permissions = ["bulut:oturum", "bulut:siparis:oku"];
    mockList.mockResolvedValue(page(rec("w1", IE_FASON)));
    render(<OrderDetail />);
    await settle();
    expect(isEmriCagrilari()).toHaveLength(0);
    expect(screen.queryByTestId("siparis-is-emirleri")).toBeNull();
  });

  it("eski fabrika siparişinde `uretim` yok → Bilgiler'de Üretim satırı yok", async () => {
    mockRecord.mockResolvedValue(rec(SID, SIPARIS));
    mockList.mockResolvedValue(page());
    render(<OrderDetail />);
    await settle();
    expect(screen.getByTestId("siparis-bilgiler")).toBeTruthy();
    expect(screen.queryByTestId("bilgi-uretim")).toBeNull();
  });
});

describe("§3 görünüm yardımcıları ve örnek veri", () => {
  it("yerMetni: açıkta kaba aşama, fasonda firma; kapalıda Tamamlandı; iptalMi iptal + devredilmiş", () => {
    expect(G.yerMetni(IE_FASON)).toBe("Fasonda – Örnek Boyahane");
    expect(G.yerMetni({ ...IE_FASON, fasonFirmaAdi: null })).toBe("Fasonda");
    expect(G.yerMetni(IE_KURSUN)).toBe("Kurşun");
    expect(G.yerMetni(IE_BITTI)).toBe("Tamamlandı");
    expect(G.iptalMi(IE_IPTAL) && G.iptalMi(IE_DEVIR)).toBe(true);
    expect(G.iptalMi(IE_FASON) || G.iptalMi(IE_BITTI)).toBe(false);
    expect(G.topMetreMetni({})).toBe("—");
    expect(workOrderRowText(rec("w3", IE_BITTI) as never).durum.label).toBe("Tamamlandı");
  });

  it("örnek siparişlerin `uretim`i örnek iş emirleriyle tutarlı", () => {
    const L = ORNEK_LISTE();
    const ieler = L["is-emri"]!.map((r) => r.kayit as Record<string, unknown>);
    for (const s of L.siparis!) {
      const u = (s.kayit as { uretim?: { tur?: string; metin?: string } }).uretim;
      expect(u?.metin).toBeTruthy();
      const bagli = ieler.filter((k) => G.siparisIdleri(k).includes(s.id) && !G.iptalMi(k));
      if (bagli.length === 0) expect(u!.tur).toBe("IS_EMRI_YOK");
      else if (bagli.every((k) => k.durum === "COMPLETED")) expect(u!.metin).toBe("Tamamlandı");
      else if (u!.tur === "FASON") expect(bagli.some((k) => u!.metin!.startsWith(G.yerMetni(k)))).toBe(true);
      else expect(["ASAMA", "HAZIR"]).toContain(u!.tur);
    }
  });
});
