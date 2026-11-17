// D5 fabrika kaynaklı bildirim tercihi: konu başlıkları, yalnız atanmış türler, kilit (tercih yetkisi yok), boş durum,
// eski bulut (ayna yok → bugünkü form), başlık başına tümünü aç/kapat, telefondan tercih gönderimi ve ret dönüşü.
import { act, fireEvent, render, screen } from "@testing-library/react-native";
import { useState } from "react";
import { NOTIFICATION_KINDS, type FactoryNotificationPrefs, type NotificationKindInfo, type NotificationSettings, type NotificationSettingsView } from "../src/api/wire";

const mockPrefs = jest.fn();
jest.mock("../src/state/session", () => ({ useSession: () => ({ api: { notificationFactoryPrefs: mockPrefs }, offline: false }) }));

const { toForm } = require("../src/lib/notification-form") as typeof import("../src/lib/notification-form");
const { settingsGroups, topicOf, withPending } = require("../src/lib/notification-topics") as typeof import("../src/lib/notification-topics");
const { NotificationSettingsForm, LOCKED_TEXT, SAVING_TEXT } = require("../src/ui/NotificationSettingsForm") as typeof import("../src/ui/NotificationSettingsForm");
const { useFactoryPrefs } = require("../src/ui/useFactoryPrefs") as typeof import("../src/ui/useFactoryPrefs");

const SETTINGS: NotificationSettings = {
  acik: true,
  turler: Object.fromEntries(NOTIFICATION_KINDS.map((k) => [k, true])) as NotificationSettings["turler"],
  sessiz: { acik: false, baslangic: "22:00", bitis: "07:00" },
  esikler: { hamStokAlt: null, bitmisStokAlt: null, gecikenKalemUst: null, gunlukUretimAlt: null, gunlukUretimSaati: 17, esitlemeGecikmeDk: 60 },
};
const kind = (tur: string, ad: string): NotificationKindInfo => ({ tur: tur as NotificationKindInfo["tur"], ad, aciklama: ad, izinli: true });
const KINDS: NotificationKindInfo[] = [
  kind("yeni-siparis", "Yeni sipariş"),
  kind("geciken-siparis", "Geciken sipariş"),
  kind("stok-esigi", "Stok eşiği"),
  kind("esitleme-gecikti", "Fabrikadan veri gelmiyor"),
];
const factory = (over: Partial<FactoryNotificationPrefs> = {}): FactoryNotificationPrefs => ({
  tercihYetkisi: true,
  turler: [
    { tur: "yeni-siparis", kapali: false, bekliyor: false },
    { tur: "yeni-is-emri", kapali: true, bekliyor: false },
  ],
  guncelleme: "2026-11-17T09:00:00.000Z",
  ...over,
});
const view = (fabrika: FactoryNotificationPrefs | null | undefined): NotificationSettingsView => ({
  etkin: SETTINGS, kaynak: "HESAP", hesap: SETTINGS, tesis: null, turler: KINDS, gonderim: "gercek", webPushAnahtari: null,
  ...(fabrika === undefined ? {} : { fabrika }),
});
const draw = (f: FactoryNotificationPrefs | null | undefined, extra: Partial<Parameters<typeof NotificationSettingsForm>[0]> = {}) =>
  render(<NotificationSettingsForm form={toForm(SETTINGS)} kinds={KINDS} dueDates onChange={jest.fn()} factory={f} {...extra} />);

beforeEach(() => jest.clearAllMocks());

describe("konu başlıkları (saf)", () => {
  it("⭐ katalog sırası: Siparişler · Üretim · Sevkiyat · Stok ve fason · Genel; boş konu yok, bilinmeyen tür Genel'e", () => {
    const g = settingsGroups(KINDS, factory({ turler: [...factory().turler, { tur: "yeni-sevk", kapali: false, bekliyor: false }] }));
    expect(g.map((x) => x.label)).toEqual(["Siparişler", "Üretim", "Sevkiyat", "Stok ve fason", "Genel"]);
    expect(topicOf("bambaska-tur")).toBe("genel");
  });
  it("⭐ ayna varken fabrika türünün bulut satırı çizilmez (çift satır yok); yalnız atanmış fabrika türleri", () => {
    const rows = settingsGroups(KINDS, factory()).flatMap((x) => x.rows);
    expect(rows.filter((r) => r.source === "bulut").map((r) => (r.source === "bulut" ? r.kind.tur : ""))).toEqual(["geciken-siparis", "stok-esigi", "esitleme-gecikti"]);
    expect(rows.filter((r) => r.source === "fabrika").map((r) => (r.source === "fabrika" ? r.tur : ""))).toEqual(["yeni-siparis", "yeni-is-emri"]);
  });
  it("yolda olan istek aynaya bindirilir; bindirme yoksa ayna aynen", () => {
    const f = factory();
    expect(withPending(f, {})).toBe(f);
    expect(withPending(f, { "yeni-siparis": true })!.turler[0]).toEqual({ tur: "yeni-siparis", kapali: true, bekliyor: true });
    expect(withPending(null, { "yeni-siparis": true })).toBeNull();
  });
});

