// =============================================================================
// BEKÇİ — Cari kartı "Özet" sekmesi kaydı: yalnız kayıtlı caride · ilk açılışta bağlanır
// =============================================================================
// Negatif sonda (kırmızı görüldü): sekme yeni kart dalına da konunca ① ❌; `TabsContent`e
// `forceMount` verilince ② ❌ (form açılışında veri çekilirdi).
import { describe, expect, it, vi } from "vitest";
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderWithProviders } from "@/test/render";
import { CustomerFormDialog } from "./CustomerFormDialog";
import type { Customer } from "./types";

vi.mock("@/components/forms/SimilarNamesWarning", () => ({ SimilarNamesWarning: () => null }));
vi.mock("@/components/forms/DocumentProfileSelect", () => ({ DocumentProfileSelect: () => null }));
vi.mock("./CustomerBranchesDraftField", () => ({ CustomerBranchesDraftField: () => null }));
vi.mock("./CustomerBranchesPanel", () => ({ CustomerBranchesPanel: () => null }));
vi.mock("./CustomerItemAliasesPanel", () => ({ CustomerItemAliasesPanel: () => null }));
vi.mock("./CustomerColorAliasesPanel", () => ({ CustomerColorAliasesPanel: () => null }));
vi.mock("./CustomerTemplateRoutesPanel", () => ({ CustomerTemplateRoutesPanel: () => null }));
vi.mock("./CustomerStandaloneLabelsPanel", () => ({ CustomerStandaloneLabelsPanel: () => null }));
vi.mock("./CustomerSubcontractorRole", async (orig) => ({ ...(await orig<typeof import("./CustomerSubcontractorRole")>()), CustomerSubcontractorRole: () => null }));
vi.mock("@/components/RecordInfoButton", () => ({ RecordInfoButton: () => null }));
vi.mock("@/hooks/usePricingEnabled", () => ({ useCustomerBranchesEnabled: () => false, usePricingEnabled: () => false, useFeatureFlags: () => ({ data: { data: { financeEnabled: false } } }) }));
vi.mock("@/hooks/useRoleAccess", () => ({ useRoleAccess: () => ({ hasPermission: () => false, hasAnyPermission: () => false, hasAllPermissions: () => false }) }));
const mounted = vi.fn();
vi.mock("./summary/CustomerSummaryTab", () => ({
  CustomerSummaryTab: (p: { customerId: string }) => {
    mounted(p.customerId);
    return <div data-testid="ozet">{p.customerId}</div>;
  },
}));

const initial = { id: "c1", code: "MUS1", name: "X", taxNumber: null, type: "CUSTOMER", isCustomerRole: true, isSupplierRole: false, isSubcontractorRole: false, exportCode: null, address: null, city: null, district: null, country: null, contactName: null, contactPhone: null, email: null, notes: null, isActive: true, createdAt: "", updatedAt: "" } as Customer;

describe("CustomerFormDialog — Özet sekmesi", () => {
  it("⭐ ① yeni kartta 'Özet' sekmesi YOK", () => {
    renderWithProviders(<CustomerFormDialog open onOpenChange={() => {}} onSubmit={() => {}} />);
    expect(screen.queryByRole("tab", { name: "Özet" })).toBeNull();
    expect(mounted).not.toHaveBeenCalled();
  });

  it("⭐ ② kayıtlı caride sekme var; tıklanana kadar bağlanmaz, tıklanınca bu carinin kimliğiyle açılır", async () => {
    renderWithProviders(<CustomerFormDialog open onOpenChange={() => {}} onSubmit={() => {}} initial={initial} />);
    expect(screen.getByRole("tab", { name: "Özet" })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "Bilgiler" })).toHaveAttribute("data-state", "active");
    expect(mounted).not.toHaveBeenCalled();
    await userEvent.click(screen.getByRole("tab", { name: "Özet" }));
    expect(await screen.findByTestId("ozet")).toHaveTextContent("c1");
    expect(mounted).toHaveBeenCalledWith("c1");
  });
});
