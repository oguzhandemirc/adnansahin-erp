// CARİ ÖZETİ anlığı (M2a — Adnan'a özgü sözleşme genişletmesi): müşteri başına toplamlar, açık sipariş, en çok
// alınan ürünler. Bulut hesap yapmaz: her sayı burada, panelin TEK TANIMLARIYLA kurulur — sevk BRÜT `_shipped.ts`
// (müşteri karnesinin sevk sütunu), iade iade karnesi (`getReturnScorecard.byCustomer`, iptal edilen iade dışarıda),
// sipariş/kalem müşteri karnesinin kapsamı (iptal sipariş ve iptal kalem dışarıda), açık miktar `siparis.acikMiktar`
// ile aynı formül. Farklı birimler TOPLANMAZ (birim başına ayrı satır); para alanı YOK; iade sevkten DÜŞÜLMEZ.
import { OrderStatus, Prisma } from "@prisma/client";
import prisma from "../lib/prisma";
import { isActiveLine, isMeasuredLine } from "../services/helpers/order-line-scope.helper";
import { isDeadlineOpenStatus } from "../services/helpers/order-deadline.helper";
import { collectShipped, collectShippedWeight } from "../services/reports/_shipped";
import { getReturnScorecard } from "../services/reports/return-scorecard.report.service";
import { round1 } from "../services/reports/_breakdown";
import { factoryDayStart } from "../constants/time";
import type { DateRange } from "../services/reports/_shared";

/** "En çok alınan ürünler" listesinin uzunluğu (dönem başına). */
export const CARI_TOP_N = 10;
const DAY_MS = 86_400_000;

/** Dönemler: tüm zamanlar + son 12 ay (365 gün, başı FABRİKA gününe hizalı: sınır gün içinde kaymaz, veri
 *  değişmedikçe içerik özeti de değişmez ⇒ anlık her turda yeniden gönderilmez). */
export function cariSummaryPeriods(now: Date): { readonly tumZamanlar: DateRange; readonly son12Ay: DateRange } {
  return { tumZamanlar: { from: new Date(0), to: now }, son12Ay: { from: factoryDayStart(new Date(now.getTime() - 365 * DAY_MS)), to: now } };
}

const D0 = (): Prisma.Decimal => new Prisma.Decimal(0);
const num3 = (d: Prisma.Decimal): number => Number(d.toFixed(3));

interface ProductAcc { urunId: string; urunAdi: string; renkId: string | null; renkAdi: string | null; birim: string; miktar: Prisma.Decimal; orders: Set<string> }
interface PeriodAcc {
  orders: Set<string>;
  lines: number;
  qtyByUnit: Map<string, Prisma.Decimal>;
  products: Map<string, ProductAcc>;
  sevk: { metre: number; top: number; kg: number; tartiliCuval: number; cuval: number };
  iade: { adet: number; metre: number };
}
interface CustomerAcc {
  periods: { tumZamanlar: PeriodAcc; son12Ay: PeriodAcc };
  openOrders: Set<string>;
  openLines: number;
  openByUnit: Map<string, Prisma.Decimal>;
  lastOrder: Date | null;
  lastShipment: Date | null;
}

const emptyPeriod = (): PeriodAcc => ({
  orders: new Set(), lines: 0, qtyByUnit: new Map(), products: new Map(),
  sevk: { metre: 0, top: 0, kg: 0, tartiliCuval: 0, cuval: 0 }, iade: { adet: 0, metre: 0 },
});

type PeriodKey = "tumZamanlar" | "son12Ay";
const PERIOD_KEYS: readonly PeriodKey[] = ["tumZamanlar", "son12Ay"];

const unitRows = (m: Map<string, Prisma.Decimal>) =>
  [...m.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([birim, miktar]) => ({ birim, miktar: num3(miktar) }));

const isoOrNull = (d: Date | null): string | null => (d ? d.toISOString() : null);

/** Kayıt sırası belirlenimli olsun (özet değişmediyse içerik özeti de değişmez). */
function laterOf(a: Date | null, b: Date | null): Date | null {
  if (!a) return b;
  if (!b) return a;
  return a.getTime() >= b.getTime() ? a : b;
}

