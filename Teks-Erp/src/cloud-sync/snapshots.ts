// ANLIK projeksiyonlar (§3.3): anlık turunda bütünüyle yeniden hesaplanan toplamlar. Panelin aynı soruya cevap
// veren servisleri AYNEN çağrılır (yeni iş mantığı yok — telefon ile panel aynı sayıyı görür); çıktı ADIYLA
// seçilen alanlardan kurulur ve KATI tel şemasından geçer. Kaynak: ana ürün 19aa48a9 `snapshots.ts` + `overview.ts`.
// Adnan farkı (yük): her kaynak tur başına BİR kez, SIRAYLA hesaplanır (`ozet` ile karneler aynı sonucu paylaşır;
// ana üründeki `Promise.all` yok); bir anlığın hatası yalnız o anlığı düşürür, kayıt eşitlemesini durdurmaz.
import { getStockScorecard } from "../services/reports/stock-scorecard.report.service";
import { getOpenOrderCoverage } from "../services/reports/open-order-coverage.report.service";
import { getShipmentScorecard } from "../services/reports/shipment-scorecard.report.service";
import { getSubcontractScorecard } from "../services/reports/subcontract-scorecard.report.service";
import { InventoryService } from "../services/inventory.service";
import { DashboardService } from "../services/dashboard.service";
import { FACTORY_TIMEZONE } from "../constants/time";
import { STANDARD_PERIODS, periodRange, type StandardPeriod } from "./periods";
import { SNAPSHOT_PROJECTIONS } from "./projections";
import { SNAPSHOT_WIRE_SCHEMAS, type SnapshotWireName } from "./snapshot-schemas";
import { buildSubcontractOpenData } from "./snapshot-fason";
import { remoteReportCatalog } from "./remote-reports";
import { snapshotDigest } from "./digest";
import { toWireValue } from "./wire";
import type { BuiltSnapshot } from "./packing";

/** "En çok" listelerinin uzunluğu (patron ekranı kartları). */
const TOP_N = 5;
const PERIOD_KEY: Readonly<Record<StandardPeriod, string>> = { bugun: "bugun", "bu-ay": "buAy", "gecen-ay": "gecenAy", "son-30-gun": "son30Gun" };

/** Üretim akışı kolonları — etiketler panel Kanban'ı ile AYNI (patron ile operatör aynı kolonu aynı adla konuşur). */
export const FLOW_COLUMNS = [
  ["hamStok", "Ham Stok"],
  ["yariMamul", "Yarı Mamul"],
  ["fason", "Fason'da"],
  ["kursun", "Kurşun Bekleyen"],
  ["tambur", "Tambur Bekleyen"],
  ["depo", "Depo"],
  ["sevk", "Sevk"],
] as const;

export function seal(projection: SnapshotWireName, raw: unknown): BuiltSnapshot {
  const data = toWireValue(SNAPSHOT_WIRE_SCHEMAS[projection].parse(toWireValue(raw)));
  // Tel sözleşmesi anlık veriyi nesne ya da dizi ister (`SnapshotEntrySchema.veri`); skaler sessizce gitmez.
  if (data === null || typeof data !== "object") throw new Error(`Anlık veri nesne/dizi değil: ${projection}`);
  return { projection, digest: snapshotDigest(data), data };
}

/** Tur başına tembel, tek seferlik kaynaklar — aynı rapor iki anlık için ikinci kez koşmaz. */
class RoundSources {
  private readonly memo = new Map<string, Promise<unknown>>();
  private once<T>(key: string, fn: () => Promise<T>): Promise<T> {
    const hit = this.memo.get(key);
    if (hit) return hit as Promise<T>;
    const p = fn();
    this.memo.set(key, p);
    return p;
  }
  stock = () => this.once("stock", () => getStockScorecard());
  coverage = () => this.once("coverage", () => getOpenOrderCoverage());
  flow = () => this.once("flow", () => new InventoryService().getProductionFlow({ includeQueues: true, includeSevk: true }));
  stations = () => this.once("stations", () => DashboardService.getStationsLiveState());
}

type Section = readonly [SnapshotWireName, () => Promise<BuiltSnapshot | null>];

