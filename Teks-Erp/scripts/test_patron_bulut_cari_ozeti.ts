// =============================================================================
// BEKÇİ — PATRON BULUTU CARİ ÖZETİ (M2a, Adnan'a özgü sözleşme genişletmesi)
// =============================================================================
//  §1 Katalog: `iade` kayıt projeksiyonu + `cari-ozeti` anlığı + siparişin `acik` türevi var; hiçbir tel/kaynak adı
//     finans sözcüğü taşımaz; iadenin serbest metni (sebep metni, not) buluta GİTMEZ.
//  §2 Katı şema: özete tanınmayan (finans) alan eklenirse mühür FIRLATIR — sözleşme dışı alan buluta gitmez.
//  §3 Fixture sayıları: kendi kurduğu müşteri için özetin HER sayısı elle hesaplanmış beklenene eşit — iptal sipariş
//     ve iptal kalem dışarıda, farklı birim ayrı satır (TOPLANMAZ), sevk BRÜT (iade geri eklenmiş, düşülmemiş),
//     iptal edilen iade dışarıda, en çok alınan ürünler miktar sırasında.
//  §4 Panel eşitliği: aynı müşteri için panel servisleri (müşteri karnesi · iade karnesi · açık sipariş karşılama)
//     aynı soruya AYNI sayıyı verir.
//  §5 Kayıtlar: `iade` satırı, siparişin `acik`ı ve `toplamMiktar`ı (aktif ∧ ölçülen satır Σ miktar) katalog kurucusundan
//     beklenen değerle çıkar.
//  §6 Kapalıyken yeni kod çalışmaz: kurucu yalnız anlık turundan (`snapshots.ts`) çağrılır.
//  §7 Aynı fabrika günü içinde iki kurulum aynı içerik özetini verir (dönem sınırı gün içinde kaymaz).
//
// NEGATİF SONDALAR (2026-11-12, elle bozulup koşuldu, hepsi KIRMIZI):
//  S1 `snapshot-cari-ozeti.ts` girdiye `tutar: 0` eklendi → mühür fırlattı, anlık kurulamadı: 13 ✗ (§3–§4).
//  S2 sevk metresinden iade düşüldü (net sevk) → 2 ✗: §3 brüt sevk + §4 müşteri karnesi eşitliği.
//  S3 açık küme daraltıldı (`… && status === "APPROVED"`) → 2 ✗: §3 açık + §4 açık sipariş karşılama eşitliği.
//  S4 son-12-ay başı fabrika gününe hizalanmadı (`now − 365 gün`) → 1 ✗: §7 (anlık her tur yeniden giderdi).
//  (2026-11-13, `toplamMiktar`) S5 `derived.ts` toplam isMeasuredLine dalının dışına alındı (KG dahil) → 1 ✗: §5 toplam.
//  S6 toplam isActiveLine dışına alındı (iptal kalem dahil) → 1 ✗: §5 toplam.
//  §4 (2.13.1) her hazır dönemde sipariş adedi + brüt sevk + iade = panel karneleri (aynı aralık).
//  §8 (2.13.1) dönem sınırları (sabit tarihli örnekler, ay kırpma, İstanbul gün sınırı) · üretim günü + `donemler` ·
//     kısa dönemde `enCokUrun` yok · kalem son sipariş tarihi · en eski açık sipariş + yaş · etiket-müşteri depodaki mal.
//  (2026-11-19) S7 `labelOwnedStock` çuvaldaki topu "raf" saydı → 1 ✗ §8 depodaki mal (2/52.8 · 0/0).
//  S8 geçen ayın sonu bu ayın başı (−1 ms yok) → 1 ✗ §8 dönem sınırları. İkisi de geri alındı.
// =============================================================================
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { z } from "zod";
import prisma from "../src/lib/prisma";
import { RECORD_PROJECTIONS, SNAPSHOT_PROJECTIONS, findRecordProjection } from "../src/cloud-sync/projections";
import { SNAPSHOT_WIRE_SCHEMAS } from "../src/cloud-sync/snapshot-schemas";
import { buildSnapshots, seal } from "../src/cloud-sync/snapshots";
import { buildCustomerSummaryData, cariSummaryPeriods } from "../src/cloud-sync/snapshot-cari-ozeti";
import { buildRecords } from "../src/cloud-sync/record-builder";
import { getCustomerScorecard } from "../src/services/reports/customer-scorecard.report.service";
import { getReturnScorecard } from "../src/services/reports/return-scorecard.report.service";
import { getOpenOrderCoverage } from "../src/services/reports/open-order-coverage.report.service";
import { factoryDayStart, factoryYmd } from "../src/constants/time";
import { CARI_PERIODS, cariPeriodRange, type CariPeriod } from "../src/cloud-sync/periods";
import { ensureTestAdmin } from "./fixture-test-user";

