// ANLIK `fason-acik`: açık fason sevkleri ve fasonda kalan top metresi, firma başına. "Açık + dışarıda" koşulu
// TEK kaynaktan (`fason-open-dispatch.helper`) okunur, ikinci tanım yazılmaz. Ana üründen farkı: Adnan'da dönüş
// termini kolonu (`expectedReturnAt`) ve kokpit servisi yok ⇒ geciken/yaklaşan alanı GÖNDERİLMEZ (uygulama
// isteğe bağlı okur); iplik/levent (dokuma) yok; özet tavansız toplanır (kırpma yok).
// Müşteri kırılımı İE satırının `musteriAdi`'yla AYNI çözümdür (`work-order-facts` loadWorkOrderCustomers).
import { Prisma } from "@prisma/client";
import prisma from "../lib/prisma";
import { outstandingItemOfOpenDispatch } from "../services/helpers/fason-open-dispatch.helper";
import { categoryNames, FIRM_SELECT, loadWorkOrderCustomers, metreNumber, primaryWorkOrderOfRoll, ROLL_WORK_ORDER_SELECT } from "./work-order-facts";

/** Boyahane = bu KODLU hizmet kategorisinde hizmet veren fason firma (kod kimliktir, ad değişebilir; seed `BOYA`). */
export const DYE_HOUSE_CATEGORY_CODE = "BOYA";

export interface SubcontractCustomerRow { cariKartId: string | null; ad: string | null; top: number; metre: number }
export interface SubcontractProductRow { urunId: string | null; urunAdi: string | null; renkId: string | null; renkAdi: string | null; top: number; metre: number }

export interface SubcontractOpenData {
  acikSevk: number;
  kalanMiktar: string;
  /** Fasonda bekleyen top sayısı (açık + dışarıda kalemlerin farklı topları). */
  acikTop: number;
  /** `acikTop`un Boyahane kategorili firmalardaki kısmı. */
  boyahanedeTop: number;
  /** Fasondaki topların farklı iş emri / müşteri sayısı (topun iş emri: durduğu adım → parti → üretildiği adım). */
  isEmriSayisi: number;
  musteriSayisi: number;
  /** Aktif hizmet kategorilerinin HEPSİ (0'lılar dahil); firma birden çok kategorideyse her birinde sayılır. */
  kategoriler: Array<{ kod: string; ad: string; acikTop: number; kalanMiktar: string }>;
  firmalar: Array<{
    fasonFirmaId: string; etiket: string; acikSevk: number; kalanMiktar: string; acikTop: number; kategoriler: string[];
    enEskiGonderim: string | null; isEmriSayisi: number; musteriler: SubcontractCustomerRow[]; urunler: SubcontractProductRow[];
  }>;
}

type Bucket = { top: number; qty: Prisma.Decimal };
const add = <K>(m: Map<K, Bucket>, k: K, qty: Prisma.Decimal): void => {
  const b = m.get(k) ?? { top: 0, qty: new Prisma.Decimal(0) };
  b.top++;
  b.qty = b.qty.plus(qty);
  m.set(k, b);
};
const byTop = <T extends { top: number; metre: number }>(label: (r: T) => string) => (a: T, b: T): number =>
  b.top - a.top || b.metre - a.metre || label(a).localeCompare(label(b), "tr");

const ITEM_SELECT = {
  dispatchId: true,
  rollId: true,
  roll: {
    select: {
      currentQty: true, itemId: true, colorId: true, item: { select: { name: true } }, color: { select: { name: true } },
      ...ROLL_WORK_ORDER_SELECT,
    },
  },
  dispatch: { select: { subcontractorId: true, dispatchedAt: true, subcontractor: { select: FIRM_SELECT } } },
} as const satisfies Prisma.SubcontractorDispatchItemSelect;
type Item = Prisma.SubcontractorDispatchItemGetPayload<{ select: typeof ITEM_SELECT }>;
type ItemRoll = NonNullable<Item["roll"]>;

type Firm = {
  name: string; categories: string[]; categoryCodes: string[]; dyeHouse: boolean; dispatches: Set<string>; rolls: Set<string>; qty: Prisma.Decimal;
  oldest: Date | null; workOrders: Set<string>; customers: Map<string, Bucket>; customerNames: Map<string, string>; products: Map<string, Bucket>;
  productInfo: Map<string, SubcontractProductRow>;
};
function newFirm(sc: Item["dispatch"]["subcontractor"]): Firm {
  return {
    name: sc.name,
    categories: categoryNames(sc.categories),
    categoryCodes: sc.categories.map((c) => c.category.code),
    dyeHouse: sc.categories.some((c) => c.category.code === DYE_HOUSE_CATEGORY_CODE),
    dispatches: new Set(), rolls: new Set(), qty: new Prisma.Decimal(0),
    oldest: null, workOrders: new Set(), customers: new Map(), customerNames: new Map(), products: new Map(), productInfo: new Map(),
  };
}

