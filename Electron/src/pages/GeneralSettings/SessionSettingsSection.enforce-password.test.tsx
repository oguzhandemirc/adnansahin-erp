// `auth.enforceStrongPasswordOnLogin` satırı (kullanıcı kararı 2026-11-15).
// Adnan'da varsayılan KAPALI: alan yoksa (eski sunucu) kapalı görünür; kayıt alanı YALNIZ
// değiştiyse gönderir (anahtarı bilmeyen eski backend'in strictObject şeması 400 vermesin);
// yazma izni yoksa salt-okunur özette "Kapalı/Açık" satırı çıkar.
// Negatif sondalar (bir kezlik, md5 ile geri alındı; sayılar commit mesajında):
//   A `?? false` → `?? true`: 2/5 ❌ · B koşullu yayılım yerine her zaman gönder: 1/5 ❌.
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, screen, waitFor } from "@testing-library/react";
import { renderWithProviders } from "@/test/render";

const flags = vi.fn();
const update = vi.fn();
const izinler = vi.fn<(list: string[]) => boolean>();
vi.mock("@/hooks/usePricingEnabled", () => ({
  FEATURE_FLAGS_QUERY_KEY: ["feature-flags"],
  useFeatureFlags: () => flags(),
}));
vi.mock("@/hooks/useRoleAccess", () => ({
  useRoleAccess: () => ({ isAdmin: true, hasPermission: () => true, hasAnyPermission: (l: string[]) => izinler(l) }),
}));
vi.mock("@/services/featureFlagService", () => ({
  featureFlagService: { update: (body: unknown) => update(body) },
}));

import { SessionSettingsSection } from "./SessionSettingsSection";

const BASLIK = "Zayıf parolayla girişte parola değiştirmeyi zorunlu tut";
const sunucu = (over: Record<string, unknown> = {}) =>
  flags.mockReturnValue({ isLoading: false, data: { data: { ...over } } });

beforeEach(() => {
  sunucu();
  update.mockReset().mockResolvedValue({ success: true, data: {} });
  izinler.mockReset().mockReturnValue(true);
});

describe("zayıf parola zorunlu değiştirme anahtarı", () => {
  it("alan gelmezse KAPALI görünür (backend varsayılanı false)", () => {
    renderWithProviders(<SessionSettingsSection />);
    expect(screen.getByLabelText(BASLIK).getAttribute("aria-checked")).toBe("false");
    expect(screen.getByText(/eski panel sürümleri parola değiştirme ekranını tanımaz/)).toBeTruthy();
  });

  it("sunucuda açık → açık görünür", () => {
    sunucu({ enforceStrongPasswordOnLogin: true });
    renderWithProviders(<SessionSettingsSection />);
    expect(screen.getByLabelText(BASLIK).getAttribute("aria-checked")).toBe("true");
  });

  it("açıp kaydetmek enforceStrongPasswordOnLogin:true gönderir", async () => {
    renderWithProviders(<SessionSettingsSection />);
    fireEvent.click(screen.getByLabelText(BASLIK));
    fireEvent.click(screen.getByRole("button", { name: /kaydet/i }));
    await waitFor(() => expect(update).toHaveBeenCalledTimes(1));
    expect(update.mock.calls[0]?.[0]).toMatchObject({ enforceStrongPasswordOnLogin: true });
  });

  it("anahtar değişmeden kaydedilirse alan GÖNDERİLMEZ (eski backend 400 vermesin)", async () => {
    renderWithProviders(<SessionSettingsSection />);
    fireEvent.click(screen.getByLabelText("Uygulamadan çıkınca kilitle (mobil)"));
    fireEvent.click(screen.getByRole("button", { name: /kaydet/i }));
    await waitFor(() => expect(update).toHaveBeenCalledTimes(1));
    expect(update.mock.calls[0]?.[0]).not.toHaveProperty("enforceStrongPasswordOnLogin");
  });

  it("yazma izni yoksa salt-okunur özet satırı", () => {
    izinler.mockReturnValue(false);
    sunucu({ enforceStrongPasswordOnLogin: true });
    renderWithProviders(<SessionSettingsSection />);
    expect(screen.queryByLabelText(BASLIK)).toBeNull();
    expect(screen.getByText("Zayıf parolayla girişte parola değiştirme zorunlu")).toBeTruthy();
  });
});
