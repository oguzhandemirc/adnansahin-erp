// D5 bildirim listesi: okunmamış vurgu + nokta, dokununca okundu + rota, "Tümünü okundu say", rozet sayısı,
// eski bulut (okunma/okunmamis yok) bugünkü liste; push dokunuşu okundu sayar; fabrika rotaları güvenle açılır.
import { act, fireEvent, render, screen } from "@testing-library/react-native";

const mockPush = jest.fn();
const mockRead = jest.fn();
const mockReadAll = jest.fn();
const mockList: { data: unknown; reload: jest.Mock } = { data: null, reload: jest.fn() };
jest.mock("../src/state/session", () => ({
  useSession: () => ({ api: { notificationRead: mockRead, notificationReadAll: mockReadAll, notificationHistory: jest.fn() }, offline: false }),
}));
jest.mock("../src/state/useRemote", () => ({ useRemote: () => mockList }));
jest.mock("../src/push/register", () => ({ registerThisDevice: jest.fn() }));
jest.mock("expo-router", () => ({ useRouter: () => ({ push: mockPush }) }));

const { NotificationHistory, isUnread } = require("../src/ui/NotificationDevices") as typeof import("../src/ui/NotificationDevices");
const okunmamis = require("../src/state/bildirim-okunmamis") as typeof import("../src/state/bildirim-okunmamis");
const { safeRoute } = require("../src/lib/notification-form") as typeof import("../src/lib/notification-form");
const { openNotification } = require("../src/push/taps") as typeof import("../src/push/taps");

const ID1 = "00000000-0000-4000-8000-0000000000a1";
const ID2 = "00000000-0000-4000-8000-0000000000a2";
const IE = "11111111-2222-4333-8444-555555555555";
const item = (id: string, okunma: string | null | undefined, rota: string | null = null) => ({
  id, tur: "yeni-is-emri", baslik: "Yeni iş emri açıldı", metin: "Mehmet Yılmaz · İş emri İE-1", rota, durum: "GONDERILDI", atlamaNedeni: null,
  olusturulma: "2026-11-17T09:00:00.000Z", gonderilme: "2026-11-17T09:00:01.000Z", ...(okunma === undefined ? {} : { okunma }),
});

beforeEach(() => {
  jest.clearAllMocks();
  okunmamis.okunmamisAyarla(null, { listeyiTazele: false });
});

describe("bildirim listesi — okundu", () => {
  it("⭐ okunmamış satır vurgulu + nokta; yazar adı metinde; sayaç listeden gelir", () => {
    mockList.data = { kayitlar: [item(ID1, null), item(ID2, "2026-11-17T10:00:00.000Z")], sonraki: null, okunmamis: 1 };
    render(<NotificationHistory />);
    expect(screen.getByTestId(`bildirim-yeni-${ID1}`)).toBeTruthy();
    expect(screen.queryByTestId(`bildirim-yeni-${ID2}`)).toBeNull();
    expect(screen.getAllByText("Mehmet Yılmaz · İş emri İE-1").length).toBe(2);
    expect(okunmamis.bildirimRozetMetni(1)).toBe("1");
  });

  it("⭐ dokununca okundu ucu çağrılır, nokta söner, rota açılır (fabrika iş emri rotası)", async () => {
    mockRead.mockResolvedValue({ guncellenen: 1, okunmamis: 0 });
    mockList.data = { kayitlar: [item(ID1, null, `/is-emirleri/${IE}`)], sonraki: null, okunmamis: 1 };
    render(<NotificationHistory />);
    await act(async () => fireEvent.press(screen.getByTestId(`bildirim-${ID1}`)));
    expect(mockRead).toHaveBeenCalledWith(ID1);
    expect(mockPush).toHaveBeenCalledWith(`/is-emirleri/${IE}`);
    expect(screen.queryByTestId(`bildirim-yeni-${ID1}`)).toBeNull();
  });

  it("okunmuş satıra dokunmak okundu ucunu çağırmaz", async () => {
    mockList.data = { kayitlar: [item(ID2, "2026-11-17T10:00:00.000Z", "/siparisler")], sonraki: null, okunmamis: 0 };
    render(<NotificationHistory />);
    await act(async () => fireEvent.press(screen.getByTestId(`bildirim-${ID2}`)));
    expect(mockRead).not.toHaveBeenCalled();
    expect(mockPush).toHaveBeenCalledWith("/siparisler");
  });

  it("⭐ 'Tümünü okundu say' yalnız okunmamış varken; basınca hepsi söner, sayaç sunucudan", async () => {
    mockReadAll.mockResolvedValue({ guncellenen: 1, okunmamis: 0 });
    mockList.data = { kayitlar: [item(ID1, null)], sonraki: null, okunmamis: 1 };
    render(<NotificationHistory />);
    await act(async () => fireEvent.press(screen.getByTestId("bildirim-tumu-okundu")));
    expect(mockReadAll).toHaveBeenCalledTimes(1);
    expect(screen.queryByTestId(`bildirim-yeni-${ID1}`)).toBeNull();
    expect(screen.queryByTestId("bildirim-tumu-okundu")).toBeNull();
    mockList.data = { kayitlar: [item(ID2, "2026-11-17T10:00:00.000Z")], sonraki: null, okunmamis: 0 };
    render(<NotificationHistory />);
    expect(screen.queryByTestId("bildirim-tumu-okundu")).toBeNull();
  });

  it("eski bulut (okunma/okunmamis yok): vurgu yok, düğme yok, okundu çağrısı yok", async () => {
    mockList.data = { kayitlar: [item(ID1, undefined, "/siparisler")], sonraki: null };
    render(<NotificationHistory />);
    expect(screen.queryByTestId(`bildirim-yeni-${ID1}`)).toBeNull();
    expect(screen.queryByTestId("bildirim-tumu-okundu")).toBeNull();
    await act(async () => fireEvent.press(screen.getByTestId(`bildirim-${ID1}`)));
    expect(mockRead).not.toHaveBeenCalled();
  });

  it("atlanan satır okunmamış sayılmaz", () => {
    expect(isUnread({ ...item(ID1, null), durum: "ATLANDI" } as never)).toBe(false);
  });
});

