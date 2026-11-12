// =============================================================================
// BEKÇİ — PATRON BULUTU ANLIK PROJEKSİYONLARI (D3b): sözleşme · finans/termin yok · doğruluk · kapalı · sıklık
// =============================================================================
// ÖLÇTÜĞÜ:
//  §1 Katalog (DB'siz): 8 anlık (`ozet` 5 bölümlü) — tel adları = katı şema anahtarları ⊂ bulut kataloğunun
//     ANLIK adları; izinler bulut okuma izinleri; şemalarda hiçbir alan adı finans (fiyat · tutar · bakiye ·
//     döviz …) ya da termin (geciken · zamanında · gecikme · termin) sözcüğü taşımaz; finans/emanet/sağlık
//     anlıkları katalogda YOK.
//  §2 Kurulum (`_test` DB): her anlık kurulur, `SnapshotEntrySchema`ya uyar, üretilen veride finans anahtarı
//     yok; üretim modülü kapalıyken `ozet.uretim` ve `uretim-akisi` ÜRETİLMEZ; bir kaynak servis fırlatırsa
//     yalnız ona bağlı anlıklar düşer, diğerleri kurulur (buildSnapshots fırlatmaz); `ozet` bölüm bazında
//     yalıtılır — istasyon hatası yalnız `ozet.uretim`i düşürür, diğer dört bölüm gider.
//  §3 Doğruluk: anlık ↔ bağımsız SQL ↔ panel servisi (açık sipariş · bugün brüt sevk · mamul stok · istasyon
//     kuyruk/bugün · fason açık · fasondaki/boyahanedeki top ↔ üretim akışı "Fason'da" kolonu · firma başına top +
//     kategori) — `scripts/lib/anlik-bagimsiz.ts`; fixture: boyahaneye 2 top + zımparaya 1 top açık fason sevki.
//  §4 KAPALI: ön koşul yokken tur `GONDERILMEDI`, anlık hesabı yok (`snapshotRun` null), dış istek yok; iş tıkı
//     da hesap yapmaz (`lastSnapshotAt` null); `snapshots:false` turunda da hesap yok.
//  §5 Sıklık: anlıklar aralık başına EN ÇOK bir kez hesaplanır (devam turu hesaplamaz); içerik özeti aynıysa
//     ikinci hesap HİÇBİR anlık göndermez; bulut hatasında (`HATA`) hesap zamanı ilerlemez.
//
// DB: oturumun `_test` veritabanı (koşucu kapısı). Yazdığı tek şey eşitleme filigranlarıdır; `finally`de
// birebir geri alınır.
//
// NEGATİF SONDA (2026-11-12, üçü de kırmızı verdi, geri alındı):
//   · `stok-karnesi` şemasına ve kurucusuna `tutar` alanı eklendi → §1 + §2 finans adı ✗
//   · iş tıkında `const snapshots = true` (her turda hesap) → §5 "devam turu hesaplamaz" ✗
//   · `stok-karnesi` `bitmisMiktar` ← `s.rawQty` (yanlış eşleme) → §3 mamul stok ✗
//   · `ozet` bölümleri tek try içinde kuruldu (eski davranış) → §2 "ozet bölüm yalıtımı" ✗
// NEGATİF SONDA (2026-11-13, kırmızı verdi, geri alındı):
//   · `boyahanedeTop` ← tüm açık toplar (kategori süzgeci yok) → §3 fixture farkı + "boyahanedeki top" ✗
//   · firma `kategoriler` boş dizi → §3 "firma başına top + kategori uyuşmazlığı" ✗
// =============================================================================
import { gunzipSync } from "node:zlib";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { Prisma } from "@prisma/client";
import prisma from "../src/lib/prisma";
import { CLOUD_READ_PERMISSIONS, SNAPSHOT_PROJECTIONS, projectionPermissions } from "../src/cloud-sync/projections";
import { SNAPSHOT_WIRE_SCHEMAS } from "../src/cloud-sync/snapshot-schemas";
import { buildSnapshots } from "../src/cloud-sync/snapshots";
import { runSyncRound } from "../src/cloud-sync/sync-round";
import { PackageSchema, SnapshotEntrySchema, type SyncResponse } from "../src/cloud-sync/wire";
import type { CloudEligibility } from "../src/cloud-sync/eligibility";
import type { CloudTransport } from "../src/cloud-sync/cloud-client";
import { generateKeyFile, loadKeyFile } from "../src/lib/cloud-signing/key-file";
import { DashboardService } from "../src/services/dashboard.service";
import { __configureCloudSyncForTests, getCloudSyncStatus, runCloudSyncTick } from "../src/jobs/cloud-sync.job";
import { accuracyRows, rowOk } from "./lib/anlik-bagimsiz";
import { ensureTestDyeHouse, ensureTestSander } from "./fixture-subcontractor";

