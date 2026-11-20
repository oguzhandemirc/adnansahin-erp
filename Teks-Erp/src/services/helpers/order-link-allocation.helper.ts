// =============================================================================
// İŞ EMRİ METRESİNİN SİPARİŞLERE PAYLAŞTIRILMASI — TEK KAYNAK (2026-11-16)
// =============================================================================
// Paylaştırma yalnız PLANDIR: açık bağ satırının `allocatedQty` kolonunda durur.
// Top↔sipariş bağı YARATMAZ; `SackAllocation`, `OrderLine.shippedQty`, iş emri
// `orderedMeters` ve patron bulutu `siparisMetre` bundan OKUNMAZ. Bulut yalnız
// gösterim için `siparisPaylari`/`isEmriPaylari` taşır (2.13.2, `plannedQtyOf`).
//
// Kurallar (kullanıcı kararı 2026-11-16):
//   • Tavan = iş emrine giren ham metre (`computeWoInput`); top yoksa `targetQuantity`;
//     ikisi de yoksa tavan yok. Σ açık bağ `allocatedQty` > tavan → 400 `ALLOCATION_OVER_BASIS`.
//   • Sipariş satırının açığını (miktar − sevk) aşmak ENGEL DEĞİL, uyarıdır.
//   • MT dışı satıra metre (> 0) paylaştırılamaz → 400 `ALLOCATION_UNIT_NOT_MEASURED`.
//   • Yalnız AÇIK bağa yazılır; bağlı olmayan satır 400 `ORDER_LINK_NOT_ACTIVE`,
//     yazım anında bağ koparılmışsa 409 `ORDER_LINK_CHANGED`.
//   • CANCELLED/SUPERSEDED iş emri 409 `WO_PLAN_FROZEN`.
// Yazan her yol tx'in İLK ifadesi olarak `touchWorkOrderTx` ile iş emri satırını kilitler.
// =============================================================================

import { Prisma, WorkOrderStatus } from "@prisma/client";
import prisma from "../../lib/prisma";
import { AppError } from "../../utils/app-error";
import { computeWoInput } from "./coverage.helper";
import { ACTIVE_ORDER_LINK } from "./order-link.helper";
import { isMeasuredLine } from "./order-line-scope.helper";
import { recordWorkOrderFieldChangesTx, type WorkOrderEventCtx } from "./workorder-event.helper";

type Tx = Prisma.TransactionClient;
type Db = Tx | typeof prisma;

export const ALLOCATION_OVER_BASIS_CODE = "ALLOCATION_OVER_BASIS";
export const ALLOCATION_UNIT_NOT_MEASURED_CODE = "ALLOCATION_UNIT_NOT_MEASURED";
export const ORDER_LINK_NOT_ACTIVE_CODE = "ORDER_LINK_NOT_ACTIVE";
export const ORDER_LINK_CHANGED_CODE = "ORDER_LINK_CHANGED";
/** İş emri hareket defterindeki alan adı (FIELD_CHANGED, satır başına bir olay). */
export const ORDER_ALLOCATION_FIELD = "orderAllocation";
export const ORDER_ALLOCATION_TRIGGER = "ORDER_ALLOCATION";

const ALLOCATION_FROZEN: WorkOrderStatus[] = [WorkOrderStatus.CANCELLED, WorkOrderStatus.SUPERSEDED];

/** INPUT = giren ham metre · TARGET = hedef metre (top yok) · NONE = tavan yok. */
export type AllocationBasisKind = "INPUT" | "TARGET" | "NONE";

export interface AllocationSummary {
  basis: number | null;
  basisKind: AllocationBasisKind;
  /** Σ açık bağ `allocatedQty`. */
  allocated: number;
  /** basis − allocated (tavan yoksa null). Negatif olabilir: tavan sonradan düştüyse (top çıkarıldı). */
  remaining: number | null;
}

export interface AllocationEntry {
  orderLineId: string;
  allocatedQty: number;
}

const D = (v: Prisma.Decimal.Value): Prisma.Decimal => new Prisma.Decimal(v);
const fmt = (d: Prisma.Decimal): string => `${Number(d.toDecimalPlaces(3)).toLocaleString("tr-TR")} m`;

