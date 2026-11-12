// =============================================================================
// BEKÇİ — Cari kartı "Özet" sekmesi: uç + süzgeç · izin yoksa istek YOK · bölüm yalıtımı · finans yok · boş durum
// =============================================================================
// Negatif sonda (kırmızı görüldü): izin kapısı `enabled: true`a çevrilince ② ❌; şeride
// `amountByCurrency` basılınca ④ ❌; dönüş yolunda `filter[customerId]` düşünce ① ❌.
import { beforeEach, describe, expect, it, vi } from "vitest";
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderWithProviders } from "@/test/render";
import { matchesPermission } from "@/types/auth";
import { CustomerSummaryTab } from "./CustomerSummaryTab";

const get = vi.fn();
const openTab = vi.fn();
let perms: string[] = [];
let reportOpen = true;

vi.mock("@/services/apiClient", () => ({ default: { get: (...a: unknown[]) => get(...a) } }));
vi.mock("@/store/tabs", () => ({ useTabsStore: (sel: (s: unknown) => unknown) => sel({ openTab }) }));
vi.mock("@/hooks/useRoleAccess", () => ({
  useRoleAccess: () => ({
    hasPermission: (p: string) => matchesPermission(perms, p),
    hasAnyPermission: (ps: string[]) => ps.some((p) => matchesPermission(perms, p)),
  }),
}));
vi.mock("@/pages/Operations/useOperationsVisibility", () => ({
  useOperationsVisibilityContext: () => ({ isReportOpen: () => reportOpen }),
}));

const CID = "11111111-2222-3333-4444-555555555555";
const ALL = ["order:read", "shipping:read", "return:read", "report:customer"];

const order = {
  id: "o1", orderNumber: "SIP-001", customerId: CID, branchId: null, currency: "TRY", totalAmount: "98765.43",
  status: "APPROVED", shippedQty: 40, orderDate: "2026-11-01T09:00:00Z", deadline: null, completedAt: null,
  manualClosedById: null, manualCloseReason: null, branch: null, createdAt: "", updatedAt: "",
  lines: [{ id: "l1", quantity: 100, unit: "MT", shippedQty: 40, cancelledAt: null, item: { id: "i1", code: "K1", name: "Penye" } }],
};
const pg = { nextCursor: null, hasMore: false, limit: 10 };

type Resp = Record<string, unknown> | Error;
function routes(over: Partial<Record<"orders" | "stats" | "open" | "ship" | "ret" | "prof", Resp>> = {}) {
  const r: Record<string, Resp> = {
    stats: { success: true, data: { totalCount: 7, byStatus: {}, totalOrderedQty: 500, totalShippedQty: 200, totalOpenQty: 300, overdueCount: 2, dueThisWeekCount: 1, noWorkOrderCount: 0, amountByCurrency: { TRY: 98765.43 } } },
    orders: { success: true, data: [order], pagination: pg },
    open: { success: true, data: [{ order: { id: "o1", orderNumber: "SIP-001", status: "APPROVED", deadline: null, customer: { id: CID, name: "X" }, branch: null }, lines: [{ lineId: "l1", item: { id: "i1", code: "K1", name: "Penye" }, color: null, width: 180, customerItemName: null, customerColorName: null, requested: 100, shipped: 40, openQty: 60, warehouseAvailable: 0, covered: false }] }] },
    ship: { success: true, data: [{ id: "s1", kind: "SHIPMENT", shipmentNo: "SVK-9", status: "DISPATCHED", dispatchedAt: "2026-11-02T10:00:00Z", createdAt: "", customer: { id: CID, code: "C", name: "X" }, branch: null, _count: { sacks: 1, rolls: 3, orders: 1, returns: 1 }, totalMeters: 412.5, totalKg: 80, invoiceNo: "FAT-1", invoicedAt: null }], summary: { shipmentCount: 4, totalMeters: 1234.5, totalKg: 210 }, pagination: pg },
    ret: { success: true, data: [{ id: "r1", returnNo: "IAD-1", qty: 12.5, createdAt: "2026-11-03T10:00:00Z", item: { id: "i1", code: "K1", name: "Penye" }, color: null, reason: { id: "x", code: "R", name: "Leke", color: null }, reasonText: null, fromShipment: { id: "s1", shipmentNo: "SVK-9" } }], summary: { count: 2, totalQty: 25 }, pagination: pg },
    prof: { success: true, data: [{ customerId: CID, customerName: "X", customerCode: "C", orderCount: 7, lineCount: 9, topItemName: "Penye", topColorName: "Siyah", topWidth: 180, lastOrderDate: "2026-11-01T00:00:00Z" }] },
    ...over,
  };
  get.mockImplementation((url: string) => {
    const k = url.startsWith("/api/orders/stats") ? "stats"
      : url.startsWith("/api/orders") ? "orders"
      : url.startsWith("/api/shipping/open-orders") ? "open"
      : url.startsWith("/api/shipping/shipments") ? "ship"
      : url.startsWith("/api/returns") ? "ret"
      : url.startsWith("/api/reports/customer/order-profile") ? "prof" : "?";
    const v = r[k];
    if (!v) return Promise.reject(new Error(`beklenmeyen uç ${url}`));
    return v instanceof Error ? Promise.reject(v) : Promise.resolve({ data: v });
  });
}