let pass = 0, fail = 0;
function check(l: string, ok: boolean, x = ""): void {
  if (ok) { pass++; console.log(`  ✓ ${l}${x ? ` — ${x}` : ""}`); }
  else { fail++; console.log(`  ✗ FAIL: ${l}${x ? ` — ${x}` : ""}`); }
}

const FINANCE = /fiyat|tutar|bakiye|maliyet|odeme|doviz|kdv|price|amount|balance|cost|paid|payment|currency|vat|tax|kur$/i;
const DEADLINE = /gecik|zamaninda|termin|vade/i;
/** Bulut kataloğunun ANLIK adları (`patron/sunucu/src/catalog/projections.ts`, sözleşme SABİT). */
const CLOUD_SNAPSHOT_NAMES = new Set([
  "ozet.stok", "ozet.siparis", "ozet.uretim", "ozet.sevkiyat", "ozet.fason", "ozet-finans", "ozet-masraf", "karlilik-ozet",
  "emanet-bakiye", "fason-acik", "hizmet-geliri", "stok-karnesi", "acik-siparis-karsilama", "rapor-katalogu", "uretim-akisi", "saglik", "tesis", "cari-ozeti",
]);
const STAMP = `TEST-D3B-${Date.now()}-`;
const fx = { rolls: [] as string[], orders: [] as string[], items: [] as string[], customers: [] as string[], wos: [] as string[], dispatches: [] as string[] };
const NOT_IN_ADNAN =["ozet-finans", "ozet-masraf", "karlilik-ozet", "hizmet-geliri", "emanet-bakiye", "saglik"];

function keysOf(v: unknown, out: Set<string> = new Set()): Set<string> {
  if (Array.isArray(v)) for (const x of v) keysOf(x, out);
  else if (v && typeof v === "object") for (const [k, x] of Object.entries(v)) { out.add(k); keysOf(x, out); }
  return out;
}
/** JSON şemasındaki bütün özellik adları (iç içe nesne ve dizi elemanları dahil). */
function schemaKeys(s: z.ZodType): Set<string> {
  const out = new Set<string>();
  const walk = (j: unknown): void => {
    if (Array.isArray(j)) { j.forEach(walk); return; }
    if (!j || typeof j !== "object") return;
    const o = j as Record<string, unknown>;
    if (o.properties && typeof o.properties === "object") for (const k of Object.keys(o.properties)) out.add(k);
    Object.values(o).forEach(walk);
  };
  walk(z.toJSONSchema(s));
  return out;
}

function wireNames(): string[] {
  return SNAPSHOT_PROJECTIONS.flatMap((p) => (p.sections ? p.sections.map((s) => s.name) : [p.name]));
}