/** Topun firmadaki ilk görünüşü: müşteri (İE'sinin ilk müşterisi) ve ürün·renk kırılımına bir kez girer. */
function addRollToFirm(f: Firm, roll: ItemRoll, wo: string | null, cust: { id: string; name: string } | null): void {
  const qty = roll.currentQty;
  if (wo) f.workOrders.add(wo);
  if (cust) f.customerNames.set(cust.id, cust.name);
  add(f.customers, cust?.id ?? "", qty);
  const pk = `${roll.itemId}|${roll.colorId ?? ""}`;
  add(f.products, pk, qty);
  f.productInfo.set(pk, { urunId: roll.itemId, urunAdi: roll.item?.name ?? null, renkId: roll.colorId, renkAdi: roll.color?.name ?? null, top: 0, metre: 0 });
}

function firmRow(id: string, f: Firm): SubcontractOpenData["firmalar"][number] & { qty: Prisma.Decimal } {
  return {
    fasonFirmaId: id, etiket: f.name, acikSevk: f.dispatches.size, kalanMiktar: f.qty.toFixed(3), acikTop: f.rolls.size, kategoriler: f.categories,
    enEskiGonderim: f.oldest ? f.oldest.toISOString() : null,
    isEmriSayisi: f.workOrders.size,
    musteriler: [...f.customers.entries()]
      .map(([cid, b]) => ({ cariKartId: cid || null, ad: cid ? f.customerNames.get(cid) ?? null : null, top: b.top, metre: metreNumber(b.qty) }))
      .sort(byTop((r) => r.ad ?? "")),
    urunler: [...f.products.entries()]
      .map(([pk, b]) => ({ ...f.productInfo.get(pk)!, top: b.top, metre: metreNumber(b.qty) }))
      .sort(byTop((r) => `${r.urunAdi ?? ""} ${r.renkAdi ?? ""}`)),
    qty: f.qty,
  };
}

/** Aktif kategorilerin HEPSİ; firma birden çok kategorideyse topu her birinde sayılır. */
async function categoryRows(catRolls: Map<string, Map<string, Prisma.Decimal>>): Promise<SubcontractOpenData["kategoriler"]> {
  const active = await prisma.subcontractorCategory.findMany({ where: { isActive: true }, select: { code: true, name: true } });
  return active
    .map((c) => {
      const m = catRolls.get(c.code) ?? new Map<string, Prisma.Decimal>();
      const qty = [...m.values()].reduce((sum, q) => sum.plus(q), new Prisma.Decimal(0));
      return { kod: c.code, ad: c.name, acikTop: m.size, kalanMiktar: qty.toFixed(3) };
    })
    .sort((a, b) => b.acikTop - a.acikTop || a.ad.localeCompare(b.ad, "tr"));
}

export async function buildSubcontractOpenData(): Promise<SubcontractOpenData> {
  const items = await prisma.subcontractorDispatchItem.findMany({ where: outstandingItemOfOpenDispatch(), select: ITEM_SELECT });
  const rollWo = new Map<string, string | null>();
  for (const it of items) if (it.rollId && it.roll) rollWo.set(it.rollId, primaryWorkOrderOfRoll(it.roll));
  const woCustomers = await loadWorkOrderCustomers([...new Set([...rollWo.values()].filter((x): x is string => !!x))]);

  const dispatches = new Set<string>();
  const rolls = new Set<string>();
  const dyeRolls = new Set<string>();
  const workOrders = new Set<string>();
  const customers = new Set<string>();
  const catRolls = new Map<string, Map<string, Prisma.Decimal>>();
  let total = new Prisma.Decimal(0);
  const firms = new Map<string, Firm>();
  for (const it of items) {
    const qty = it.roll?.currentQty ?? new Prisma.Decimal(0);
    dispatches.add(it.dispatchId);
    total = total.plus(qty);
    const f = firms.get(it.dispatch.subcontractorId) ?? newFirm(it.dispatch.subcontractor);
    firms.set(it.dispatch.subcontractorId, f);
    f.dispatches.add(it.dispatchId);
    f.qty = f.qty.plus(qty);
    if (!f.oldest || it.dispatch.dispatchedAt < f.oldest) f.oldest = it.dispatch.dispatchedAt;
    if (!it.rollId || !it.roll || f.rolls.has(it.rollId)) continue;
    rolls.add(it.rollId);
    f.rolls.add(it.rollId);
    if (f.dyeHouse) dyeRolls.add(it.rollId);
    for (const code of f.categoryCodes) catRolls.set(code, (catRolls.get(code) ?? new Map<string, Prisma.Decimal>()).set(it.rollId, qty));
    const wo = rollWo.get(it.rollId) ?? null;
    const cust = (wo ? woCustomers.get(wo)?.[0] : undefined) ?? null;
    if (wo) workOrders.add(wo);
    if (cust) customers.add(cust.id);
    addRollToFirm(f, it.roll, wo, cust);
  }
  const firmalar = [...firms.entries()]
    .map(([id, f]) => firmRow(id, f))
    .sort((a, b) => b.qty.comparedTo(a.qty) || a.etiket.localeCompare(b.etiket, "tr"))
    .map(({ qty: _qty, ...rest }) => rest);
  return {
    acikSevk: dispatches.size, kalanMiktar: total.toFixed(3), acikTop: rolls.size, boyahanedeTop: dyeRolls.size,
    isEmriSayisi: workOrders.size, musteriSayisi: customers.size, kategoriler: await categoryRows(catRolls), firmalar,
  };
}