/** `ozet` bölümleri — her biri AYRI anlıktır (uygulama kutusu bölüm başına); bir bölümün hatası yalnız onu düşürür. */
function overviewSections(src: RoundSources, now: Date, productionOn: boolean): Section[] {
  const sections: Section[] = [
    ["ozet.stok", async () => {
      const stock = await src.stock();
      return seal("ozet.stok", {
        hamMiktar: stock.summary.rawQty, yariMamulMiktar: stock.summary.semiQty, bitmisMiktar: stock.summary.finishedQty,
        oluMiktar: stock.summary.deadQty, oluStokGun: stock.summary.deadStockDays,
        enCokUrun: stock.byItem.slice(0, TOP_N).map((r) => ({ etiket: r.label, miktar: r.qty })),
      });
    }],
    ["ozet.siparis", async () => {
      const orders = await src.coverage();
      return seal("ozet.siparis", {
        acikKalem: orders.summary.openLineCount, acikMiktar: orders.summary.openQty, karsilanmayanMiktar: orders.summary.uncoveredQty,
        karsilanmaYuzde: orders.summary.coveragePct,
        enCokCari: orders.byCustomer.slice(0, TOP_N).map((r) => ({ etiket: r.label, miktar: r.openQty })),
      });
    }],
  ];
  if (productionOn) {
    sections.push(["ozet.uretim", async () => {
      const flow = (await src.flow()).data;
      if (!flow) return null;
      const stations = await src.stations();
      return seal("ozet.uretim", {
        // Toplamı fabrika hesaplar (bulut yalnız eşikle karşılaştırır).
        bugunTamamlananToplam: stations.reduce((n, s) => n + s.todayCompletedCount, 0),
        // `total` kolonun TAM sayımıdır (önizleme dizisi yalnız ilk 10).
        kolonlar: FLOW_COLUMNS.map(([key, label]) => ({ anahtar: key, etiket: label, adet: flow[key].total })),
        istasyonlar: stations.map((s) => ({ ad: s.name, kuyruk: s.queueCount, aktif: s.activeCount, bugunTamamlanan: s.todayCompletedCount })),
      });
    }]);
  }
  sections.push(["ozet.sevkiyat", async () => {
    const shipping: Record<string, unknown> = {};
    for (const p of STANDARD_PERIODS) {
      const s = (await getShipmentScorecard(periodRange(p, now))).summary;
      shipping[PERIOD_KEY[p]] = { sevkMiktari: s.shippedQty, sevkTopSayisi: s.shippedRollCount, tamamlananSiparis: s.completedOrders };
    }
    return seal("ozet.sevkiyat", shipping);
  }]);
  sections.push(["ozet.fason", async () => {
    const subcontract: Record<string, unknown> = {};
    for (const p of STANDARD_PERIODS) {
      const f = await getSubcontractScorecard(periodRange(p, now));
      subcontract[PERIOD_KEY[p]] = {
        acikMiktar: f.summary.openQty, acikKalem: f.summary.openItems, fireYuzde: f.summary.firePct,
        ortDonusGun: f.summary.avgTurnaroundDays,
        // `oldestOpen` en yaşlıdan sıralı gelir; boşsa açık sevk yok demektir.
        enEskiAcikGun: f.oldestOpen[0]?.daysOpen ?? null,
      };
    }
    return seal("ozet.fason", subcontract);
  }]);
  return sections;
}

function errorText(err: unknown): string {
  return err instanceof Error ? err.message.replace(/\s+/g, " ").slice(0, 200) : String(err);
}

async function buildStock(src: RoundSources): Promise<BuiltSnapshot> {
  const r = await src.stock();
  const s = r.summary;
  return seal("stok-karnesi", {
    ozet: {
      bitmisMiktar: s.finishedQty, bitmisAdet: s.finishedCount, hamMiktar: s.rawQty, hamAdet: s.rawCount,
      yariMamulMiktar: s.semiQty, yariMamulAdet: s.semiCount, yasliMiktar: s.agedQty, oluMiktar: s.deadQty,
      oluStokGun: s.deadStockDays, yassizAdet: s.unagedCount, yassizMiktar: s.unagedQty,
    },
    yasKovalari: r.byAge.map((a) => ({ anahtar: a.key, etiket: a.label, adet: a.count, miktar: a.qty, yuzde: a.pct })),
    urunler: r.byItem.map((i) => ({ anahtar: i.key, etiket: i.label, adet: i.count, miktar: i.qty, enEskiGun: i.oldestDays, siparissizMiktar: i.uncoveredQty })),
  });
}

