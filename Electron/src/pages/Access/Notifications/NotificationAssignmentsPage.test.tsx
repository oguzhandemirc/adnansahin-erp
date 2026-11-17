// Bildirim Atamaları sayfası: kişi seçimi → konu başlıklı liste, kilitli satır nedeni, kayıt gövdesi, tercih anahtarı.
import { beforeEach, describe, expect, it, vi } from "vitest";
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderWithProviders } from "@/test/render";
import { matchesPermission } from "@/types/auth";
import { NotificationAssignmentsPage } from "./NotificationAssignmentsPage";

const get = vi.fn();
const put = vi.fn();
const post = vi.fn();
const del = vi.fn();
let perms: string[] = [];

vi.mock("@/services/apiClient", () => ({
  default: {
    get: (...a: unknown[]) => get(...a),
    put: (...a: unknown[]) => put(...a),
    post: (...a: unknown[]) => post(...a),
    delete: (...a: unknown[]) => del(...a),
  },
}));
vi.mock("@/hooks/useRoleAccess", () => ({
  useRoleAccess: () => ({ hasPermission: (p: string) => matchesPermission(perms, p) }),
}));
vi.mock("@/components/layout/PageHeader", () => ({
  PageHeader: ({ title }: { title: string }) => <h1>{title}</h1>,
}));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

const UID = "11111111-2222-3333-4444-555555555555";
const catalog = {
  topics: [
    { key: "siparisler", label: "Siparişler", kinds: [{ kind: "yeni-siparis", label: "Yeni sipariş", dataPermission: "order:read", missingPermissionText: "Siparişleri görme izni yok" }] },
    { key: "uretim", label: "Üretim", kinds: [{ kind: "yeni-is-emri", label: "Yeni iş emri", dataPermission: "workorder:read", missingPermissionText: "İş emirlerini görme izni yok" }] },
    { key: "sevkiyat", label: "Sevkiyat", kinds: [{ kind: "yeni-sevk", label: "Yeni sevk", dataPermission: "shipping:read", missingPermissionText: "Sevkiyatları görme izni yok" }] },
    { key: "genel", label: "Genel", kinds: [] },
  ],
};
const detail = {
  user: { id: UID, username: "ayse", fullName: "Ayşe Yılmaz", isActive: true },
  canChangePreference: false,
  kinds: [
    { kind: "yeni-siparis", topic: "siparisler", label: "Yeni sipariş", dataPermission: "order:read", assigned: true, lockedReason: null, mutedByUser: false },
    { kind: "yeni-is-emri", topic: "uretim", label: "Yeni iş emri", dataPermission: "workorder:read", assigned: false, lockedReason: null, mutedByUser: false },
    { kind: "yeni-sevk", topic: "sevkiyat", label: "Yeni sevk", dataPermission: "shipping:read", assigned: false, lockedReason: "Sevkiyatları görme izni yok", mutedByUser: false },
  ],
};

function route(url: string) {
  if (url === "/api/bildirimler/katalog") return { data: { success: true, data: catalog } };
  if (url === "/api/bildirim-atamalari/kullanicilar")
    return { data: { success: true, data: { items: [{ id: UID, username: "ayse", fullName: "Ayşe Yılmaz", isSystemAccount: false, assignedCount: 1, canChangePreference: false }] } } };
  if (url === "/api/bildirim-atamalari/sablonlar") return { data: { success: true, data: { items: [] } } };
  if (url === `/api/bildirim-atamalari/kullanicilar/${UID}`) return { data: { success: true, data: detail } };
  if (url === "/api/bildirim-atamalari/gun-sonu-saati") return { data: { success: true, data: { time: "18:30", defaultTime: "18:30" } } };
  if (url === "/api/admin/permissions") return { data: { success: true, data: [{ id: "perm-tercih", code: "bildirim:tercih" }] } };
  throw new Error(`beklenmeyen GET ${url}`);
}

beforeEach(() => {
  get.mockReset().mockImplementation((url: string) => Promise.resolve(route(url)));
  put.mockReset().mockResolvedValue({ data: { success: true, data: detail } });
  post.mockReset().mockResolvedValue({ data: { success: true } });
  del.mockReset();
  perms = ["bildirim:yonet", "admin:users"];
});

async function openUser() {
  renderWithProviders(<NotificationAssignmentsPage />);
  await userEvent.click(await screen.findByRole("button", { name: /Ayşe Yılmaz/ }));
  await screen.findByRole("region", { name: "Siparişler" });
}

describe("NotificationAssignmentsPage", () => {
  it("konu başlıkları çizilir, boş 'Genel' başlığı çizilmez; kilitli satır nedeni yazar ve devre dışıdır", async () => {
    await openUser();
    expect(screen.getByRole("region", { name: "Üretim" })).toBeInTheDocument();
    expect(screen.queryByRole("region", { name: "Genel" })).toBeNull();
    const sevk = screen.getByRole("region", { name: "Sevkiyat" });
    expect(within(sevk).getByText("Sevkiyatları görme izni yok")).toBeInTheDocument();
    expect(within(sevk).getByRole("switch", { name: "Yeni sevk" })).toBeDisabled();
  });

  it("aç + Kaydet yalnız kilitsiz türleri katalog sırasıyla gönderir", async () => {
    await openUser();
    await userEvent.click(screen.getByRole("switch", { name: "Yeni iş emri" }));
    await userEvent.click(screen.getByRole("button", { name: "Kaydet" }));
    await waitFor(() => expect(put).toHaveBeenCalled());
    expect(put).toHaveBeenCalledWith(`/api/bildirim-atamalari/kullanicilar/${UID}`, { kinds: ["yeni-siparis", "yeni-is-emri"] });
  });

  it("başlıkta 'Hepsini kapat' o başlığın türünü kapatır", async () => {
    await openUser();
    const sip = screen.getByRole("region", { name: "Siparişler" });
    await userEvent.click(within(sip).getByRole("button", { name: "Hepsini kapat" }));
    expect(within(sip).getByRole("switch", { name: "Yeni sipariş" })).toHaveAttribute("aria-checked", "false");
  });

  it("'Kendi tercihini değiştirebilir' izni mevcut izin yolundan verir ve oturum uyarısı gösterir", async () => {
    await openUser();
    expect(screen.getByText(/oturumu kapanır/)).toBeInTheDocument();
    const sw = screen.getByRole("switch", { name: "Kendi tercihini değiştirebilir" });
    await waitFor(() => expect(sw).not.toBeDisabled());
    await userEvent.click(sw);
    await waitFor(() => expect(post).toHaveBeenCalledWith(`/api/admin/users/${UID}/permissions`, { permissionId: "perm-tercih" }));
  });

  it("admin:users yoksa tercih anahtarı kilitli ve nedeni yazılı", async () => {
    perms = ["bildirim:yonet"];
    await openUser();
    expect(screen.getByRole("switch", { name: "Kendi tercihini değiştirebilir" })).toBeDisabled();
    expect(screen.getByText(/admin:users/)).toBeInTheDocument();
  });
});