/** Anlığın ham verisi — `seal("cari-ozeti", …)` katı şemadan geçirir. Sorgular SIRAYLA koşar (yük kuralı). */
export async function buildCustomerSummaryData(now: Date): Promise<{ son12AyBaslangic: string; cariler: Record<string, unknown> }> {
  const ranges = cariSummaryPeriods(now);
  const byCustomer = new Map<string, CustomerAcc>();
  const acc = (id: string): CustomerAcc => {
    let a = byCustomer.get(id);
    if (!a) {
      a = { periods: { tumZamanlar: emptyPeriod(), son12Ay: emptyPeriod() }, openOrders: new Set(), openLines: 0, openByUnit: new Map(), lastOrder: null, lastShipment: null };
      byCustomer.set(id, a);
    }
    return a;
  };

  // Sipariş tarafı: müşteri karnesinin kapsamı — iptal sipariş "verilmemiş", iptal kalem işe sayılmaz.
  const orders = await prisma.order.findMany({
    where: { status: { not: OrderStatus.CANCELLED }, customer: { mergedIntoId: null } },
    select: {
      id: true, customerId: true, status: true, orderDate: true,
      lines: { select: { itemId: true, colorId: true, unit: true, quantity: true, shippedQty: true, cancelledAt: true, item: { select: { name: true } }, color: { select: { name: true } } } },
    },
    orderBy: [{ orderDate: "asc" }, { id: "asc" }],
  });
  for (const o of orders) {
    const c = acc(o.customerId);
    c.lastOrder = laterOf(c.lastOrder, o.orderDate);
    const open = isDeadlineOpenStatus(o.status);
    if (open) c.openOrders.add(o.id);
    const inPeriods = PERIOD_KEYS.filter((k) => o.orderDate >= ranges[k].from && o.orderDate <= ranges[k].to);
    for (const k of inPeriods) c.periods[k].orders.add(o.id);
    for (const l of o.lines) {
      if (!isActiveLine(l)) continue;
      const unit = String(l.unit);
      const qty = new Prisma.Decimal(l.quantity);
      if (open) {
        c.openLines++;
        const rest = qty.minus(new Prisma.Decimal(l.shippedQty));
        if (isMeasuredLine(l) && rest.gt(0)) c.openByUnit.set(unit, (c.openByUnit.get(unit) ?? D0()).plus(rest));
      }
      for (const k of inPeriods) {
        const p = c.periods[k];
        p.lines++;
        p.qtyByUnit.set(unit, (p.qtyByUnit.get(unit) ?? D0()).plus(qty));
        const key = `${l.itemId}|${l.colorId ?? ""}|${unit}`;
        const prod = p.products.get(key) ?? { urunId: l.itemId, urunAdi: l.item.name, renkId: l.colorId, renkAdi: l.color?.name ?? null, birim: unit, miktar: D0(), orders: new Set<string>() };
        prod.miktar = prod.miktar.plus(qty);
        prod.orders.add(o.id);
        p.products.set(key, prod);
      }
    }
  }

  for (const k of PERIOD_KEYS) {
    // Sevk BRÜT, tek tanım (`_shipped.ts`): canlı sevk + iade geri-eklemesi + doğrudan sevk; müşteri karnesiyle aynı.
    for (const cell of await collectShipped(ranges[k])) {
      const s = acc(cell.customerId).periods[k].sevk;
      s.metre += cell.qty;
      s.top += cell.rollCount;
    }
    for (const cell of await collectShippedWeight(ranges[k])) {
      const s = acc(cell.customerId).periods[k].sevk;
      s.kg += cell.kg;
      s.tartiliCuval += cell.weighedSacks;
      s.cuval += cell.totalSacks;
    }
    // İade ayrı belgedir: iade karnesinin müşteri kırılımı (iptal edilen iade dışarıda); sevkten düşülmez.
    for (const row of (await getReturnScorecard(ranges[k])).byCustomer) {
      const i = acc(row.key).periods[k].iade;
      i.adet += row.count;
      i.metre += row.qty;
    }
  }

  const lastDispatch = await prisma.shipment.groupBy({ by: ["customerId"], where: { status: "DISPATCHED", dispatchedAt: { not: null } }, _max: { dispatchedAt: true } });
  for (const r of lastDispatch) acc(r.customerId).lastShipment = laterOf(acc(r.customerId).lastShipment, r._max.dispatchedAt);
  const lastDirect = await prisma.directShipment.groupBy({ by: ["customerId"], _max: { shippedAt: true } });
  for (const r of lastDirect) acc(r.customerId).lastShipment = laterOf(acc(r.customerId).lastShipment, r._max.shippedAt);

  const cariler: Record<string, unknown> = {};
  for (const id of [...byCustomer.keys()].sort()) {
    const c = byCustomer.get(id)!;
    const period = (p: PeriodAcc) => ({
      siparisSayisi: p.orders.size,
      kalemSayisi: p.lines,
      siparisMiktari: unitRows(p.qtyByUnit),
      sevk: { metre: round1(p.sevk.metre), top: p.sevk.top, kg: round1(p.sevk.kg), tartiliCuval: p.sevk.tartiliCuval, cuval: p.sevk.cuval },
      iade: { adet: p.iade.adet, metre: round1(p.iade.metre) },
      enCokUrun: [...p.products.values()]
        .sort((a, b) => b.miktar.comparedTo(a.miktar) || b.orders.size - a.orders.size || a.urunAdi.localeCompare(b.urunAdi, "tr") || (a.renkAdi ?? "").localeCompare(b.renkAdi ?? "", "tr"))
        .slice(0, CARI_TOP_N)
        .map((x) => ({ urunId: x.urunId, urunAdi: x.urunAdi, renkId: x.renkId, renkAdi: x.renkAdi, birim: x.birim, miktar: num3(x.miktar), siparisSayisi: x.orders.size })),
    });
    cariler[id] = {
      tumZamanlar: period(c.periods.tumZamanlar),
      son12Ay: period(c.periods.son12Ay),
      acik: { siparisSayisi: c.openOrders.size, kalemSayisi: c.openLines, acikMiktar: unitRows(c.openByUnit) },
      sonSiparisTarihi: isoOrNull(c.lastOrder),
      sonSevkTarihi: isoOrNull(c.lastShipment),
    };
  }
  return { son12AyBaslangic: ranges.son12Ay.from.toISOString(), cariler };
}
