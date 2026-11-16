import { describe, it, expect, vi, beforeEach } from "vitest";
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderWithProviders } from "@/test/render";

const openTarget = vi.fn();
vi.mock("@/components/layout/tabs/use-tab-target", () => ({
  useOpenTarget: () => openTarget,
}));

import { OrderLinksV3 } from "./OrderLinksV3";
import type { WorkOrder } from "../types";

function wo(links: unknown[]): WorkOrder {
  return { type: "ORDER_PRODUCTION", orderLinks: links } as unknown as WorkOrder;
}
const linkWithOrder = {
  orderLineId: "l1",
  orderLine: {
    quantity: 100,
    shippedQty: 0,
    width: 150,
    item: { name: "Test Kumaş" },
    order: { id: "ord1", orderNumber: "SIP-1", customer: { name: "Müşteri A" } },
  },
};
const linkNoOrder = {
  orderLineId: "l2",
  orderLine: { quantity: 50, shippedQty: 0, item: { name: "X" }, order: null },
};

describe("OrderLinksV3 sipariş navigasyonu", () => {
  beforeEach(() => openTarget.mockReset());

  it("gerçek sipariş → başlık tıklanabilir, openTarget(?focus=)", async () => {
    const user = userEvent.setup();
    renderWithProviders(<OrderLinksV3 wo={wo([linkWithOrder])} />);
    const btn = screen.getByRole("button", { name: /SIP-1/ });
    await user.click(btn);
    expect(openTarget).toHaveBeenCalledTimes(1);
    expect(openTarget.mock.calls[0]?.[0]).toBe("/operations/orders?focus=ord1");
  });

  it("siparişsiz bağ → tıklanamaz (button yok)", () => {
    renderWithProviders(<OrderLinksV3 wo={wo([linkNoOrder])} />);
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });
});

describe("OrderLinksV3 paylaştırma etiketi + sunucu özeti", () => {
  it("allocatedQty '800.000' (METİN) → 'Paylaştırılan 800 m'; özet sunucunun allocation'ından", () => {
    const w = {
      ...wo([{ ...linkWithOrder, allocatedQty: "800.000" }]),
      allocation: { basis: 1000, basisKind: "INPUT", allocated: 800, remaining: 200 },
    } as unknown as WorkOrder;
    renderWithProviders(<OrderLinksV3 wo={w} />);
    expect(screen.getAllByText("Paylaştırılan 800 m")).toHaveLength(2);
    const total = screen.getByTestId("allocation-total");
    expect(total).toHaveTextContent("Giren 1000 m");
    expect(total).toHaveTextContent("Kalan 200 m");
  });
  it("allocatedQty 0 / '0.000' / yok → etiket ve özet YOK", () => {
    for (const q of [0, "0.000", undefined]) {
      const w = {
        ...wo([{ ...linkWithOrder, allocatedQty: q }]),
        allocation: { basis: 1000, basisKind: "INPUT", allocated: 0, remaining: 1000 },
      } as unknown as WorkOrder;
      const { unmount } = renderWithProviders(<OrderLinksV3 wo={w} />);
      expect(screen.queryByText(/Paylaştırılan/)).not.toBeInTheDocument();
      expect(screen.queryByTestId("allocation-total")).not.toBeInTheDocument();
      unmount();
    }
  });
  it("özet istemcide TOPLANMAZ: bağlar 800 dese de sunucu allocated 500 → özet 500", () => {
    const w = {
      ...wo([{ ...linkWithOrder, allocatedQty: "800" }]),
      allocation: { basis: 1000, basisKind: "INPUT", allocated: 500, remaining: 500 },
    } as unknown as WorkOrder;
    renderWithProviders(<OrderLinksV3 wo={w} />);
    expect(screen.getByTestId("allocation-total")).toHaveTextContent("Paylaştırılan 500 m");
  });
});

describe("OrderLinksV3 açık metraj (MEASURED_LINE ikizi)", () => {
  it("MT satır → 'Açık <kalan>' (unit yoksa da metre)", () => {
    renderWithProviders(<OrderLinksV3 wo={wo([{ ...linkWithOrder, orderLine: { ...linkWithOrder.orderLine, shippedQty: 40 } }])} />);
    expect(screen.getByText(/Açık 60/)).toBeInTheDocument();
  });
  it("KG satır → 'Açık ölçülmüyor' (metreye düşülmez, rakam basılmaz)", () => {
    renderWithProviders(
      <OrderLinksV3 wo={wo([{ ...linkWithOrder, orderLine: { ...linkWithOrder.orderLine, unit: "KG" } }])} />,
    );
    expect(screen.getByText(/Açık ölçülmüyor/)).toBeInTheDocument();
    expect(screen.queryByText(/Açık 100/)).not.toBeInTheDocument();
  });
});