/**
 * Bağın PLANLANAN metresi (okuma yüzü, tek tanım): `allocatedQty` > 0 ise o, 0 = paylaştırma yok → null.
 * Tambur bağlamı `plannedQty` ve patron bulutu `paylastirilanMetre` bunu çağırır.
 */
export function plannedQtyOf(allocatedQty: Prisma.Decimal.Value | null | undefined): number | null {
  const n = allocatedQty == null ? 0 : Number(allocatedQty);
  return Number.isFinite(n) && n > 0 ? n : null;
}

/**
 * Ön planda gösterilecek metre — tablet Tambur kuralının (`mobil/src/screens/Modules/Tambur/orderLineDisplayQty.ts`)
 * SUNUCU İKİZİ; iki tanımın eşitliğini `test_patron_bulut_is_emri` aynı matriste ölçer. Planlanan > 0 ise o,
 * yoksa siparişin metresi (negatif/boş → 0).
 */
export function orderLineDisplayQty(line: { orderedQty: number; plannedQty: number | null | undefined }): { qty: number; planned: boolean } {
  const planned = line.plannedQty;
  if (typeof planned === "number" && Number.isFinite(planned) && planned > 0) return { qty: planned, planned: true };
  return { qty: Math.max(0, line.orderedQty || 0), planned: false };
}

/** Paylaştırma tavanı — tek tanım. */
export async function readAllocationBasis(
  db: Db,
  workOrderId: string,
): Promise<{ basis: Prisma.Decimal | null; basisKind: AllocationBasisKind }> {
  const input = (await computeWoInput(db, [workOrderId])).get(workOrderId);
  if (input && input.count > 0) return { basis: D(input.meters), basisKind: "INPUT" };
  const wo = await db.workOrder.findUnique({ where: { id: workOrderId }, select: { targetQuantity: true } });
  if (wo?.targetQuantity != null && D(wo.targetQuantity).gt(0)) return { basis: D(wo.targetQuantity), basisKind: "TARGET" };
  return { basis: null, basisKind: "NONE" };
}

async function sumAllocated(db: Db, workOrderId: string): Promise<Prisma.Decimal> {
  const agg = await db.workOrderToOrderLine.aggregate({
    where: { workOrderId, ...ACTIVE_ORDER_LINK },
    _sum: { allocatedQty: true },
  });
  return D(agg._sum.allocatedQty ?? 0);
}

/** Okuma yüzü (detay) — sunucu hesaplar, istemci hesaplamaz. */
export async function summarizeAllocation(
  db: Db,
  workOrderId: string,
): Promise<AllocationSummary> {
  const { basis, basisKind } = await readAllocationBasis(db, workOrderId);
  const allocated = await sumAllocated(db, workOrderId);
  return {
    basis: basis ? Number(basis) : null,
    basisKind,
    allocated: Number(allocated),
    remaining: basis ? Number(basis.minus(allocated)) : null,
  };
}

/** Tavan aşımı → 400 (tx içinde çağrılır; fırlatınca yazım geri alınır). */
export async function assertAllocationWithinBasisTx(tx: Tx, workOrderId: string): Promise<AllocationSummary> {
  const { basis, basisKind } = await readAllocationBasis(tx, workOrderId);
  const allocated = await sumAllocated(tx, workOrderId);
  if (basis && allocated.gt(basis)) {
    const label = basisKind === "INPUT" ? "iş emrine giren" : "iş emrinin hedef";
    throw AppError.badRequest(
      `Paylaştırılan toplam ${fmt(allocated)}, ${label} metre ${fmt(basis)} — ${fmt(allocated.minus(basis))} fazla. ` +
        "Siparişlere en fazla giren metre kadar paylaştırabilirsiniz.",
      {
        code: ALLOCATION_OVER_BASIS_CODE,
        basis: Number(basis),
        basisKind,
        allocated: Number(allocated),
        remaining: Number(basis.minus(allocated)),
      },
    );
  }
  return {
    basis: basis ? Number(basis) : null,
    basisKind,
    allocated: Number(allocated),
    remaining: basis ? Number(basis.minus(allocated)) : null,
  };
}

export interface AllocationChange {
  orderLineId: string;
  orderNumber: string;
  from: number;
  to: number;
}

