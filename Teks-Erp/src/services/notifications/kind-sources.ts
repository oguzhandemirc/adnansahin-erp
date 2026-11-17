// =============================================================================
// Bildirim türlerinin VARLIK yükleyicileri + varlık çözücüleri (2.13.0, D1 + D6a)
// =============================================================================
// Katalog (`constants/notification-catalog.ts`) saf kalır; tür → durum tablosundan donmuş olgular burada.
// Olgular denetim satırından DEĞİL varlığın kendisinden okunur (kullanıcı onayı 2026-11-17, kural istisnası 1).
// D6a yükleyicileri aynı zamanda OLAY YÜKLEMİDİR: durum olayla uyuşmuyorsa (ör. sipariş CANCELLED değil) ya da
// olay damgası `NOTIFICATION_FRESH_MS`den eskiyse null döner — eski bir kayda sonradan yapılan sıradan bir yazım
// (fatura no, not) bayat "iptal edildi / çıktı" bildirimi doğurmaz.
// Yeni tür = katalog girdisi + buraya bir yükleyici; `Record` tamlığı eksik yükleyiciyi derlemede yakalar.
// =============================================================================

import prisma from "../../lib/prisma";
import { RollStatus } from "@prisma/client";
import type { NotificationEntityVia, NotificationFacts, NotificationKind } from "../../constants/notification-catalog";
import { grossRollCount, loadShipmentGrossTotals, LIVE_RETURN_WHERE } from "../helpers/shipment-gross-totals.helper";

/** Olay damgası en çok bu kadar eski olabilir (kanca çağrısı olaydan saniyeler sonra gelir; pay geniş). */
export const NOTIFICATION_FRESH_MS = 15 * 60 * 1000;

export interface LoaderContext {
  /** Denetim çağrısının etiketleri (`audit-hook.auditCallTags`). */
  readonly tags: Readonly<Record<string, string>>;
  readonly nowMs: number;
}

type FactsLoader = (entityId: string, ctx: LoaderContext) => Promise<NotificationFacts | null>;

const fresh = (at: Date | null | undefined, ctx: LoaderContext): boolean => !!at && ctx.nowMs - at.getTime() <= NOTIFICATION_FRESH_MS;
const num = (d: { toNumber(): number } | null | undefined): number | null => (d ? d.toNumber() : null);

const loadOrder: FactsLoader = async (id) => {
  const r = await prisma.order.findUnique({
    where: { id },
    select: { orderNumber: true, createdById: true, customer: { select: { name: true } } },
  });
  return r ? { number: r.orderNumber, customerName: r.customer?.name ?? null, createdById: r.createdById } : null;
};

const loadOrderInState = (state: "CANCELLED" | "COMPLETED"): FactsLoader => async (id, ctx) => {
  const r = await prisma.order.findUnique({
    where: { id },
    select: { orderNumber: true, status: true, cancelledAt: true, completedAt: true, customer: { select: { name: true } } },
  });
  if (!r || r.status !== state) return null;
  if (!fresh(state === "CANCELLED" ? r.cancelledAt : r.completedAt, ctx)) return null;
  return { number: r.orderNumber, customerName: r.customer?.name ?? null, createdById: null };
};

const loadWorkOrder: FactsLoader = async (id) => {
  const r = await prisma.workOrder.findUnique({ where: { id }, select: { workOrderNumber: true, createdById: true } });
  return r ? { number: r.workOrderNumber, customerName: null, createdById: r.createdById } : null;
};

const loadShipment: FactsLoader = async (id) => {
  const r = await prisma.shipment.findUnique({
    where: { id },
    select: { shipmentNo: true, createdById: true, customer: { select: { name: true } } },
  });
  return r ? { number: r.shipmentNo, customerName: r.customer?.name ?? null, createdById: r.createdById } : null;
};

/** Sevk çıkışı: DISPATCHED + taze `dispatchedAt`; metre ve top BRÜT (tek kaynak `shipment-gross-totals.helper`). */
const loadShipmentDispatched: FactsLoader = async (id, ctx) => {
  const r = await prisma.shipment.findUnique({
    where: { id },
    select: {
      shipmentNo: true, status: true, dispatchedAt: true, customer: { select: { name: true } },
      _count: { select: { rolls: true, returns: { where: LIVE_RETURN_WHERE } } },
    },
  });
  if (!r || r.status !== "DISPATCHED" || !fresh(r.dispatchedAt, ctx)) return null;
  const gross = (await loadShipmentGrossTotals([id])).get(id);
  return {
    number: r.shipmentNo,
    customerName: r.customer?.name ?? null,
    createdById: null,
    rollCount: grossRollCount(r._count.rolls, r._count.returns),
    meters: gross ? gross.grossMeters.toNumber() : null,
  };
};

/** Sevk iptali (PLANNED → CANCELLED) ya da sevk geri alma (DISPATCHED → PLANNED/CANCELLED). */
const loadShipmentCancelled: FactsLoader = async (id, ctx) => {
  const r = await prisma.shipment.findUnique({
    where: { id },
    select: { shipmentNo: true, status: true, cancelledAt: true, updatedAt: true, customer: { select: { name: true } } },
  });
  if (!r) return null;
  const undo = ctx.tags.kind === "UNDO_DISPATCH";
  const ok = undo ? r.status !== "DISPATCHED" && fresh(r.updatedAt, ctx) : r.status === "CANCELLED" && fresh(r.cancelledAt, ctx);
  if (!ok) return null;
  return { number: r.shipmentNo, customerName: r.customer?.name ?? null, createdById: null, variant: undo ? "UNDO_DISPATCH" : "CANCEL" };
};

