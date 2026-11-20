// =============================================================================
// BEKÇİ — PATRON BULUTU SEVKİYAT İÇERİĞİ (2026-11-19, Adnan'a özgü sözleşme genişletmesi)
// =============================================================================
//  §1 Katalog: `sevkiyat-icerigi` KAYIT projeksiyonu kök `shipments`, izin `bulut:sevkiyat:oku`, birim tavanı ≤ 100;
//     türetici kayıtlı; tel adlarında (iç içe dahil) finans sözcüğü yok.
//  §2 Panel eşitliği: kaydın `ozet`i panelin `getShipmentById().summary`siyle AYNI sayı (çuval · top · metre BRÜT · kg ·
//     iade · kartela); `tartiliCuval` kg'si dolu çuval sayısı.
//  §3 Çuval kırılımı: çuval sırası panelinki; iade alınan top (iptal edilmemiş `RollReturn.prevSackId`) ESKİ çuvalında
//     `iade: true` ile durur ve sayılır (BRÜT); iptal edilen iade görünmez; hayalet top `yok: true`; top kg ve etiket
//     müşterisi depolanmış kolondan.
//  §4 Çuvalsız top `cuvalsizToplar`da; çuval metreleri + çuvalsız = özet metresi.
//  §5 Projeksiyonlar arası: `sevkiyat` kaydının `toplamMetre`/`topSayisi`/`cuvalSayisi` = içerik özeti.
//  §6 Paketleme: 250 kök → 100'lük birimler (ağır satır 32 MB sınırını aşmaz).
//  §7 (2.13.2) Sevk partisi: içerik çuvalında partiAdi/partiKodu/partiDurumu/ambalajNo, topta üretim `parti` (batchNumber);
//     partisizde null; `cuval` KAYIT aynı alanlar; packing_groups kaynağı doğru kökleri kirletir; ad/durum değişimi
//     filigranı ilerletir ve yeniden kurulan satır yeni değeri taşır; iki projeksiyonda katalog sürümü 2.
//  §8 (2.13.2) `sevkiyat` süzgeç dizileri (katalog 2): fikstür değerleri; DB'deki her sevkiyatta içerik kaydıyla eşitlik
//     (hayalet hariç, iade BRÜT, başka sevkiyatın çuvalını gösteren iade yok); ad/depo/parti kaynakları kökü kirletir;
//     yalnız tahsis satırı doğunca (`sack_allocations.createdAt`) sevkiyat kirli ve yeni sipariş no gelir.
//
// NEGATİF SONDALAR (2026-11-19, elle bozulup koşuldu, hepsi KIRMIZI): `bekci-sonda` notu commit mesajında.
//  S8a (2026-11-20) loadShipmentFacets hayalet süzgeci kaldırıldı → 2 ✗ (§8 fikstür + içerik eşitliği).
//  S8b (2026-11-20) başka sevkiyatın çuvalını gösteren iade atlanmadı → 2 ✗ (§8 içerik eşitliği + ikinci sevkiyat).
//  S8c (2026-11-20) `sack_allocations` kaynağı katalogdan çıkarıldı → 1 ✗ (§8 yeni tahsis → kirli).
// =============================================================================
import prisma from "../src/lib/prisma";
import { findRecordProjection } from "../src/cloud-sync/projections";
import { DERIVERS } from "../src/cloud-sync/derived";
import { buildRecords } from "../src/cloud-sync/record-builder";
import { toUnits } from "../src/cloud-sync/packing";
import { collectProjectionChanges, mapToRoots, positionsAfterFull } from "../src/cloud-sync/change-scan";
import { buildShipmentContent } from "../src/cloud-sync/shipment-content";
import { shippingService } from "../src/services/shipping.service";
import { ensureTestAdmin } from "./fixture-test-user";

