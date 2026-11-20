// TÜRETİLMİŞ ALANLAR — fabrika hesaplar, bulut saklar (§1.1). Her alan katalogda adı geçen
// TEK KAYNAK yardımcıyı çağırır; formül burada yeniden yazılmaz (liste ekranı ile
// projeksiyon aynı sayıyı basmak zorunda — "ayrışan yüzey" sınıfı).
import { ItemUnit, Prisma, WorkOrderStatus } from "@prisma/client";
import prisma from "../lib/prisma";
import { isActiveLine, isMeasuredLine } from "../services/helpers/order-line-scope.helper";
import { daysPastDeadline, isDeadlineOpenStatus } from "../services/helpers/order-deadline.helper";
import { grossRollCount, loadShipmentGrossTotals, LIVE_RETURN_WHERE } from "../services/helpers/shipment-gross-totals.helper";
import { loadSackContentTotals } from "../services/helpers/sack-content-totals.helper";
import { currentWorkOrderStep } from "../services/helpers/work-order-current-step.helper";
import { ACTIVE_ORDER_LINK } from "../services/helpers/order-link.helper";
import { WorkOrderService } from "../services/workorder.service";
import { sortLinksByLinkedAt } from "../services/helpers/work-order-customers.helper";
import { deriveOrderUretim, type Uretim } from "../services/helpers/order-nerede.helper";
import { loadNeredeContext, placesOf, rollsOfOrder, type NeredeLoad, type NeredeLoadRow } from "../services/helpers/order-nerede-load.helper";
import {
  isOpenWorkOrderStatus, loadCloseDates, loadOpenFasonOfWorkOrders, loadRollStagesOfWorkOrders, metreNumber, NO_FASON,
  orderSharesOf, shareMeters, STAGE_STATION_SELECT, uretimStepName, workOrderStage, WO_ORDER_SHARES_SELECT,
} from "./work-order-facts";
import { shipmentContentDerived } from "./shipment-content";
import { loadPackingLots, partiOf } from "./packing-lot-facts";

type RawRow = Record<string, unknown> & { id: string };
export type DerivedValues = Map<string, Record<string, unknown>>;
type Deriver = (rows: readonly RawRow[], nowMs: number) => Promise<DerivedValues>;

const D0 = (): Prisma.Decimal => new Prisma.Decimal(0);
const dec = (v: unknown): Prisma.Decimal => new Prisma.Decimal(v as Prisma.Decimal.Value);
const ids = (rows: readonly RawRow[]): string[] => rows.map((r) => r.id);

/** Görünen ad sözlüğü: olgu satırı BOYUT'un `ad` kolonunu (aynı `name`) taşır; bulut birleştirme yapmaz. */
async function displayNames(model: "customer" | "item" | "color", keys: readonly unknown[]): Promise<Map<string, string>> {
  const idList = [...new Set(keys.filter((k): k is string => typeof k === "string"))];
  if (idList.length === 0) return new Map();
  const where = { id: { in: idList } };
  const select = { id: true, name: true } as const;
  const found =
    model === "customer" ? await prisma.customer.findMany({ where, select })
    : model === "item" ? await prisma.item.findMany({ where, select })
    : await prisma.color.findMany({ where, select });
  return new Map(found.map((r) => [r.id, r.name]));
}

/**
 * Sipariş "Üretim" cümlesi (`uretim`) — panelin "Nerede?" yükleyicisi ve yer ayrımı (`loadNeredeContext` · `placesOf`),
 * kaba aşama adı `uretimStepName`, cümle `deriveOrderUretim`. Top okuması yalnız açık (bitmemiş) İE'si olan
 * siparişler için yapılır: bütün İE'leri tamamlanmış sipariş "Tamamlandı"dır ve topa bakmaz (TAM gönderim ucuz kalır).
 */
