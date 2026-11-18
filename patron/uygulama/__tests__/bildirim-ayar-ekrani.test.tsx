// Saha kusuru 2026-11-18 (Kusur 1): Bildirim Ayarları EKRANI, sunucunun gerçekte döndürdüğü biçimle çizilir.
//   · ayna VAR + tercih yetkisi YOK + yalnız `yeni-siparis` atanmış → yalnız o fabrika satırı (kilitli + "yöneticiniz
//     belirler"); atanmamış fabrika türlerinin METNİ ekranda YOK; tek bloklu eski form yok.
//   · ayna YOK (fabrika kipi, atama henüz gelmedi; ya da bulut kipi) → eski form yalnız sunucunun `turler` listesini
//     (bulutun KENDİ türleri) çizer; fabrika kaynaklı türlerin metni ekranda YOK.
// `turler` listesi sunucu servisiyle aynı kuraldan (`cloudManagedKinds`) gelir — sunucu bekçisi `test_bildirim_tercih_aynasi` §2f.
import { render, screen } from "@testing-library/react-native";
import { NOTIFICATION_KINDS, type FactoryNotificationPrefs, type NotificationKindInfo, type NotificationSettings, type NotificationSettingsView } from "../src/api/wire";

let mockView: NotificationSettingsView;
jest.mock("../src/state/session", () => ({ useSession: () => ({ api: { notificationFactoryPrefs: jest.fn() }, permissions: ["bulut:siparis:oku", "bulut:ozet:oku"], offline: false }) }));
jest.mock("../src/state/useRemote", () => ({
  useRemote: () => ({ data: mockView, error: null, loading: false, refreshing: false, stale: false, offline: false, savedAt: null, reload: jest.fn() }),
}));
jest.mock("../src/ui/pano/useSnapshot", () => ({ useSnapshot: () => ({ data: null }) }));
jest.mock("../src/ui/NotificationDevices", () => ({ NotificationDevices: () => null, NotificationHistory: () => null }));
jest.mock("../src/ui/Frame", () => {
  const { View } = require("react-native");
  return { Screen: ({ children }: { children: unknown }) => <View>{children}</View> };
});

const Notifications = (require("../app/(app)/bildirimler") as { default: () => React.JSX.Element }).default;

const SETTINGS: NotificationSettings = {
  acik: true,
  turler: Object.fromEntries(NOTIFICATION_KINDS.map((k) => [k, true])) as NotificationSettings["turler"],
  sessiz: { acik: false, baslangic: "22:00", bitis: "07:00" },
  esikler: { hamStokAlt: null, bitmisStokAlt: null, gecikenKalemUst: null, gunlukUretimAlt: null, gunlukUretimSaati: 17, esitlemeGecikmeDk: 60 },
};

/** Sunucunun KENDİ yönettiği türler (bulut `catalog/notifications.ts` `CLOUD_OWN_KINDS` ile aynı küme). */
const CLOUD_OWN = ["gelen-kutusu-sonucu", "stok-esigi", "geciken-siparis", "gunluk-uretim", "esitleme-gecikti"] as const;
const { notificationKind } = require("../src/lib/labels/diger") as typeof import("../src/lib/labels/diger");
/** Sunucu etiketleri = uygulama sözlüğü (bekçi `labels.test.ts` §5). */
const info = (tur: string): NotificationKindInfo => ({ tur: tur as NotificationKindInfo["tur"], ad: notificationKind(tur).ad, aciklama: "açıklama", izinli: true });
const view = (turler: readonly string[], fabrika: FactoryNotificationPrefs | null): NotificationSettingsView => ({
  etkin: SETTINGS, kaynak: "HESAP", hesap: SETTINGS, tesis: null, turler: turler.map(info), gonderim: "gercek", webPushAnahtari: null, fabrika,
});

/** Atanmamış fabrika türlerinin ekrandaki adları (uygulama sözlüğü). */
const UNASSIGNED_TEXTS = ["Sipariş iptali", "Sipariş tamamlandı", "Top fire / iptal", "Sevkiyat çıktı", "Sevkiyat iptali", "Mal kabul girişi", "Fasona gönderildi", "Fasondan döndü", "Gün sonu özeti", "Yeni iş emri", "Yeni sevk"];

describe("Bildirim Ayarları ekranı — saha durumu", () => {
  it("⭐ ayna var + tercih yetkisi yok + yalnız yeni-siparis: tek kilitli fabrika satırı, atanmamış türlerin metni YOK", () => {
    mockView = view(CLOUD_OWN, { tercihYetkisi: false, turler: [{ tur: "yeni-siparis", kapali: false, bekliyor: false }], guncelleme: "2026-11-18T00:20:00.000Z" });
    render(<Notifications />);
    const row = screen.getByTestId("fabrika-tur-yeni-siparis");
    expect(row.props.value).toBe(true);
    expect(row.props.disabled).toBe(true);
    expect(screen.getByTestId("fabrika-kilitli")).toBeTruthy();
    expect(screen.getAllByText(/Bildirim tercihlerinizi yöneticiniz belirler/).length).toBeGreaterThan(0);
    expect(screen.queryByTestId("bildirim-turleri")).toBeNull();
    expect(screen.queryAllByTestId(/^fabrika-tur-/).map((n) => n.props.testID)).toEqual(["fabrika-tur-yeni-siparis"]);
    for (const text of UNASSIGNED_TEXTS) expect(screen.queryByText(text)).toBeNull();
    // Bulutun kendi türleri konu başlıkları altında kalır.
    expect(screen.getByTestId("tur-stok-esigi")).toBeTruthy();
    expect(screen.queryByTestId("tur-yeni-siparis")).toBeNull();
  });

  it("⭐ ayna yok (fabrika kipi, atama henüz gelmedi): eski form yalnız bulutun kendi türleri; fabrika türü metni YOK", () => {
    mockView = view(CLOUD_OWN, null);
    render(<Notifications />);
    expect(screen.getByTestId("bildirim-turleri")).toBeTruthy();
    // Geciken sipariş yalnız fabrika termin türevi gönderiyorsa çizilir (burada özet yok).
    expect(screen.queryAllByTestId(/^tur-/).map((n) => n.props.testID)).toEqual(CLOUD_OWN.filter((k) => k !== "geciken-siparis").map((k) => `tur-${k}`));
    for (const text of [...UNASSIGNED_TEXTS, "Yeni sipariş"]) expect(screen.queryByText(text)).toBeNull();
  });

  it("bulut kipi (ayna yok): yeni-siparis bulut türü olarak kalır", () => {
    mockView = view([...CLOUD_OWN, "yeni-siparis"], null);
    render(<Notifications />);
    expect(screen.getByTestId("tur-yeni-siparis")).toBeTruthy();
    for (const text of UNASSIGNED_TEXTS) expect(screen.queryByText(text)).toBeNull();
  });

  it("⭐ eski sunucu bütün türleri yollasa da ayna yokken fabrika kaynaklı türler çizilmez (yeni-siparis hariç)", () => {
    mockView = view(NOTIFICATION_KINDS, null);
    render(<Notifications />);
    for (const text of UNASSIGNED_TEXTS) expect(screen.queryByText(text)).toBeNull();
    expect(screen.getByTestId("tur-yeni-siparis")).toBeTruthy();
  });

  it("sessiz saat anahtarı gerçek etkin ayarı gösterir (kapalı → kapalı)", () => {
    mockView = view(CLOUD_OWN, null);
    render(<Notifications />);
    expect(screen.getByTestId("sessiz").props.value).toBe(false);
  });
});
