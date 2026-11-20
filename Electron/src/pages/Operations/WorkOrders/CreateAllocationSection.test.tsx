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

  it("hedef yok → tavan yok, boş satır gövdeye girmez; şerit tek cümle söyler (B1)", () => {
    renderWithProviders(<Harness target={null} />);
    expect(last?.allocations).toEqual([]);
    expect(last?.preview.basis).toBeNull();
    const bar = screen.getByTestId("allocation-summary");
    expect(bar).toHaveTextContent("Hedef metre girilmedi — toplam sınırı yok.");
    expect(bar).not.toHaveTextContent("Hedef 0");
    expect(bar).not.toHaveTextContent("Kalan");
  });

  it("B2: açığı aşan satır altında sarı uyarı, kayıt engellenmez; açık içindeki satırda uyarı YOK", async () => {
    renderWithProviders(<Harness target={null} />);
    const user = userEvent.setup();
    await user.type(screen.getByLabelText("SIP-A bu iş emrine bağlanacak metre"), "5000");
    await user.type(screen.getByLabelText("SIP-B bu iş emrine bağlanacak metre"), "300");
    expect(screen.getByText("Siparişin açık miktarı 600 m; 5000 m yazdınız.")).toBeInTheDocument();
    expect(screen.queryByText(/Siparişin açık miktarı 300 m/)).toBeNull();
    expect(last?.invalid).toBe(false);
    expect(last?.allocations).toEqual([
      { orderLineId: "a", allocatedQty: 5000 },
      { orderLineId: "b", allocatedQty: 300 },
    ]);
  });

  it("B3: '1.500' kırmızı ve nedenli (gövdeye girmez); '12.5' okunan değeri yankılar", async () => {
    renderWithProviders(<Harness target={null} />);
    const user = userEvent.setup();
    await user.type(screen.getByLabelText("SIP-A bu iş emrine bağlanacak metre"), "1.500");
    expect(screen.getByLabelText("SIP-A bu iş emrine bağlanacak metre")).toHaveAttribute("aria-invalid", "true");
    expect(screen.getByText(/Binlik ayracı kullanmayın/)).toBeInTheDocument();
    expect(last?.invalid).toBe(true);
    await user.type(screen.getByLabelText("SIP-B bu iş emrine bağlanacak metre"), "12.5");
    expect(screen.getByText("12,5 m olarak okundu.")).toBeInTheDocument();
  });
});