const urls = () => get.mock.calls.map((c) => String(c[0]));
const section = (name: string) => screen.getByRole("region", { name });
const shipmentsReady = () => waitFor(() => expect(within(section("Sevk edilenler")).getByText("SVK-9")).toBeInTheDocument());

beforeEach(() => {
  get.mockReset();
  openTab.mockReset();
  perms = ALL;
  reportOpen = true;
});

describe("CustomerSummaryTab — uç + izin", () => {
  it("⭐ ① her bölüm doğru uca, bu carinin süzgeciyle gider (süzme sunucuda)", async () => {
    routes();
    renderWithProviders(<CustomerSummaryTab customerId={CID} />);
    await shipmentsReady();
    const u = urls();
    const enc = `filter%5BcustomerId%5D=${CID}`;
    expect(u.find((x) => x.startsWith("/api/orders?"))).toContain(enc);
    expect(u.find((x) => x.startsWith("/api/orders?"))).toContain("mode=cursor");
    expect(u.find((x) => x.startsWith("/api/orders/stats"))).toContain(enc);
    expect(u.find((x) => x.startsWith("/api/shipping/open-orders"))).toBe(`/api/shipping/open-orders?customerId=${CID}`);
    const ship = u.find((x) => x.startsWith("/api/shipping/shipments"))!;
    expect(ship).toContain(enc);
    expect(ship).toContain("filter%5Bstatus%5D=DISPATCHED");
    expect(ship).toContain("withSummary=true");
    const ret = u.find((x) => x.startsWith("/api/returns"))!;
    expect(ret).toContain(enc);
    expect(ret).toContain("withTotal=true");
    const prof = get.mock.calls.find((c) => String(c[0]).startsWith("/api/reports/customer/order-profile"))!;
    expect(prof[1]).toEqual({ params: { customerId: CID } });

    // Şerit: uçların verdiği toplamlar (brüt sevk özetin kendisinden)
    expect(within(screen.getByTestId("summary-tile-orders")).getByText("7")).toBeInTheDocument();
    expect(within(screen.getByTestId("summary-tile-open")).getByText("300 m")).toBeInTheDocument();
    expect(within(screen.getByTestId("summary-tile-shipped")).getByText("1234,5 m")).toBeInTheDocument();
    expect(within(screen.getByTestId("summary-tile-returns")).getByText("25 m")).toBeInTheDocument();
  });

  it("⭐ ② izin yoksa bölüm çizilmez ve isteği HİÇ atılmaz", async () => {
    routes();
    perms = ["order:read", "customer:read"];
    renderWithProviders(<CustomerSummaryTab customerId={CID} />);
    await screen.findByText("SIP-001");
    expect(urls().some((x) => x.startsWith("/api/shipping") || x.startsWith("/api/returns") || x.startsWith("/api/reports"))).toBe(false);
    expect(screen.queryByRole("region", { name: "Açık siparişler" })).toBeNull();
    expect(screen.queryByRole("region", { name: "Sevk edilenler" })).toBeNull();
    expect(screen.queryByRole("region", { name: "İadeler" })).toBeNull();
    expect(screen.queryByRole("region", { name: "En çok alınan" })).toBeNull();
    expect(screen.queryByTestId("summary-tile-shipped")).toBeNull();
  });

  it("②b rapor izni var ama rapor kapalıysa rapor ucu çağrılmaz", async () => {
    routes();
    reportOpen = false;
    renderWithProviders(<CustomerSummaryTab customerId={CID} />);
    await shipmentsReady();
    expect(urls().some((x) => x.startsWith("/api/reports"))).toBe(false);
    expect(screen.queryByRole("region", { name: "En çok alınan" })).toBeNull();
  });
});

