// "Diğer" dilimi ekranları: profilden Görünüm'e geçiş · profilde parola yalnız bilgi (fabrikada değişir) ·
// gelen kutusu süzgeci sunucuya gider (istemci süzmez) · Diğer'de bekleyen rozeti · gövde özeti · kısa yoklama.
import { act, fireEvent, render, screen } from "@testing-library/react-native";
import { Text } from "react-native";
import type { InboxItem } from "../src/api/wire";

const mockApi = {
  inboxList: jest.fn(async (_p: unknown) => ({ kayitlar: [], sonraki: null })),
  twoFactorStatus: jest.fn(async () => ({ acik: false, acilis: null })),
};
const mockSession = {
  api: mockApi, permissions: ["bulut:hesap:yonet", "bulut:siparis:yaz"] as string[], facility: { tesis: { id: "t", ad: "Örnek Tekstil", saklamaAy: 13 }, hesap: { ad: "Ayşe Yılmaz", kullaniciAdi: "ayse" }, esitleme: null } as unknown,
  facilityId: "t", offline: false, offlineSince: null, logout: jest.fn(),
};
const mockRemote: { calls: { key: string | null; fetcher: () => Promise<unknown> }[]; data: Record<string, unknown> } = { calls: [], data: {} };
jest.mock("../src/state/session", () => ({ useSession: () => mockSession }));
jest.mock("../src/state/useRemote", () => ({
  useRemote: (key: string | null, fetcher: () => Promise<unknown>) => {
    mockRemote.calls.push({ key, fetcher });
    const prefix = key ? Object.keys(mockRemote.data).find((k) => key === k || key.startsWith(`${k}:`)) : undefined;
    return { data: prefix ? mockRemote.data[prefix] : null, error: null, loading: false, refreshing: false, stale: false, offline: false, savedAt: null, reload: jest.fn() };
  },
}));
const mockRouter = { push: jest.fn(), back: jest.fn(), canGoBack: () => false, replace: jest.fn(), navigate: jest.fn() };
jest.mock("expo-router", () => ({ useRouter: () => mockRouter, usePathname: () => "/x", useLocalSearchParams: () => ({ id: "h1" }) }));
jest.mock("react-native-safe-area-context", () => ({ useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }) }));

// mock'lar kurulduktan SONRA yüklenir.
const Profile = (require("../app/(app)/profil") as typeof import("../app/(app)/profil")).default;
const Inbox = (require("../app/(app)/gelen-kutusu/index") as typeof import("../app/(app)/gelen-kutusu/index")).default;
const More = (require("../app/(app)/diger") as typeof import("../app/(app)/diger")).default;
const { ThemeProvider, useTokens } = require("../src/ui/theme-context") as typeof import("../src/ui/theme-context");
const { inboxBody, inboxOverdue, inboxSummary } = require("../src/ui/diger/inbox-format") as typeof import("../src/ui/diger/inbox-format");
const { inboxRowText } = require("../src/ui/diger/InboxRow") as typeof import("../src/ui/diger/InboxRow");
const { useSettlePoll } = require("../src/ui/diger/useSettlePoll") as typeof import("../src/ui/diger/useSettlePoll");

beforeEach(() => {
  mockRemote.calls = [];
  mockRemote.data = {};
  jest.clearAllMocks();
});

function Probe() {
  return <Text testID="sema">{useTokens().scheme}</Text>;
}

describe("profil: görünüm", () => {
  it("Görünüm satırı özet taşır ve Görünüm ekranını açar (ayarlar orada: gorunum.test)", async () => {
    const store = { get: jest.fn(async () => JSON.stringify({ mode: "koyu", preset: "teal" })), set: jest.fn(async () => undefined) };
    render(<ThemeProvider store={store}><Profile /><Probe /></ThemeProvider>);
    await act(async () => undefined);
    expect(screen.getByTestId("sema").props.children).toBe("dark");
    expect(screen.getByText("Koyu · Turkuaz · Lavanta")).toBeTruthy();
    fireEvent.press(screen.getByTestId("gorunum-git"));
    expect(mockRouter.push).toHaveBeenCalledWith("/gorunum");
  });
  it("lacivert kartta rol: hesap yönetimi izni Yönetici", () => {
    render(<Profile />);
    expect(screen.getByTestId("profil-rol").props.accessibilityLabel).toBe("Rol: Yönetici");
    expect(screen.getByText("Ayşe Yılmaz")).toBeTruthy();
  });
  it("parola telefonda değişmez: satır yalnız bilgi; hesap silme ve fabrika değiştir YOK", () => {
    render(<Profile />);
    expect(screen.getByTestId("parola-bilgi").props.accessibilityLabel).toBe("Parolanı fabrikadaki yöneticin değiştirir");
    expect(screen.getByText("Fabrikadaki yöneticin değiştirir")).toBeTruthy();
    expect(screen.getByTestId("parola-bilgi").props.accessibilityRole).toBeUndefined();
    expect(screen.queryByTestId("parola-degistir")).toBeNull();
    expect(screen.queryByTestId("hesap-sil-git")).toBeNull();
    expect(screen.queryByTestId("fabrika-degistir")).toBeNull();
    expect(screen.getByText("ayse")).toBeTruthy();
    expect(screen.getByTestId("dogrulama-git")).toBeTruthy();
  });
});

