// Patron bulutu — iş emri olgu satırının (`is-emri`) ve `fason-acik` anlığının ORTAK okumaları. Kümeler tek
// kaynaklardan gelir: İE'nin topları `whereRollsOfWorkOrders`, açık fason `outstandingItemOfOpenDispatch`,
// Kurşun/Tambur kuyruğu `production-flow-where.helper` (akış panosuyla aynı), müşteri `rollupWorkOrderCustomers`.
import { Prisma, RollStatus, StationKind, WorkOrderStatus } from "@prisma/client";
import prisma from "../lib/prisma";
import { K18_DEAD_STATUSES } from "../services/batch.service";
import { outstandingItemOfOpenDispatch } from "../services/helpers/fason-open-dispatch.helper";
import { ACTIVE_ORDER_LINK } from "../services/helpers/order-link.helper";
import { KURSUN_FLOW_STEP_WHERE, TAMBUR_FLOW_STEP_WHERE } from "../services/helpers/production-flow-where.helper";
import { STEP_QUALITY_SELECT, stepCanApplyQuality } from "../services/helpers/quality-station.helper";
import { OPEN_WORK_ORDER_STATUSES } from "../services/helpers/live-ref-where.helper";
import { rollupWorkOrderCustomers, type WorkOrderCustomerRef } from "../services/helpers/work-order-customers.helper";
import { whereRollsOfWorkOrders } from "../services/helpers/workorder-rolls.helper";

/** Aşama kırılımının SABİT sırası (tel sözleşmesi). */
export const FLOW_STAGE_KEYS = ["fason", "kursun", "tambur", "depo", "sevkEdildi", "diger"] as const;
export type FlowStageKey = (typeof FLOW_STAGE_KEYS)[number];
export interface StageCount { anahtar: FlowStageKey; top: number; metre: number }

/** Açık iş emri: `OPEN_WORK_ORDER` (PLANNED · IN_PROGRESS) kümesinin bellek ikizi — aynı listeden. */
export const isOpenWorkOrderStatus = (s: WorkOrderStatus): boolean => OPEN_WORK_ORDER_STATUSES.includes(s);

/** Metre teli: 3 haneye yuvarlanmış sayı (Decimal toplamından). */
export const metreNumber = (d: Prisma.Decimal): number => Number(d.toFixed(3));

/** Topun iş emri bağları — `whereRollsOfWorkOrders`ın üç yolu (üretildiği adım · durduğu adım · parti). */
export const ROLL_WORK_ORDER_SELECT = {
  producedInStep: { select: { workOrderId: true } },
  currentStep: { select: { workOrderId: true } },
  batch: { select: { workOrderId: true } },
} as const;
type RollWoLinks = {
  producedInStep: { workOrderId: string } | null;
  currentStep: { workOrderId: string } | null;
  batch: { workOrderId: string } | null;
};
export function workOrdersOfRoll(r: RollWoLinks): string[] {
  return [...new Set([r.currentStep?.workOrderId, r.batch?.workOrderId, r.producedInStep?.workOrderId].filter((x): x is string => !!x))];
}
/** Topun TEK iş emri (müşteri atfı için): durduğu adım → parti → üretildiği adım. */
export function primaryWorkOrderOfRoll(r: RollWoLinks): string | null {
  return r.currentStep?.workOrderId ?? r.batch?.workOrderId ?? r.producedInStep?.workOrderId ?? null;
}

/** Aşama için adım istasyonu seçimi — kalite yüklemi `STEP_QUALITY_SELECT` sözleşmesiyle okur. */
export const STAGE_STATION_SELECT = { name: true, ...STEP_QUALITY_SELECT } as const;

/** Açık İE'nin aşaması — şu anki adımın istasyonundan (kapanmışta null). */
export function workOrderStage(station: { kind: StationKind; appliesQuality: boolean } | null | undefined): string {
  if (!station) return "diger";
  if (station.kind === StationKind.SUBCONTRACTOR) return "fason";
  if (stepCanApplyQuality(station)) return "kursun";
  if (station.kind === StationKind.TAMBUR) return "tambur";
  if (station.kind === StationKind.RAW_QC) return "kk1";
  return "diger";
}

const STATUS_STAGE: Partial<Record<RollStatus, FlowStageKey>> = {
  [RollStatus.AT_SUBCONTRACTOR]: "fason",
  [RollStatus.WAREHOUSE]: "depo",
  [RollStatus.SHIPPED]: "sevkEdildi",
};