async function main(): Promise<void> {
  console.log("\n§1 Katalog ve tel şemaları");
  check("8 anlık projeksiyon (M2a: + cari-ozeti)", SNAPSHOT_PROJECTIONS.length === 8, SNAPSHOT_PROJECTIONS.map((p) => p.name).join(","));
  const names = wireNames();
  const schemaNames = Object.keys(SNAPSHOT_WIRE_SCHEMAS);
  check("tel adları = katı şema anahtarları", names.length === schemaNames.length && names.every((n) => schemaNames.includes(n)), names.join(","));
  check("her tel adı bulut kataloğunda ANLIK", names.every((n) => CLOUD_SNAPSHOT_NAMES.has(n)), names.filter((n) => !CLOUD_SNAPSHOT_NAMES.has(n)).join(","));
  check("finans/emanet/sağlık anlığı katalogda yok", NOT_IN_ADNAN.every((n) => !names.includes(n) && !SNAPSHOT_PROJECTIONS.some((p) => p.name === n)));
  const perms = projectionPermissions();
  const readPerms = new Set<string>(CLOUD_READ_PERMISSIONS);
  check("her tel adının izni bulut okuma izni", names.every((n) => readPerms.has(perms.get(n) ?? "")));
  const allKeys = new Set<string>();
  for (const [n, s] of Object.entries(SNAPSHOT_WIRE_SCHEMAS)) { allKeys.add(n); for (const k of schemaKeys(s)) allKeys.add(k); }
  check("şema alanlarında finans adı yok", ![...allKeys].some((k) => FINANCE.test(k)), [...allKeys].filter((k) => FINANCE.test(k)).join(","));
  check("şema alanlarında termin/gecikme adı yok", ![...allKeys].some((k) => DEADLINE.test(k)), [...allKeys].filter((k) => DEADLINE.test(k)).join(","));

  console.log("\n§2 Kurulum (test DB)");
  const now = new Date();
  const b = await buildSnapshots({ now, productionOn: true });
  check("hata yok", b.errors.length === 0, JSON.stringify(b.errors));
  const built = b.snapshots.map((s) => s.projection);
  check("bütün tel adları kuruldu", names.every((n) => built.includes(n)), built.join(","));
  check("her anlık SnapshotEntrySchema'ya uyar", b.snapshots.every((s) => SnapshotEntrySchema.safeParse({ projeksiyon: s.projection, icerikOzeti: s.digest, veri: s.data }).success));
  const dataKeys = keysOf(b.snapshots.map((s) => s.data));
  check("üretilen veride finans anahtarı yok", ![...dataKeys].some((k) => FINANCE.test(k)), [...dataKeys].filter((k) => FINANCE.test(k)).join(","));
  const off = await buildSnapshots({ now, productionOn: false });
  const offNames = off.snapshots.map((s) => s.projection);
  check("üretim kapalı: ozet.uretim + uretim-akisi üretilmez", !offNames.includes("ozet.uretim") && !offNames.includes("uretim-akisi") && offNames.includes("ozet.stok"), offNames.join(","));
  const origStations = DashboardService.getStationsLiveState;
  DashboardService.getStationsLiveState = () => Promise.reject(new Error("sonda: istasyon servisi düştü"));
  try {
    const broken = await buildSnapshots({ now, productionOn: true });
    const bn = broken.snapshots.map((s) => s.projection);
    check("kaynak hatası yalnız bağlı anlıkları düşürür", broken.errors.some((e) => e.name === "uretim-akisi") && bn.includes("stok-karnesi") && bn.includes("tesis") && bn.includes("fason-acik"), `${JSON.stringify(broken.errors.map((e) => e.name))} · kurulan ${bn.length}`);
    const errNames = broken.errors.map((e) => e.name).sort().join(",");
    check("ozet bölüm yalıtımı: istasyon hatası yalnız ozet.uretim'i düşürür, diğer 4 bölüm gider",
      errNames === "ozet.uretim,uretim-akisi" && !bn.includes("ozet.uretim") && ["ozet.stok", "ozet.siparis", "ozet.sevkiyat", "ozet.fason"].every((n) => bn.includes(n)),
      `hatalar ${errNames} · kurulan ${bn.join(",")}`);
  } finally {
    DashboardService.getStationsLiveState = origStations;
  }

  console.log("\n§3 Doğruluk (anlık ↔ bağımsız SQL ↔ panel servisi)");
  // Kendi fixture'ı: 2 mamul top (123,4 + 50) + 1 ham top (77) + 1 açık kalem (300 m). Ölçü FARKTIR (ortam verisi karışmaz).
  const pick = (snaps: typeof b.snapshots, name: string, k: string): number =>
    Number(((snaps.find((s) => s.projection === name)?.data as Record<string, Record<string, unknown>>)?.ozet ?? {})[k] ?? NaN);
  const base = (await buildSnapshots({ now, productionOn: true })).snapshots;
  const item = await prisma.item.create({ data: { code: `${STAMP}I`, name: `${STAMP}Kumaş`, itemType: "FABRIC" }, select: { id: true } });
  fx.items.push(item.id);
  const customer = await prisma.customer.create({ data: { code: `${STAMP}C`, name: `${STAMP}Müşteri` }, select: { id: true } });
  fx.customers.push(customer.id);
  for (const [i, [qty, status]] of ([[123.4, "WAREHOUSE"], [50, "WAREHOUSE"], [77, "STOCK"]] as const).entries()) {
    const r = await prisma.roll.create({
      data: { itemId: item.id, initialQty: qty, currentQty: qty, status, entrySource: "SUPPLIER_RECEIPT", barcode: `${STAMP}R${i}` },
      select: { id: true },
    });
    fx.rolls.push(r.id);
  }
  const order = await prisma.order.create({ data: { orderNumber: `${STAMP}O`, customerId: customer.id, status: "APPROVED" }, select: { id: true } });
  fx.orders.push(order.id);
  await prisma.orderLine.create({ data: { orderId: order.id, itemId: item.id, quantity: 300, shippedQty: 0 } });
  // Fason: boyahane firmasına 2 top, zımpara firmasına 1 top — açık sevk (iş emri + adım + parti başlığı CHECK'i).
  const [dye, sander] = [await ensureTestDyeHouse(), await ensureTestSander()];
  const fasonSt = await prisma.station.findFirst({ where: { code: "BOYA_FASON" }, select: { id: true } });
  if (!fasonSt) throw new Error("Seed fixture eksik: BOYA_FASON istasyonu");
  const wo = await prisma.workOrder.create({
    data: { workOrderNumber: `${STAMP}WO`, type: "STOCK_PRODUCTION", status: "IN_PROGRESS", targetItemId: item.id, steps: { create: [{ stationId: fasonSt.id, stepSequence: 1, status: "ACTIVE" }] } },
    select: { id: true, steps: { select: { id: true } } },
  });
  fx.wos.push(wo.id);
  const batch = await prisma.batch.create({ data: { batchNumber: `${STAMP}P`, workOrderId: wo.id }, select: { id: true } });
  for (const [k, [firm, count]] of ([[dye.id, 2], [sander.id, 1]] as const).entries()) {
    const d = await prisma.subcontractorDispatch.create({
      data: { dispatchNo: `${STAMP}SD${k}`, workOrderId: wo.id, stepId: wo.steps[0]!.id, batchId: batch.id, subcontractorId: firm },
      select: { id: true },
    });
    fx.dispatches.push(d.id);
    for (let j = 0; j < count; j++) {
      const r = await prisma.roll.create({
        data: { itemId: item.id, initialQty: 40, currentQty: 40, status: "AT_SUBCONTRACTOR", entrySource: "SUPPLIER_RECEIPT", barcode: `${STAMP}F${k}${j}` },
        select: { id: true },
      });
      fx.rolls.push(r.id);
      await prisma.subcontractorDispatchItem.create({ data: { dispatchId: d.id, rollId: r.id, dispatchedQty: 40 } });
    }
  }
  const acc = await accuracyRows(now);
  const delta = (name: string, k: string) => Math.round((pick(acc.snapshots, name, k) - pick(base, name, k)) * 10) / 10;
  const top = (snaps: typeof b.snapshots, k: string): number => Number((snaps.find((x) => x.projection === "fason-acik")?.data as Record<string, unknown>)?.[k] ?? NaN);
  const fasonDelta = (k: string) => top(acc.snapshots, k) - top(base, k);
  check("fixture farkı: fasonda +3 top, boyahanede +2", fasonDelta("acikTop") === 3 && fasonDelta("boyahanedeTop") === 2, `${fasonDelta("acikTop")} · ${fasonDelta("boyahanedeTop")}`);
  const dyeRow = ((acc.snapshots.find((x) => x.projection === "fason-acik")?.data as { firmalar?: Array<Record<string, unknown>> })?.firmalar ?? []).find((f) => f.fasonFirmaId === dye.id);
  check("firma satırı: boyahane 2 top, kategori Boyahane", dyeRow?.acikTop === 2 && Array.isArray(dyeRow.kategoriler) && (dyeRow.kategoriler as string[]).includes("Boyahane"), JSON.stringify(dyeRow));
  check("fixture farkı: mamul stok +173,4 m / +2 top", delta("stok-karnesi", "bitmisMiktar") === 173.4 && delta("stok-karnesi", "bitmisAdet") === 2, `${delta("stok-karnesi", "bitmisMiktar")} m · ${delta("stok-karnesi", "bitmisAdet")} top`);
  check("fixture farkı: ham stok +77 m", delta("stok-karnesi", "hamMiktar") === 77, `${delta("stok-karnesi", "hamMiktar")}`);
  check("fixture farkı: açık sipariş +1 kalem / +300 m", delta("acik-siparis-karsilama", "acikKalem") === 1 && delta("acik-siparis-karsilama", "acikMiktar") === 300);
  for (const r of acc.rows) check(r.soru, rowOk(r), `anlık ${r.anlik} · SQL ${r.sql} · panel ${r.panel ?? "—"}`);

  // §4–§5 ortak: geçerli anahtar, sahte bulut.
  const dir = mkdtempSync(path.join(tmpdir(), "tst-patron-anlik-"));
  const keyPath = path.join(dir, "kurulum.key");
  generateKeyFile(keyPath);
  const key = loadKeyFile(keyPath);
  if (!key.ok) throw new Error("anahtar dosyası kurulamadı");
  const openElig: Extract<CloudEligibility, { ok: true }> = { ok: true, baseUrl: "http://127.0.0.1:9", installationId: randomUUID(), privateKey: key.key.privateKey, intervalMinutes: 5 };
  const wmBefore = await prisma.syncWatermark.findMany();
  let calls = 0;
  const snapshotCounts: number[] = [];
  const accepting: CloudTransport = (req) => {
    calls++;
    const pkg = PackageSchema.parse(JSON.parse(gunzipSync(req.body).toString("utf8")));
    snapshotCounts.push(pkg.anliklar.length);
    const resp: SyncResponse = {
      v: 1, paketId: pkg.paketId,
      kabul: pkg.kayitlar.map((e) => ({ projeksiyon: e.projeksiyon, filigran: e.filigran.yeni })),
      ret: [], istenen: [], ufukTarihi: {}, sozlesmeUyarisi: null,
    };
    return Promise.resolve({ status: 200, body: Buffer.from(JSON.stringify(resp)) });
  };
  const failing: CloudTransport = () => { calls++; return Promise.resolve({ status: 503, body: Buffer.from("{}") }); };
  try {
    console.log("\n§4 Kapalı");
    calls = 0;
    const closed = await runSyncRound({ kind: "ARTIMLI", snapshots: true }, { transport: accepting, eligibility: async () => ({ ok: false, reason: "BULUT_ADRESI_YOK" }) as CloudEligibility });
    check("ön koşul yok: GONDERILMEDI, anlık hesabı yok", closed.status === "GONDERILMEDI" && closed.snapshotRun === null, closed.status);
    __configureCloudSyncForTests({ reset: true, transport: accepting, eligibility: async () => ({ ok: false, reason: "BULUT_ADRESI_YOK" }) as CloudEligibility, forceDue: true });
    await runCloudSyncTick(Date.now());
    check("iş tıkı kapalıyken hesap yok", getCloudSyncStatus().lastSnapshotAt === null && getCloudSyncStatus().lastOutcome === null);
    check("kapalıyken dış istek yok", calls === 0, `${calls}`);
    const noSnap = await runSyncRound({ kind: "ARTIMLI", snapshots: false }, { transport: accepting, eligibility: async () => openElig });
    check("snapshots:false turunda hesap yok", noSnap.snapshotRun === null && snapshotCounts.every((n) => n === 0), noSnap.status);

    console.log("\n§5 Sıklık ve içerik özeti");
    __configureCloudSyncForTests({ reset: true, transport: accepting, eligibility: async () => openElig, forceDue: true });
    const t0 = Date.now();
    snapshotCounts.length = 0;
    await runCloudSyncTick(t0);
    const first = getCloudSyncStatus().lastSnapshotAt;
    check("ilk tur anlıkları hesaplar ve gönderir", first === t0 && snapshotCounts.reduce((a, n) => a + n, 0) >= names.length, `${snapshotCounts.join("+")}`);
    __configureCloudSyncForTests({ forceDue: true });
    await runCloudSyncTick(t0 + 61_000);
    check("devam turu (aralık dolmadan) hesaplamaz", getCloudSyncStatus().lastSnapshotAt === t0);
    snapshotCounts.length = 0;
    __configureCloudSyncForTests({ forceDue: true });
    await runCloudSyncTick(t0 + 5 * 60_000 + 1);
    check("aralık dolunca yeniden hesaplar", getCloudSyncStatus().lastSnapshotAt === t0 + 5 * 60_000 + 1);
    check("içerik aynıysa hiçbir anlık gönderilmez", snapshotCounts.every((n) => n === 0), snapshotCounts.join("+"));
    __configureCloudSyncForTests({ transport: failing, forceDue: true });
    await runCloudSyncTick(t0 + 11 * 60_000);
    check("bulut hatasında hesap zamanı ilerlemez", getCloudSyncStatus().lastSnapshotAt === t0 + 5 * 60_000 + 1 && getCloudSyncStatus().consecutiveFailures > 0);
  } finally {
    __configureCloudSyncForTests({ reset: true });
    const wmNow = await prisma.syncWatermark.findMany({ select: { id: true } });
    const before = new Map(wmBefore.map((w) => [w.id, w]));
    const fresh = wmNow.map((w) => w.id).filter((id) => !before.has(id));
    if (fresh.length > 0) await prisma.syncWatermark.deleteMany({ where: { id: { in: fresh } } });
    for (const w of wmBefore) {
      const { id, ...rest } = w;
      await prisma.syncWatermark.update({ where: { id }, data: rest as Prisma.SyncWatermarkUpdateInput });
    }
    rmSync(dir, { recursive: true, force: true });
  }
}

