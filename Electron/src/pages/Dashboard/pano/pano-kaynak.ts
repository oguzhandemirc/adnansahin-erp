// Pano veri kaynakları — Adnan backend'inin BUGÜN verdiği uçlar. Aynı uç + aynı parametre, kaç kutu isterse
// istesin TEK istek olur (`fetchQuery` önbelleği): üretim KPI'ı, eğilim, dağılım ve kalite aynı kalite
// karnesini paylaşır. Burada yalnız okunan alanlar tiplenir.
import type { QueryClient } from "@tanstack/react-query";
import apiClient from "@/services/apiClient";
import { buildQueryString } from "@/lib/query-builder";
import type { ApiResponse, PaginatedResponse } from "@/types/api";
import type { PanoPencere } from "./types";

export interface QualityScorecard {
  summary: { rollCount: number; totalQty: number; ungradedQty: number; prevRollCount?: number; prevTotalQty?: number };
  grades: Array<{ gradeId: string | null; code: string; name: string; qty: number; pct: number }>;
  byItem: Array<{ key: string; label: string; rollCount: number; totalQty: number }>;
  daily: Array<{ day: string; totalQty: number }>;
}

export interface ScrapScorecard { summary: { scrapQty: number; scrapPct: number | null; defectsDetected: number } }

export interface Breakdown { key: string; label: string; count: number; qty: number }

export interface ShipmentScorecard {
  summary: { shippedQty: number; shippedRollCount: number; prevShippedQty?: number };
  byCustomer: Breakdown[];
  byItem: Breakdown[];
  daily: Array<{ day: string; qty: number }>;
}

export interface OrderIntake {
  summary: { orderCount: number; totalQty: number; prevOrderCount?: number };
  byCustomer: Breakdown[];
}

export interface SubcontractScorecard { summary: { dispatchedQty: number; returnedQty: number; prevDispatchedQty?: number } }

export interface InventoryScorecard {
  summary: { finishedQty: number; finishedCount: number; rawQty: number; rawCount: number; semiQty: number; semiCount: number };
}

export interface WipReport {
  byStation: Array<{ key: string; label: string; kind: string; waitingCount: number; waitingQty: number }>;
}

export interface OrderRow {
  id: string;
  orderNumber: string;
  createdAt: string;
  customer?: { name: string } | null;
  sevk?: { requested: number; unit: string } | null;
}

export interface ShipmentRow {
  id: string;
  kind: "SHIPMENT" | "DIRECT";
  shipmentNo: string;
  dispatchedAt: string | null;
  createdAt: string;
  customer: { name: string } | null;
  totalMeters: number;
}

export interface StationLiveState {
  id: string;
  code: string;
  name: string;
  kind: string;
  type: string;
  queueCount: number;
  activeCount: number;
  todayCompletedCount: number;
  /** EXTERNAL istasyonlarda bugün sevk edilen parça sayısı. INTERNAL'de 0. */
  todayDispatchedCount: number;
}

const STALE = 60_000;

/** Rapor penceresi parametreleri (`aralik-iso` sözleşmesi + önceki dönem kıyası). */
export const pencereParams = (p: PanoPencere, compare = true): Record<string, string> => ({
  dateFrom: p.dateFrom,
  dateTo: p.dateTo,
  ...(compare ? { compare: "prev" } : {}),
});

/** `/api/reports/<yol>` — zarfın `data`sı. */
export function fetchReport<T>(qc: QueryClient, path: string, params: Record<string, string> = {}): Promise<T> {
  const qs = new URLSearchParams(params).toString();
  return qc.fetchQuery({
    queryKey: ["dashboard", "pano-uc", path, params],
    queryFn: async () => (await apiClient.get<ApiResponse<T>>(`/api/reports/${path}${qs ? `?${qs}` : ""}`)).data.data,
    staleTime: STALE,
  });
}

export interface ListQuery { pageSize: number; sortBy?: string; filters?: Record<string, string> }

/** Sayfalı liste ucu — satırlar + toplam (sayım için `pageSize: 1`). */
export function fetchList<T>(qc: QueryClient, path: string, q: ListQuery): Promise<{ rows: T[]; total: number | null }> {
  const qs = buildQueryString({ page: 1, pageSize: q.pageSize, sortBy: q.sortBy ?? "createdAt", sortOrder: "desc", filters: q.filters ?? {} });
  return qc.fetchQuery({
    queryKey: ["dashboard", "pano-uc", path, qs],
    queryFn: async () => {
      const res = (await apiClient.get<PaginatedResponse<T>>(`${path}${qs}`)).data;
      return { rows: res.data ?? [], total: res.pagination?.total ?? null };
    },
    staleTime: STALE,
  });
}

/** Liste toplamı (yalnız sayı). */
export async function fetchCount(qc: QueryClient, path: string, filters: Record<string, string>): Promise<number | null> {
  return (await fetchList(qc, path, { pageSize: 1, filters })).total;
}

export async function fetchStationLiveState(): Promise<StationLiveState[]> {
  const res = await apiClient.get<ApiResponse<StationLiveState[]>>("/api/dashboard/stations/live-state");
  return res.data.data;
}
