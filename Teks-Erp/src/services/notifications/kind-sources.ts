// =============================================================================
// Bildirim türlerinin VARLIK yükleyicileri (2.13.0, D1)
// =============================================================================
// Katalog (`constants/notification-catalog.ts`) saf kalır; tür → durum tablosundan donmuş olgular burada.
// Olgular denetim satırından DEĞİL varlığın kendisinden okunur (kullanıcı onayı 2026-11-17, kural istisnası 1).
// Yeni tür (D6) = katalog girdisi + buraya bir yükleyici; `Record` tamlığı eksik yükleyiciyi derlemede yakalar.
// =============================================================================

import prisma from "../../lib/prisma";
import type { NotificationFacts, NotificationKind } from "../../constants/notification-catalog";

type FactsLoader = (entityId: string) => Promise<NotificationFacts | null>;

const loadOrder: FactsLoader = async (id) => {
  const r = await prisma.order.findUnique({
    where: { id },
    select: { orderNumber: true, createdById: true, customer: { select: { name: true } } },
  });
  return r ? { number: r.orderNumber, customerName: r.customer?.name ?? null, createdById: r.createdById } : null;
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

export const NOTIFICATION_FACT_LOADERS: Readonly<Record<NotificationKind, FactsLoader>> = {
  "yeni-siparis": loadOrder,
  "yeni-is-emri": loadWorkOrder,
  "yeni-sevk": loadShipment,
};
