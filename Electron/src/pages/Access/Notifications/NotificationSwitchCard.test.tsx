// Bildirim ana şalteri kartı: sistem hesabı → anahtar + PUT; yönetici → kilitli + not; 18:30 sonrası uyarı; hata cümlesi.
import { beforeEach, describe, expect, it, vi } from "vitest";
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { AxiosError, AxiosHeaders } from "axios";
import { renderWithProviders } from "@/test/render";
import { useAuthStore } from "@/store/auth";
import type { JwtPayload } from "@/types/auth";
import { NotificationSwitchCard } from "./NotificationSwitchCard";
import { isPastDailySummary, switchErrorMessage } from "./notification-switch";

const get = vi.fn();
const put = vi.fn();
const toastSuccess = vi.fn();

vi.mock("@/services/apiClient", () => ({
  default: {
    get: (...a: unknown[]) => get(...a),
    put: (...a: unknown[]) => put(...a),
    post: vi.fn(),
    delete: vi.fn(),
  },
}));
vi.mock("sonner", () => ({ toast: { success: (...a: unknown[]) => toastSuccess(...a), error: vi.fn() } }));

let enabled = false;
let summaryTime = "18:30";

function route(url: string) {
  if (url === "/api/bildirimler")
    return { data: { success: true, data: { items: [], unreadCount: 0, enabled, nextCursor: null, hasMore: false, limit: 20 } } };
  if (url === "/api/bildirim-atamalari/gun-sonu-saati")
    return { data: { success: true, data: { time: summaryTime, defaultTime: "18:30" } } };
  throw new Error(`beklenmeyen GET ${url}`);
}

/** İstanbul saatiyle (UTC+3) verilen saat. */
const at = (hm: string) => () => new Date(`2026-11-18T${hm}:00+03:00`);

function axiosErr(status: number, body: unknown): AxiosError {
  const headers = new AxiosHeaders();
  return new AxiosError("x", "ERR", { headers }, null, { status, statusText: "", headers, config: { headers }, data: body });
}

beforeEach(() => {
  enabled = false;
  summaryTime = "18:30";
  get.mockReset().mockImplementation((url: string) => Promise.resolve(route(url)));
  put.mockReset().mockResolvedValue({ data: { success: true } });
  toastSuccess.mockReset();
  useAuthStore.setState({
    user: { userId: "u1", username: "sistem", permissions: ["*"] } as unknown as JwtPayload,
    isSystemAccount: true,
    systemAccountExists: true,
  });
});

describe("NotificationSwitchCard", () => {
  it("sistem hesabı: anahtar etkin; açma onayı → PUT `notifications.enabled` true, durum ve zil tazelenir", async () => {
    renderWithProviders(<NotificationSwitchCard now={at("10:00")} />);
    expect(await screen.findByText("Kapalı")).toBeInTheDocument();
    const sw = screen.getByRole("switch", { name: "Bildirimler" });
    await waitFor(() => expect(sw).toBeEnabled());
    expect(screen.queryByText(/yalnız sistem yöneticisi/)).toBeNull();

    await userEvent.click(sw);
    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByText("Bildirimler açılsın mı?")).toBeInTheDocument();
    expect(within(dialog).queryByText(/Gün sonu özeti saati geçtiği/)).toBeNull();

    enabled = true;
    const inboxCalls = get.mock.calls.filter((c) => c[0] === "/api/bildirimler").length;
    await userEvent.click(within(dialog).getByRole("button", { name: "Bildirimleri aç" }));
    await waitFor(() => expect(put).toHaveBeenCalledTimes(1));
    expect(put.mock.calls[0]![0]).toBe("/api/admin/settings/notifications.enabled");
    expect(put.mock.calls[0]![1]).toEqual({ value: "true" });
    expect(await screen.findByText("Açık")).toBeInTheDocument();
    expect(get.mock.calls.filter((c) => c[0] === "/api/bildirimler").length).toBeGreaterThan(inboxCalls);
    expect(toastSuccess).toHaveBeenCalledWith("Bildirimler açıldı.");
  });

  it("kapatma onayı geçmişin silinmediğini söyler ve `false` yazar", async () => {
    enabled = true;
    renderWithProviders(<NotificationSwitchCard now={at("10:00")} />);
    expect(await screen.findByText("Açık")).toBeInTheDocument();
    const sw = screen.getByRole("switch", { name: "Bildirimler" });
    await waitFor(() => expect(sw).toBeEnabled());
    await userEvent.click(sw);
    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByText("Yeni bildirim üretilmez; geçmiş silinmez.")).toBeInTheDocument();
    await userEvent.click(within(dialog).getByRole("button", { name: "Bildirimleri kapat" }));
    await waitFor(() => expect(put).toHaveBeenCalledTimes(1));
    expect(put.mock.calls[0]![1]).toEqual({ value: "false" });
  });

  it("gün sonu özeti saati geçtiyse açma onayı ek uyarıyı taşır", async () => {
    renderWithProviders(<NotificationSwitchCard now={at("19:05")} />);
    const sw = await screen.findByRole("switch", { name: "Bildirimler" });
    await waitFor(() => expect(sw).toBeEnabled());
    await userEvent.click(sw);
    const dialog = await screen.findByRole("dialog");
    expect(
      within(dialog).getByText(/Gün sonu özeti saati geçtiği için bugünün özeti hemen gönderilir\./),
    ).toBeInTheDocument();
  });

});