let pass = 0;
let fail = 0;
function check(l: string, ok: boolean, x = ""): void {
  if (ok) { pass++; console.log(`  ✓ ${l}${x ? ` — ${x}` : ""}`); }
  else { fail++; console.log(`  ✗ FAIL: ${l}${x ? ` — ${x}` : ""}`); }
}

const FINANCE = /fiyat|tutar|bakiye|maliyet|odeme|doviz|kdv|price|amount|balance|cost|paid|payment|currency|vat|tax/i;
const STAMP = `TEST-SVKI-${Date.now()}-`;
const fx = { customers: [] as string[], items: [] as string[], colors: [] as string[], rolls: [] as string[], sacks: [] as string[], shipments: [] as string[], returns: [] as string[], groups: [] as string[], wos: [] as string[],
  warehouses: [] as string[], orders: [] as string[] };

type J = Record<string, unknown>;
const isObj = (v: unknown): v is J => typeof v === "object" && v !== null && !Array.isArray(v);
const plain = (v: unknown): unknown => JSON.parse(JSON.stringify(v));
const n = (v: unknown): number => Number(v);
const j = (v: unknown): string => JSON.stringify(v);
function keysDeep(v: unknown, out = new Set<string>()): Set<string> {
  if (Array.isArray(v)) v.forEach((x) => keysDeep(x, out));
  else if (isObj(v)) for (const [k, x] of Object.entries(v)) { out.add(k); keysDeep(x, out); }
  return out;
}

