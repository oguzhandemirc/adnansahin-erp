// =============================================================================
// BEKÇİ — PATRON BULUTU ANLIK PROJEKSİYONLARI (D3b): sözleşme · finans/termin yok · doğruluk · kapalı · sıklık
// =============================================================================
// ÖLÇTÜĞÜ:
//  §1 Katalog (DB'siz): 10 anlık (`ozet` 5 bölümlü; + `stok-kalem`; + `cuval-deposu`) — tel adları = katı şema anahtarları ⊂ bulut kataloğunun
//     ANLIK adları; izinler bulut okuma izinleri; şemalarda hiçbir alan adı finans (fiyat · tutar · bakiye ·
//     döviz …) ya da termin (geciken · zamanında · gecikme · termin) sözcüğü taşımaz; finans/emanet/sağlık
//     anlıkları katalogda YOK.
//  §2 Kurulum (`_test` DB): her anlık kurulur, `SnapshotEntrySchema`ya uyar, üretilen veride finans anahtarı
//     yok; üretim modülü kapalıyken `ozet.uretim` ve `uretim-akisi` ÜRETİLMEZ; bir kaynak servis fırlatırsa
//     yalnız ona bağlı anlıklar düşer, diğerleri kurulur (buildSnapshots fırlatmaz); `ozet` bölüm bazında
//     yalıtılır — istasyon hatası yalnız `ozet.uretim`i düşürür, diğer dört bölüm gider.
//  §3 Doğruluk: anlık ↔ bağımsız SQL ↔ panel servisi (açık sipariş · bugün brüt sevk · mamul stok · istasyon
//     kuyruk/bugün · fason açık · fasondaki/boyahanedeki top ↔ üretim akışı "Fason'da" kolonu · firma başına top +
//     kategori · stok-kalem top listesi/kalem toplamı ↔ raf kümesi) — `scripts/lib/anlik-bagimsiz.ts`; fixture: boyahaneye 2 top + zımparaya 1 top açık fason sevki.
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
// NEGATİF SONDA (2026-11-13, stok-kalem): şemaya `tutar` eklendi → §1 finans adı ✗; bitmiş
//   top listesinden ilk top düşürüldü → §3 "stok-kalem: bitmiş top listesi" + "kalem top sayısı ≠ topları" ✗.
// §3b Çuval deposu (2.12.4, `cuval-deposu`): havuz + PLANNED çuval görünür, DISPATCHED gelmez, hayalet top sayılmaz;
//   çuval top/metre = panel `searchSacks`, cari çuval sayısı = panel `listSackCustomers`, özet = satırlar = bağımsız SQL.
// NEGATİF SONDA (2026-11-17, cuval-deposu): içerik sorgusundan `PRESENT_ROLL_WHERE` düşürüldü + kapsam `resolveScopeOr(
//   undefined, true)` (sevk edilmiş dahil) → §3b 6 satır ✗; `etiketFarkli: labelCustomerId !== cari` (boş etiket de işaretli)
//   → §3b "etiket ≠ çuval carisi" ✗. Geri alınınca yeşil.
// NEGATİF SONDA (2026-11-17, stok-kalem kime/nerede): `etiketMusteri` ← çuval carisi → §3 "raf topu: etiket müşterisi"
//   + "çuvaldaki top: …" ✗ (2 kırmızı, geri alındı). Çuval sorgusuna SHIPPED eklemek yeşil kaldı: `getSackedFinishedRolls`
//   ayrıca `isFinishedCell` ile süzer (çift sed, bilinçli).
// NEGATİF SONDA (2026-11-19, stok-kalem süzülmüş toplam katkısı): `contributionOf` raf katkısı `r.exactQty` yerine görünen
//   `r.qty` (1 hane) → §3 "katkı metresi kesin" + "bitmiş raf: Σ depoda katkısı = toplam" (193.4/193.5) ✗ (2 kırmızı, geri alındı).
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
import type { SackDepotData } from "../src/cloud-sync/snapshot-cuval-deposu";
import { sackSearchService } from "../src/services/sack-search.service";
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
  "emanet-bakiye", "fason-acik", "hizmet-geliri", "stok-karnesi", "stok-kalem", "cuval-deposu", "acik-siparis-karsilama", "rapor-katalogu", "uretim-akisi", "saglik", "tesis", "cari-ozeti",
]);
const STAMP = `TEST-D3B-${Date.now()}-`;
const fx = { rolls: [] as string[], orders: [] as string[], items: [] as string[], customers: [] as string[], wos: [] as string[], dispatches: [] as string[], sacks: [] as string[], shipments: [] as string[] };
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
  check("10 anlık projeksiyon (M2a: + cari-ozeti; + stok-kalem; 2.12.4: + cuval-deposu)", SNAPSHOT_PROJECTIONS.length === 10, SNAPSHOT_PROJECTIONS.map((p) => p.name).join(","));
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
      // İlk mamul top etiketi müşteri adına basılmış (2.12.4 `etiketMusteri`); ötekiler stok etiketi.
      data: { itemId: item.id, initialQty: qty, currentQty: qty, status, entrySource: "SUPPLIER_RECEIPT", barcode: `${STAMP}R${i}`, labelCustomerId: i === 0 ? customer.id : null },
      select: { id: true },
    });
    fx.rolls.push(r.id);
  }
  // Çuval (2.12.4): carisi ayrı müşteri; içinde 2 bitmiş top (30 m etiketi müşteriye · 20 m stok etiketi) + 1 SHIPPED top
  // (çıkmış mal, sayılmaz). Raf rakamlarına (karne, kalem) KARIŞMAMALI; çuval sayısı/metresi ayrı gelmeli.
  const sackCustomer = await prisma.customer.create({ data: { code: `${STAMP}C2`, name: `${STAMP}Çuval Carisi` }, select: { id: true } });
  fx.customers.push(sackCustomer.id);
  const sack = await prisma.sack.create({ data: { sackNo: `${STAMP}S`, customerId: sackCustomer.id }, select: { id: true } });
  fx.sacks.push(sack.id);
  for (const [i, [qty, status, label]] of ([[30, "WAREHOUSE", customer.id], [20, "A1_STOCK", null], [10, "SHIPPED", null]] as const).entries()) {
    const r = await prisma.roll.create({
      data: { itemId: item.id, initialQty: qty, currentQty: qty, status, entrySource: "SUPPLIER_RECEIPT", barcode: `${STAMP}S${i}`, sackId: sack.id, labelCustomerId: label },
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
  // Kime/nerede (2.12.4): etiket müşterisi · çuval no · çuval carisi; çuvaldaki bitmiş toplar ayrı dizi + fabrika sayısı.
  type Bitmis = { toplar: Array<Record<string, unknown>>; cuvaldakiToplar: Array<Record<string, unknown>>; cuvaldaTop: number; cuvaldaMetre: number };
  const kalemOf = (snaps: typeof b.snapshots) => (snaps.find((x) => x.projection === "stok-kalem")?.data as { bitmis: Bitmis }).bitmis;
  const [kNow, kBase] = [kalemOf(acc.snapshots), kalemOf(base)];
  const shelfTop = kNow.toplar.find((t) => t.topNo === `${STAMP}R0`);
  check("raf topu: etiket müşterisi adı, çuval yok", shelfTop?.etiketMusteri === `${STAMP}Müşteri` && shelfTop.cuvalNo === null && shelfTop.cuvalCari === null, JSON.stringify(shelfTop));
  check("raf topu (stok etiketi): etiket müşterisi null", kNow.toplar.find((t) => t.topNo === `${STAMP}R1`)?.etiketMusteri === null);
  check("çuvaldaki top raf listesine karışmaz", !kNow.toplar.some((t) => String(t.topNo).startsWith(`${STAMP}S`)));
  const sackTops = kNow.cuvaldakiToplar.filter((t) => String(t.topNo).startsWith(`${STAMP}S`));
  check("çuvaldaki bitmiş toplar: 2 (SHIPPED yok)", sackTops.length === 2, sackTops.map((t) => t.topNo).join(","));
  const s0 = sackTops.find((t) => t.topNo === `${STAMP}S0`);
  check("çuvaldaki top: çuval no · çuval carisi · etiket müşterisi · kalem alanları",
    s0?.cuvalNo === `${STAMP}S` && s0.cuvalCari === `${STAMP}Çuval Carisi` && s0.etiketMusteri === `${STAMP}Müşteri` && s0.urun === `${STAMP}Kumaş` && s0.metre === 30,
    JSON.stringify(s0));
  check("fixture farkı: çuvalda +2 top / +50 m", kNow.cuvaldaTop - kBase.cuvaldaTop === 2 && Math.round((kNow.cuvaldaMetre - kBase.cuvaldaMetre) * 10) / 10 === 50,
    `${kNow.cuvaldaTop - kBase.cuvaldaTop} · ${kNow.cuvaldaMetre - kBase.cuvaldaMetre}`);
  check("çuvalda sayısı = dizi uzunluğu", kNow.cuvaldaTop === kNow.cuvaldakiToplar.length);

  // Süzülmüş toplam (2.13.1): her top hazır katkısını taşır; süzgeçsiz toplam bölüm toplamıyla BİREBİR (uygulama yalnız toplar).
  // Ek fixture: 3 haneli iki raf topu (10,049 m) — görünen 1 hanelik `metre`yi toplamak 0,1 m kaçırır, kesin katkı kaçırmaz.
  for (const i of [0, 1]) {
    const r = await prisma.roll.create({
      data: { itemId: item.id, initialQty: 10.049, currentQty: 10.049, status: "WAREHOUSE", entrySource: "SUPPLIER_RECEIPT", barcode: `${STAMP}K${i}` },
      select: { id: true },
    });
    fx.rolls.push(r.id);
  }
  type Katki = { depodaTop: number; depodaMetre: number; cuvaldaTop: number; cuvaldaMetre: number };
  const sk = (await buildSnapshots({ now, productionOn: true, only: new Set(["stok-kalem"]) })).snapshots[0]?.data as
    { ham: { toplamTop: number; toplamMetre: number; toplar: Katki[] }; bitmis: Bitmis & { toplamTop: number; toplamMetre: number; toplar: Katki[]; cuvaldakiToplar: Katki[] } } | undefined;
  const r0 = sk?.bitmis.toplar.find((t) => (t as unknown as { topNo: string }).topNo === `${STAMP}R0`);
  check("raf topu katkısı: depoda 1 top / 123,4 m, çuvalda 0", r0?.depodaTop === 1 && r0.depodaMetre === 123.4 && r0.cuvaldaTop === 0 && r0.cuvaldaMetre === 0, JSON.stringify(r0));
  const sTop = sk?.bitmis.cuvaldakiToplar.find((t) => (t as unknown as { topNo: string }).topNo === `${STAMP}S0`);
  check("çuvaldaki top katkısı: çuvalda 1 top / 30 m, depoda 0", sTop?.cuvaldaTop === 1 && sTop.cuvaldaMetre === 30 && sTop.depodaTop === 0 && sTop.depodaMetre === 0, JSON.stringify(sTop));
  const k3 = sk?.bitmis.toplar.find((t) => (t as unknown as { topNo: string }).topNo === `${STAMP}K0`);
  check("katkı metresi kesin (3 hane): 10,049", k3?.depodaMetre === 10.049, JSON.stringify(k3));
  const sum = (rows: Katki[] | undefined, k: keyof Katki) => (rows ?? []).reduce((a, t) => a + Math.round(t[k] * 1000), 0);
  const m1 = (mm: number) => Math.round(mm / 100) / 10;
  check("ham: Σ katkı = bölüm toplamı (top + metre), çuvalda 0",
    !!sk && sum(sk.ham.toplar, "depodaTop") / 1000 === sk.ham.toplamTop && m1(sum(sk.ham.toplar, "depodaMetre")) === sk.ham.toplamMetre && sum(sk.ham.toplar, "cuvaldaTop") === 0,
    `${sum(sk?.ham.toplar, "depodaTop") / 1000}/${sk?.ham.toplamTop} · ${m1(sum(sk?.ham.toplar, "depodaMetre"))}/${sk?.ham.toplamMetre}`);
  check("bitmiş raf: Σ depoda katkısı = toplamTop/toplamMetre, çuvalda 0",
    !!sk && sum(sk.bitmis.toplar, "depodaTop") / 1000 === sk.bitmis.toplamTop && m1(sum(sk.bitmis.toplar, "depodaMetre")) === sk.bitmis.toplamMetre && sum(sk.bitmis.toplar, "cuvaldaMetre") === 0,
    `${sum(sk?.bitmis.toplar, "depodaTop") / 1000}/${sk?.bitmis.toplamTop} · ${m1(sum(sk?.bitmis.toplar, "depodaMetre"))}/${sk?.bitmis.toplamMetre}`);
  check("bitmiş çuval: Σ çuvalda katkısı = cuvaldaTop/cuvaldaMetre, depoda 0",
    !!sk && sum(sk.bitmis.cuvaldakiToplar, "cuvaldaTop") / 1000 === sk.bitmis.cuvaldaTop && m1(sum(sk.bitmis.cuvaldakiToplar, "cuvaldaMetre")) === sk.bitmis.cuvaldaMetre && sum(sk.bitmis.cuvaldakiToplar, "depodaTop") === 0,
    `${sum(sk?.bitmis.cuvaldakiToplar, "cuvaldaTop") / 1000}/${sk?.bitmis.cuvaldaTop} · ${m1(sum(sk?.bitmis.cuvaldakiToplar, "cuvaldaMetre"))}/${sk?.bitmis.cuvaldaMetre}`);

  // Çuval deposu (2.12.4): panelin Paketleme/Çuvallar kapsamı (havuz + PLANNED) ve sayıları; DISPATCHED gelmez, hayalet
  // top (kartelaya gitmiş) sayılmaz. Ek fixture stok-kalem ölçüsünden SONRA kurulur (yukarıdaki farkları bozmaz).
  console.log("\n§3b Çuval deposu (anlık ↔ panel servisi ↔ bağımsız SQL)");
  const planned = await prisma.shipment.create({ data: { shipmentNo: `${STAMP}SHP`, customerId: customer.id, status: "PLANNED" }, select: { id: true } });
  const gone = await prisma.shipment.create({ data: { shipmentNo: `${STAMP}SHD`, customerId: customer.id, status: "DISPATCHED", dispatchedAt: new Date() }, select: { id: true } });
  fx.shipments.push(planned.id, gone.id);
  const sackP = await prisma.sack.create({ data: { sackNo: `${STAMP}SP`, customerId: customer.id, shipmentId: planned.id, weightKg: 41.5 }, select: { id: true } });
  const sackD = await prisma.sack.create({ data: { sackNo: `${STAMP}SD`, customerId: customer.id, shipmentId: gone.id }, select: { id: true } });
  fx.sacks.push(sackP.id, sackD.id);
  for (const [code, qty, status, sackId, label] of [
    ["P0", 15, "WAREHOUSE", sackP.id, customer.id], ["D0", 12, "SHIPPED", sackD.id, null], ["G0", 99, "AT_KARTELA", sack.id, null],
  ] as const) {
    const r = await prisma.roll.create({
      data: { itemId: item.id, initialQty: qty, currentQty: qty, status, entrySource: "SUPPLIER_RECEIPT", barcode: `${STAMP}${code}`, sackId, labelCustomerId: label },
      select: { id: true },
    });
    fx.rolls.push(r.id);
  }
  const depoBuild = await buildSnapshots({ now, productionOn: true, only: new Set(["cuval-deposu"]) });
  check("cuval-deposu kuruldu", depoBuild.errors.length === 0 && depoBuild.snapshots.length === 1, JSON.stringify(depoBuild.errors));
  const depo = depoBuild.snapshots[0]!.data as unknown as SackDepotData;
  const dSack = (no: string) => depo.cuvallar.find((c) => c.cuvalNo === no);
  const pool = dSack(`${STAMP}S`);
  const panelPool = (await sackSearchService.searchSacks({ customerId: sackCustomer.id })).data as Array<{ id: string; rollCount: number; totalQty: number }>;
  const panelPoolRow = panelPool.find((r) => r.id === sack.id);
  check("havuz çuvalı: DEPODA, carisi, top/metre = panel listesi (hayalet sayılmaz)",
    pool?.durum === "DEPODA" && pool.cari === `${STAMP}Çuval Carisi` && pool.top === panelPoolRow?.rollCount && pool.metre === panelPoolRow?.totalQty && pool.toplar.length === pool.top,
    `anlık ${pool?.top}/${pool?.metre} · panel ${panelPoolRow?.rollCount}/${panelPoolRow?.totalQty}`);
  check("hayalet top (kartelada) içerikte yok", !pool?.toplar.some((t) => t.topNo === `${STAMP}G0`));
  const s0d = pool?.toplar.find((t) => t.topNo === `${STAMP}S0`);
  const s1d = pool?.toplar.find((t) => t.topNo === `${STAMP}S1`);
  check("etiket ≠ çuval carisi işaretli; stok etiketi işaretsiz",
    s0d?.etiketFarkli === true && s0d.etiketMusteri === `${STAMP}Müşteri` && s0d.urun === `${STAMP}Kumaş` && s1d?.etiketFarkli === false && s1d.etiketMusteri === null,
    JSON.stringify([s0d, s1d]));
  const pSack = dSack(`${STAMP}SP`);
  check("sevke atanmış çuval görünür: SEVKE_ATANDI + sevkiyat no + kg, etiket = cari → işaretsiz",
    pSack?.durum === "SEVKE_ATANDI" && pSack.sevkiyatNo === `${STAMP}SHP` && pSack.kg === 41.5 && pSack.top === 1 && pSack.toplar[0]?.etiketFarkli === false,
    JSON.stringify(pSack));
  check("sevk edilmiş (DISPATCHED) çuval gelmez", dSack(`${STAMP}SD`) === undefined);
  const panelCust = (await sackSearchService.searchSacks({ customerId: customer.id })).data as Array<{ id: string }>;
  check("müşterinin çuvalları = panel listesi (havuz + PLANNED)", panelCust.length === depo.cuvallar.filter((c) => c.cariKartId === customer.id).length && panelCust.some((r) => r.id === sackP.id) && !panelCust.some((r) => r.id === sackD.id),
    `panel ${panelCust.length}`);
  const sumOf = <T,>(xs: readonly T[], f: (x: T) => number) => Math.round(xs.reduce((a, x) => a + f(x), 0) * 1000) / 1000;
  check("özet = çuval satırları (fabrika toplar)", depo.ozet.cuval === depo.cuvallar.length && depo.ozet.top === sumOf(depo.cuvallar, (c) => c.top)
    && Math.abs(depo.ozet.metre - sumOf(depo.cuvallar, (c) => c.metre)) < 0.001 && depo.ozet.sevkeAtanan === depo.cuvallar.filter((c) => c.durum === "SEVKE_ATANDI").length);
  check("cari dökümü = özet", sumOf(depo.cariler, (c) => c.cuval) === depo.ozet.cuval && sumOf(depo.cariler, (c) => c.top) === depo.ozet.top);
  const custRow = depo.cariler.find((c) => c.cariKartId === customer.id);
  const sackCustRow = depo.cariler.find((c) => c.cariKartId === sackCustomer.id);
  // Panelin cari kapısı (`listSackCustomers`, aynı kapsam): çuval sayısı aynı.
  const gate = new Map<string | null, number>();
  for (let cursor: string | undefined, guard = 0; guard < 100; guard++) {
    const page = await sackSearchService.listSackCustomers({ withSacksOnly: true, limit: 200, cursor });
    for (const it of page.data!.items) gate.set(it.customerId, it.sackCount);
    if (!page.data!.nextCursor) break;
    cursor = page.data!.nextCursor;
  }
  check("cari satırı çuval sayısı = panel cari kapısı", custRow?.cuval === 1 && gate.get(customer.id) === 1 && sackCustRow?.cuval === gate.get(sackCustomer.id) && custRow.kg === 41.5,
    `anlık ${custRow?.cuval}/${sackCustRow?.cuval} · panel ${gate.get(customer.id)}/${gate.get(sackCustomer.id)}`);
  const [depoSql] = await prisma.$queryRaw<Array<{ sacks: number; rolls: number; qty: number }>>(Prisma.sql`
    SELECT (SELECT COUNT(*)::int FROM sacks s LEFT JOIN shipments sh ON sh.id = s."shipmentId" WHERE s."shipmentId" IS NULL OR sh.status::text = 'PLANNED') AS sacks,
           COUNT(r.id)::int AS rolls, COALESCE(SUM(r."currentQty"), 0)::float AS qty
    FROM rolls r JOIN sacks s ON s.id = r."sackId" LEFT JOIN shipments sh ON sh.id = s."shipmentId"
    WHERE (s."shipmentId" IS NULL OR sh.status::text = 'PLANNED')
      AND r.status::text NOT IN ('CANCELLED','SCRAP','IN_PRODUCTION','AT_SUBCONTRACTOR','SUBCONTRACTOR_CONSUMED','AT_KARTELA','KARTELA_CONSUMED','TAMBUR_CONSUMED')`);
  check("bağımsız SQL: çuval · top · metre", depo.ozet.cuval === depoSql?.sacks && depo.ozet.top === depoSql.rolls && Math.abs(depo.ozet.metre - depoSql.qty) < 0.01,
    `anlık ${depo.ozet.cuval}/${depo.ozet.top}/${depo.ozet.metre} · SQL ${depoSql?.sacks}/${depoSql?.rolls}/${depoSql?.qty}`);

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
    if (fx.sacks.length) await prisma.sack.deleteMany({ where: { id: { in: fx.sacks } } });
    if (fx.shipments.length) await prisma.shipment.deleteMany({ where: { id: { in: fx.shipments } } });
    if (fx.wos.length) await prisma.workOrderStep.deleteMany({ where: { workOrderId: { in: fx.wos } } });
    if (fx.wos.length) await prisma.workOrder.deleteMany({ where: { id: { in: fx.wos } } });
    if (fx.items.length) await prisma.item.deleteMany({ where: { id: { in: fx.items } } });
    if (fx.customers.length) await prisma.customer.deleteMany({ where: { id: { in: fx.customers } } });
    await prisma.$disconnect();
    console.log(`\n=== Sonuç: ${pass} geçti, ${fail} başarısız ===\n`);
    process.exit(fail > 0 ? 1 : 0);
  });