main()
  .catch((e: unknown) => { fail++; console.log(`  ✗ FAIL: beklenmeyen hata — ${e instanceof Error ? e.stack ?? e.message : String(e)}`); })
  .finally(async () => {
    // Fixture FK sırasıyla silinir (fason kalem → sevk → parti/iş emri; kalem → sipariş → top → kumaş → müşteri).
    if (fx.dispatches.length) await prisma.subcontractorDispatchItem.deleteMany({ where: { dispatchId: { in: fx.dispatches } } });
    if (fx.dispatches.length) await prisma.subcontractorDispatch.deleteMany({ where: { id: { in: fx.dispatches } } });
    if (fx.wos.length) await prisma.batch.deleteMany({ where: { workOrderId: { in: fx.wos } } });
    if (fx.orders.length) await prisma.orderLine.deleteMany({ where: { orderId: { in: fx.orders } } });
    if (fx.orders.length) await prisma.order.deleteMany({ where: { id: { in: fx.orders } } });
    if (fx.rolls.length) await prisma.roll.deleteMany({ where: { id: { in: fx.rolls } } });
    if (fx.wos.length) await prisma.workOrderStep.deleteMany({ where: { workOrderId: { in: fx.wos } } });
    if (fx.wos.length) await prisma.workOrder.deleteMany({ where: { id: { in: fx.wos } } });
    if (fx.items.length) await prisma.item.deleteMany({ where: { id: { in: fx.items } } });
    if (fx.customers.length) await prisma.customer.deleteMany({ where: { id: { in: fx.customers } } });
    await prisma.$disconnect();
    console.log(`\n=== Sonuç: ${pass} geçti, ${fail} başarısız ===\n`);
    process.exit(fail > 0 ? 1 : 0);
  });