async function setup(now: Date) {
  const user = await ensureTestAdmin();
  const cust = await prisma.customer.create({ data: { code: `${STAMP}C`, name: `${STAMP}Müşteri` }, select: { id: true } });
  const label = await prisma.customer.create({ data: { code: `${STAMP}E`, name: `${STAMP}Etiket` }, select: { id: true } });
  fx.customers.push(cust.id, label.id);
  const item = await prisma.item.create({ data: { code: `${STAMP}I`, name: `${STAMP}Kumaş`, itemType: "FABRIC" }, select: { id: true } });
  fx.items.push(item.id);
  const color = await prisma.color.create({ data: { code: `${STAMP}K`, name: `${STAMP}Renk` }, select: { id: true } });
  fx.colors.push(color.id);
  const ship = await prisma.shipment.create({ data: { shipmentNo: `${STAMP}S`, customerId: cust.id, status: "DISPATCHED", dispatchedAt: now }, select: { id: true } });
  fx.shipments.push(ship.id);
  // 2.13.2: çuval 1 bir sevk partisinde (ambalaj no 3), çuval 2 partisiz; r1 bir üretim partisinde.
  const lot = await prisma.packingGroup.create({ data: { customerId: cust.id, name: `${STAMP}DNZ-084`, code: `T${String(Date.now()).slice(-12)}`, status: "CLOSED" }, select: { id: true, code: true } });
  fx.groups.push(lot.id);
  const wo = await prisma.workOrder.create({ data: { workOrderNumber: `${STAMP}WO`, status: "IN_PROGRESS", targetItemId: item.id }, select: { id: true } });
  fx.wos.push(wo.id);
  const batch = await prisma.batch.create({ data: { batchNumber: `${STAMP}P54`, workOrderId: wo.id }, select: { id: true } });
  // §8: çuval 1 bir depoda ve bir siparişe tahsisli; çuvalsız top ikinci ürün/renk ve başka en.
  const wh = await prisma.warehouse.create({ data: { code: `T${String(Date.now()).slice(-10)}W`, name: `${STAMP}Depo` }, select: { id: true } });
  fx.warehouses.push(wh.id);
  const item2 = await prisma.item.create({ data: { code: `${STAMP}I2`, name: `${STAMP}Astar`, itemType: "FABRIC" }, select: { id: true } });
  fx.items.push(item2.id);
  const color2 = await prisma.color.create({ data: { code: `${STAMP}K2`, name: `${STAMP}Bej` }, select: { id: true } });
  fx.colors.push(color2.id);
  const order = await prisma.order.create({ data: { orderNumber: `${STAMP}SIP`, customerId: cust.id, status: "APPROVED" }, select: { id: true } });
  fx.orders.push(order.id);
  const line = await prisma.orderLine.create({ data: { orderId: order.id, itemId: item.id, colorId: color.id, quantity: 200, unit: "MT" }, select: { id: true } });
  const sack1 = await prisma.sack.create({ data: { sackNo: `${STAMP}CV1`, customerId: cust.id, shipmentId: ship.id, seq: 1, weightKg: 30, packingGroupId: lot.id, packageNo: 3, warehouseId: wh.id }, select: { id: true } });
  const sack2 = await prisma.sack.create({ data: { sackNo: `${STAMP}CV2`, customerId: cust.id, shipmentId: ship.id, seq: 2 }, select: { id: true } });
  fx.sacks.push(sack1.id, sack2.id);
  await prisma.sackAllocation.create({ data: { sackId: sack1.id, sackNo: `${STAMP}CV1`, orderLineId: line.id, qty: 150 } });
  let i = 0;
  const roll = async (qty: number, o: { sackId: string | null; shipmentId: string | null; status: "SHIPPED" | "WAREHOUSE" | "SCRAP"; kg?: number; labelCustomerId?: string; batchId?: string; width?: number; itemId?: string; colorId?: string }) => {
    i++;
    const r = await prisma.roll.create({
      data: { itemId: o.itemId ?? item.id, colorId: o.colorId ?? color.id, initialQty: qty, currentQty: qty, width: o.width ?? 150, status: o.status, entrySource: "SUPPLIER_RECEIPT", barcode: `${STAMP}R${i}`,
        sackId: o.sackId, shipmentId: o.shipmentId, weightKg: o.kg ?? null, labelCustomerId: o.labelCustomerId ?? null, batchId: o.batchId ?? null },
      select: { id: true },
    });
    fx.rolls.push(r.id);
    return r.id;
  };
  const r1 = await roll(100, { sackId: sack1.id, shipmentId: ship.id, status: "SHIPPED", kg: 12.5, labelCustomerId: label.id, batchId: batch.id });
  const r2 = await roll(50, { sackId: sack1.id, shipmentId: ship.id, status: "SHIPPED" });
  const r3 = await roll(70, { sackId: sack2.id, shipmentId: ship.id, status: "SHIPPED" });
  // Hayalet: çuval kaydında ama fiziksel olarak yok (SCRAP).
  // §8: hayaletin eni (999) süzgeç dizilerine GİRMEZ.
  const r4 = await roll(5, { sackId: sack2.id, shipmentId: ship.id, status: "SCRAP", width: 999 });
  // Çuvalsız sevk edilmiş top (§8: ikinci ürün/renk, en 160).
  const r5 = await roll(40, { sackId: null, shipmentId: ship.id, status: "SHIPPED", width: 160, itemId: item2.id, colorId: color2.id });
  // İade alınan top: FK'lar NULL (iade akışı gibi), iz `prevSackId`te.
  const r6 = await roll(25, { sackId: null, shipmentId: null, status: "WAREHOUSE" });
  // İptal edilen iade: hiç görünmez.
  const r7 = await roll(10, { sackId: null, shipmentId: null, status: "WAREHOUSE" });
  const base = { customerId: cust.id, fromShipmentId: ship.id, itemId: item.id, colorId: color.id, receivedById: user.id, reasonText: `${STAMP}neden` };
  const live = await prisma.rollReturn.create({ data: { ...base, rollId: r6, qty: 25, prevSackId: sack1.id }, select: { id: true } });
  const gone = await prisma.rollReturn.create({ data: { ...base, rollId: r7, qty: 10, prevSackId: sack1.id, cancelledAt: now, cancelledById: user.id }, select: { id: true } });
  fx.returns.push(live.id, gone.id);
  // §8 ikinci sevkiyat: çuvalsız (legacy, prevSackId yok) iade en 170 + başka sevkiyatın çuvalını gösteren iade (içerikte yok).
  const ship2 = await prisma.shipment.create({ data: { shipmentNo: `${STAMP}S2`, customerId: cust.id, status: "DISPATCHED", dispatchedAt: now }, select: { id: true } });
  fx.shipments.push(ship2.id);
  const r8 = await roll(30, { sackId: null, shipmentId: null, status: "WAREHOUSE", width: 170 });
  const r9 = await roll(30, { sackId: null, shipmentId: null, status: "WAREHOUSE", width: 180 });
  const legacy = await prisma.rollReturn.create({ data: { ...base, fromShipmentId: ship2.id, rollId: r8, qty: 30, width: 170 }, select: { id: true } });
  const foreign = await prisma.rollReturn.create({ data: { ...base, fromShipmentId: ship2.id, rollId: r9, qty: 30, width: 180, prevSackId: sack2.id }, select: { id: true } });
  fx.returns.push(legacy.id, foreign.id);
  return { ship: ship.id, sack1: sack1.id, sack2: sack2.id, lot: lot.id, lotCode: lot.code, r1, r2, r3, r4, r5, r6, r7,
    item: item.id, item2: item2.id, color: color.id, color2: color2.id, wh: wh.id, line: line.id, label: label.id, ship2: ship2.id };
}