/** Top fire/iptal: SCRAP | CANCELLED + taze çıkış izi (`cancelledAt` iki modu da taşır). */
const loadRollScrapOrCancel: FactsLoader = async (id, ctx) => {
  const r = await prisma.roll.findUnique({
    where: { id },
    select: { barcode: true, status: true, cancelledAt: true, currentQty: true, item: { select: { name: true } }, batch: { select: { workOrderId: true } } },
  });
  if (!r || (r.status !== RollStatus.SCRAP && r.status !== RollStatus.CANCELLED) || !fresh(r.cancelledAt, ctx)) return null;
  return {
    number: r.barcode ?? "—",
    customerName: null,
    createdById: null,
    productName: r.item?.name ?? null,
    meters: num(r.currentQty),
    refId: r.batch?.workOrderId ?? null,
    variant: r.status === RollStatus.SCRAP ? "SCRAP" : "CANCEL",
  };
};

/** Mal kabul girişi (belge düzeyi): ACTIVE + taze; top sayısı ve metraj fişin topları. */
const loadGoodsReceipt: FactsLoader = async (id, ctx) => {
  const r = await prisma.goodsReceipt.findUnique({
    where: { id },
    select: { receiptNo: true, status: true, createdAt: true, supplier: { select: { name: true } }, subcontractorSupplier: { select: { name: true } } },
  });
  if (!r || r.status !== "ACTIVE" || !fresh(r.createdAt, ctx)) return null;
  const agg = await prisma.roll.aggregate({ where: { goodsReceiptId: id }, _count: { _all: true }, _sum: { initialQty: true } });
  return {
    number: r.receiptNo,
    customerName: null,
    createdById: null,
    partyName: r.supplier?.name ?? r.subcontractorSupplier?.name ?? null,
    rollCount: agg._count._all,
    meters: num(agg._sum.initialQty),
  };
};

/** Fason sevk (belge düzeyi; dokuma sevki HARİÇ — modül kapsam dışı). */
const loadSubcontractorDispatch: FactsLoader = async (id, ctx) => {
  const r = await prisma.subcontractorDispatch.findUnique({
    where: { id },
    select: {
      dispatchNo: true, cancelledAt: true, weavingOrderId: true, createdAt: true, totalQty: true, workOrderId: true,
      subcontractor: { select: { name: true } }, _count: { select: { items: { where: { rollId: { not: null } } } } },
    },
  });
  if (!r || r.cancelledAt || r.weavingOrderId || !fresh(r.createdAt, ctx)) return null;
  return {
    number: r.dispatchNo,
    customerName: null,
    createdById: null,
    partyName: r.subcontractor.name,
    rollCount: r._count.items,
    meters: num(r.totalQty),
    refId: r.workOrderId,
  };
};

/** Fason kabul (belge düzeyi; dokuma kabulü HARİÇ). */
const loadSubcontractorReceipt: FactsLoader = async (id, ctx) => {
  const r = await prisma.subcontractorReceipt.findUnique({
    where: { id },
    select: { receiptNo: true, cancelledAt: true, weavingOrderId: true, createdAt: true, workOrderId: true, subcontractor: { select: { name: true } } },
  });
  if (!r || r.cancelledAt || r.weavingOrderId || !fresh(r.createdAt, ctx)) return null;
  const agg = await prisma.subcontractorReceiptItem.aggregate({ where: { receiptId: id }, _count: { _all: true }, _sum: { receivedQty: true } });
  return {
    number: r.receiptNo,
    customerName: null,
    createdById: null,
    partyName: r.subcontractor.name,
    rollCount: agg._count._all,
    meters: num(agg._sum.receivedQty),
    refId: r.workOrderId,
  };
};

/** Gün sonu özeti denetim çağrısından doğmaz; olguları iş (`jobs/daily-summary.job.ts`) hazır verir. */
const noAuditSource: FactsLoader = async () => null;

export const NOTIFICATION_FACT_LOADERS: Readonly<Record<NotificationKind, FactsLoader>> = {
  "yeni-siparis": loadOrder,
  "siparis-iptal": loadOrderInState("CANCELLED"),
  "siparis-tamamlandi": loadOrderInState("COMPLETED"),
  "yeni-is-emri": loadWorkOrder,
  "fire-top-iptal": loadRollScrapOrCancel,
  "yeni-sevk": loadShipment,
  "sevkiyat-cikti": loadShipmentDispatched,
  "sevkiyat-iptal": loadShipmentCancelled,
  "ham-giris": loadGoodsReceipt,
  "fason-gitti": loadSubcontractorDispatch,
  "fason-dondu": loadSubcontractorReceipt,
  "gun-sonu-ozeti": noAuditSource,
};

/** Denetim çağrısının kayıt kimliğinden türün varlık kimliklerine (sıralı, tekil). */
export async function resolveNotificationEntities(via: NotificationEntityVia, recordId: string): Promise<string[]> {
  switch (via) {
    case "self":
      return [recordId];
    case "order-line-order": {
      const l = await prisma.orderLine.findUnique({ where: { id: recordId }, select: { orderId: true } });
      return l ? [l.orderId] : [];
    }
    case "shipment-orders": {
      // Sevkiyatın siparişleri: başlık bağı (ShipmentOrder) + çuval tahsisleri (sevkte temizlenen dahil).
      const links = await prisma.shipmentOrder.findMany({ where: { shipmentId: recordId }, select: { orderId: true } });
      const allocs = await prisma.sackAllocation.findMany({
        where: { OR: [{ sack: { shipmentId: recordId } }, { clearedShipmentId: recordId }] },
        select: { orderLine: { select: { orderId: true } } },
      });
      return [...new Set([...links.map((l) => l.orderId), ...allocs.map((a) => a.orderLine.orderId)])].sort();
    }
  }
}
