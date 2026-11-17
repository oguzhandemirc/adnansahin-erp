// Kişinin kendi bildirim tercihi: tercih izni yoksa hepsi kilitli + not; varsa açılır, zorunlu kilitli; PUT gövdesi.
import { beforeEach, describe, expect, it, vi } from "vitest";
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderWithProviders } from "@/test/render";
import { NotificationPreferencesCard } from "./NotificationPreferencesCard";

const get = vi.fn();
const put = vi.fn();

vi.mock("@/services/apiClient", () => ({
  default: { get: (...a: unknown[]) => get(...a), put: (...a: unknown[]) => put(...a) },
}));

const topics = [
  { key: "siparisler", label: "Siparişler" },
  { key: "uretim", label: "Üretim" },
  { key: "sevkiyat", label: "Sevkiyat" },
];
let prefs: { canChange: boolean; topics: typeof topics; items: Array<Record<string, unknown>> };

beforeEach(() => {
  prefs = {
    canChange: true,
    topics,
    items: [
      { kind: "yeni-siparis", topic: "siparisler", label: "Yeni sipariş", mutedByUser: false, required: false },
      { kind: "yeni-is-emri", topic: "uretim", label: "Yeni iş emri", mutedByUser: true, required: false },
      { kind: "yeni-sevk", topic: "sevkiyat", label: "Yeni sevk", mutedByUser: false, required: true },
    ],
  };
  get.mockReset().mockImplementation(() => Promise.resolve({ data: { success: true, data: prefs } }));
  put.mockReset().mockImplementation(() => Promise.resolve({ data: { success: true, data: prefs } }));
});

describe("NotificationPreferencesCard", () => {
  it("tercih izni yoksa her satır kilitli ve 'yöneticiniz belirler' notu görünür", async () => {
    prefs.canChange = false;
    prefs.items = prefs.items.map((i) => ({ ...i, mutedByUser: false, required: true }));
    renderWithProviders(<NotificationPreferencesCard />);
    expect(await screen.findByText("Bildirim tercihlerinizi yöneticiniz belirler.")).toBeInTheDocument();
    const switches = screen.getAllByRole("switch");
    expect(switches).toHaveLength(3);
    for (const s of switches) {
      expect(s).toBeDisabled();
      expect(s).toBeChecked();
    }
  });

  it("tercih izni varsa açık satır değişir ve yalnız {kind, muted} gider; zorunlu satır kilitli", async () => {
    renderWithProviders(<NotificationPreferencesCard />);
    const order = await screen.findByRole("switch", { name: "Yeni sipariş" });
    expect(screen.queryByText("Bildirim tercihlerinizi yöneticiniz belirler.")).toBeNull();
    expect(screen.getByRole("switch", { name: "Yeni iş emri" })).not.toBeChecked();
    expect(screen.getByRole("switch", { name: "Yeni sevk" })).toBeDisabled();
    expect(screen.getByText("(zorunlu)")).toBeInTheDocument();
    await userEvent.click(order);
    expect(put).toHaveBeenCalledWith("/api/bildirimler/tercihler", { items: [{ kind: "yeni-siparis", muted: true }] });
  });

  it("konu başlıklı çizilir; atanmamış kişide sade boş durum", async () => {
    renderWithProviders(<NotificationPreferencesCard />);
    expect(await screen.findByRole("region", { name: "Üretim" })).toBeInTheDocument();
  });

  it("ataması olmayan kişi: 'Size atanmış bildirim yok.'", async () => {
    prefs.items = [];
    renderWithProviders(<NotificationPreferencesCard />);
    expect(await screen.findByText("Size atanmış bildirim yok.")).toBeInTheDocument();
    expect(screen.queryAllByRole("switch")).toHaveLength(0);
  });
});