describe("CustomerSummaryTab — çizim", () => {
  it("⭐ ③ bir bölüm hata verince diğerleri çizilir; yeniden dene isteği tekrarlar", async () => {
    routes({ ret: new Error("500") });
    renderWithProviders(<CustomerSummaryTab customerId={CID} />);
    await waitFor(() => expect(within(section("İadeler")).getByText("Yüklenemedi.")).toBeInTheDocument());
    expect(within(section("Son siparişler")).getByText("SIP-001")).toBeInTheDocument();
    expect(within(section("Sevk edilenler")).getByText("SVK-9")).toBeInTheDocument();
    expect(screen.queryByTestId("summary-tile-returns")).toBeNull();
    const before = urls().filter((x) => x.startsWith("/api/returns")).length;
    await userEvent.click(within(section("İadeler")).getByRole("button", { name: /Yeniden dene/ }));
    await waitFor(() => expect(urls().filter((x) => x.startsWith("/api/returns")).length).toBe(before + 1));
  });

  it("⭐ ④ finans alanı çizilmez (tutar / para birimi / fatura no)", async () => {
    routes();
    renderWithProviders(<CustomerSummaryTab customerId={CID} />);
    await shipmentsReady();
    const txt = screen.getByTestId("customer-summary").textContent ?? "";
    expect(txt).not.toMatch(/98765|98\.765|TRY|₺|Tutar|Bakiye|FAT-1/);
  });

  it("⑤ boş durum: kayıt yoksa her bölüm 'Kayıt yok' der", async () => {
    const empty = { success: true, data: [], pagination: pg };
    routes({ orders: empty, open: { success: true, data: [] }, ship: { ...empty, summary: { shipmentCount: 0, totalMeters: 0, totalKg: 0 } }, ret: { ...empty, summary: { count: 0, totalQty: 0 } }, prof: { success: true, data: [] } });
    renderWithProviders(<CustomerSummaryTab customerId={CID} />);
    for (const name of ["Son siparişler", "Açık siparişler", "Sevk edilenler", "İadeler", "En çok alınan"]) {
      await waitFor(() => expect(within(section(name)).getByText("Kayıt yok")).toBeInTheDocument());
    }
  });

  it("⑥ 'Tümünü gör' liste ekranını bu cari süzgeciyle YENİ sekmede açar; route izni yoksa bağlantı yok", async () => {
    routes();
    renderWithProviders(<CustomerSummaryTab customerId={CID} />);
    await shipmentsReady();
    await userEvent.click(within(section("Sevk edilenler")).getByRole("button", { name: "Tümünü gör" }));
    expect(openTab).toHaveBeenCalledWith(`/operations/shipments?filter[customerId]=${CID}&filter[status]=DISPATCHED`, { forceNew: true });
    await userEvent.click(within(section("Açık siparişler")).getByRole("button", { name: "Tümünü gör" }));
    expect(openTab).toHaveBeenLastCalledWith(`/operations/orders?filter[customerId]=${CID}&filter[status]=PENDING,APPROVED,PARTIAL_SHIPPED`, { forceNew: true });
  });

  it("⑥b uç izni var ama liste route izni yoksa (mobil iade) bölüm çizilir, bağlantı çizilmez", async () => {
    routes();
    perms = ["mobile:iade"];
    renderWithProviders(<CustomerSummaryTab customerId={CID} />);
    await waitFor(() => expect(within(section("İadeler")).getByText("IAD-1")).toBeInTheDocument());
    expect(within(section("İadeler")).queryByRole("button", { name: "Tümünü gör" })).toBeNull();
  });
});
