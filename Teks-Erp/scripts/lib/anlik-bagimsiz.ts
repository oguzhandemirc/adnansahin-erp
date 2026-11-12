// Patron bulutu ANLIK doğruluğu: anlığın ürettiği sayıyı, AYNI soruyu bağımsız cevaplayan düz SQL ve panelin
// kullandığı servisle karşılaştırır. Bekçi (`test_patron_bulut_anliklar`, `_test` DB) ve ölçüm
// (`olcum_patron_anliklar`, yerel `_prova`) aynı satırları üretir. SQL bilerek servis kodunu ÇAĞIRMAZ.
import { Prisma } from "@prisma/client";
import prisma from "../../src/lib/prisma";
import { factoryDayStart } from "../../src/constants/time";
import { buildSnapshots } from "../../src/cloud-sync/snapshots";
import type { BuiltSnapshot } from "../../src/cloud-sync/packing";
import { getStockScorecard } from "../../src/services/reports/stock-scorecard.report.service";
import { getOpenOrderCoverage } from "../../src/services/reports/open-order-coverage.report.service";
import { getShipmentScorecard } from "../../src/services/reports/shipment-scorecard.report.service";
import { DashboardService } from "../../src/services/dashboard.service";

export interface AccuracyRow {
  readonly soru: string;
  readonly anlik: number;
  readonly sql: number;
  /** Panel servisinin (rapor ekranının) aynı soruya cevabı; servis yoksa null. */
  readonly panel: number | null;
  /** İzinli fark (yuvarlama: rapor 1 haneye yuvarlar). */
  readonly tol: number;
}

export const rowOk = (r: AccuracyRow): boolean => Math.abs(r.anlik - r.sql) <= r.tol && (r.panel === null || Math.abs(r.anlik - r.panel) <= r.tol);

const n = (v: unknown): number => (v === null || v === undefined ? 0 : Number(v));
type Obj = Record<string, unknown>;
const get = (s: BuiltSnapshot[], name: string): Obj => {
  const x = s.find((y) => y.projection === name);
  if (!x) throw new Error(`anlık yok: ${name}`);
  return x.data as Obj;
};