describe("okunmamış sayısı deposu", () => {
  it("rozet metni: 0/null yok, 10+ → 9+; eski bulut (undefined) → null", () => {
    expect(okunmamis.bildirimRozetMetni(0)).toBeNull();
    expect(okunmamis.bildirimRozetMetni(null)).toBeNull();
    expect(okunmamis.bildirimRozetMetni(12)).toBe("9+");
    okunmamis.okunmamisAyarla(undefined);
    expect(okunmamis.bildirimRozetMetni(null)).toBeNull();
  });
  it("yoklama sayıyı okur; hata son sayıyı korur", async () => {
    await okunmamis.okunmamisTazele({ notificationHistory: async () => ({ kayitlar: [], sonraki: null, okunmamis: 3 }) });
    let n: number | null = null;
    const Probe = () => {
      n = okunmamis.useBildirimOkunmamis();
      return null;
    };
    render(<Probe />);
    expect(n).toBe(3);
    await okunmamis.okunmamisTazele({ notificationHistory: async () => Promise.reject(new Error("ağ")) });
    expect(n).toBe(3);
  });
});

describe("push dokunuşu ve fabrika rotaları", () => {
  it("⭐ push'a dokununca bildirim okundu sayılır ve iş emri ayrıntısı açılır", async () => {
    const onRead = jest.fn();
    const push = jest.fn();
    const ok = await openNotification({ bildirimId: ID1, rota: `/is-emirleri/${IE}`, tesisId: "t1" }, { facilityId: "t1", push, onRead });
    expect(ok).toBe(true);
    expect(onRead).toHaveBeenCalledWith(ID1);
    expect(push).toHaveBeenCalledWith(`/is-emirleri/${IE}`);
  });
  it("başka tesisin bildirimi okunmaz ve açılmaz", async () => {
    const onRead = jest.fn();
    expect(await openNotification({ bildirimId: ID1, rota: "/siparisler", tesisId: "t2" }, { facilityId: "t1", push: jest.fn(), onRead })).toBe(false);
    expect(onRead).not.toHaveBeenCalled();
  });
  it("⭐ yeni-sevk rotası sevkiyat ayrıntısına; kimlik UUID değilse açılmaz", () => {
    expect(safeRoute(`/sevkiyat/${IE}`)).toBe(`/kayit/sevkiyat/${IE}`);
    expect(safeRoute(`/is-emirleri/${IE}`)).toBe(`/is-emirleri/${IE}`);
    expect(safeRoute("/is-emirleri/abc")).toBeNull();
    expect(safeRoute("/sevkiyat/abc")).toBeNull();
    expect(safeRoute("/is-emirleri")).toBeNull();
    expect(safeRoute("/sevkiyat")).toBe("/sevkiyat");
  });
});
