// Stok & Ölü Stok — "Kalem bazında" sekmesi: servis tipleri + dışa aktarım spec'i.
// Toplamlar sunucudan gelir (tüm küme, Stok & Ölü Stok kutularıyla aynı rakam);
// ekran ve Excel/PDF aynı spec'i basar.

import apiClient from "@/services/apiClient";
import type { ReportExportSpec } from "../_components/reportExport";
import type { ReportResponse } from "../_services/types";
import { foldSearchText } from "@/lib/search-fold";

export interface StockKalemHamRow {
  key: string;
  itemId: string;
  itemName: string;
  count: number;
  qty: number;
  /** Tartılmış topların kg toplamı; metreyle toplanmaz. Eski sunucu göndermez. */
  kg?: number | null;
  /** Kalemdeki en eski topun raf yaşı (gün, kesirli); çıpasız kalemde null. */
  oldestDays?: number | null;
}

export interface StockKalemBitmisRow {
  key: string;
  itemId: string;
  itemName: string;
  width: number | null;
  colorId: string | null;
  colorName: string | null;
  foldType: string | null;
  foldName: string | null;
  count: number;
  qty: number;
  kg?: number | null;
  oldestDays?: number | null;
}

export interface StockKalem {
  totals: { hamCount: number; hamQty: number; bitmisCount: number; bitmisQty: number };
  ham: StockKalemHamRow[];
  bitmis: StockKalemBitmisRow[];
}

export type KalemBolum = "ham" | "bitmis";
export type KalemGorunum = "kalem" | "top";
export type StockKalemRow = StockKalemHamRow | StockKalemBitmisRow;

/** Raftaki tek top — `kalemKey` kalem satırının `key`iyle aynı. */
export interface StockKalemRoll {
  rollId: string;
  barcode: string | null;
  kalemKey: string;
  qty: number;
  weightKg: number | null;
  batchNumber: string | null;
  warehouseName: string | null;
  days: number | null;
  shelfDay: string | null;
}

/** Top listesi sorgu anahtarı — sekme ve Excel/PDF aynı önbelleği okur (`kalem` yoksa bölümün tamamı). */
export const stockKalemRollsKey = (bolum: KalemBolum, kalem?: string) =>
  ["reports", "inventory", "scorecard", "kalem", "toplar", bolum, kalem ?? "*"] as const;

export const stockKalemApi = {
  /** `warnings`: satır tavanı aşılırsa sunucunun Türkçe uyarısı (toplamlar yine tam küme). */
  get: async (): Promise<ReportResponse<StockKalem> & { warnings?: string[] }> => {
    // Hata sekmenin içinde yazılır (eski sunucuda uç yok → 404); genel toast çift mesaj olurdu.
    const res = await apiClient.get<ReportResponse<StockKalem> & { warnings?: string[] }>(
      "/api/reports/inventory/scorecard/kalem",
      { suppressErrorToast: true },
    );
    return res.data;
  },
  /** Bölümün (kalem verilirse yalnız o kalemin) rafta duran topları — kalem ucuyla aynı raf kümesi. */
  toplar: async (bolum: KalemBolum, kalem?: string): Promise<StockKalemRoll[]> => {
    const params = new URLSearchParams({ bolum });
    if (kalem) params.set("kalem", kalem);
    const res = await apiClient.get<ReportResponse<Partial<Record<KalemBolum, StockKalemRoll[]>>>>(
      `/api/reports/inventory/scorecard/kalem/toplar?${params.toString()}`,
      { suppressErrorToast: true },
    );
    return res.data.data[bolum] ?? [];
  },
};

export const KALEM_SERVER_OUTDATED = "Bu rapor için sunucunun güncellenmesi gerekiyor.";

/** Sekmede gösterilecek hata cümlesi: 404 = sunucu bu ucu henüz taşımıyor (2.11.7 öncesi). */
export function kalemErrorText(error: unknown): string {
  const res = (error as { response?: { status?: number; data?: { message?: unknown } } } | null)?.response;
  if (res?.status === 404) return KALEM_SERVER_OUTDATED;
  if (!res) return "Sunucuya ulaşılamıyor.";
  return typeof res.data?.message === "string" && res.data.message ? res.data.message : "Kalem bazında rapor yüklenemedi.";
}

/** En metni — ekran ve çıktı aynı metni basar. */
export const widthText = (w: number | null): string => (w === null ? "—" : `${w} cm`);

const isBitmis = (r: StockKalemRow): r is StockKalemBitmisRow => "width" in r;

/** Kalemin tek satırlık adı: ürün · en · renk · kat (boş parça atlanır). */
export function kalemLabel(r: StockKalemRow): string {
  if (!isBitmis(r)) return r.itemName;
  const parts = [r.itemName, r.width === null ? null : widthText(r.width), r.colorName, r.foldName];
  return parts.filter((p): p is string => Boolean(p)).join(" · ");
}

/** Raf yaşı tam gün (aşağı yuvarlanır); çıpasız → "—". */
export const daysText = (d: number | null | undefined): string =>
  d === null || d === undefined || Number.isNaN(d) ? "—" : String(Math.floor(d));

/** Kümede tartılmış (kg'li) satır var mı — yoksa kg sütunu hiç çizilmez. */
export const anyKg = (vals: Array<number | null | undefined>): boolean => vals.some((v) => typeof v === "number");

/** Çok kelimeli istemci süzmesi (liste tek istekte tam gelir) — her kelime geçmeli, Türkçe katlamalı. */
export function matchesSearch(haystack: string, q: string): boolean {
  const words = foldSearchText(q).split(" ").filter(Boolean);
  if (words.length === 0) return true;
  const h = foldSearchText(haystack);
  return words.every((w) => h.includes(w));
}

