// Rapor/liste yanıtı → kutu verisi (saf). Uydurma yok: kaynağı kapalı (izinsiz/rapor kapalı) seri `null` kalır,
// pencere içinde kaydı olmayan gün 0'dır.
import { formatCount } from "./pano-bicim";
import { kovala } from "./pano-donem";
import type {
  InventoryScorecard, OrderIntake, OrderRow, QualityScorecard, ScrapScorecard, ShipmentRow, ShipmentScorecard,
  SubcontractScorecard, WipReport,
} from "./pano-kaynak";
import type {
  DistributionBox, KpiBox, MovementBox, OutsideBox, PanoPencere, QualityBox, RankBox, RankRow, StockBox, TrendBox, WipBox,
} from "./types";

const prev = (n: number | undefined): number | null => (typeof n === "number" ? n : null);

export const kpiUretim = (q: QualityScorecard): KpiBox => ({
  ana: { deger: q.summary.totalQty, onceki: prev(q.summary.prevTotalQty) }, anaBirim: "m", ek: `${formatCount(q.summary.rollCount)} top`,
});

export const kpiSevk = (s: ShipmentScorecard): KpiBox => ({
  ana: { deger: s.summary.shippedQty, onceki: prev(s.summary.prevShippedQty) }, anaBirim: "m", ek: `${formatCount(s.summary.shippedRollCount)} top`,
});

export const kpiSiparis = (o: OrderIntake): KpiBox => ({
  ana: { deger: o.summary.orderCount, onceki: prev(o.summary.prevOrderCount) }, anaBirim: "adet", ek: `${formatCount(o.summary.totalQty)} m`,
});

export const kpiFason = (f: SubcontractScorecard): KpiBox => ({
  ana: { deger: f.summary.dispatchedQty, onceki: prev(f.summary.prevDispatchedQty) }, anaBirim: "m", ek: `Dönen ${formatCount(f.summary.returnedQty)} m`,
});

export const kpiStok = (s: InventoryScorecard): KpiBox => ({
  ana: { deger: s.summary.finishedQty, onceki: null }, anaBirim: "m", ek: `Ham ${formatCount(s.summary.rawQty)} m`,
});

/** Üretim (biten) ve sevk eğilimi; kapalı kaynak null seri. İkisi de kapalıysa null (kutu çizilmez). */
export function egilim(p: Pick<PanoPencere, "kova" | "kovalar">, q: QualityScorecard | null, s: ShipmentScorecard | null): TrendBox | null {
  if (!q && !s) return null;
  const u = q ? kovala(p, q.daily.map((d) => ({ day: d.day, qty: d.totalQty }))) : null;
  const v = s ? kovala(p, s.daily) : null;
  return { kova: p.kova, noktalar: p.kovalar.map((k, i) => ({ anahtar: k, uretim: u ? u[i]! : null, sevk: v ? v[i]! : null })) };
}

/** Kumaş payı: ilk 5 + "Diğer" (toplamı bozmadan). */
export function dagilim(q: QualityScorecard, limit = 5): DistributionBox {
  const total = q.byItem.reduce((a, r) => a + r.totalQty, 0);
  const sirali = [...q.byItem].sort((a, b) => b.totalQty - a.totalQty);
  const ilk = sirali.slice(0, limit);
  const rest = sirali.slice(limit).reduce((a, r) => a + r.totalQty, 0);
  const yuzde = (m: number) => (total > 0 ? (m * 100) / total : 0);
  const dilimler = ilk.map((r) => ({ key: r.key, ad: r.label, metre: r.totalQty, yuzde: yuzde(r.totalQty) }));
  if (rest > 0) dilimler.push({ key: "__diger__", ad: "Diğer", metre: rest, yuzde: yuzde(rest) });
  return { toplam: total, dilimler };
}

const top5 = <T>(rows: readonly T[], qty: (r: T) => number): T[] => [...rows].sort((a, b) => qty(b) - qty(a)).slice(0, 5);

type Sekme = RankBox["sekmeler"][number];
const sekme = (key: string, etiket: string, satirlar: RankRow[] | null): Sekme | null => (satirlar ? { key, etiket, satirlar } : null);
const kutu = (list: Array<Sekme | null>): RankBox | null => {
  const sekmeler = list.filter((s): s is Sekme => s !== null);
  return sekmeler.length > 0 ? { sekmeler } : null;
};