describe("ayar formu — fabrika aynası", () => {
  it("⭐ yalnız atanmış fabrika türleri satır olur; atanmamış (yeni-sevk) görünmez; konu başlıkları çizilir", () => {
    draw(factory());
    expect(screen.getByTestId("fabrika-tur-yeni-siparis").props.value).toBe(true);
    expect(screen.getByTestId("fabrika-tur-yeni-is-emri").props.value).toBe(false);
    expect(screen.queryByTestId("fabrika-tur-yeni-sevk")).toBeNull();
    expect(screen.queryByTestId("tur-yeni-siparis")).toBeNull();
    expect(screen.getByTestId("konu-siparisler")).toBeTruthy();
    expect(screen.getByTestId("konu-uretim")).toBeTruthy();
    expect(screen.queryByTestId("bildirim-turleri")).toBeNull();
    expect(screen.getByTestId("sessiz")).toBeTruthy();
  });
  it("⭐ tercih yetkisi yok → fabrika satırları kilitli + 'yöneticiniz belirler'; dokunuş istek yollamaz", () => {
    const onFactoryChange = jest.fn();
    draw(factory({ tercihYetkisi: false }), { onFactoryChange });
    const row = screen.getByTestId("fabrika-tur-yeni-siparis");
    expect(row.props.disabled).toBe(true);
    expect(screen.getAllByText(LOCKED_TEXT).length).toBeGreaterThan(0);
    expect(screen.getByTestId("fabrika-kilitli")).toBeTruthy();
    // Siparişler konusunda değiştirilebilir tek satır (bulut geciken-siparis) kalır → toplu düğme yok.
    expect(screen.queryByTestId("konu-tumu-siparisler")).toBeNull();
    // Bulut türleri kilitlenmez.
    expect(screen.getByTestId("tur-geciken-siparis").props.disabled).toBe(false);
  });
  it("⭐ hiç atama yoksa sade boş durum; fabrika satırı yok", () => {
    draw(factory({ turler: [] }));
    expect(screen.getByTestId("fabrika-atama-yok")).toBeTruthy();
    expect(screen.queryByTestId(/^fabrika-tur-/)).toBeNull();
    expect(screen.queryByTestId("fabrika-kilitli")).toBeNull();
  });
  it("⭐ eski bulut (fabrika alanı yok ya da null) → bugünkü form: tek blok, yeni-siparis bulut anahtarıyla", () => {
    for (const f of [undefined, null]) {
      const onChange = jest.fn();
      const r = draw(f, { onChange });
      expect(screen.getByTestId("bildirim-turleri")).toBeTruthy();
      expect(screen.queryByTestId(/^konu-/)).toBeNull();
      expect(screen.queryByTestId("fabrika-atama-yok")).toBeNull();
      fireEvent(screen.getByTestId("tur-yeni-siparis"), "valueChange", false);
      expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ turler: expect.objectContaining({ "yeni-siparis": false }) }));
      r.unmount();
    }
  });
  it("⭐ tümünü kapat: bulut satırları forma, fabrika satırları TEK istekle fabrikaya; yalnız değişenler gider", () => {
    const onChange = jest.fn();
    const onFactoryChange = jest.fn();
    draw(factory(), { onChange, onFactoryChange });
    fireEvent.press(screen.getByTestId("konu-tumu-siparisler"));
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ turler: expect.objectContaining({ "geciken-siparis": false }) }));
    expect(onFactoryChange).toHaveBeenCalledTimes(1);
    expect(onFactoryChange).toHaveBeenCalledWith([{ tur: "yeni-siparis", kapali: true }]);
  });
  it("tümünü aç: kapalı satır varken düğme 'Tümünü aç' der ve kapalıları açar", () => {
    const onFactoryChange = jest.fn();
    draw(factory({ turler: [{ tur: "yeni-siparis", kapali: true, bekliyor: false }] }), { onFactoryChange });
    expect(screen.getByText("Tümünü aç")).toBeTruthy();
    fireEvent.press(screen.getByTestId("konu-tumu-siparisler"));
    expect(onFactoryChange).toHaveBeenCalledWith([{ tur: "yeni-siparis", kapali: false }]);
  });
  it("tek satırlı fabrika türü dokunuşu istek olur; bekleyen satır 'kaydediliyor' der", () => {
    const onFactoryChange = jest.fn();
    draw(factory({ turler: [{ tur: "yeni-is-emri", kapali: true, bekliyor: true }] }), { onFactoryChange });
    expect(screen.getByText(SAVING_TEXT)).toBeTruthy();
    fireEvent(screen.getByTestId("fabrika-tur-yeni-is-emri"), "valueChange", true);
    expect(onFactoryChange).toHaveBeenCalledWith([{ tur: "yeni-is-emri", kapali: false }]);
  });
});