async function orderUretim(
  orderIds: readonly string[],
  links: ReadonlyArray<{ orderId: string; workOrderLinks: Array<{ workOrder: { id: string; status: WorkOrderStatus } }> }>,
): Promise<Map<string, Uretim>> {
  const byOrder = new Map<string, NeredeLoadRow & { lines: NonNullable<NeredeLoadRow["lines"]> }>();
  for (const id of orderIds) byOrder.set(id, { id, lines: [] });
  for (const l of links) byOrder.get(l.orderId)?.lines.push({ workOrderLinks: l.workOrderLinks });
  // Durum süzgeci (iptal/devredilmiş sayılmaz) YALNIZ `deriveOrderUretim`te; burada bağlı İE başına durum toplanır.
  const statusesOf = (r: NeredeLoadRow): WorkOrderStatus[] => {
    const m = new Map<string, WorkOrderStatus>();
    for (const l of r.lines ?? []) for (const k of l.workOrderLinks ?? []) m.set(k.workOrder.id, k.workOrder.status);
    return [...m.values()];
  };
  // Topsuz karar verilebilen sipariş (İE yok · hepsi tamamlandı) yükleyiciye girmez.
  const settled = (r: NeredeLoadRow): boolean => {
    const tur = deriveOrderUretim({ woStatuses: statusesOf(r), places: [], anyRoll: false }).tur;
    return tur === "IS_EMRI_YOK" || tur === "TAMAMLANDI";
  };
  const ctx: NeredeLoad = await loadNeredeContext([...byOrder.values()].filter((r) => !settled(r)));
  const out = new Map<string, Uretim>();
  for (const r of byOrder.values()) {
    const wos = ctx.woIdsByOrder.get(r.id) ?? [];
    out.set(r.id, deriveOrderUretim({
      woStatuses: statusesOf(r),
      places: placesOf(rollsOfOrder(ctx, r.id), new Date(), uretimStepName),
      anyRoll: wos.some((w) => ctx.woWithAnyRoll.has(w)),
    }));
  }
  return out;
}

async function orderDerived(rows: readonly RawRow[], nowMs: number): Promise<DerivedValues> {
  const lines = await prisma.orderLine.findMany({
    where: { orderId: { in: ids(rows) } },
    select: {
      orderId: true, quantity: true, shippedQty: true, unit: true, cancelledAt: true,
      // Aktif bağ yüklemi tek kaynaktan (koparılmış bağ girmez) — panelin liste `defaultInclude`uyla aynı seçim.
      workOrderLinks: { where: ACTIVE_ORDER_LINK, select: { workOrder: { select: { id: true, status: true } } } },
    },
  });
  const byOrder = new Map<string, { open: Prisma.Decimal; total: Prisma.Decimal; count: number }>();
  for (const l of lines) {
    const acc = byOrder.get(l.orderId) ?? { open: D0(), total: D0(), count: 0 };
    if (isActiveLine(l)) {
      acc.count++;
      // `acikMiktar` ile `toplamMiktar` AYNI satır kapsamı (aktif ∧ ölçülen) — tek dal, kopya yok.
      if (isMeasuredLine(l)) {
        acc.total = acc.total.plus(dec(l.quantity));
        if (dec(l.quantity).gt(dec(l.shippedQty))) acc.open = acc.open.plus(dec(l.quantity).minus(dec(l.shippedQty)));
      }
    }
    byOrder.set(l.orderId, acc);
  }
  const customers = await displayNames("customer", rows.map((r) => r.customerId));
  const uretim = await orderUretim(ids(rows), lines);
  const out: DerivedValues = new Map();
  for (const r of rows) {
    const acc = byOrder.get(r.id) ?? { open: D0(), total: D0(), count: 0 };
    const open = isDeadlineOpenStatus(String(r.status));
    const late = open && daysPastDeadline(r.deadline as Date | null, nowMs) !== null;
    out.set(r.id, { acikMiktar: acc.open, toplamMiktar: acc.total, kalemSayisi: acc.count, gecikmis: late, acik: open, musteriAdi: customers.get(r.customerId as string) ?? null, uretim: uretim.get(r.id) ?? null });
  }
  return out;
}

async function orderLineDerived(rows: readonly RawRow[]): Promise<DerivedValues> {
  const items = await displayNames("item", rows.map((r) => r.itemId));
  const colors = await displayNames("color", rows.map((r) => r.colorId));
  // 2 (2.13.2): kalemi karşılayan iş emirleri — `is-emri.siparisPaylari` ile aynı bağ kümesi/sırası ve metre üçlüsü.
  const links = await prisma.workOrderToOrderLine.findMany({
    where: { orderLineId: { in: ids(rows) }, ...ACTIVE_ORDER_LINK },
    orderBy: WO_ORDER_SHARES_SELECT.orderBy,
    select: { orderLineId: true, workOrderId: true, allocatedQty: true, workOrder: { select: { workOrderNumber: true } } },
  });
  const qtyOf = new Map(rows.map((r) => [r.id, r.quantity as Prisma.Decimal.Value]));
  const sharesOf = new Map<string, Array<{ isEmriId: string; isEmriNo: string; paylastirilanMetre: number | null; gosterilenMetre: number }>>();
  for (const l of links) {
    const m = shareMeters(qtyOf.get(l.orderLineId) ?? 0, l.allocatedQty);
    const arr = sharesOf.get(l.orderLineId) ?? [];
    arr.push({ isEmriId: l.workOrderId, isEmriNo: l.workOrder.workOrderNumber, paylastirilanMetre: m.paylastirilanMetre, gosterilenMetre: m.gosterilenMetre });
    sharesOf.set(l.orderLineId, arr);
  }
  const out: DerivedValues = new Map();
  for (const r of rows) {
    const names = { urunAdi: items.get(r.itemId as string) ?? null, renkAdi: colors.get(r.colorId as string) ?? null, isEmriPaylari: sharesOf.get(r.id) ?? [] };
    const line = { cancelledAt: r.cancelledAt as Date | null, unit: r.unit as ItemUnit };
    if (!isMeasuredLine(line)) {
      out.set(r.id, { acikMiktar: null, ...names });
      continue;
    }
    const open = dec(r.quantity).minus(dec(r.shippedQty));
    out.set(r.id, { acikMiktar: isActiveLine(line) && open.gt(0) ? open : D0(), ...names });
  }
  return out;
}

