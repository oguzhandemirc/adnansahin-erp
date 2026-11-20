import { describe, it, expect, vi, beforeEach } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderWithProviders } from "@/test/render";

const getLinkableOrderLines = vi.fn();
const linkOrderLines = vi.fn();
vi.mock("./service", () => ({
  workOrderService: {
    getLinkableOrderLines: (...a: unknown[]) => getLinkableOrderLines(...a),
    linkOrderLines: (...a: unknown[]) => linkOrderLines(...a),
  },
}));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn(), warning: vi.fn() } }));
vi.mock("@/components/PermissionGate", () => ({ PermissionGate: () => null }));

import { LinkOrderDialog } from "./LinkOrderDialog";

const line = (id: string, orderNumber: string, openQty: number) => ({
  id,
  orderId: `o-${id}`,
  orderNumber,
  customerName: `Firma ${orderNumber}`,
  itemId: "i1",
  itemName: "Patos",
  colorId: null,
  colorName: null,
  width: 150,
  quantity: openQty,
  shippedQty: 0,
  openQty,
  measured: true,
  deadline: null,
  warnings: [],
});

function renderDialog(allocation = { basis: 1000, basisKind: "INPUT" as const, allocated: 0, remaining: 1000 }) {
  getLinkableOrderLines.mockResolvedValue({ success: true, data: [line("a", "SIP-X", 600), line("b", "SIP-Y", 800)] });
  renderWithProviders(
    <LinkOrderDialog
      open
      onOpenChange={() => {}}
      workOrderId="wo1"
      workOrderNumber="IE1611260001"
      targetItemId="i1"
      targetItemName="Patos"
      targetColorId={null}
      targetColorName={null}
      targetWidth={150}
      allocation={allocation}
    />,
  );
}

describe("LinkOrderDialog — bağlarken paylaştırma", () => {
  beforeEach(() => {
    getLinkableOrderLines.mockReset();
    linkOrderLines.mockReset();
  });

  it("metre yazmak satırı seçer; gövde { allocations } — eski orderLineAllocations YOK", async () => {
    linkOrderLines.mockResolvedValue({ success: true, data: { linked: 2, alreadyLinked: 0, warnings: [] } });
    renderDialog();
    const user = userEvent.setup();
    await user.type(await screen.findByLabelText("SIP-X bu iş emrine bağlanacak metre"), "800");
    await user.type(screen.getByLabelText("SIP-Y bu iş emrine bağlanacak metre"), "200");
    const bar = screen.getByTestId("allocation-summary");
    expect(bar).toHaveTextContent("Giren 1000 m");
    expect(bar).toHaveTextContent("Kalan 0 m");
    await user.click(screen.getByRole("button", { name: "Bağla (2)" }));
    await waitFor(() => expect(linkOrderLines).toHaveBeenCalledTimes(1));
    const [id, ids, opts] = linkOrderLines.mock.calls[0] as [string, string[], Record<string, unknown>];
    expect(id).toBe("wo1");
    expect(ids.sort()).toEqual(["a", "b"]);
    expect(opts).toEqual({
      allocations: [
        { orderLineId: "a", allocatedQty: 800 },
        { orderLineId: "b", allocatedQty: 200 },
      ],
      quiet: true,
    });
    expect(JSON.stringify(opts)).not.toContain("orderLineAllocations");
  });

  it("mevcut paylaştırma önizlemeye eklenir; TARGET'ta etiket 'Hedef'", async () => {
    renderDialog({ basis: 500, basisKind: "TARGET" as never, allocated: 300, remaining: 200 });
    const user = userEvent.setup();
    await user.type(await screen.findByLabelText("SIP-X bu iş emrine bağlanacak metre"), "250");
    const bar = screen.getByTestId("allocation-summary");
    expect(bar).toHaveTextContent("Hedef 500 m");
    expect(bar).toHaveTextContent("Paylaştırılan 550 m");
    expect(bar).toHaveTextContent("50 m fazla");
  });

  it("'Tamamı' siparişin açığını yazar ve satırı seçer; başlık 'Bu iş emrine (m)'", async () => {
    linkOrderLines.mockResolvedValue({ success: true, data: { linked: 1, alreadyLinked: 0, warnings: [] } });
    renderDialog();
    const user = userEvent.setup();
    await user.click(await screen.findByRole("button", { name: "SIP-X bu iş emrine bağlanacak metre: tamamı" }));
    expect(screen.getByLabelText("SIP-X bu iş emrine bağlanacak metre")).toHaveValue("600");
    expect(screen.getByText("Bu iş emrine (m)")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Bağla (1)" }));
    await waitFor(() =>
      expect(linkOrderLines).toHaveBeenCalledWith("wo1", ["a"], { allocations: [{ orderLineId: "a", allocatedQty: 600 }], quiet: true }),
    );
  });

  it("metresiz bağlama: allocations boş gider (yalnız bağ)", async () => {
    linkOrderLines.mockResolvedValue({ success: true, data: { linked: 1, alreadyLinked: 0, warnings: [] } });
    renderDialog();
    const user = userEvent.setup();
    await user.click(await screen.findByLabelText("SIP-X seç"));
    await user.click(screen.getByRole("button", { name: "Bağla (1)" }));
    await waitFor(() => expect(linkOrderLines).toHaveBeenCalledWith("wo1", ["a"], { allocations: [], quiet: true }));
  });
});