/**
 * Paylaştırmayı yazar — ÇAĞIRAN tx'i açar ve İLK ifade olarak `touchWorkOrderTx` koşar.
 * Gönderilmeyen açık bağın miktarı KORUNUR (kısmi güncelleme). Yazım satır başına
 * `updateMany WHERE {id, unlinkedAt:null}`, sıralı; 0 satır = bağ koparıldı → 409.
 */
export async function applyOrderLinkAllocationsTx(
  tx: Tx,
  workOrderId: string,
  entries: AllocationEntry[],
  ctx: WorkOrderEventCtx,
): Promise<{ changes: AllocationChange[]; warnings: string[]; summary: AllocationSummary }> {
  const wo = await tx.workOrder.findUnique({
    where: { id: workOrderId },
    select: { id: true, workOrderNumber: true, status: true },
  });
  if (!wo) throw AppError.notFound("İş emri bulunamadı");
  if (ALLOCATION_FROZEN.includes(wo.status)) {
    throw AppError.conflict(
      `${wo.workOrderNumber} iptal edilmiş/devredilmiş durumda (${wo.status}) — paylaştırma değiştirilemez.`,
      { code: "WO_PLAN_FROZEN", status: wo.status },
    );
  }

  const seen = new Set<string>();
  for (const e of entries) {
    if (seen.has(e.orderLineId)) throw AppError.badRequest("Aynı sipariş satırı iki kez gönderildi.");
    seen.add(e.orderLineId);
  }

  const links = await tx.workOrderToOrderLine.findMany({
    where: { workOrderId, orderLineId: { in: [...seen] }, ...ACTIVE_ORDER_LINK },
    select: {
      id: true,
      orderLineId: true,
      allocatedQty: true,
      orderLine: { select: { unit: true, quantity: true, shippedQty: true, order: { select: { orderNumber: true } } } },
    },
  });
  const byLine = new Map(links.map((l) => [l.orderLineId, l]));
  const missing = entries.filter((e) => !byLine.has(e.orderLineId));
  if (missing.length > 0) {
    throw AppError.badRequest(
      `${missing.length} sipariş satırı bu iş emrine bağlı değil — ekranı yenileyip tekrar deneyin.`,
      { code: ORDER_LINK_NOT_ACTIVE_CODE, orderLineIds: missing.map((m) => m.orderLineId) },
    );
  }

  const changes: AllocationChange[] = [];
  const warnings: string[] = [];
  for (const e of entries) {
    const link = byLine.get(e.orderLineId)!;
    const to = D(e.allocatedQty).toDecimalPlaces(3);
    const orderNumber = link.orderLine.order.orderNumber;
    if (to.gt(0) && !isMeasuredLine(link.orderLine)) {
      throw AppError.badRequest(
        `${orderNumber}: metre dışı birimli sipariş satırına metre paylaştırılamaz (${link.orderLine.unit}).`,
        { code: ALLOCATION_UNIT_NOT_MEASURED_CODE, orderLineId: e.orderLineId },
      );
    }
    if (isMeasuredLine(link.orderLine)) {
      const open = Prisma.Decimal.max(0, D(link.orderLine.quantity).minus(link.orderLine.shippedQty));
      if (to.gt(open)) warnings.push(`${orderNumber}: paylaştırılan ${fmt(to)}, siparişin açığı ${fmt(open)}.`);
    }
    const from = D(link.allocatedQty);
    if (from.equals(to)) continue;
    const w = await tx.workOrderToOrderLine.updateMany({
      where: { id: link.id, ...ACTIVE_ORDER_LINK },
      data: { allocatedQty: to },
    });
    if (w.count === 0) {
      throw AppError.conflict(`${orderNumber} bağı bu sırada koparıldı — ekranı yenileyin.`, { code: ORDER_LINK_CHANGED_CODE });
    }
    changes.push({ orderLineId: e.orderLineId, orderNumber, from: Number(from), to: Number(to) });
  }

  const summary = await assertAllocationWithinBasisTx(tx, workOrderId);

  if (changes.length > 0) {
    await recordWorkOrderFieldChangesTx(
      tx,
      workOrderId,
      changes.map((c) => ({
        field: ORDER_ALLOCATION_FIELD,
        from: String(c.from),
        to: String(c.to),
        fromLabel: `${c.orderNumber}: ${fmt(D(c.from))}`,
        toLabel: `${c.orderNumber}: ${fmt(D(c.to))}`,
      })),
      ctx,
    );
  }
  return { changes, warnings, summary };
}