let pass = 0;
let fail = 0;
function check(l: string, ok: boolean, x = ""): void {
  if (ok) { pass++; console.log(`  ✓ ${l}${x ? ` — ${x}` : ""}`); }
  else { fail++; console.log(`  ✗ FAIL: ${l}${x ? ` — ${x}` : ""}`); }
}

const FINANCE = /fiyat|tutar|bakiye|maliyet|odeme|doviz|kdv|price|amount|balance|cost|paid|payment|currency|vat|tax|kur$/i;
const STAMP = `TEST-M2A-${Date.now()}-`;
const DAY_MS = 86_400_000;
const fx = { sacks: [] as string[], customers: [] as string[], items: [] as string[], colors: [] as string[], orders: [] as string[], rolls: [] as string[], shipments: [] as string[], returns: [] as string[] };

/** Tel değerini düz JSON'a çevirir (Decimal → sayı); karşılaştırma için. */
function plain(v: unknown): unknown {
  return v === undefined ? undefined : JSON.parse(JSON.stringify(v));
}
function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}
function field(v: unknown, ...keys: string[]): unknown {
  let cur: unknown = v;
  for (const k of keys) cur = Array.isArray(cur) ? cur[Number(k)] : isRecord(cur) ? cur[k] : undefined;
  return cur;
}