describe("gelen kutusu", () => {
  it("⭐ segment süzgeci sunucuya gider: anahtar ve istek `durum` taşır; varsayılan Tümü", async () => {
    render(<Inbox />);
    expect(mockRemote.calls.at(-1)!.key).toBe("gelen-kutusu:HEPSI");
    fireEvent.press(screen.getByTestId("sekme-REDDEDILDI"));
    const last = mockRemote.calls.at(-1)!;
    expect(last.key).toBe("gelen-kutusu:REDDEDILDI");
    await last.fetcher();
    expect(mockApi.inboxList).toHaveBeenLastCalledWith({ durum: "REDDEDILDI", limit: 50 });
    fireEvent.press(screen.getByTestId("sekme-HEPSI"));
    await mockRemote.calls.at(-1)!.fetcher();
    expect(mockApi.inboxList).toHaveBeenLastCalledWith({ durum: undefined, limit: 50 });
  });
  it("Diğer: Gönderdiklerim ikincil giriş — bekleyen sayacı yok; yalnız ret listesi istenir (okunmamış rozeti)", () => {
    render(<More />);
    const keys = mockRemote.calls.map((c) => String(c.key)).filter((k) => k.startsWith("gelen-kutusu"));
    expect([...new Set(keys)]).toEqual(["gelen-kutusu:REDDEDILDI"]);
    expect(screen.queryByTestId("gelen-rozet")).toBeNull();
    expect(screen.getByTestId("menu-gelen-kutusu")).toBeTruthy();
    expect(screen.getByTestId("menu-disa-aktar")).toBeTruthy();
    expect(screen.queryByTestId("menu-hesaplar")).toBeNull();
  });
  it("hata alan kayıt: satırda Hata rozeti + ret nedeni; işlenen kayıtta rozet yok", () => {
    const base = { mesajId: "m1", tur: "CARI" as const, govde: { ad: "Deneme Cari" }, hesapAdi: "A", olusturulma: new Date().toISOString(), islenme: null, iptal: null };
    const red = inboxRowText({ ...base, durum: "REDDEDILDI", sonuc: { mesaj: "Vergi no geçersiz" } } as InboxItem);
    expect(red.rozet).toEqual({ label: "Hata", tone: "danger" });
    expect(red.ikincil).toBe("Vergi no geçersiz");
    expect(inboxRowText({ ...base, durum: "ISLENDI", sonuc: { belgeNo: "C-1" } } as InboxItem).rozet).toBeNull();
  });
  it("gövde özeti ve ayrıntı: kimlik değil ad/sayı; 24 saat uyarısı yalnız bekleyende", () => {
    const order = { tur: "SIPARIS" as const, govde: { cariKartId: "c-uuid", doviz: "USD", termin: "2026-11-20", kalemler: [{ urunId: "u-uuid", miktar: "100.5", birim: "MT" }, { urunId: "u2", miktar: "50", birim: "MT", musteriUrunAdi: "Pamuklu", birimFiyat: "2.5" }] } };
    expect(inboxSummary(order)).toBe("2 kalem · 150,5 mt · termin 20.11.2026");
    const b = inboxBody(order)!;
    expect(JSON.stringify(b)).not.toMatch(/uuid/);
    expect(b.lines.map((l) => l.title)).toEqual(["1. kalem", "Pamuklu"]);
    expect(b.lines[1]!.detail).toBe("Birim fiyat: 2,5 $");
    expect(inboxSummary({ tur: "CARI", govde: { ad: "Deniz Tekstil", roller: { musteri: true, tedarikci: false }, il: "Bursa" } })).toBe("Deniz Tekstil · Müşteri · Bursa");
    const old = new Date(Date.now() - 25 * 3_600_000).toISOString();
    expect(inboxOverdue({ durum: "BEKLIYOR", olusturulma: old })).toBe(true);
    expect(inboxOverdue({ durum: "ISLENDI", olusturulma: old })).toBe(false);
  });
});

describe("kısa yoklama", () => {
  function Poller({ active, reload }: { active: boolean; reload: () => void }) {
    useSettlePoll(active, reload, [3_000, 6_000]);
    return null;
  }
  it("bekleyen varken 3 → 6 sn aralıkla tazeler, bütçe bitince durur; bekleyen yoksa hiç", () => {
    jest.useFakeTimers();
    const reload = jest.fn();
    const r = render(<Poller active reload={reload} />);
    act(() => jest.advanceTimersByTime(2_999));
    expect(reload).not.toHaveBeenCalled();
    act(() => jest.advanceTimersByTime(1));
    expect(reload).toHaveBeenCalledTimes(1);
    act(() => jest.advanceTimersByTime(6_000));
    expect(reload).toHaveBeenCalledTimes(2);
    act(() => jest.advanceTimersByTime(60_000));
    expect(reload).toHaveBeenCalledTimes(2);
    r.unmount();
    const idle = jest.fn();
    render(<Poller active={false} reload={idle} />);
    act(() => jest.advanceTimersByTime(60_000));
    expect(idle).not.toHaveBeenCalled();
    jest.useRealTimers();
  });
});