/** `now` anına göre ("bugün" = o anın fabrika günü) anlıkları kurar ve bağımsız SQL'le karşılaştırır. */
export async function accuracyRows(now: Date): Promise<{ rows: AccuracyRow[]; snapshots: BuiltSnapshot[] }> {
  const build = await buildSnapshots({ now, productionOn: true });
  if (build.errors.length > 0) throw new Error(`anlık kurulamadı: ${JSON.stringify(build.errors)}`);
  const s = build.snapshots;
  const rows: AccuracyRow[] = [];

  // 1) Açık sipariş: iptal/tamamlanmamış sipariş, iptal edilmemiş metre kalemi, kalan > 0.
  const [o] = await prisma.$queryRaw<Array<{ cnt: number; qty: number }>>(Prisma.sql`
    SELECT COUNT(*)::int AS cnt, COALESCE(SUM(ol.quantity - ol."shippedQty"), 0)::float AS qty
    FROM order_lines ol JOIN orders o ON o.id = ol."orderId"
    WHERE o.status NOT IN ('CANCELLED', 'COMPLETED') AND ol."cancelledAt" IS NULL AND ol.unit = 'MT'
      AND ol.quantity - ol."shippedQty" > 0`);
  const cov = await getOpenOrderCoverage();
  const kars = get(s, "acik-siparis-karsilama").ozet as Obj;
  const ozSip = get(s, "ozet.siparis");
  rows.push({ soru: "açık sipariş kalem sayısı", anlik: n(kars.acikKalem), sql: n(o?.cnt), panel: cov.summary.openLineCount, tol: 0 });
  rows.push({ soru: "açık sipariş miktarı (m)", anlik: n(kars.acikMiktar), sql: n(o?.qty), panel: cov.summary.openQty, tol: 0.05 });
  rows.push({ soru: "pano: açık sipariş miktarı (m)", anlik: n(ozSip.acikMiktar), sql: n(o?.qty), panel: cov.summary.openQty, tol: 0.05 });

  // 2) Bugünkü BRÜT sevk: DISPATCHED sevkiyatın topları + o sevkiyatlardan iade (geri-ekleme) + doğrudan sevk.
  const from = factoryDayStart(now);
  const [sh] = await prisma.$queryRaw<Array<{ qty: number; cnt: number }>>(Prisma.sql`
    WITH d AS (SELECT id FROM shipments WHERE status = 'DISPATCHED' AND "dispatchedAt" >= ${from} AND "dispatchedAt" <= ${now}),
    p AS (
      SELECT r."currentQty" AS qty, 1 AS cnt FROM rolls r WHERE r."shipmentId" IN (SELECT id FROM d)
      UNION ALL
      SELECT rr.qty, 1 FROM roll_returns rr WHERE rr."cancelledAt" IS NULL AND rr."fromShipmentId" IN (SELECT id FROM d)
      UNION ALL
      SELECT ds."totalQty", (SELECT COUNT(*) FROM rolls r2 WHERE r2."directShipmentId" = ds.id)::int
      FROM direct_shipments ds WHERE ds."shippedAt" >= ${from} AND ds."shippedAt" <= ${now}
    )
    SELECT COALESCE(SUM(qty), 0)::float AS qty, COALESCE(SUM(cnt), 0)::int AS cnt FROM p`);
  const shipSvc = (await getShipmentScorecard({ from, to: now })).summary;
  const bugun = (get(s, "ozet.sevkiyat").bugun ?? {}) as Obj;
  rows.push({ soru: "bugün brüt sevk metresi", anlik: n(bugun.sevkMiktari), sql: n(sh?.qty), panel: shipSvc.shippedQty, tol: 0.05 });
  rows.push({ soru: "bugün sevk top sayısı", anlik: n(bugun.sevkTopSayisi), sql: n(sh?.cnt), panel: shipSvc.shippedRollCount, tol: 0 });

  // 3) Mamul stok (rafta: depo/A1, sevkiyata ve çuvala bağlanmamış).
  const [st] = await prisma.$queryRaw<Array<{ qty: number; cnt: number }>>(Prisma.sql`
    SELECT COALESCE(SUM("currentQty"), 0)::float AS qty, COUNT(*)::int AS cnt FROM rolls
    WHERE status::text IN ('WAREHOUSE', 'A1_STOCK') AND "shipmentId" IS NULL AND "sackId" IS NULL`);
  const stockSvc = (await getStockScorecard()).summary;
  const karne = get(s, "stok-karnesi").ozet as Obj;
  rows.push({ soru: "mamul stok metresi", anlik: n(karne.bitmisMiktar), sql: n(st?.qty), panel: stockSvc.finishedQty, tol: 0.05 });
  rows.push({ soru: "mamul stok top sayısı", anlik: n(karne.bitmisAdet), sql: n(st?.cnt), panel: stockSvc.finishedCount, tol: 0 });
  rows.push({ soru: "pano: mamul stok metresi", anlik: n(get(s, "ozet.stok").bitmisMiktar), sql: n(st?.qty), panel: stockSvc.finishedQty, tol: 0.05 });

  // 4) İstasyon bazında üretim: kuyruk (anlık) ve bugün tamamlanan (iç istasyon: bugün çıkışı olan top).
  const stations = await DashboardService.getStationsLiveState();
  const flow = get(s, "uretim-akisi").istasyonlar as Obj[];
  const q = await prisma.$queryRaw<Array<{ id: string; queue: number; done: number }>>(Prisma.sql`
    SELECT s.id::text AS id,
      (SELECT COUNT(*) FROM rolls r JOIN work_order_steps w ON w.id = r."currentStepId" WHERE w."stationId" = s.id)::int AS queue,
      (SELECT COUNT(DISTINCT rm."rollId") FROM roll_movements rm JOIN work_order_steps w ON w.id = rm."workOrderStepId"
        WHERE w."stationId" = s.id AND rm."exitedAt" >= ${factoryDayStart()} AND rm."revokedAt" IS NULL)::int AS done
    FROM stations s WHERE s."isActive" = true AND s.type::text <> 'EXTERNAL' AND s.kind::text <> 'RAW_QC'`);
  const sumBy = (rowsIn: Obj[], ids: Set<string>, k: string) => rowsIn.filter((r) => ids.has(String(r.id))).reduce((a, r) => a + n(r[k]), 0);
  const ids = new Set(q.map((r) => r.id));
  rows.push({ soru: "iç istasyon kuyruk toplamı", anlik: sumBy(flow, ids, "kuyruk"), sql: q.reduce((a, r) => a + r.queue, 0), panel: stations.filter((x) => ids.has(x.id)).reduce((a, x) => a + x.queueCount, 0), tol: 0 });
  rows.push({ soru: "iç istasyon bugün tamamlanan", anlik: sumBy(flow, ids, "bugunTamamlanan"), sql: q.reduce((a, r) => a + r.done, 0), panel: stations.filter((x) => ids.has(x.id)).reduce((a, x) => a + x.todayCompletedCount, 0), tol: 0 });

  // 5) Fason açık: iptal/doğrudan-sevk değil · kalan kapanmamış · topu doğrudan sevk edilmemiş · aktif TAM makbuz yok.
  const [f] = await prisma.$queryRaw<Array<{ disp: number; qty: number }>>(Prisma.sql`
    SELECT COUNT(DISTINCT i."dispatchId")::int AS disp, COALESCE(SUM(r."currentQty"), 0)::float AS qty
    FROM subcontractor_dispatch_items i
    JOIN subcontractor_dispatches d ON d.id = i."dispatchId"
    JOIN rolls r ON r.id = i."rollId"
    WHERE d."cancelledAt" IS NULL AND d."directShippedAt" IS NULL AND i."remainderClosedAt" IS NULL AND r."directShipmentId" IS NULL
      AND NOT EXISTS (SELECT 1 FROM subcontractor_receipt_items ri JOIN subcontractor_receipts rc ON rc.id = ri."receiptId"
                      WHERE ri."sourceDispatchItemId" = i.id AND ri."isPartial" = false AND rc."cancelledAt" IS NULL)`);
  const fa = get(s, "fason-acik");
  rows.push({ soru: "fason açık sevk sayısı", anlik: n(fa.acikSevk), sql: n(f?.disp), panel: null, tol: 0 });
  rows.push({ soru: "fasonda kalan top metresi", anlik: n(fa.kalanMiktar), sql: n(f?.qty), panel: null, tol: 0.001 });
  return { rows, snapshots: s };
}