async function setup(now: Date): Promise<{ customerId: string; itemId: string; item2Id: string; colorId: string; orderOpen: string; orderOld: string; orderCancelled: string; liveReturn: string }> {
  const user = await ensureTestAdmin();
  const customer = await prisma.customer.create({ data: { code: `${STAMP}C`, name: `${STAMP}Müşteri` }, select: { id: true } });
  fx.customers.push(customer.id);
  const item = await prisma.item.create({ data: { code: `${STAMP}I1`, name: `${STAMP}Kumaş A`, itemType: "FABRIC" }, select: { id: true } });
  const item2 = await prisma.item.create({ data: { code: `${STAMP}I2`, name: `${STAMP}Kumaş B`, itemType: "FABRIC" }, select: { id: true } });
  fx.items.push(item.id, item2.id);
  const color = await prisma.color.create({ data: { code: `${STAMP}K`, name: `${STAMP}Renk` }, select: { id: true } });
  fx.colors.push(color.id);

  // Açık sipariş: MT 300 (100 sevk) + iptal kalem MT 50 + KG 20 (farklı birim) + ikinci ürün MT 80.
  const open = await prisma.order.create({ data: { orderNumber: `${STAMP}O1`, customerId: customer.id, status: "PARTIAL_SHIPPED", orderDate: new Date(now.getTime() - 10 * DAY_MS) }, select: { id: true } });
  fx.orders.push(open.id);
  await prisma.orderLine.create({ data: { orderId: open.id, itemId: item.id, colorId: color.id, quantity: 300, shippedQty: 100, unit: "MT" } });
  await prisma.orderLine.create({ data: { orderId: open.id, itemId: item.id, colorId: color.id, quantity: 50, shippedQty: 0, unit: "MT", cancelledAt: now } });
  await prisma.orderLine.create({ data: { orderId: open.id, itemId: item.id, colorId: color.id, quantity: 20, shippedQty: 0, unit: "KG" } });
  await prisma.orderLine.create({ data: { orderId: open.id, itemId: item2.id, quantity: 80, shippedQty: 0, unit: "MT" } });
  // İki yıl önceki tamamlanmış sipariş: tüm zamanlarda var, son 12 ayda yok.
  const old = await prisma.order.create({ data: { orderNumber: `${STAMP}O2`, customerId: customer.id, status: "COMPLETED", orderDate: new Date(now.getTime() - 730 * DAY_MS) }, select: { id: true } });
  fx.orders.push(old.id);
  await prisma.orderLine.create({ data: { orderId: old.id, itemId: item2.id, quantity: 40, shippedQty: 40, unit: "MT" } });
  // İptal sipariş: hiçbir sayıya girmez.
  const cancelled = await prisma.order.create({ data: { orderNumber: `${STAMP}O3`, customerId: customer.id, status: "CANCELLED", orderDate: new Date(now.getTime() - 5 * DAY_MS), cancelledAt: now }, select: { id: true } });
  fx.orders.push(cancelled.id);
  await prisma.orderLine.create({ data: { orderId: cancelled.id, itemId: item.id, quantity: 999, shippedQty: 0, unit: "MT" } });

  // Sevkiyat: sevkte duran top 120 m + iade edilen top 25 m (canlı iade) ⇒ BRÜT 145 m / 2 top.
  const dispatchedAt = new Date(now.getTime() - 3 * DAY_MS);
  const ship = await prisma.shipment.create({ data: { shipmentNo: `${STAMP}S`, customerId: customer.id, status: "DISPATCHED", dispatchedAt }, select: { id: true } });
  fx.shipments.push(ship.id);
  const roll = (qty: number, i: number, shipmentId: string | null, status: "SHIPPED" | "WAREHOUSE") =>
    prisma.roll.create({ data: { itemId: item.id, colorId: color.id, initialQty: qty, currentQty: qty, status, entrySource: "SUPPLIER_RECEIPT", barcode: `${STAMP}R${i}`, shipmentId }, select: { id: true } });
  const r1 = await roll(120, 1, ship.id, "SHIPPED");
  const r2 = await roll(25, 2, null, "WAREHOUSE");
  const r3 = await roll(10, 3, null, "WAREHOUSE");
  fx.rolls.push(r1.id, r2.id, r3.id);
  const base = { customerId: customer.id, fromShipmentId: ship.id, orderId: open.id, itemId: item.id, colorId: color.id, receivedById: user.id, reasonText: `${STAMP}serbest metin`, note: `${STAMP}not` };
  const live = await prisma.rollReturn.create({ data: { ...base, rollId: r2.id, qty: 25 }, select: { id: true } });
  // İptal edilen iade (storno ≠ iade): sayılara girmez.
  const gone = await prisma.rollReturn.create({ data: { ...base, rollId: r3.id, qty: 10, cancelledAt: now, cancelledById: user.id }, select: { id: true } });
  fx.returns.push(live.id, gone.id);
  // Depodaki hazır mal (2.13.1, sahiplik YALNIZ etiket): raf 40,5 m + çuvalda 12,25 m (çuval carisi BAŞKA müşteri olsa da
  // etiket sayılır); etiketli ama SHIPPED top ve etiketsiz raf topları (r2/r3) sayılmaz.
  const other = await prisma.customer.create({ data: { code: `${STAMP}C2`, name: `${STAMP}Çuval Carisi` }, select: { id: true } });
  fx.customers.push(other.id);
  const sack = await prisma.sack.create({ data: { sackNo: `${STAMP}CV`, customerId: other.id }, select: { id: true } });
  fx.sacks.push(sack.id);
  for (const [i, [qty, status, sackId]] of ([[40.5, "WAREHOUSE", null], [12.25, "WAREHOUSE", sack.id], [7, "SHIPPED", null]] as const).entries()) {
    const r = await prisma.roll.create({
      data: { itemId: item.id, colorId: color.id, initialQty: qty, currentQty: qty, status, entrySource: "SUPPLIER_RECEIPT", barcode: `${STAMP}L${i}`, sackId, labelCustomerId: customer.id },
      select: { id: true },
    });
    fx.rolls.push(r.id);
  }
  return { customerId: customer.id, itemId: item.id, item2Id: item2.id, colorId: color.id, orderOpen: open.id, orderOld: old.id, orderCancelled: cancelled.id, liveReturn: live.id };
}