/** İE başına canlı top aşama kırılımı (sıfır satır yok, sıra `FLOW_STAGE_KEYS`); ölü küme (`K18_DEAD_STATUSES`) sayılmaz. */
export async function loadRollStagesOfWorkOrders(woIds: readonly string[]): Promise<Map<string, StageCount[]>> {
  const out = new Map<string, StageCount[]>();
  if (woIds.length === 0) return out;
  const asked = new Set(woIds);
  const rolls = await prisma.roll.findMany({
    where: { AND: [whereRollsOfWorkOrders([...woIds]), { status: { notIn: K18_DEAD_STATUSES } }] },
    select: { id: true, status: true, currentQty: true, ...ROLL_WORK_ORDER_SELECT },
  });
  const queued = rolls.filter((r) => !STATUS_STAGE[r.status]).map((r) => r.id);
  const inQueue = async (stepWhere: Prisma.WorkOrderStepWhereInput): Promise<Set<string>> =>
    queued.length === 0 ? new Set() : new Set((await prisma.roll.findMany({ where: { id: { in: queued }, currentStep: stepWhere }, select: { id: true } })).map((r) => r.id));
  const kursun = await inQueue(KURSUN_FLOW_STEP_WHERE);
  const tambur = await inQueue(TAMBUR_FLOW_STEP_WHERE);
  const acc = new Map<string, Map<FlowStageKey, { top: number; metre: Prisma.Decimal }>>();
  for (const r of rolls) {
    const stage: FlowStageKey = STATUS_STAGE[r.status] ?? (kursun.has(r.id) ? "kursun" : tambur.has(r.id) ? "tambur" : "diger");
    for (const wo of workOrdersOfRoll(r)) {
      if (!asked.has(wo)) continue;
      const m = acc.get(wo) ?? new Map();
      const c = m.get(stage) ?? { top: 0, metre: new Prisma.Decimal(0) };
      c.top++;
      c.metre = c.metre.plus(r.currentQty);
      m.set(stage, c);
      acc.set(wo, m);
    }
  }
  for (const [wo, m] of acc) {
    out.set(wo, FLOW_STAGE_KEYS.filter((k) => m.has(k)).map((k) => ({ anahtar: k, top: m.get(k)!.top, metre: metreNumber(m.get(k)!.metre) })));
  }
  return out;
}

export interface WorkOrderFason {
  fasonFirmaId: string | null; fasonFirmaAdi: string | null; fasonKategoriler: string[]; fasonGonderim: Date | null;
  /** Şu an `AT_SUBCONTRACTOR` toplarının bulunduğu firmalar (tekil, id sırası) — bulutun üyelik süzgeci. */
  fasonFirmaIdleri: string[];
}
export const NO_FASON: WorkOrderFason = { fasonFirmaId: null, fasonFirmaAdi: null, fasonKategoriler: [], fasonGonderim: null, fasonFirmaIdleri: [] };

/** Firma kategori adları (Türkçe sıralı) — `fason-acik` firma satırıyla aynı seçim. */
export const FIRM_SELECT = { name: true, categories: { select: { category: { select: { code: true, name: true } } } } } as const;
export const categoryNames = (cats: ReadonlyArray<{ category: { name: string } }>): string[] =>
  cats.map((c) => c.category.name).sort((a, b) => a.localeCompare(b, "tr"));