async function main(): Promise<void> {
  console.log("\n§1 Katalog");
  const p = findRecordProjection("sevkiyat-icerigi");
  check("`sevkiyat-icerigi` var, kök shipments", p?.root.table === "shipments");
  check("izin bulut:sevkiyat:oku", p?.permission === "bulut:sevkiyat:oku");
  check("birim tavanı ≤ 100", (p?.unitRoots ?? Infinity) <= 100, String(p?.unitRoots));
  check("türetici kayıtlı", typeof DERIVERS["sevkiyat-icerigi"] === "function");
  const wireNames = [...(p?.columns.map((c) => c.wire) ?? []), ...(p?.derived.map((d) => d.wire) ?? [])];
  check("tel adlarında finans yok", wireNames.every((w) => !FINANCE.test(w)), wireNames.join(","));
  if (!p) { console.log(`\nSonuç: ${pass} geçti, ${fail} başarısız`); process.exit(1); }

  const now = new Date();
  try {
    const f = await setup(now);
    const built = await buildRecords(p, [f.ship], now.getTime());
    const row = plain(built.rows.get("sevkiyat-icerigi")?.[0]);
    check("kayıt kuruldu", isObj(row));
    if (!isObj(row)) throw new Error("kayıt yok");
    const panel = plain((await shippingService.getShipmentById(f.ship)).data);
    const ps = isObj(panel) && isObj(panel.summary) ? panel.summary : {};
    const oz = isObj(row.ozet) ? row.ozet : {};

    console.log("\n§2 Panel eşitliği (özet)");
    check("çuval = panel", n(oz.cuval) === n(ps.sackCount) && n(oz.cuval) === 2, `${oz.cuval}`);
    check("top BRÜT = panel (5 canlı + 1 iade, iptal iade yok)", n(oz.top) === n(ps.rollCount) && n(oz.top) === 6, `${oz.top}/${ps.rollCount}`);
    check("metre BRÜT = panel", n(oz.metre) === n(ps.totalMeters), `${oz.metre}/${ps.totalMeters}`);
    check("kg = panel", n(oz.kg) === n(ps.totalKg) && n(oz.kg) === 30);
    check("iade top/metre = panel", n(oz.iadeTop) === n(ps.returnedCount) && n(oz.iadeTop) === 1 && n(oz.iadeMetre) === 25);
    check("tartiliCuval = 1 (kg'si dolu çuval)", n(oz.tartiliCuval) === 1);

    console.log("\n§3 Çuval kırılımı");
    const cuvallar = Array.isArray(row.cuvallar) ? row.cuvallar.filter(isObj) : [];
    check("çuval sırası panelinki", cuvallar.map((c) => c.id).join() === [f.sack1, f.sack2].join());
    const c1 = cuvallar[0] ?? {};
    const t1 = Array.isArray(c1.toplar) ? c1.toplar.filter(isObj) : [];
    check("çuval 1: 2 canlı + 1 iade (iptal iade yok)", t1.map((t) => t.id).join() === [f.r1, f.r2, f.r6].join(), t1.map((t) => t.topNo).join());
    check("çuval 1 top = 3, metre = 175 (BRÜT)", n(c1.top) === 3 && n(c1.metre) === 175, `${c1.top}/${c1.metre}`);
    check("iade satırı işaretli", t1.find((t) => t.id === f.r6)?.iade === true && t1.find((t) => t.id === f.r1)?.iade === false);
    check("top kg ve etiket müşterisi kolondan", n(t1[0]?.kg) === 12.5 && t1[0]?.etiketMusteri === `${STAMP}Etiket`);
    check("ürün/renk/en dolu", t1[0]?.urun === `${STAMP}Kumaş` && t1[0]?.renk === `${STAMP}Renk` && n(t1[0]?.en) === 150);
    const c2 = cuvallar[1] ?? {};
    const t2 = Array.isArray(c2.toplar) ? c2.toplar.filter(isObj) : [];
    check("hayalet top süzülmez, `yok: true`", t2.find((t) => t.id === f.r4)?.yok === true && t2.find((t) => t.id === f.r3)?.yok === false);
    check("çuval kg: 30 · null", n(c1.kg) === 30 && c2.kg === null);

    console.log("\n§4 Çuvalsız top");
    const cs = Array.isArray(row.cuvalsizToplar) ? row.cuvalsizToplar.filter(isObj) : [];
    check("çuvalsız = [r5]", cs.map((t) => t.id).join() === f.r5);
    const toplamMetre = cuvallar.reduce((m, c) => m + n(c.metre), 0) + cs.reduce((m, t) => m + n(t.metre), 0);
    check("çuval metreleri + çuvalsız = özet metresi", toplamMetre === n(oz.metre), `${toplamMetre}/${oz.metre}`);
    check("iç içe tel adlarında finans yok", [...keysDeep(row)].every((k) => !FINANCE.test(k)));

    console.log("\n§5 Projeksiyonlar arası");
    const sp = findRecordProjection("sevkiyat");
    const srow = sp ? plain((await buildRecords(sp, [f.ship], now.getTime())).rows.get("sevkiyat")?.[0]) : null;
    check("sevkiyat.toplamMetre = içerik özeti", isObj(srow) && n(srow.toplamMetre) === n(oz.metre));
    check("sevkiyat.topSayisi = içerik özeti", isObj(srow) && n(srow.topSayisi) === n(oz.top), isObj(srow) ? `${srow.topSayisi}/${oz.top}` : "");
    check("sevkiyat.cuvalSayisi = içerik özeti", isObj(srow) && n(srow.cuvalSayisi) === n(oz.cuval));

    console.log("\n§7 Sevk partisi + üretim parti no (2.13.2)");
    check("içerik katalog sürümü 2", p.catalogVersion === 2, String(p.catalogVersion));
    check("⭐ çuval 1: partiAdi · partiKodu · partiDurumu CLOSED · ambalajNo 3",
      c1.partiAdi === `${STAMP}DNZ-084` && c1.partiKodu === f.lotCode && c1.partiDurumu === "CLOSED" && c1.ambalajNo === 3,
      j({ a: c1.partiAdi, k: c1.partiKodu, d: c1.partiDurumu, n: c1.ambalajNo }));
    check("partisiz çuval 2: dört alan null (anahtar var)", "partiAdi" in c2 && c2.partiAdi === null && c2.partiKodu === null && c2.partiDurumu === null && c2.ambalajNo === null);
    check("⭐ top üretim parti no: r1 batchNumber, partisiz top null",
      t1.find((t) => t.id === f.r1)?.parti === `${STAMP}P54` && t1.find((t) => t.id === f.r2)?.parti === null && cs[0]?.parti === null,
      j(t1.map((t) => t.parti)));
    const lotSrc = p.sources.find((s) => s.table === "packing_groups");
    check("⭐ içerik kaynağı: packing_groups → partinin çuvallarının sevkiyatı",
      !!lotSrc && (await mapToRoots(lotSrc.root, [f.lot])).join() === f.ship, lotSrc ? j(await mapToRoots(lotSrc.root, [f.lot])) : "kaynak yok");

    const cp = findRecordProjection("cuval");
    check("cuval katalog sürümü 2 + partiAdi/partiKodu/partiDurumu türevi", cp?.catalogVersion === 2 && ["partiAdi", "partiKodu", "partiDurumu"].every((w) => cp.derived.some((d) => d.wire === w)), String(cp?.catalogVersion));
    const crows = cp ? ((await buildRecords(cp, [f.sack1, f.sack2], now.getTime())).rows.get("cuval") ?? []).map(plain).filter(isObj) : [];
    const k1 = crows.find((r) => r.id === f.sack1);
    const k2 = crows.find((r) => r.id === f.sack2);
    check("⭐ cuval kaydı: partiId + partiAdi + partiKodu + partiDurumu + ambalajNo",
      k1?.partiId === f.lot && k1.partiAdi === `${STAMP}DNZ-084` && k1.partiKodu === f.lotCode && k1.partiDurumu === "CLOSED" && k1.ambalajNo === 3, j(k1));
    check("cuval kaydı partisiz: parti alanları null", !!k2 && k2.partiAdi === null && k2.partiKodu === null && k2.partiDurumu === null, j(k2));
    const cSrc = cp?.sources.find((s) => s.table === "packing_groups");
    check("⭐ cuval kaynağı: packing_groups → partinin çuvalları (başka çuval yok)", !!cSrc && (await mapToRoots(cSrc.root, [f.lot])).join() === f.sack1);
    // Yeniden adlandırma / yeniden açma filigranı ilerletir (Prisma @updatedAt) ⇒ kaynak taraması kökü kirletir.
    const before = await prisma.packingGroup.findUniqueOrThrow({ where: { id: f.lot }, select: { updatedAt: true } });
    await prisma.packingGroup.updateMany({ where: { id: f.lot }, data: { name: `${STAMP}DNZ-085`, status: "OPEN" } });
    const after = await prisma.packingGroup.findUniqueOrThrow({ where: { id: f.lot }, select: { updatedAt: true } });
    check("parti adı/durumu değişince updatedAt ilerler (filigran kaynağı)", after.updatedAt > before.updatedAt);
    const k1b = cp ? plain((await buildRecords(cp, [f.sack1], now.getTime())).rows.get("cuval")?.[0]) : null;
    check("yeniden kurulan cuval satırı yeni adı ve durumu taşır", isObj(k1b) && k1b.partiAdi === `${STAMP}DNZ-085` && k1b.partiDurumu === "OPEN", j(k1b));

    console.log("\n§8 `sevkiyat` süzgeç dizileri (2.13.2, katalog 2)");
    const FACETS = ["urunIdleri", "urunAdlari", "renkIdleri", "renkAdlari", "enler", "partiAdlari", "partiKodlari", "uretimPartileri", "etiketMusterileri", "siparisNolari", "depolar"];
    check("sevkiyat katalog 2 + 11 dizi türevi", sp?.catalogVersion === 2 && FACETS.every((w) => sp.derived.some((d) => d.wire === w)), String(sp?.catalogVersion));
    const facetRow = async (id: string): Promise<J> => plain((await buildRecords(sp!, [id], Date.now())).rows.get("sevkiyat")?.[0]) as J;
    const s8 = await facetRow(f.ship);
    const exp8 = {
      urunIdleri: [f.item2, f.item], urunAdlari: [`${STAMP}Astar`, `${STAMP}Kumaş`], renkIdleri: [f.color2, f.color], renkAdlari: [`${STAMP}Bej`, `${STAMP}Renk`],
      enler: [150, 160], partiAdlari: [`${STAMP}DNZ-085`], partiKodlari: [f.lotCode], uretimPartileri: [`${STAMP}P54`],
      etiketMusterileri: [`${STAMP}Etiket`], siparisNolari: [`${STAMP}SIP`], depolar: [`${STAMP}Depo`],
    };
    const got8 = Object.fromEntries(FACETS.map((k) => [k, s8[k]]));
    check("⭐ fikstür değerleri: kimlik/ad çiftleri ada göre aynı sırada; hayalet eni (999) ve iptal iade yok; parti/depo/sipariş çuvaldan", j(got8) === j(exp8), j(got8));

    // İçerik kaydıyla eşitlik — DB'deki HER sevkiyat (içerik panel servisinden; diziler toplu okumadan).
    const allShips = (await prisma.shipment.findMany({ select: { id: true } })).map((s) => s.id);
    const listRows = new Map(((await buildRecords(sp!, allShips, Date.now())).rows.get("sevkiyat") ?? []).map((r) => plain(r) as J).map((r) => [r.id as string, r]));
    const uniq = (xs: unknown[]): string => j([...new Set(xs.filter((x) => x !== null && x !== undefined).map(String))].sort());
    const diffs: string[] = [];
    for (const id of allShips) {
      const c = plain(await buildShipmentContent(id)) as J;
      const sacksC = (Array.isArray(c.cuvallar) ? c.cuvallar : []).filter(isObj);
      const topsC = [...sacksC.flatMap((s) => (Array.isArray(s.toplar) ? s.toplar : []).filter(isObj)), ...(Array.isArray(c.cuvalsizToplar) ? c.cuvalsizToplar : []).filter(isObj)].filter((t) => t.yok !== true);
      const r = listRows.get(id) ?? {};
      const pairsOk = (Array.isArray(r.urunIdleri) && Array.isArray(r.urunAdlari) && r.urunIdleri.length === r.urunAdlari.length) && (Array.isArray(r.renkIdleri) && Array.isArray(r.renkAdlari) && r.renkIdleri.length === r.renkAdlari.length);
      const same =
        pairsOk &&
        uniq(r.urunAdlari as unknown[]) === uniq(topsC.map((t) => t.urun)) &&
        uniq(r.renkAdlari as unknown[]) === uniq(topsC.map((t) => t.renk)) &&
        uniq((r.enler as unknown[]).map((e) => Number(e))) === uniq(topsC.map((t) => (t.en === null ? null : Number(t.en)))) &&
        uniq(r.uretimPartileri as unknown[]) === uniq(topsC.map((t) => t.parti)) &&
        uniq(r.etiketMusterileri as unknown[]) === uniq(topsC.map((t) => t.etiketMusteri)) &&
        uniq(r.partiKodlari as unknown[]) === uniq(sacksC.map((s) => s.partiKodu));
      if (!same) diffs.push(id);
    }
    check(`⭐ dizi değerleri = içerik kaydı (${allShips.length} sevkiyat)`, allShips.length >= 2 && diffs.length === 0, diffs.slice(0, 3).join(","));
    const s2 = listRows.get(f.ship2) ?? {};
    check("ikinci sevkiyat: çuvalsız legacy iade dahil (170), başka sevkiyatın çuvalını gösteren iade hariç (180)", j(s2.enler) === "[170]", j(s2.enler));

    // Değişince yeniden gönderim: kaynak eşlemeleri + tahsis doğuşu (createdAt filigranı).
    const srcOf = (t: string) => sp!.sources.find((s) => s.table === t);
    const rootsOf = async (t: string, keys: string[]): Promise<string[]> => { const s = srcOf(t); return s ? mapToRoots(s.root, keys) : []; };
    check("ürün / renk / etiket müşterisi / depo / parti adı değişince sevkiyat kirli",
      (await rootsOf("items", [f.item2])).includes(f.ship) && (await rootsOf("colors", [f.color2])).includes(f.ship) &&
      (await rootsOf("customers", [f.label])).includes(f.ship) && (await rootsOf("warehouses", [f.wh])).includes(f.ship) && (await rootsOf("packing_groups", [f.lot])).includes(f.ship));
    const t8 = new Date();
    const stored8 = new Map(positionsAfterFull(sp!, t8).map((w) => [w.source, { source: w.source, at: w.at ?? null, tie: w.tie ?? null, catalogVersion: null, digest: null, retentionFrom: null }]));
    await new Promise((res) => setTimeout(res, 15));
    const order2 = await prisma.order.create({ data: { orderNumber: `${STAMP}SIP2`, customerId: fx.customers[0]!, status: "APPROVED" }, select: { id: true } });
    fx.orders.push(order2.id);
    const line2 = await prisma.orderLine.create({ data: { orderId: order2.id, itemId: f.item, colorId: f.color, quantity: 80, unit: "MT" }, select: { id: true } });
    await prisma.sackAllocation.create({ data: { sackId: f.sack2, sackNo: `${STAMP}CV2`, orderLineId: line2.id, qty: 70 } });
    const ch8 = await collectProjectionChanges(sp!, stored8, new Date(Date.now() + 1));
    check("⭐ yeni tahsis (yalnız sack_allocations satırı) → sevkiyat kirli", ch8.dirty.has(f.ship), j([...ch8.dirty]));
    const s8b = await facetRow(f.ship);
    check("yeniden kurulan satır yeni siparişi taşır (sıralı)", j(s8b.siparisNolari) === j([`${STAMP}SIP`, `${STAMP}SIP2`]), j(s8b.siparisNolari));

    console.log("\n§6 Paketleme");
    const fake = Array.from({ length: 250 }, (_, k) => ({ id: `00000000-0000-4000-8000-${String(k).padStart(12, "0")}` }));
    const units = toUnits({ projection: p, built: new Map([["sevkiyat-icerigi", fake]]), removed: [], full: null });
    check("250 kök → 3 birim (100·100·50)", units.map((u) => u.rows).join() === "100,100,50", units.map((u) => u.rows).join());
  } finally {
    await prisma.rollReturn.deleteMany({ where: { id: { in: fx.returns } } });
    await prisma.roll.deleteMany({ where: { id: { in: fx.rolls } } });
    await prisma.sackAllocation.deleteMany({ where: { sackId: { in: fx.sacks } } });
    await prisma.sack.deleteMany({ where: { id: { in: fx.sacks } } });
    await prisma.orderLine.deleteMany({ where: { orderId: { in: fx.orders } } });
    await prisma.order.deleteMany({ where: { id: { in: fx.orders } } });
    await prisma.warehouse.deleteMany({ where: { id: { in: fx.warehouses } } });
    await prisma.shipment.deleteMany({ where: { id: { in: fx.shipments } } });
    await prisma.packingGroup.deleteMany({ where: { id: { in: fx.groups } } });
    await prisma.batch.deleteMany({ where: { workOrderId: { in: fx.wos } } });
    await prisma.workOrder.deleteMany({ where: { id: { in: fx.wos } } });
    await prisma.color.deleteMany({ where: { id: { in: fx.colors } } });
    await prisma.item.deleteMany({ where: { id: { in: fx.items } } });
    await prisma.customer.deleteMany({ where: { id: { in: fx.customers } } });
  }
  console.log(`\nSonuç: ${pass} geçti, ${fail} başarısız`);
  await prisma.$disconnect();
  process.exit(fail > 0 ? 1 : 0);
}

main().catch(async (err: unknown) => {
  console.error(err);
  await prisma.$disconnect();
  process.exit(1);
});