/** Yaşa göre azalan (en eski üstte); yaşı bilinmeyen sona. */
export function sortRollsByAge(rolls: StockKalemRoll[]): StockKalemRoll[] {
  return [...rolls].sort((a, b) => (b.days ?? -1) - (a.days ?? -1));
}

const KG_COL = { header: "Kg", key: "kg", width: 11, numFmt: "#,##0.0", align: "right" } as const;
const OLDEST_COL = { header: "En eski (gün)", key: "oldestDays", width: 12, numFmt: "#,##0", align: "right" } as const;
const ageCell = (d: number | null | undefined) => (d === null || d === undefined ? null : Math.floor(d));

export function buildStockKalemExport(k: StockKalem, warnings: string[] = []): ReportExportSpec {
  const hamKg = anyKg(k.ham.map((r) => r.kg));
  const bitmisKg = anyKg(k.bitmis.map((r) => r.kg));
  return {
    title: "Stok ve Ölü Stok — Kalem Bazında",
    subtitle: "Anlık durum",
    meta: [
      "Ham: kumaş başına; dışarıdan alınan yarı mamul dahil değil. Bitmiş: kumaş + en + renk + kat başına (depo + A1 stok).",
      "Sevkiyata okutulmuş / çuvala girmiş toplar raf sayılmaz. Toplamlar Stok & Ölü Stok kutularıyla aynıdır.",
      ...warnings,
    ],
    tables: [
      {
        name: "Ham",
        columns: [
          { header: "Kumaş", key: "itemName", width: 32 },
          { header: "Top", key: "count", width: 9, numFmt: "#,##0", align: "right" },
          { header: "Metre", key: "qty", width: 14, numFmt: "#,##0.0", align: "right" },
          ...(hamKg ? [KG_COL] : []),
          OLDEST_COL,
        ],
        rows: k.ham.map((r) => ({ itemName: r.itemName, count: r.count, qty: r.qty, kg: r.kg ?? null, oldestDays: ageCell(r.oldestDays) })),
        totalRow: { itemName: "TOPLAM", count: k.totals.hamCount, qty: k.totals.hamQty },
      },
      {
        name: "Bitmiş",
        columns: [
          { header: "Kumaş", key: "itemName", width: 28 },
          { header: "En", key: "width", width: 10 },
          { header: "Renk", key: "colorName", width: 18 },
          { header: "Kat", key: "foldName", width: 12 },
          { header: "Top", key: "count", width: 9, numFmt: "#,##0", align: "right" },
          { header: "Metre", key: "qty", width: 14, numFmt: "#,##0.0", align: "right" },
          ...(bitmisKg ? [KG_COL] : []),
          OLDEST_COL,
        ],
        rows: k.bitmis.map((r) => ({
          itemName: r.itemName,
          width: widthText(r.width),
          colorName: r.colorName ?? "—",
          foldName: r.foldName ?? "—",
          count: r.count,
          qty: r.qty,
          kg: r.kg ?? null,
          oldestDays: ageCell(r.oldestDays),
        })),
        totalRow: { itemName: "TOPLAM", width: "", colorName: "", foldName: "", count: k.totals.bitmisCount, qty: k.totals.bitmisQty },
      },
    ],
  };
}

/** "Top bazında" görünümün Excel/PDF'i: bölüm başına bir sayfa, her top tek satır, en eski üstte. */
export function buildStockKalemRollsExport(
  k: StockKalem,
  rolls: Record<KalemBolum, StockKalemRoll[]>,
  warnings: string[] = [],
): ReportExportSpec {
  const labels = new Map<string, string>();
  for (const r of [...k.ham, ...k.bitmis]) labels.set(r.key, kalemLabel(r));
  const sheet = (name: string, list: StockKalemRoll[]) => {
    const sorted = sortRollsByAge(list);
    const withKg = anyKg(sorted.map((r) => r.weightKg));
    return {
      name,
      columns: [
        { header: "Top no", key: "barcode", width: 16 },
        { header: "Kalem", key: "kalem", width: 40 },
        { header: "Metre", key: "qty", width: 12, numFmt: "#,##0.0", align: "right" as const },
        ...(withKg ? [KG_COL] : []),
        { header: "Parti", key: "batch", width: 12 },
        { header: "Depo", key: "warehouse", width: 18 },
        { header: "Yaş (gün)", key: "days", width: 10, numFmt: "#,##0", align: "right" as const },
      ],
      rows: sorted.map((r) => ({
        barcode: r.barcode ?? "—",
        kalem: labels.get(r.kalemKey) ?? "—",
        qty: r.qty,
        kg: r.weightKg ?? null,
        batch: r.batchNumber ?? "—",
        warehouse: r.warehouseName ?? "—",
        days: ageCell(r.days),
      })),
      totalRow: { barcode: "TOPLAM", kalem: `${sorted.length} top`, qty: Math.round(sorted.reduce((s, r) => s + r.qty, 0) * 10) / 10 },
    };
  };
  return {
    title: "Stok ve Ölü Stok — Top Bazında",
    subtitle: "Anlık durum",
    meta: ["Rafta duran her top tek satır (depo + A1 stok); sevkiyata okutulmuş / çuvala girmiş toplar raf sayılmaz.", ...warnings],
    tables: [sheet("Ham toplar", rolls.ham), sheet("Bitmiş toplar", rolls.bitmis)],
  };
}