async function main(): Promise<void> {
  const now = new Date();
  console.log("\n§1 Katalog: iade projeksiyonu · cari-ozeti anlığı · acik türevi · finans yok");
  const iade = findRecordProjection("iade");
  check("`iade` kayıt projeksiyonu var (kök roll_returns)", iade?.root.table === "roll_returns");
  check("`cari-ozeti` anlığı katalogda", SNAPSHOT_PROJECTIONS.some((p) => p.name === "cari-ozeti"));
  const siparis = findRecordProjection("siparis");
  check("siparişte `acik` + `toplamMiktar` türevi + katalog sürümü 4 (uretim)", !!siparis?.derived.some((d) => d.wire === "acik") && !!siparis?.derived.some((d) => d.wire === "toplamMiktar") && siparis?.catalogVersion === 4);
  const iadeNames = iade ? [...iade.columns.map((c) => `${c.wire}←${c.source}`), ...iade.derived.map((d) => d.wire)] : [];
  check("iade: finans sözcüğü yok", iadeNames.length > 5 && !iadeNames.some((n) => FINANCE.test(n)), iadeNames.join(","));
  check("iade: serbest metin (reasonText/note) ve kişi (receivedById) GİTMEZ", iade !== undefined && !iade.columns.some((c) => ["reasonText", "note", "receivedById", "cancelReason"].includes(c.source)));
  const schemaKeys = schemaPropertyNames();
  check("cari-ozeti şeması: finans sözcüğü yok", schemaKeys.size > 20 && ![...schemaKeys].some((k) => FINANCE.test(k)), `${schemaKeys.size} anahtar`);
  check("kayıt projeksiyonu sayısı 15 (+ sevkiyat-icerigi 2026-11-19)", RECORD_PROJECTIONS.length === 15, `${RECORD_PROJECTIONS.length}`);

  const ids = await setup(now);
  try {
    console.log("\n§2 Katı şema: tanınmayan alan mühürde fırlar");
    const runNow = new Date();
    const raw = await buildCustomerSummaryData(runNow);
    const mine = raw.cariler[ids.customerId];
    let threw = false;
    try {
      seal("cari-ozeti", { ...raw, cariler: { ...raw.cariler, [ids.customerId]: { ...(isRecord(mine) ? mine : {}), tutar: 1 } } });
    } catch {
      threw = true;
    }
    check("özete `tutar` eklenirse mühür FIRLATIR", threw);

    console.log("\n§3 Fixture sayıları (elle hesaplanan beklenen)");
    const built = await buildSnapshots({ now: runNow, productionOn: true, only: new Set(["cari-ozeti"]) });
    check("anlık kuruldu, hata yok", built.snapshots.length === 1 && built.errors.length === 0, JSON.stringify(built.errors));
    const entry = plain(field(built.snapshots[0]?.data, "cariler", ids.customerId));
    const all = field(entry, "tumZamanlar");
    const y12 = field(entry, "son12Ay");
    check("tüm zamanlar: 2 sipariş (iptal hariç), 4 kalem (iptal kalem hariç)", field(all, "siparisSayisi") === 2 && field(all, "kalemSayisi") === 4, `${field(all, "siparisSayisi")}/${field(all, "kalemSayisi")}`);
    check("tüm zamanlar: birim başına ayrı — KG 20 · MT 420 (toplanmaz)", JSON.stringify(field(all, "siparisMiktari")) === JSON.stringify([{ birim: "KG", miktar: 20 }, { birim: "MT", miktar: 420 }]), JSON.stringify(field(all, "siparisMiktari")));
    check("son 12 ay: eski sipariş dışarıda — 1 sipariş, MT 380", field(y12, "siparisSayisi") === 1 && JSON.stringify(field(y12, "siparisMiktari")) === JSON.stringify([{ birim: "KG", miktar: 20 }, { birim: "MT", miktar: 380 }]));
    check("sevk BRÜT: 145 m / 2 top (iade düşülmez)", field(all, "sevk", "metre") === 145 && field(all, "sevk", "top") === 2, JSON.stringify(field(all, "sevk")));
    check("iade: 1 adet / 25 m (iptal edilen iade dışarıda)", field(all, "iade", "adet") === 1 && field(all, "iade", "metre") === 25, JSON.stringify(field(all, "iade")));
    check("açık: 1 sipariş, 3 kalem, MT 280 (KG ölçülmez, iptal kalem yok)", JSON.stringify([field(entry, "acik", "siparisSayisi"), field(entry, "acik", "kalemSayisi"), field(entry, "acik", "acikMiktar")]) === JSON.stringify([1, 3, [{ birim: "MT", miktar: 280 }]]), JSON.stringify(field(entry, "acik")));
    const top = field(all, "enCokUrun");
    const topRows = Array.isArray(top) ? top : [];
    check("en çok: Kumaş A/Renk MT 300 · Kumaş B MT 120 (2 sipariş) · Kumaş A/Renk KG 20", topRows.length === 3
      && field(topRows[0], "urunId") === ids.itemId && field(topRows[0], "miktar") === 300 && field(topRows[0], "renkId") === ids.colorId
      && field(topRows[1], "urunId") === ids.item2Id && field(topRows[1], "miktar") === 120 && field(topRows[1], "siparisSayisi") === 2
      && field(topRows[2], "birim") === "KG", JSON.stringify(topRows.map((r) => [field(r, "urunAdi"), field(r, "birim"), field(r, "miktar")])));
    check("son sevk tarihi = sevkiyat çıkışı", field(entry, "sonSevkTarihi") === new Date(now.getTime() - 3 * DAY_MS).toISOString());

    console.log("\n§4 Panel eşitliği (aynı müşteri, panel servisleri)");
    const range = cariSummaryPeriods(runNow).tumZamanlar;
    const card = (await getCustomerScorecard(range, null, { customerId: [ids.customerId] })).ranking.find((r) => r.customerId === ids.customerId);
    check("müşteri karnesi: sipariş adedi eşit", card?.orderCount === field(all, "siparisSayisi"), `panel ${card?.orderCount}`);
    check("müşteri karnesi: brüt sevk metresi eşit", card?.shippedQty === field(all, "sevk", "metre"), `panel ${card?.shippedQty}`);
    const ret = (await getReturnScorecard(range)).byCustomer.find((r) => r.key === ids.customerId);
    check("iade karnesi: adet + metre eşit", ret?.count === field(all, "iade", "adet") && ret?.qty === field(all, "iade", "metre"), `panel ${ret?.count}/${ret?.qty}`);
    const cov = (await getOpenOrderCoverage()).byCustomer.find((r) => r.key === ids.customerId);
    check("açık sipariş karşılama: açık metre eşit", cov?.openQty === 280 && cov.openQty === field(entry, "acik", "acikMiktar", "0", "miktar"), `panel ${cov?.openQty}`);
    // 2.13.1 hazır dönemler: her dönemde müşteri karnesi (aynı aralık) aynı sipariş adedini ve BRÜT sevk metresini verir.
    const ranges = cariSummaryPeriods(runNow);
    for (const k of CARI_PERIODS) {
      const pc = (await getCustomerScorecard(ranges[k], null, { customerId: [ids.customerId] })).ranking.find((r) => r.customerId === ids.customerId);
      const pr = (await getReturnScorecard(ranges[k])).byCustomer.find((r) => r.key === ids.customerId);
      const p = field(entry, k);
      check(`dönem ${k}: sipariş adedi + brüt sevk + iade = panel karneleri`,
        (pc?.orderCount ?? 0) === field(p, "siparisSayisi") && (pc?.shippedQty ?? 0) === field(p, "sevk", "metre") && (pr?.count ?? 0) === field(p, "iade", "adet"),
        `panel ${pc?.orderCount ?? 0}/${pc?.shippedQty ?? 0}/${pr?.count ?? 0} · anlık ${field(p, "siparisSayisi")}/${field(p, "sevk", "metre")}/${field(p, "iade", "adet")}`);
    }

    console.log("\n§8 Hazır dönem sınırları · en eski açık sipariş · depodaki mal (2.13.1)");
    const at = (iso: string) => (p: CariPeriod) => cariPeriodRange(p, new Date(iso));
    const r31 = at("2026-03-31T10:00:00.000Z");
    check("31 Mart: bu ay 1 Mart · geçen ay Şubat · bu yıl 1 Ocak · geçen yıl 2025 (fabrika günü başı, İstanbul)",
      r31("buAy").from.toISOString() === "2026-02-28T21:00:00.000Z" && r31("gecenAy").from.toISOString() === "2026-01-31T21:00:00.000Z" && r31("gecenAy").to.toISOString() === "2026-02-28T20:59:59.999Z"
      && r31("buYil").from.toISOString() === "2025-12-31T21:00:00.000Z" && r31("gecenYil").from.toISOString() === "2024-12-31T21:00:00.000Z" && r31("gecenYil").to.toISOString() === "2025-12-31T20:59:59.999Z",
      [r31("buAy").from, r31("gecenAy").from, r31("gecenAy").to, r31("buYil").from, r31("gecenYil").from, r31("gecenYil").to].map((d) => d.toISOString()).join(" · "));
    check("31 Mart: son 3 ay 31 Aralık · son 6 ay 30 Eylül", r31("son3Ay").from.toISOString() === "2025-12-30T21:00:00.000Z" && r31("son6Ay").from.toISOString() === "2025-09-29T21:00:00.000Z",
      `${r31("son3Ay").from.toISOString()} · ${r31("son6Ay").from.toISOString()}`);
    check("31 Mayıs − 3 ay = 28 Şubat (kısa ay kırpılır)", at("2026-05-31T10:00:00.000Z")("son3Ay").from.toISOString() === "2026-02-27T21:00:00.000Z", at("2026-05-31T10:00:00.000Z")("son3Ay").from.toISOString());
    check("UTC 31 Mart 22:30 = İstanbul 1 Nisan: bu ay 1 Nisan", at("2026-03-31T22:30:00.000Z")("buAy").from.toISOString() === "2026-03-31T21:00:00.000Z", at("2026-03-31T22:30:00.000Z")("buAy").from.toISOString());
    const sealed = plain(built.snapshots[0]?.data);
    check("üretim günü = fabrika günü; dönem sınırı: şimdi ucu null, geçen ay kapalı, tüm zamanlar başı null",
      field(sealed, "uretimGunu") === factoryYmd(runNow) && field(sealed, "donemler", "buAy", "bitis") === null && typeof field(sealed, "donemler", "gecenAy", "bitis") === "string"
      && field(sealed, "donemler", "tumZamanlar", "baslangic") === null && field(sealed, "donemler", "son12Ay", "baslangic") === field(sealed, "son12AyBaslangic"),
      JSON.stringify(field(sealed, "donemler", "buAy")));
    check("kısa dönemlerde `enCokUrun` YOK, tüm zamanlar + son 12 ayda var",
      ["buAy", "gecenAy", "son3Ay", "son6Ay", "buYil", "gecenYil"].every((k) => isRecord(field(entry, k)) && field(entry, k, "enCokUrun") === undefined) && Array.isArray(field(y12, "enCokUrun")));
    check("en çok alınan kalemde son sipariş tarihi (Kumaş B: eski + açık sipariş → açığın tarihi)",
      field(topRows[1], "sonSiparisTarihi") === new Date(now.getTime() - 10 * DAY_MS).toISOString(), String(field(topRows[1], "sonSiparisTarihi")));
    check("en eski açık sipariş: tarih + 10 fabrika günü yaş (tamamlanan/iptal sayılmaz)",
      field(entry, "acik", "enEskiSiparisTarihi") === new Date(now.getTime() - 10 * DAY_MS).toISOString() && field(entry, "acik", "enEskiSiparisYasGun") === 10,
      `${String(field(entry, "acik", "enEskiSiparisTarihi"))} · ${String(field(entry, "acik", "enEskiSiparisYasGun"))}`);
    check("depodaki mal (etiket): raf 1 top / 40,5 m · çuvalda 1 top / 12,3 m (SHIPPED + etiketsiz yok)",
      JSON.stringify(field(entry, "depodakiMal")) === JSON.stringify({ depodaTop: 1, depodaMetre: 40.5, cuvaldaTop: 1, cuvaldaMetre: 12.3 }), JSON.stringify(field(entry, "depodakiMal")));
    const sackOwner = plain(field(built.snapshots[0]?.data, "cariler", fx.customers[1] ?? ""));
    check("çuval carisi etiket sahibi değildir: çuvaldaki top ona sayılmaz", sackOwner === undefined || field(sackOwner, "depodakiMal", "cuvaldaTop") === 0, JSON.stringify(field(sackOwner, "depodakiMal")));

    console.log("\n§5 Kayıtlar: iade satırı ve siparişin `acik`ı");
    if (iade && siparis) {
      const rec = await buildRecords(iade, [ids.liveReturn], now.getTime());
      const row = plain(rec.rows.get("iade")?.[0] ?? null);
      check("iade satırı: müşteri/sipariş/sevkiyat bağı + metre 25", field(row, "cariKartId") === ids.customerId && field(row, "siparisId") === ids.orderOpen && Number(field(row, "metre")) === 25, JSON.stringify(row));
      check("iade satırı: ad türevleri dolu, serbest metin YOK", typeof field(row, "musteriAdi") === "string" && typeof field(row, "urunAdi") === "string" && !JSON.stringify(row).includes(`${STAMP}serbest`) && !JSON.stringify(row).includes(`${STAMP}not`));
      const orders = plain((await buildRecords(siparis, [ids.orderOpen, ids.orderOld, ids.orderCancelled], now.getTime())).rows.get("siparis") ?? []);
      const acik = (id: string) => (Array.isArray(orders) ? orders.find((o) => field(o, "id") === id) : undefined);
      check("sipariş `acik`: kısmi sevk true · tamamlanan false · iptal false", field(acik(ids.orderOpen), "acik") === true && field(acik(ids.orderOld), "acik") === false && field(acik(ids.orderCancelled), "acik") === false);
      // Toplam = Σ quantity, aktif ∧ ölçülen satır (acikMiktar ile aynı kapsam): MT 300 + MT 80 = 380; iptal kalem MT 50 ve KG 20 hariç.
      const num = (id: string, k: string) => Number(field(acik(id), k));
      check("sipariş `toplamMiktar`: 380 (iptal kalem + ölçülmeyen birim hariç) · açık 280 · eski 40", num(ids.orderOpen, "toplamMiktar") === 380 && num(ids.orderOpen, "acikMiktar") === 280 && num(ids.orderOld, "toplamMiktar") === 40,
        `${field(acik(ids.orderOpen), "toplamMiktar")}/${field(acik(ids.orderOpen), "acikMiktar")}/${field(acik(ids.orderOld), "toplamMiktar")}`);
    } else check("projeksiyonlar çözüldü", false);

    console.log("\n§6 Kapalıyken çalışmaz: kurucu yalnız anlık turundan çağrılır");
    const srcDir = path.join(__dirname, "..", "src");
    const callers: string[] = [];
    const walk = (dir: string): void => {
      for (const e of readdirSync(dir, { withFileTypes: true })) {
        const p = path.join(dir, e.name);
        if (e.isDirectory()) walk(p);
        else if (p.endsWith(".ts") && !p.endsWith("snapshot-cari-ozeti.ts") && readFileSync(p, "utf8").includes("buildCustomerSummaryData")) callers.push(path.relative(srcDir, p));
      }
    };
    walk(srcDir);
    check("tek çağıran `cloud-sync/snapshots.ts` (eşitleme işinin anlık turu)", callers.length === 1 && callers[0] === path.join("cloud-sync", "snapshots.ts"), callers.join(","));

    console.log("\n§7 Aynı fabrika günü iki tur: içerik özeti aynı (anlık yeniden gönderilmez)");
    // Gönderim kararı içerik özetidir (`snapshotDigest`); dönem sınırı "şimdi"ye bağlı kayarsa anlık her tur gider.
    const tB = new Date(runNow.getTime() + 6 * 60_000);
    const tA = new Date(Math.max(runNow.getTime() + 60_000, factoryDayStart(tB).getTime() + 60_000));
    const [dA, dB] = [
      (await buildSnapshots({ now: tA, productionOn: true, only: new Set(["cari-ozeti"]) })).snapshots[0]?.digest,
      (await buildSnapshots({ now: tB, productionOn: true, only: new Set(["cari-ozeti"]) })).snapshots[0]?.digest,
    ];
    check("aynı gün, 5 dk arayla iki kurulum → aynı içerik özeti", !!dA && dA === dB, `${dA?.slice(0, 12)} · ${dB?.slice(0, 12)}`);
  } finally {
    await prisma.rollReturn.deleteMany({ where: { id: { in: fx.returns } } });
    await prisma.roll.deleteMany({ where: { id: { in: fx.rolls } } });
    await prisma.sack.deleteMany({ where: { id: { in: fx.sacks } } });
    await prisma.shipment.deleteMany({ where: { id: { in: fx.shipments } } });
    await prisma.orderLine.deleteMany({ where: { orderId: { in: fx.orders } } });
    await prisma.order.deleteMany({ where: { id: { in: fx.orders } } });
    await prisma.color.deleteMany({ where: { id: { in: fx.colors } } });
    await prisma.item.deleteMany({ where: { id: { in: fx.items } } });
    await prisma.customer.deleteMany({ where: { id: { in: fx.customers } } });
  }
  console.log(`\n=== Sonuç: ${pass} geçti, ${fail} başarısız ===`);
  await prisma.$disconnect();
  process.exit(fail === 0 ? 0 : 1);
}

/** `cari-ozeti` tel şemasının bütün özellik adları (iç içe dahil). */
function schemaPropertyNames(): Set<string> {
  const out = new Set<string>();
  const walk = (j: unknown): void => {
    if (Array.isArray(j)) { j.forEach(walk); return; }
    if (!isRecord(j)) return;
    if (isRecord(j.properties)) for (const k of Object.keys(j.properties)) out.add(k);
    Object.values(j).forEach(walk);
  };
  walk(z.toJSONSchema(SNAPSHOT_WIRE_SCHEMAS["cari-ozeti"]));
  return out;
}

main().catch(async (err: unknown) => {
  console.error(err);
  await prisma.$disconnect();
  process.exit(1);
});
