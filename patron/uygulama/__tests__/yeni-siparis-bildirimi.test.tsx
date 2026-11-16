// "Yeni sipariş" bildirim türü (bulut 0dfbefdc, 2026-11-17): tel tipinde var, etiketi var, Bildirim Ayarları'nda
// görünür ve kapatılabilir, dokununca sunucunun gönderdiği `/siparisler/<id>` yolu açılır (telefon ve web aynı süzgeç).
// NEGATİF SONDA (2026-11-17, geri alındı): diger.ts'ten "yeni-siparis" etiketi silinince "⭐ tür tel tipinde ve
// etiketli" ❌ (tsc de kırmızı); safeRoute RECORD_ROUTES'tan "/siparisler" çıkarılınca "⭐ dokununca…" ❌.
import { fireEvent, render, screen } from "@testing-library/react-native";
import { NOTIFICATION_KINDS, type NotificationKindInfo, type NotificationSettings } from "../src/api/wire";
import { NOTIFICATION_KIND, notificationKind } from "../src/lib/labels/diger";
import { safeRoute, toForm } from "../src/lib/notification-form";
import { NotificationSettingsForm } from "../src/ui/NotificationSettingsForm";

jest.mock("expo-notifications", () => ({ setNotificationHandler: jest.fn() }));
jest.mock("../src/state/session", () => ({ useSession: () => ({}) }));
jest.mock("expo-router", () => ({ useRouter: () => ({ push: jest.fn() }) }));
const { openNotification } = require("../src/push/taps") as typeof import("../src/push/taps");

const SIPARIS_ID = "3f2b8c1e-0000-4000-8000-0000000000aa";
const SETTINGS: NotificationSettings = {
  acik: true,
  turler: Object.fromEntries(NOTIFICATION_KINDS.map((k) => [k, true])) as NotificationSettings["turler"],
  sessiz: { acik: false, baslangic: "22:00", bitis: "07:00" },
  esikler: { hamStokAlt: null, bitmisStokAlt: null, gecikenKalemUst: null, gunlukUretimAlt: null, gunlukUretimSaati: 18, esitlemeGecikmeDk: 60 },
};

describe("yeni-siparis bildirim türü", () => {
  it("⭐ tür tel tipinde ve etiketli (sipariş alanı)", () => {
    expect(NOTIFICATION_KINDS).toContain("yeni-siparis");
    expect(NOTIFICATION_KIND["yeni-siparis"]).toEqual(expect.objectContaining({ ad: "Yeni sipariş", domain: "siparisler" }));
    expect(notificationKind("yeni-siparis").ad).toBe("Yeni sipariş");
  });

  it("⭐ Bildirim Ayarları'nda görünür ve kapatılabilir", () => {
    const kinds: NotificationKindInfo[] = [{ tur: "yeni-siparis", ad: "Yeni sipariş", aciklama: "Fabrikada yeni sipariş açıldı", izinli: true }];
    const onChange = jest.fn();
    render(<NotificationSettingsForm form={toForm(SETTINGS)} kinds={kinds} onChange={onChange} />);
    expect(screen.getByText("Yeni sipariş")).toBeTruthy();
    const anahtar = screen.getByTestId("tur-yeni-siparis");
    expect(anahtar.props.disabled).toBe(false);
    fireEvent(anahtar, "valueChange", false);
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ turler: expect.objectContaining({ "yeni-siparis": false }) }));
  });

  it("⭐ dokununca /siparisler/<id> açılır (aynı tesis ya da tesisId yok)", async () => {
    expect(safeRoute(`/siparisler/${SIPARIS_ID}`)).toBe(`/siparisler/${SIPARIS_ID}`);
    for (const data of [{ bildirimId: "b1", rota: `/siparisler/${SIPARIS_ID}`, tesisId: "t1" }, { rota: `/siparisler/${SIPARIS_ID}` }]) {
      const push = jest.fn();
      await expect(openNotification(data, { facilityId: "t1", push })).resolves.toBe(true);
      expect(push).toHaveBeenCalledWith(`/siparisler/${SIPARIS_ID}`);
    }
  });

  it("başka tesisin sipariş bildirimi açılmaz", async () => {
    const push = jest.fn();
    await expect(openNotification({ rota: `/siparisler/${SIPARIS_ID}`, tesisId: "t2" }, { facilityId: "t1", push })).resolves.toBe(false);
    expect(push).not.toHaveBeenCalled();
  });
});
