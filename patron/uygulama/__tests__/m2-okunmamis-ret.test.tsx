// M2b bekçisi: okunmamış ret rozeti — fabrikanın reddettiği KENDİ gönderimi "Diğer" sekmesinde ve Gönderdiklerim
// satırında sayılır; kayıt açılınca (retGoruldu) söner ve cihaz deposuna yazılır; işlenen kayıt rozet üretmez; 10+ → "9+".
import { act, render, screen } from "@testing-library/react-native";
import type { ReactElement } from "react";
import type { InboxItem } from "../src/api/wire";

const mockInboxList = jest.fn();
const mockCache = { load: jest.fn(async (_k: string, f: () => Promise<unknown>) => ({ data: await f(), offline: false, savedAt: "" })), peek: jest.fn(async () => null) };
const mockSession = {
  api: { inboxList: mockInboxList },
  cache: mockCache, markOnline: jest.fn(),
  permissions: ["bulut:oturum", "bulut:siparis:yaz"] as string[],
  facility: { tesis: { id: "t1", ad: "Örnek Fabrika", saklamaAy: 13 }, hesap: { id: "h1", ad: "Ayşe", eposta: "a@ornek.invalid" }, esitleme: null } as unknown,
  facilities: [] as unknown[], facilityId: "t1", offline: false, offlineSince: null, switchError: null, logout: jest.fn(),
};
jest.mock("../src/state/session", () => ({ useSession: () => mockSession }));
jest.mock("expo-router", () => ({ useRouter: () => ({ push: jest.fn(), back: jest.fn(), canGoBack: () => true }), usePathname: () => "/diger", useLocalSearchParams: () => ({}) }));
jest.mock("react-native-safe-area-context", () => ({ useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }) }));

const More = (require("../app/(app)/(tabs)/diger") as { default: () => ReactElement }).default;
const { okunmamisSay, okunmamisDeposu, retGoruldu, rozetMetni } = require("../src/state/okunmamis-ret") as typeof import("../src/state/okunmamis-ret");

const msg = (mesajId: string, durum: InboxItem["durum"], hesapAdi = "Ayşe"): InboxItem =>
  ({ mesajId, tur: "SIPARIS", durum, govde: {}, hesapAdi, sonuc: { mesaj: "Ürün pasif" }, olusturulma: "2026-11-12T08:00:00.000Z", islenme: null, iptal: null });

const depo = new Map<string, string>();
const memDepo = { get: async (k: string) => depo.get(k) ?? null, set: async (k: string, v: string) => void depo.set(k, v), remove: async (k: string) => void depo.delete(k) };

async function settle() {
  for (let i = 0; i < 3; i++) await act(async () => undefined);
}

beforeEach(() => {
  depo.clear();
  okunmamisDeposu(memDepo);
  mockInboxList.mockReset();
  mockSession.permissions = ["bulut:oturum", "bulut:siparis:yaz"];
});

describe("saf kurallar", () => {
  it("rozet metni: 0 → yok, 1..9 sayı, 10+ → 9+", () => {
    expect(rozetMetni(0)).toBeNull();
    expect(rozetMetni(1)).toBe("1");
    expect(rozetMetni(9)).toBe("9");
    expect(rozetMetni(10)).toBe("9+");
  });

  it("yalnız REDDEDİLEN ve görülmemiş; yönetici yalnız kendi gönderdiğini sayar", () => {
    const me = { ad: "Ayşe", admin: false };
    expect(okunmamisSay([msg("a", "REDDEDILDI")], new Set(), me)).toBe(1);
    expect(okunmamisSay([msg("a", "ISLENDI"), msg("b", "BEKLIYOR")], new Set(), me)).toBe(0);
    expect(okunmamisSay([msg("a", "REDDEDILDI")], new Set(["a"]), me)).toBe(0);
    expect(okunmamisSay([msg("a", "REDDEDILDI", "Bora")], new Set(), { ad: "Ayşe", admin: true })).toBe(0);
  });
});

describe("Diğer → Gönderdiklerim rozeti", () => {
  it("ret → 1; kayıt açılınca → 0 ve cihaz deposuna yazılır", async () => {
    mockInboxList.mockResolvedValue({ kayitlar: [msg("m1", "REDDEDILDI")], sonraki: null });
    render(<More />);
    await settle();
    expect(mockInboxList).toHaveBeenCalledWith({ durum: "REDDEDILDI", limit: 50 });
    expect(screen.getByTestId("gelen-okunmamis")).toBeTruthy();
    expect(screen.getByTestId("menu-gelen-kutusu").props.accessibilityLabel).toBe("Gönderdiklerim, 1 okunmamış hata");
    act(() => retGoruldu({ mesajId: "m1", durum: "REDDEDILDI" }));
    await settle();
    expect(screen.queryByTestId("gelen-okunmamis")).toBeNull();
    expect(JSON.parse(depo.get("patron.ret.goruldu:t1:h1") ?? "[]")).toEqual(["m1"]);
  });

  it("depoda görülmüş kayıt yeniden açılışta rozet üretmez", async () => {
    depo.set("patron.ret.goruldu:t1:h1", JSON.stringify(["m1"]));
    okunmamisDeposu(memDepo);
    mockInboxList.mockResolvedValue({ kayitlar: [msg("m1", "REDDEDILDI")], sonraki: null });
    render(<More />);
    await settle();
    expect(screen.queryByTestId("gelen-okunmamis")).toBeNull();
  });

  it("başarılı (işlenen) kayıt → rozet yok; 12 ret → 9+", async () => {
    mockInboxList.mockResolvedValue({ kayitlar: [], sonraki: null });
    const a = render(<More />);
    await settle();
    expect(screen.queryByTestId("gelen-okunmamis")).toBeNull();
    a.unmount();
    okunmamisDeposu(memDepo);
    mockInboxList.mockResolvedValue({ kayitlar: Array.from({ length: 12 }, (_, i) => msg(`r${i}`, "REDDEDILDI")), sonraki: null });
    render(<More />);
    await settle();
    expect(screen.getByText("9+")).toBeTruthy();
  });

  it("yazma izni yoksa istek yok, rozet yok", async () => {
    mockSession.permissions = ["bulut:oturum", "bulut:siparis:oku"];
    render(<More />);
    await settle();
    expect(mockInboxList).not.toHaveBeenCalled();
  });
});