/** Ekranın bağlantısı: kanca + form; `adopt` görünümü değiştirir (ekrandaki `setView`). */
function Harness(p: { initial: NotificationSettingsView; reload?: () => void }) {
  const [v, setV] = useState<NotificationSettingsView | null>(p.initial);
  const prefs = useFactoryPrefs(v, setV, p.reload ?? jest.fn());
  return (
    <>
      <NotificationSettingsForm form={toForm(SETTINGS)} kinds={KINDS} dueDates onChange={jest.fn()}
        factory={prefs.factory} onFactoryChange={(c) => void prefs.change(c)} factoryBusy={prefs.busy} />
      {prefs.error ? <TextError text={prefs.error} /> : null}
    </>
  );
}
function TextError(p: { text: string }) {
  const { Text } = require("react-native") as typeof import("react-native");
  return <Text testID="tercih-hata">{p.text}</Text>;
}

describe("telefondan tercih gönderimi", () => {
  it("⭐ istek yoldayken satır istenen değeri 'kaydediliyor' gösterir; bulut kabul edince yanıt görünüme alınır", async () => {
    let resolve!: (v: NotificationSettingsView) => void;
    mockPrefs.mockReturnValue(new Promise<NotificationSettingsView>((r) => (resolve = r)));
    render(<Harness initial={view(factory())} />);
    await act(async () => fireEvent(screen.getByTestId("fabrika-tur-yeni-siparis"), "valueChange", false));
    expect(mockPrefs).toHaveBeenCalledWith([{ tur: "yeni-siparis", kapali: true }]);
    expect(screen.getByTestId("fabrika-tur-yeni-siparis").props.value).toBe(false);
    expect(screen.getByText(SAVING_TEXT)).toBeTruthy();
    const accepted = view(factory({ turler: [{ tur: "yeni-siparis", kapali: true, bekliyor: true }, factory().turler[1]!] }));
    await act(async () => resolve(accepted));
    expect(screen.getByTestId("fabrika-tur-yeni-siparis").props.value).toBe(false);
    expect(screen.getByText(SAVING_TEXT)).toBeTruthy();
  });
  it("⭐ ret (bulut 403/409/ağ) → satır eski hâline döner, hata gösterilir", async () => {
    mockPrefs.mockRejectedValue(new Error("Bu türün tercihi yöneticinizde"));
    render(<Harness initial={view(factory())} />);
    await act(async () => fireEvent(screen.getByTestId("fabrika-tur-yeni-siparis"), "valueChange", false));
    expect(screen.getByTestId("fabrika-tur-yeni-siparis").props.value).toBe(true);
    expect(screen.queryByText(SAVING_TEXT)).toBeNull();
    expect(screen.getByTestId("tercih-hata")).toBeTruthy();
  });
  it("fabrika bekleyen isteği işleyene dek ayar yeniden okunur; bekleyen yokken yoklama yok", () => {
    jest.useFakeTimers();
    try {
      const reload = jest.fn();
      const r = render(<Harness initial={view(factory({ turler: [{ tur: "yeni-siparis", kapali: true, bekliyor: true }] }))} reload={reload} />);
      act(() => void jest.advanceTimersByTime(10_000));
      expect(reload).toHaveBeenCalledTimes(1);
      r.unmount();
      const idle = jest.fn();
      render(<Harness initial={view(factory())} reload={idle} />);
      act(() => void jest.advanceTimersByTime(30_000));
      expect(idle).not.toHaveBeenCalled();
    } finally {
      jest.useRealTimers();
    }
  });
});
