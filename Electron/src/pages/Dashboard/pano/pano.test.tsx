import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { OperationsVisibilityContext } from "@/pages/Operations/tile-config";
import { panoStorageKey, resetPanoTercihCache } from "./usePanoTercih";

// Açılış panosu davranış bekçisi: yalnız ekli kutunun ucu istenir, modülü kapalı kutu görünmez ve istenmez,
// bir ucun hatası yalnız kendi kutusunu düşürür.

const get = vi.fn();
vi.mock("@/services/apiClient", () => ({ default: { get: (url: string) => get(url) } }));
vi.mock("@/hooks/useRoleAccess", () => ({ useRoleAccess: () => ({ hasPermission: () => true, permissions: ["*"] }) }));

let regime: Partial<OperationsVisibilityContext> = {};
vi.mock("@/pages/Operations/useOperationsVisibility", () => ({
  useOperationsVisibilityContext: (): OperationsVisibilityContext => ({
    shipmentConfirmationEnabled: false, depoMultiEnabled: false, devereEnabled: false, dokumaEnabled: false,
    financeEnabled: false, productionEnabled: true, ticaretEnabled: false, iplikEnabled: false,
    reportsClosedKeys: [], isReportOpen: () => true, flagsReady: true, flagsFailed: false, ...regime,
  }),
}));
vi.mock("@/store/auth", () => ({ useAuthStore: (sel: (s: Record<string, unknown>) => unknown) => sel({ user: { userId: "u1", username: "ayse" } }) }));
vi.mock("@/store/tabs", () => ({ useTabsStore: (sel: (s: Record<string, unknown>) => unknown) => sel({ navigateActive: vi.fn() }) }));

const QUALITY = {
  summary: { rollCount: 4, totalQty: 1200, ungradedQty: 0, prevRollCount: 2, prevTotalQty: 1000 },
  grades: [{ gradeId: "g1", code: "A", name: "1. kalite", qty: 1200, pct: 100 }],
  byItem: [{ key: "i1", label: "Poplin", rollCount: 4, totalQty: 1200 }],
  daily: [{ day: new Date().toISOString().slice(0, 10), totalQty: 1200 }],
};
const SHIPMENT = { summary: { shippedQty: 800, shippedRollCount: 3, prevShippedQty: 400 }, byCustomer: [], byItem: [], daily: [] };

/** Yol → yanıt (`Error` ise reddedilir). */
let routes: Record<string, unknown> = {};
function reply(url: string) {
  const path = url.split("?")[0]!;
  const hit = routes[path];
  if (hit instanceof Error) return Promise.reject(hit);
  if (hit === undefined) return Promise.resolve({ data: { data: [], pagination: { total: 0 } } });
  return Promise.resolve({ data: { data: hit } });
}
const requested = () => get.mock.calls.map((c) => String(c[0]).split("?")[0]);

function setLayout(boxes: string[]) {
  localStorage.setItem(panoStorageKey("u1"), JSON.stringify({ boxes, donem: "hafta" }));
}

async function renderPano() {
  const { DashboardPage } = await import("../DashboardPage");
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={qc}><DashboardPage /></QueryClientProvider>);
}

// Sayfa modülünün ilk derlemesi testin süresine yazılmasın (marj).
beforeAll(async () => { await import("../DashboardPage"); }, 30_000);

const box = (key: string) => document.querySelector(`[data-box="${key}"]`);

beforeEach(() => {
  localStorage.clear();
  resetPanoTercihCache();
  regime = {};
  routes = { "/api/reports/quality/scorecard": QUALITY, "/api/reports/sales/shipment-scorecard": SHIPMENT };
  get.mockReset().mockImplementation(reply);
});

describe("açılış panosu", () => {
  it("yalnız ekli kutunun ucu istenir", async () => {
    setLayout(["uretim"]);
    await renderPano();
    await waitFor(() => expect(box("uretim")?.textContent).toMatch(/1\.?200/));
    expect(new Set(requested())).toEqual(new Set(["/api/reports/quality/scorecard"]));
    expect(box("sevk")).toBeNull();
  });

  it("aynı uca giden iki kutu tek istek atar", async () => {
    setLayout(["uretim", "dagilim"]);
    await renderPano();
    await waitFor(() => expect(box("dagilim")).not.toBeNull());
    await waitFor(() => expect(box("uretim")?.textContent).toMatch(/1\.?200/));
    expect(requested().filter((p) => p === "/api/reports/quality/scorecard")).toHaveLength(1);
  });

  it("üretim modülü kapalıyken üretim kutuları görünmez ve uçları istenmez", async () => {
    regime = { productionEnabled: false };
    setLayout(["uretim", "kalite", "istasyonDoluluk", "isEmriDurum", "sevk"]);
    await renderPano();
    await waitFor(() => expect(box("sevk")?.textContent).toContain("800"));
    for (const k of ["uretim", "kalite", "istasyonDoluluk", "isEmriDurum"]) expect(box(k), k).toBeNull();
    const paths = requested();
    expect(paths).not.toContain("/api/reports/quality/scorecard");
    expect(paths).not.toContain("/api/dashboard/stations/live-state");
    expect(paths).not.toContain("/api/work-orders");
  });

  it("bir ucun hatası yalnız kendi kutusunu düşürür", async () => {
    routes["/api/reports/quality/scorecard"] = new Error("500");
    setLayout(["kalite", "sevk"]);
    await renderPano();
    await waitFor(() => expect(within(box("kalite") as HTMLElement).getByText("Veri alınamadı.")).toBeTruthy());
    await waitFor(() => expect(box("sevk")?.textContent).toContain("800"));
    expect(within(box("sevk") as HTMLElement).queryByText("Veri alınamadı.")).toBeNull();
    expect(screen.getAllByTestId("pano-kutu-hata")).toHaveLength(1);
  });
});