async function shipmentDerived(rows: readonly RawRow[]): Promise<DerivedValues> {
  const shipIds = ids(rows);
  const totals = await loadShipmentGrossTotals(shipIds);
  const counts = await prisma.shipment.findMany({
    where: { id: { in: shipIds } },
    // Ana üründeki `LIVE_LOAD_UNIT_WHERE` süzgeci yok: Adnan'da çözülen yük birimi (`Sack.dissolvedAt`) yok, her çuval canlı.
    select: { id: true, _count: { select: { sacks: true, rolls: true, returns: { where: LIVE_RETURN_WHERE } } } },
  });
  const countById = new Map(counts.map((c) => [c.id, c._count]));
  const links = await prisma.shipmentOrder.findMany({
    where: { shipmentId: { in: shipIds } },
    select: { shipmentId: true, orderId: true },
    orderBy: [{ shipmentId: "asc" }, { orderId: "asc" }],
  });
  const ordersById = new Map<string, string[]>();
  for (const l of links) ordersById.set(l.shipmentId, [...(ordersById.get(l.shipmentId) ?? []), l.orderId]);
  const customers = await displayNames("customer", rows.map((r) => r.customerId));
  const customerOf = new Map(rows.map((r) => [r.id, r.customerId as string]));
  const out: DerivedValues = new Map();
  for (const id of shipIds) {
    const t = totals.get(id);
    const c = countById.get(id);
    out.set(id, {
      toplamMetre: t?.grossMeters ?? D0(),
      toplamKg: t?.kg ?? D0(),
      cuvalSayisi: c?.sacks ?? 0,
      topSayisi: grossRollCount(c?.rolls ?? 0, c?.returns ?? 0),
      siparisIdleri: ordersById.get(id) ?? [],
      musteriAdi: customers.get(customerOf.get(id) ?? "") ?? null,
    });
  }
  return out;
}

async function sackDerived(rows: readonly RawRow[]): Promise<DerivedValues> {
  const totals = await loadSackContentTotals(ids(rows));
  // 2.13.2: sevk partisinin adı/kodu/durumu (kimlik zaten `partiId` kolonu).
  const lots = await loadPackingLots(rows.map((r) => r.packingGroupId));
  const out: DerivedValues = new Map();
  for (const r of rows) {
    const t = totals.get(r.id);
    out.set(r.id, { topSayisi: t?.rollCount ?? 0, metre: t?.totalQty ?? D0(), ...partiOf(lots, r.packingGroupId) });
  }
  return out;
}

/** İade satırı görünen adları; sebep katalog adıdır (serbest metin ve not buluta gitmez). */
async function returnDerived(rows: readonly RawRow[]): Promise<DerivedValues> {
  const customers = await displayNames("customer", rows.map((r) => r.customerId));
  const items = await displayNames("item", rows.map((r) => r.itemId));
  const colors = await displayNames("color", rows.map((r) => r.colorId));
  const reasonIds = [...new Set(rows.map((r) => r.reasonId).filter((k): k is string => typeof k === "string"))];
  const reasons = reasonIds.length === 0 ? [] : await prisma.returnReason.findMany({ where: { id: { in: reasonIds } }, select: { id: true, name: true } });
  const reasonName = new Map(reasons.map((r) => [r.id, r.name]));
  const out: DerivedValues = new Map();
  for (const r of rows) {
    out.set(r.id, {
      musteriAdi: customers.get(r.customerId as string) ?? null,
      urunAdi: items.get(r.itemId as string) ?? null,
      renkAdi: colors.get(r.colorId as string) ?? null,
      sebepAdi: reasonName.get(r.reasonId as string) ?? null,
    });
  }
  return out;
}

/** `withProductionMeters` liste ekranıyla AYNI sayıyı versin diye o yöntem çağrılır (formül kopyalanmaz). */
type MetersFn = WorkOrderService["withProductionMeters"];

