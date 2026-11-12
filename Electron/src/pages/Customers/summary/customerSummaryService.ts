import apiClient from "@/services/apiClient";
import { buildCursorQueryString } from "@/lib/query-builder";
import type { CursorPaginatedResponse } from "@/types/api";
import { orderService } from "@/pages/Operations/Orders/service";
import { sackHubService } from "@/pages/Operations/SackContentEdit/service";
import { returnsService } from "@/pages/Operations/Returns/service";
import { customerReportsApi } from "@/pages/Reports/Customer/service";
import type { ShipmentListItem } from "@/pages/Operations/Shipments/types";

// Cari kartı "Özet" sekmesinin veri kapısı — YALNIZ var olan uçlar; her süzme sunucuda.
// Liste uçlarında iptaller panel listeleriyle aynı biçimde dışlanır (`hideCancelled`),
// böylece "Tümünü gör" ile açılan liste aynı sayıyı söyler.

export const SUMMARY_LIMIT = 10;

/** Sevk listesinin kümenin TAMAMI için özeti (`withSummary=true`; brüt metre). */
export interface ShipmentSummaryTotals {
  shipmentCount: number;
  totalMeters: number;
  totalKg: number;
}

export type ShipmentSummaryResponse = CursorPaginatedResponse<ShipmentListItem> & {
  summary?: ShipmentSummaryTotals;
};

export const customerSummaryService = {
  /** Son siparişler — sipariş listesinin cursor ucu, iptaller hariç. */
  recentOrders: (customerId: string) =>
    orderService.listCursor({
      limit: SUMMARY_LIMIT,
      sortBy: "createdAt",
      sortOrder: "desc",
      filters: { customerId, hideCancelled: "true" },
    }),

  /** Sipariş özet şeridi — listeyle aynı where (`buildListWhere`). */
  orderStats: (customerId: string) =>
    orderService.getStats({
      page: 1,
      pageSize: 1,
      sortBy: "createdAt",
      sortOrder: "desc",
      filters: { customerId, hideCancelled: "true" },
    }),

  /** Açık siparişler — paketleme rehberi ucu (`customerId` ham parametre, sunucu süzer). */
  openOrders: (customerId: string) => sackHubService.listOpenOrders({ customerId }),

  /** Sevk edilenler — birleşik liste (çuval + doğrudan sevk), BRÜT; özet kümenin tamamı için. */
  dispatchedShipments: (customerId: string): Promise<ShipmentSummaryResponse> =>
    apiClient
      .get<ShipmentSummaryResponse>(
        `/api/shipping/shipments${buildCursorQueryString({
          limit: SUMMARY_LIMIT,
          sortBy: "createdAt",
          sortOrder: "desc",
          filters: { customerId, status: "DISPATCHED" },
        })}&withSummary=true`,
      )
      .then((r) => r.data),

  /** İadeler — iptal edilmemiş iade satırları; ilk sayfada özet (adet + metre). */
  returns: (customerId: string) =>
    returnsService.listCursor({
      limit: SUMMARY_LIMIT,
      withTotal: true,
      sortBy: "createdAt",
      sortOrder: "desc",
      filters: { customerId },
    }),

  /** Sipariş profili (rapor ucu; `report:customer` ister) — en sık kumaş/renk/en. */
  orderProfile: (customerId: string) => customerReportsApi.orderProfile({ customerId }),
};
