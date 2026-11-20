import { describe, it, expect } from "vitest";
import { useState } from "react";
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderWithProviders } from "@/test/render";
import { CreateAllocationSection, useCreateAllocation } from "./CreateAllocationSection";
import type { PickedOrderLine } from "./OrderPickerDialog";

const picked = (lineId: string, orderNumber: string, openQty: number | null): PickedOrderLine => ({
  lineId, orderId: `o-${lineId}`, orderNumber, orderDeadline: null, customerId: "c1", customerName: `Firma ${orderNumber}`,
  branchName: null, branchCode: null, itemId: "i1", itemName: "Patos", colorId: null, itemColorHex: null,
  itemColorName: null, quantity: openQty ?? 50, openQty, width: 180, requiredProperties: [],
});

let last: ReturnType<typeof useCreateAllocation> | null = null;
function Harness({ target }: { target: number | null }) {
  const [qty, setQty] = useState<Record<string, string>>({});
  const lines = useState(() => [picked("a", "SIP-A", 600), picked("b", "SIP-B", 300), picked("k", "SIP-K", null)])[0];
  const state = useCreateAllocation(lines, qty, target);
  last = state;
  return <CreateAllocationSection state={state} qty={qty} onQty={(id, v) => setQty((p) => ({ ...p, [id]: v }))} error={null} />;
}

describe("CreateAllocationSection — yeni iş emrinde paylaştırma", () => {
  it("seçim kutusu YOK; siparişin metresi görünür; KG satır metre dışı", () => {
    renderWithProviders(<Harness target={800} />);
    expect(screen.queryByRole("checkbox")).toBeNull();
    expect(screen.getByText("600 m")).toBeInTheDocument();
    expect(screen.getByText("metre dışı")).toBeInTheDocument();
    expect(screen.getByTestId("allocation-summary")).toHaveTextContent("Hedef 800 m");
  });

  it("'Tamamı' + elle metre → canlı önizleme ve gövde girdisi; aşım kırmızı", async () => {
    renderWithProviders(<Harness target={800} />);
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: "SIP-A bu iş emrine bağlanacak metre: tamamı" }));
    await user.type(screen.getByLabelText("SIP-B bu iş emrine bağlanacak metre"), "300");
    expect(last?.allocations).toEqual([
      { orderLineId: "a", allocatedQty: 600 },
      { orderLineId: "b", allocatedQty: 300 },
    ]);
    expect(last?.preview.over).toBe(true);
    expect(screen.getByTestId("allocation-summary")).toHaveTextContent("100 m fazla");
  });

  it("hedef yok → tavan yok, boş satır gövdeye girmez", () => {
    renderWithProviders(<Harness target={null} />);
    expect(last?.allocations).toEqual([]);
    expect(last?.preview.basis).toBeNull();
    expect(screen.getByTestId("allocation-summary")).toHaveTextContent("tavan yok");
  });
});