describe("NotificationSwitchCard — kilit ve hata", () => {
  it("❌ normal yönetici: anahtar yok, durum + not görünür, PUT hiç çağrılmaz", async () => {
    useAuthStore.setState({
      user: { userId: "u2", username: "yonetici", permissions: ["admin:users", "bildirim:yonet"] } as unknown as JwtPayload,
      isSystemAccount: false,
      systemAccountExists: true,
    });
    renderWithProviders(<NotificationSwitchCard now={at("10:00")} />);
    expect(await screen.findByText("Kapalı")).toBeInTheDocument();
    expect(screen.queryByRole("switch")).toBeNull();
    expect(screen.getByText("Bildirimleri yalnız sistem yöneticisi açıp kapatabilir.")).toBeInTheDocument();
    expect(put).not.toHaveBeenCalled();
  });

  it("❌ supap (sistem hesabı hiç yok) yönetici için anahtarı AÇMAZ — backend kapısı supapsız", async () => {
    useAuthStore.setState({
      user: { userId: "u2", username: "yonetici", permissions: ["*"] } as unknown as JwtPayload,
      isSystemAccount: false,
      systemAccountExists: false,
    });
    renderWithProviders(<NotificationSwitchCard now={at("10:00")} />);
    expect(await screen.findByText("Kapalı")).toBeInTheDocument();
    expect(screen.queryByRole("switch")).toBeNull();
  });

  it("yazma hatası (403 SUPERADMIN_ONLY) kartta Türkçe yazılır, durum değişmez", async () => {
    put.mockReset().mockRejectedValue(
      axiosErr(403, { success: false, message: "x", details: { code: "SUPERADMIN_ONLY", key: "notifications.enabled" } }),
    );
    renderWithProviders(<NotificationSwitchCard now={at("10:00")} />);
    const sw = await screen.findByRole("switch", { name: "Bildirimler" });
    await waitFor(() => expect(sw).toBeEnabled());
    await userEvent.click(sw);
    await userEvent.click(within(await screen.findByRole("dialog")).getByRole("button", { name: "Bildirimleri aç" }));
    expect(await screen.findByText(/Bildirimleri yalnız sistem yöneticisi açıp kapatabilir\. Bu oturum/)).toBeInTheDocument();
    expect(screen.getByText("Kapalı")).toBeInTheDocument();
    expect(put.mock.calls[0]![2]).toEqual({ suppressErrorToast: true });
    expect(toastSuccess).not.toHaveBeenCalled();
  });
});

describe("notification-switch yardımcıları", () => {
  it("gün sonu saati İstanbul saatiyle karşılaştırılır; geçersiz saat 18:30'a düşer", () => {
    expect(isPastDailySummary(new Date("2026-11-18T18:29:00+03:00"), "18:30")).toBe(false);
    expect(isPastDailySummary(new Date("2026-11-18T18:30:00+03:00"), "18:30")).toBe(true);
    expect(isPastDailySummary(new Date("2026-11-18T15:31:00Z"), "18:30")).toBe(true);
    expect(isPastDailySummary(new Date("2026-11-18T20:00:00+03:00"), "21:00")).toBe(false);
    expect(isPastDailySummary(new Date("2026-11-18T19:00:00+03:00"), "bozuk")).toBe(true);
  });

  it("hata cümleleri", () => {
    expect(switchErrorMessage(axiosErr(403, { details: { code: "OTHER" } }))).toBe("Bu işlem için yetkiniz bulunmuyor.");
    expect(switchErrorMessage(axiosErr(500, {}))).toMatch(/Sunucu hatası/);
    expect(switchErrorMessage(axiosErr(400, { message: "Geçersiz değer" }))).toBe("Geçersiz değer");
    expect(switchErrorMessage(new AxiosError("ağ"))).toMatch(/Sunucuya ulaşılamıyor/);
    expect(switchErrorMessage(new Error("x"))).toBe("Bildirim ayarı kaydedilemedi.");
  });
});