async function workOrderDerived(rows: readonly RawRow[]): Promise<DerivedValues> {
  const wos = await prisma.workOrder.findMany({
    where: { id: { in: ids(rows) } },
    select: {
      id: true,
      steps: {
        select: { id: true, stepSequence: true, status: true, stationId: true, station: { select: STAGE_STATION_SELECT } },
        orderBy: { stepSequence: "asc" },
      },
      // Seçim liste ekranıyla aynı (`WO_LIST_ORDER_CUSTOMER`); aktif bağ yüklemi tek kaynaktan (koparılmış bağ girmez).
      // 2.13.2: `WO_ORDER_SHARES_SELECT` = aynı küme/sıra + kalem metresi, ürün/renk adı, `allocatedQty` (siparisPaylari).
      orderLinks: { where: ACTIVE_ORDER_LINK, orderBy: WO_ORDER_SHARES_SELECT.orderBy, select: WO_ORDER_SHARES_SELECT.select },
    },
  });
  // Yöntem canlı dosyada `private`; dosyaya dokunmamak için öğe erişimiyle çağrılır (TS kaçışı, çalışma anı farkı yok).
  const service = new WorkOrderService();
  const meters: MetersFn = service["withProductionMeters"].bind(service);
  const withMeters = await meters(wos);
  const woIds = ids(rows);
  const { stages, fasonShares } = await loadRollStagesOfWorkOrders(woIds);
  const fason = await loadOpenFasonOfWorkOrders(woIds);
  const closeDates = await loadCloseDates(rows.map((r) => ({ id: r.id, status: r.status as WorkOrderStatus, cancelledAt: (r.cancelledAt as Date | null) ?? null })));
  const items = await displayNames("item", rows.map((r) => r.targetItemId));
  const colors = await displayNames("color", rows.map((r) => r.targetColorId));
  const rowById = new Map(rows.map((r) => [r.id, r]));
  const out: DerivedValues = new Map();
  for (const w of withMeters) {
    const r = rowById.get(w.id)!;
    const open = isOpenWorkOrderStatus(r.status as WorkOrderStatus);
    const current = currentWorkOrderStep(w.steps);
    const orders = new Map<string, string>();
    for (const l of sortLinksByLinkedAt(w.orderLinks)) orders.set(l.orderLine.order.id, l.orderLine.order.orderNumber);
    const asamaTop = stages.get(w.id) ?? [];
    out.set(w.id, {
      uretilenMetre: new Prisma.Decimal(w.producedMeters),
      girenMetre: new Prisma.Decimal(w.inputMeters),
      siparisMetre: new Prisma.Decimal(w.orderedMeters),
      cariKartIdleri: w.customers.map((c) => c.id),
      aktifIstasyonId: current?.stationId ?? null,
      acik: open,
      kapanisTarihi: closeDates.get(w.id) ?? null,
      musteriAdi: w.customers[0]?.name ?? null,
      musteriAdlari: w.customers.map((c) => c.name),
      siparisIdleri: [...orders.keys()],
      siparisNolari: [...orders.values()],
      urunAdi: items.get(r.targetItemId as string) ?? null,
      renkAdi: colors.get(r.targetColorId as string) ?? null,
      asama: open ? workOrderStage(current?.station) : null,
      asamaTop,
      topSayisi: asamaTop.reduce((n, a) => n + a.top, 0),
      metre: metreNumber(asamaTop.reduce((m, a) => m.plus(a.metre), D0())),
      ...(fason.get(w.id) ?? NO_FASON),
      fasonFirmaPayi: fasonShares.get(w.id) ?? [],
      siparisPaylari: orderSharesOf(w.orderLinks),
    });
  }
  return out;
}

/** Projeksiyon → türetici. Katalogdaki `derived` tel adları + `resolvedBy` kolonları ile BİREBİR (bekçi ölçer). */
export const DERIVERS: Readonly<Record<string, Deriver>> = {
  siparis: orderDerived,
  "siparis-kalemi": orderLineDerived,
  sevkiyat: shipmentDerived,
  "sevkiyat-icerigi": shipmentContentDerived,
  cuval: sackDerived,
  "is-emri": workOrderDerived,
  iade: returnDerived,
};

/**
 * Türeticinin ham satırdan okuduğu kök kolonları — opt-in tel kolonu OLMASALAR da
 * kurucu bunları seçer (ör. fatura vadesi için `cariId` zaten tel kolonudur).
 */
export const DERIVER_ROW_FIELDS: Readonly<Record<string, readonly string[]>> = {
  siparis: ["status", "deadline", "customerId"],
  "siparis-kalemi": ["quantity", "shippedQty", "unit", "cancelledAt", "itemId", "colorId"],
  sevkiyat: ["customerId"],
  iade: ["reasonId"],
  "is-emri": ["status", "cancelledAt", "targetItemId", "targetColorId"],
};