/** İE'nin açık + dışarıdaki fason kalemleri: en çok topu olan firma, gönderim = o firmadaki en eski açık sevk. */
export async function loadOpenFasonOfWorkOrders(woIds: readonly string[]): Promise<Map<string, WorkOrderFason>> {
  const out = new Map<string, WorkOrderFason>();
  if (woIds.length === 0) return out;
  const asked = new Set(woIds);
  const items = await prisma.subcontractorDispatchItem.findMany({
    where: { ...outstandingItemOfOpenDispatch(), roll: whereRollsOfWorkOrders([...woIds]) },
    select: {
      rollId: true,
      roll: { select: { status: true, ...ROLL_WORK_ORDER_SELECT } },
      dispatch: { select: { subcontractorId: true, dispatchedAt: true, subcontractor: { select: FIRM_SELECT } } },
    },
  });
  type Firm = { name: string; cats: string[]; rolls: Set<string>; oldest: Date; outside: boolean };
  const byWo = new Map<string, Map<string, Firm>>();
  for (const it of items) {
    if (!it.roll || !it.rollId) continue;
    for (const wo of workOrdersOfRoll(it.roll)) {
      if (!asked.has(wo)) continue;
      const firms = byWo.get(wo) ?? new Map<string, Firm>();
      const d = it.dispatch;
      const f = firms.get(d.subcontractorId) ?? { name: d.subcontractor.name, cats: categoryNames(d.subcontractor.categories), rolls: new Set<string>(), oldest: d.dispatchedAt, outside: false };
      f.rolls.add(it.rollId);
      if (it.roll.status === RollStatus.AT_SUBCONTRACTOR) f.outside = true;
      if (d.dispatchedAt < f.oldest) f.oldest = d.dispatchedAt;
      firms.set(d.subcontractorId, f);
      byWo.set(wo, firms);
    }
  }
  for (const [wo, firms] of byWo) {
    const [id, f] = [...firms.entries()].sort((a, b) => b[1].rolls.size - a[1].rolls.size || a[1].name.localeCompare(b[1].name, "tr") || a[0].localeCompare(b[0]))[0]!;
    const outside = [...firms.entries()].filter(([, x]) => x.outside).map(([fid]) => fid).sort();
    out.set(wo, { fasonFirmaId: id, fasonFirmaAdi: f.name, fasonKategoriler: f.cats, fasonGonderim: f.oldest, fasonFirmaIdleri: outside });
  }
  return out;
}

/** İE ↔ sipariş bağ seçimi — liste ekranıyla aynı aktif yüklem + bağlanma sırası; müşteri ve sipariş no aynı turda. */
export const WO_ORDER_LINKS_SELECT = {
  where: ACTIVE_ORDER_LINK,
  orderBy: [{ createdAt: "asc" }, { id: "asc" }],
  select: {
    orderLineId: true,
    createdAt: true,
    orderLine: { select: { order: { select: { id: true, orderNumber: true, customer: { select: { id: true, name: true } } } } } },
  },
} as const satisfies Prisma.WorkOrder$orderLinksArgs;

/** İE'nin müşterileri — `cariKartIdleri`/`musteriAdi` ile AYNI çözüm (`rollupWorkOrderCustomers`, bağlanma sırası, ≤5). */
export async function loadWorkOrderCustomers(woIds: readonly string[]): Promise<Map<string, WorkOrderCustomerRef[]>> {
  if (woIds.length === 0) return new Map();
  const wos = await prisma.workOrder.findMany({ where: { id: { in: [...woIds] } }, select: { id: true, orderLinks: WO_ORDER_LINKS_SELECT } });
  return new Map(wos.map((w) => [w.id, rollupWorkOrderCustomers(w.orderLinks).customers]));
}

/**
 * Kapanmış İE'nin kapanış anı DEFTERDEN: iptalde `cancelledAt`; yoksa güncel durumu yazan son `STATUS_CHANGED`
 * olayı; tamamlanmışta olay yoksa son kapanış künyesi. Açık İE'de null.
 */
export async function loadCloseDates(rows: ReadonlyArray<{ id: string; status: WorkOrderStatus; cancelledAt: Date | null }>): Promise<Map<string, Date | null>> {
  const out = new Map<string, Date | null>();
  const closed = rows.filter((r) => !isOpenWorkOrderStatus(r.status));
  for (const r of rows) out.set(r.id, null);
  if (closed.length === 0) return out;
  const ids = closed.map((r) => r.id);
  const events = await prisma.workOrderEvent.findMany({
    where: { workOrderId: { in: ids }, type: "STATUS_CHANGED", field: "status" },
    select: { workOrderId: true, toValue: true, createdAt: true },
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
  });
  const lastTo = new Map<string, { to: string | null; at: Date }>();
  for (const e of events) lastTo.set(e.workOrderId, { to: e.toValue, at: e.createdAt });
  const snaps = await prisma.workOrderCloseSnapshot.findMany({
    where: { workOrderId: { in: ids } },
    select: { workOrderId: true, createdAt: true },
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
  });
  const lastSnap = new Map(snaps.map((s) => [s.workOrderId, s.createdAt]));
  for (const r of closed) {
    const ev = lastTo.get(r.id);
    const fromEvent = ev && ev.to === r.status ? ev.at : null;
    if (r.status === WorkOrderStatus.CANCELLED) out.set(r.id, r.cancelledAt ?? fromEvent);
    else out.set(r.id, fromEvent ?? (r.status === WorkOrderStatus.COMPLETED ? lastSnap.get(r.id) ?? null : null));
  }
  return out;
}
