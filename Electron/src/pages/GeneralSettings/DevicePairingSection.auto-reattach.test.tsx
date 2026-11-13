// `device.autoReattachKnownHardware` satırı (2026-11-13; ana ürün PR #673 testinin uyarlaması).
// Adnan'da varsayılan KAPALI (kullanıcı kararı): alan yoksa (eski sunucu) kapalı görünür; kayıt
// yalnız değişen alanı gönderir; dar yazma izniyle satır salt-okunurdur.
// Negatif sonda (B, (bu commit)): `?? false` → `?? true` yapılınca 2/4 ❌, md5 ile geri alındı.
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

import { DevicePairingSection } from "./DevicePairingSection";

const BASLIK = "Yeniden kurulan cihazı eski kaydına bağla";
const sunucu = (over: Record<string, unknown> = {}) =>
  flags.mockReturnValue({ isLoading: false, data: { data: { devicePairingRequired: false, ...over } } });

beforeEach(() => {
  sunucu();
  update.mockReset().mockResolvedValue({ success: true, data: {} });
  izinler.mockReset().mockReturnValue(true);
});

describe("bilinen cihazı yeniden tanıma satırı", () => {
  it("alan gelmezse KAPALI görünür (backend varsayılanı false)", () => {
    renderWithProviders(<DevicePairingSection />);
    expect(screen.getByLabelText(BASLIK).getAttribute("aria-checked")).toBe("false");
  });

  it("sunucuda açık → açık görünür", () => {
    sunucu({ deviceAutoReattachKnownHardware: true });
    renderWithProviders(<DevicePairingSection />);
    expect(screen.getByLabelText(BASLIK).getAttribute("aria-checked")).toBe("true");
  });

  it("açıp kaydetmek yalnız deviceAutoReattachKnownHardware:true gönderir", async () => {
    renderWithProviders(<DevicePairingSection />);
    fireEvent.click(screen.getByLabelText(BASLIK));
    fireEvent.click(screen.getByRole("button", { name: /kaydet/i }));
    await waitFor(() => expect(update).toHaveBeenCalledTimes(1));
    expect(update).toHaveBeenCalledWith({ deviceAutoReattachKnownHardware: true });
  });

  it("yazma izni yoksa salt-okunur", () => {
    izinler.mockReturnValue(false);
    renderWithProviders(<DevicePairingSection writePermissions={["settings:devices"]} />);
    expect(screen.queryByLabelText(BASLIK)).toBeNull();
    expect(screen.getByText(BASLIK)).toBeTruthy();
  });
});