/** En çok üretilen / sevk edilen kumaş — iki kaynak da kapalıysa null. */
export function enCokKumas(q: QualityScorecard | null, s: ShipmentScorecard | null): RankBox | null {
  return kutu([
    sekme("uretilen", "Üretilen", q && top5(q.byItem, (r) => r.totalQty).map((r) => ({ id: r.key, ad: r.label, metre: r.totalQty, ek: `${formatCount(r.rollCount)} top` }))),
    sekme("sevk", "Sevk", s && top5(s.byItem, (r) => r.qty).map((r) => ({ id: r.key, ad: r.label, metre: r.qty, ek: `${formatCount(r.count)} top` }))),
  ]);
}

/** En çok müşteri — sipariş (metre) / sevk (metre). */
export function enCokMusteri(o: OrderIntake | null, s: ShipmentScorecard | null): RankBox | null {
  return kutu([
    sekme("siparis", "Sipariş", o && top5(o.byCustomer, (r) => r.qty).map((r) => ({ id: r.key, ad: r.label, metre: r.qty, ek: `${formatCount(r.count)} sipariş` }))),
    sekme("sevk", "Sevk", s && top5(s.byCustomer, (r) => r.qty).map((r) => ({ id: r.key, ad: r.label, metre: r.qty, ek: `${formatCount(r.count)} top` }))),
  ]);
}

const UNGRADED = "__UNGRADED__";

export function kalite(q: QualityScorecard, scrap: ScrapScorecard | null): QualityBox {
  return {
    bitenMetre: q.summary.totalQty,
    bitenTop: q.summary.rollCount,
    kaliteler: q.grades.filter((g) => g.code !== UNGRADED && g.qty > 0).map((g) => ({ key: g.code, ad: g.name, metre: g.qty, yuzde: g.pct })),
    belirsizMetre: q.summary.ungradedQty,
    fire: scrap ? { metre: scrap.summary.scrapQty, yuzde: scrap.summary.scrapPct, hata: scrap.summary.defectsDetected } : null,
  };
}

export const stokOzeti = (s: InventoryScorecard): StockBox => ({
  mamul: { top: s.summary.finishedCount, metre: s.summary.finishedQty },
  ham: { top: s.summary.rawCount, metre: s.summary.rawQty },
  yariMamul: { top: s.summary.semiCount, metre: s.summary.semiQty },
});

const FASON_KIND = "SUBCONTRACTOR";

export function bekleyenMal(w: WipReport): WipBox {
  const istasyonlar = [...w.byStation].sort((a, b) => b.waitingQty - a.waitingQty)
    .map((s) => ({ key: s.key, ad: s.label, fason: s.kind === FASON_KIND, top: s.waitingCount, metre: s.waitingQty }));
  return { istasyonlar, toplam: { top: istasyonlar.reduce((a, s) => a + s.top, 0), metre: istasyonlar.reduce((a, s) => a + s.metre, 0) } };
}

export function fasondaki(w: WipReport): OutsideBox {
  const f = w.byStation.filter((s) => s.kind === FASON_KIND);
  return { top: f.reduce((a, s) => a + s.waitingCount, 0), metre: f.reduce((a, s) => a + s.waitingQty, 0), istasyon: f.length };
}

/** Son siparişler + son sevkler, zamana göre tek akış. */
export function hareketler(orders: OrderRow[] | null, shipments: ShipmentRow[] | null, limit = 8): MovementBox {
  const list = [
    ...(orders ?? []).map((o) => ({
      tur: "SIPARIS" as const, id: o.id, belgeNo: o.orderNumber, cari: o.customer?.name ?? null,
      miktar: o.sevk?.requested ?? null, birim: o.sevk?.unit ?? null, zaman: o.createdAt,
    })),
    ...(shipments ?? []).map((s) => ({
      tur: "SEVK" as const, id: s.id, belgeNo: s.shipmentNo, cari: s.customer?.name ?? null,
      miktar: s.totalMeters, birim: "m", zaman: s.dispatchedAt ?? s.createdAt,
    })),
  ];
  list.sort((a, b) => b.zaman.localeCompare(a.zaman));
  return { hareketler: list.slice(0, limit) };
}