async function buildCoverage(src: RoundSources): Promise<BuiltSnapshot> {
  const r = await src.coverage();
  const s = r.summary;
  const bucket = (b: (typeof r.byCustomer)[number]) => ({
    anahtar: b.key, etiket: b.label, kalem: b.lineCount, acikMiktar: b.openQty, depodanMiktar: b.fromWarehouseQty,
    uretimdenMiktar: b.fromProductionQty, karsilanmayanMiktar: b.uncoveredQty, karsilanmaYuzde: b.coveragePct,
  });
  return seal("acik-siparis-karsilama", {
    ozet: {
      acikKalem: s.openLineCount, acikMiktar: s.openQty, depodanMiktar: s.fromWarehouseQty, uretimdenMiktar: s.fromProductionQty,
      karsilanmayanMiktar: s.uncoveredQty, hamEksikMiktar: s.materialGapQty, tamKarsilanan: s.fullyCoveredLines,
      kismiKarsilanan: s.partiallyCoveredLines, karsilanmayan: s.uncoveredLines, karsilanmaYuzde: s.coveragePct,
    },
    cariler: r.byCustomer.map(bucket),
    urunler: r.byItem.map(bucket),
  });
}

async function buildProductionFlow(src: RoundSources): Promise<BuiltSnapshot> {
  const data = (await src.flow()).data;
  const stations = await src.stations();
  return seal("uretim-akisi", {
    kolonlar: FLOW_COLUMNS.map(([key, label]) => ({ anahtar: key, etiket: label, adet: data ? data[key].total : 0 })),
    istasyonlar: stations.map((s) => ({
      id: s.id, kod: s.code, ad: s.name, tur: s.type, kuyruk: s.queueCount, aktif: s.activeCount,
      bugunTamamlanan: s.todayCompletedCount, bugunSevk: s.todayDispatchedCount,
    })),
  });
}

/** Adnan tek saat dilimiyle çalışır (`constants/time.ts`); dönem listesi boş ⇒ her an taban dilimdedir. */
function buildFacility(): BuiltSnapshot {
  return seal("tesis", { saatDilimi: FACTORY_TIMEZONE, tabanDilim: FACTORY_TIMEZONE, donemler: [] });
}

export interface SnapshotContext {
  readonly now: Date;
  readonly productionOn: boolean;
  /** Test/ölçüm kancası: yalnız bu adlar kurulur (verilmezse hepsi). */
  readonly only?: ReadonlySet<string>;
}

export interface SnapshotBuild {
  readonly snapshots: BuiltSnapshot[];
  /** Projeksiyon adı → hesap süresi (ms); ölçüm ve log için. */
  readonly timings: Array<{ readonly name: string; readonly ms: number }>;
  /** Kurulamayan anlıklar (yalnız o anlık düşer; tur devam eder). */
  readonly errors: Array<{ readonly name: string; readonly message: string }>;
}

/** Turun anlık kayıtları — modülü kapalı projeksiyon ÜRETİLMEZ (§4.6). Asla fırlatmaz. */
export async function buildSnapshots(ctx: SnapshotContext): Promise<SnapshotBuild> {
  const src = new RoundSources();
  const out: BuiltSnapshot[] = [];
  const timings: SnapshotBuild["timings"] = [];
  const errors: SnapshotBuild["errors"] = [];
  for (const p of SNAPSHOT_PROJECTIONS) {
    if (ctx.only && !ctx.only.has(p.name)) continue;
    if (p.module === "production.enabled" && !ctx.productionOn) continue;
    const t0 = performance.now();
    try {
      switch (p.name) {
        case "ozet":
          // Bölüm hatası özeti düşürmez: hatalı bölüm gönderilmez (bulutta son geçerli hali kalır), diğerleri gider.
          for (const [name, build] of overviewSections(src, ctx.now, ctx.productionOn)) {
            try {
              const s = await build();
              if (s) out.push(s);
            } catch (err) {
              errors.push({ name, message: errorText(err) });
            }
          }
          break;
        case "stok-karnesi": out.push(await buildStock(src)); break;
        case "acik-siparis-karsilama": out.push(await buildCoverage(src)); break;
        case "uretim-akisi": out.push(await buildProductionFlow(src)); break;
        case "fason-acik": out.push(seal("fason-acik", await buildSubcontractOpenData())); break;
        case "rapor-katalogu": out.push(seal("rapor-katalogu", { raporlar: await remoteReportCatalog() })); break;
        case "tesis": out.push(buildFacility()); break;
        default: throw new Error(`Anlık kurucu yok: ${p.name}`);
      }
    } catch (err) {
      errors.push({ name: p.name, message: errorText(err) });
    }
    timings.push({ name: p.name, ms: Math.round(performance.now() - t0) });
  }
  return { snapshots: out, timings, errors };
}
