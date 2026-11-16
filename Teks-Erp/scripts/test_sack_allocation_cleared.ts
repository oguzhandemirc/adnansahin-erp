// =============================================================================
// BEKÇİ — ÇUVAL TAHSİSİ (SackAllocation) SİL-YAZ'DAN DAMGAYA (K2, 2026-09-14)
// =============================================================================
// `SackAllocation` sipariş karşılamasını belirleyen TİCARİ pivottur (defter.md ③a):
// yeniden hesap (sipariş kümesi değişimi · tahsis yenileme · sevkiyat iptali) eski
// satırı SİLMEZ, `clearedAt` + `clearedShipmentId` + `clearedById` ile damgalar
// (`SackTagAssignment.clearedAt` deseni). Tablo hem etkin hem damgalı satır taşır ⇒
// Σ okuyan HER yol `ACTIVE_SACK_ALLOCATION` süzer; süzmeyen bir yüzey karşılamayı şişirir.
//
//   §1 sipariş kümesi değişince eski tahsis SİLİNMEZ, damgalanır (clearedShipmentId = sevkiyat);
//      yeni satır etkin; Σ okuyucular (sipariş defteri shippedQty · sevkiyat tahsis Σ) yalnız etkin
//   §2 aynı (çuval, satır) damgalı satır DURURKEN yeniden tahsis edilebilir (PARTIAL unique)
//   §3 sevkiyat iptali tahsisleri damgalar (silmez); sipariş defteri geri düşer
//   §4 ⭐ AST + tip: `sackAllocation` delegate/ilişki okumalarının HEPSİ `ACTIVE_SACK_ALLOCATION` taşır,
//      `delete/deleteMany` YOK, ham SQL `"clearedAt" IS NULL` — `revoke-ast-tarama` (damga: clearedAt)
//   §5 SQL ikizi (`consistency-check.sql` + `test_consistency.ts`) her `sack_allocations` başvurusunda
//      süzgeç taşır (qty ≤ 0 satırı beyanlı istisna)
//   §6 damgalı satırın ileri kaydı DEĞİŞMEZ: qty/sackId/orderLineId aynı, sadece damga
//   §7 (2026-11-17) sevkiyata girip çıkmış BOŞ çuval silinir: geçmiş satır kalır, bağı kopar
//      (sackId NULL), donuk sackNo taşır; shippedQty · kapsama · sevk geçmişi önce = sonra;
//      etkin tahsisli çuval 409; çıkarılan çuvalda etkin tahsis kalmaz; DB CHECK seddi.
//      SONDALAR (2026-11-17): bağ koparma kaldırıldı → 4 ❌ (P2003) · `removeSackFromShipment`
//      damgası kaldırıldı → 4 ❌ · helper'ın 409 sayımı kaldırıldı → §7l ❌.
//
// NEGATİF SONDALAR (2026-09-14, cp + sha256): `order-status.helper`ten `...ACTIVE_SACK_ALLOCATION`
// düşürüldü → §4 ihlal ❌ VE §1 shippedQty şişti (300 → 600) ❌ · `clearShipmentAllocationsTx`
// deleteMany'e çevrildi → §1/§3 "satır silinmedi" ❌ + §4 silme ❌.
// =============================================================================
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { RollStatus, ShipmentStatus } from "@prisma/client";
import prisma, { pool } from "../src/lib/prisma";
import { ShippingService } from "../src/services/shipping.service";
import { ACTIVE_SACK_ALLOCATION } from "../src/services/helpers/sack-allocation.helper";
import { computeLineLedgerTx } from "../src/services/helpers/order-status.helper";
import { OrderService } from "../src/services/order.service";
import { SETTING_KEYS } from "../src/services/system-setting.service";
import { fixtureWarehouseId } from "./fixture-warehouse";
import { aktifYuklemTara, sqlEksikSuzgec } from "./revoke-ast-tarama";

let pass = 0;
let fail = 0;
function check(label: string, ok: boolean, detail = ""): void {
  if (ok) {
    pass++;
    console.log(`✅ ${label}${detail ? ` — ${detail}` : ""}`);
  } else {
    fail++;
    console.error(`❌ ${label}${detail ? ` — ${detail}` : ""}`);
  }
}

const ts = Date.now();
const TAG = `TST-SAC-${ts}`;
const svc = new ShippingService();
const sackIds: string[] = [];
const rollIds: string[] = [];
const shipmentIds: string[] = [];
const bagsizTahsisIds: string[] = []; // §7: silinen çuvalın geçmiş satırları (sackId NULL)
let customerId = "";
let itemId = "";
let onayEskiDeger: string | null = null;

async function makeSack(tag: string, qty: number): Promise<string> {
  const sack = await prisma.sack.create({ data: { sackNo: `${TAG}-${tag}`, customerId }, select: { id: true } });
  sackIds.push(sack.id);
  const roll = await prisma.roll.create({
    data: {
      warehouseId: await fixtureWarehouseId(),
      barcode: `${TAG}-${tag}`,
      itemId,
      initialQty: qty,
      currentQty: qty,
      status: RollStatus.WAREHOUSE,
      sackId: sack.id,
    },
    select: { id: true },
  });
  rollIds.push(roll.id);
  return sack.id;
}

async function kur(sackId: string, orderIds: string[]): Promise<string> {
  const r = await svc.createShipment({ sackIds: [sackId], customerId, orderIds }, undefined);
  const id = (r.data as { id: string }).id;
  shipmentIds.push(id);
  return id;
}

interface Satir { id: string; sackId: string | null; orderLineId: string; qty: number; clearedAt: Date | null; clearedShipmentId: string | null }
async function satirlar(sackId: string): Promise<Satir[]> {
  const rows = await prisma.sackAllocation.findMany({
    // `clearedAt` SÜZÜLMEZ: bekçi damgalı satırın DURDUĞUNU ölçüyor
    where: { sackId },
    orderBy: { createdAt: "asc" },
    select: { id: true, sackId: true, orderLineId: true, qty: true, clearedAt: true, clearedShipmentId: true },
  });
  return rows.map((r) => ({ ...r, qty: Number(r.qty) }));
}
async function etkinToplam(lineId: string): Promise<number> {
  const a = await prisma.sackAllocation.aggregate({ where: { orderLineId: lineId, ...ACTIVE_SACK_ALLOCATION }, _sum: { qty: true } });
  return Number(a._sum.qty ?? 0);
}
async function shippedOf(lineId: string): Promise<number> {
  const l = await prisma.orderLine.findUnique({ where: { id: lineId }, select: { shippedQty: true } });
  return Number(l?.shippedQty ?? 0);
}

async function main(): Promise<void> {
  console.log("\n=== SackAllocation DAMGA — sil-yaz yok, etkin yüklem tek kaynak ===\n");
  const customer = await prisma.customer.create({ data: { code: `${TAG}-CUS`, name: `Tahsis damgası ${ts}` }, select: { id: true } });
  customerId = customer.id;
  const item = await prisma.item.create({ data: { code: `${TAG}-ITM`, name: `Tahsis kumaş ${ts}`, itemType: "FABRIC", unit: "MT" }, select: { id: true } });
  itemId = item.id;
  const eski = await prisma.systemSetting.findUnique({ where: { key: SETTING_KEYS.SHIPMENT_CONFIRMATION_ENABLED }, select: { value: true } });
  onayEskiDeger = eski ? JSON.stringify(eski.value) : null;
  await prisma.systemSetting.upsert({
    where: { key: SETTING_KEYS.SHIPMENT_CONFIRMATION_ENABLED },
    create: { key: SETTING_KEYS.SHIPMENT_CONFIRMATION_ENABLED, value: true },
    update: { value: true },
  });

  const orderA = await prisma.order.create({
    data: { orderNumber: `TEST-SAC-A-${ts}`, customerId, lines: { create: [{ itemId, quantity: 500 }] } },
    select: { id: true, lines: { select: { id: true } } },
  });
  const orderB = await prisma.order.create({
    data: { orderNumber: `TEST-SAC-B-${ts}`, customerId, lines: { create: [{ itemId, quantity: 500 }] } },
    select: { id: true, lines: { select: { id: true } } },
  });
  const lineA = orderA.lines[0]!.id;
  const lineB = orderB.lines[0]!.id;

  // ── §1 sipariş kümesi değişimi: eski satır damgalanır, yeni satır etkin ──────
  const sackA = await makeSack("A", 300);
  const sh = await kur(sackA, [orderA.id]);
  const s1 = await satirlar(sackA);
  check("§1a fikstür: A siparişine 300 m etkin tahsis", s1.length === 1 && s1[0]!.orderLineId === lineA && s1[0]!.qty === 300 && s1[0]!.clearedAt === null, JSON.stringify(s1));

  await svc.setShipmentOrders(sh, [orderB.id], undefined);
  const s2 = await satirlar(sackA);
  const eskiA = s2.find((r) => r.orderLineId === lineA);
  const yeniB = s2.find((r) => r.orderLineId === lineB);
  check("§1b ⭐ eski tahsis SİLİNMEDİ — damgalı, clearedShipmentId = sevkiyat", eskiA !== undefined && eskiA.clearedAt !== null && eskiA.clearedShipmentId === sh, JSON.stringify(eskiA));
  check("§1c yeni tahsis etkin (B, 300)", yeniB !== undefined && yeniB.clearedAt === null && yeniB.qty === 300, JSON.stringify(yeniB));
  check("§1d ⭐ Σ okuyucu yalnız ETKİN satırı toplar — A 0 / B 300", (await etkinToplam(lineA)) === 0 && (await etkinToplam(lineB)) === 300);
  check("§1e sipariş defteri (shippedQty) PLANNED'da 0 (damgalı satır sayılmadı, sevk yok)", (await shippedOf(lineA)) === 0 && (await shippedOf(lineB)) === 0);

  // ── §2 partial unique: aynı (çuval, satır) damgalı satır dururken yeniden tahsis ──
  await svc.setShipmentOrders(sh, [orderA.id], undefined);
  const s3 = await satirlar(sackA);
  const aSatirlari = s3.filter((r) => r.orderLineId === lineA);
  check("§2a ⭐ aynı (çuval, A satırı) damgalı dururken YENİDEN tahsis edildi (partial unique)", aSatirlari.length === 2 && aSatirlari.filter((r) => r.clearedAt === null).length === 1, `A satırı ${aSatirlari.length}, etkin ${aSatirlari.filter((r) => r.clearedAt === null).length}`);
  check("§2b B satırı damgalandı", s3.find((r) => r.orderLineId === lineB)?.clearedAt !== null);
  check("§2c toplam satır 3 (hiçbiri silinmedi), etkin 1", s3.length === 3 && s3.filter((r) => r.clearedAt === null).length === 1);
  const cift = await prisma.sackAllocation.count({ where: { sackId: sackA, orderLineId: lineA, ...ACTIVE_SACK_ALLOCATION } });
  check("§2d etkin (çuval, satır) çifti TEK (sed: sack_allocations_active_uq)", cift === 1, `${cift}`);

  // ── §6 damgalı satırın ileri kaydı değişmedi ─────────────────────────────
  const damgali = aSatirlari.find((r) => r.clearedAt !== null);
  check("§6 damgalı satırın ileri kaydı DEĞİŞMEDİ (qty 300, aynı çuval/satır)", damgali?.qty === 300 && damgali.sackId === sackA && damgali.orderLineId === lineA);

  // ── §3 sevkiyat iptali: damga, silme değil ────────────────────────────────
  await svc.dispatchShipment(sh, {}, undefined);
  check("§3a sevk sonrası sipariş defteri A 300 (etkin tahsis)", (await shippedOf(lineA)) === 300, `${await shippedOf(lineA)}`);
  // Sevk tahsisi YENİDEN hesaplar (`writeShipmentAllocationsTx`): eski etkin satır damgalanır,
  // yenisi doğar — satır sayısı DÜŞMEZ, etkin hep 1.
  const sevkSonrasi = await satirlar(sackA);
  check("§3a2 sevk satır SİLMEDİ (≥3 satır), etkin 1", sevkSonrasi.length >= 3 && sevkSonrasi.filter((r) => r.clearedAt === null).length === 1, `${sevkSonrasi.length} satır, etkin ${sevkSonrasi.filter((r) => r.clearedAt === null).length}`);
  await svc.undoDispatch(sh, "bekçi §3 storno", undefined);
  check("§3a3 storno sonrası sipariş defteri 0, tahsis satırları yine 3/1 (storno tahsise dokunmaz)", (await shippedOf(lineA)) === 0 && (await satirlar(sackA)).filter((r) => r.clearedAt === null).length === 1, `${await shippedOf(lineA)}`);
  const durum = await prisma.shipment.findUnique({ where: { id: sh }, select: { status: true } });
  check("§3a4 storno sonrası sevkiyat PLANNED", durum?.status === ShipmentStatus.PLANNED, durum?.status ?? "");
  const iptalOncesi = (await satirlar(sackA)).length;
  await svc.cancelShipment(sh, undefined);
  const s4 = await satirlar(sackA);
  check("§3b ⭐ iptal tahsisleri SİLMEDİ — satır sayısı aynı, hepsi damgalı", s4.length === iptalOncesi && s4.every((r) => r.clearedAt !== null), `${s4.length}/${iptalOncesi}, etkin ${s4.filter((r) => r.clearedAt === null).length}`);
  check("§3c iptal sonrası Σ etkin 0 ve sipariş defteri 0", (await etkinToplam(lineA)) === 0 && (await shippedOf(lineA)) === 0);

  // ── §4 AST + tip taraması ─────────────────────────────────────────────────
  const kok = join(__dirname, "..");
  const r = aktifYuklemTara(kok, [
    {
      delegate: "sackAllocation",
      model: "SackAllocation",
      sabit: "ACTIVE_SACK_ALLOCATION",
      tablo: "sack_allocations",
      helper: join("src", "services", "helpers", "sack-allocation.helper.ts"),
      damga: "clearedAt",
    },
  ]).get("sackAllocation")!;
  check("§4a ⭐ her delegate okuma/güncelleme ACTIVE_SACK_ALLOCATION taşır", r.cagriSayisi >= 6 && r.cagriIhlal.length === 0, `çağrı=${r.cagriSayisi}${r.cagriIhlal.length ? " İHLAL: " + r.cagriIhlal.join(", ") : ""}`);
  check("§4b ⭐ her ilişki okuması (allocations: {…}) ACTIVE_SACK_ALLOCATION taşır", r.iliskiSayisi >= 5 && r.iliskiIhlal.length === 0, `ilişki=${r.iliskiSayisi}${r.iliskiIhlal.length ? " İHLAL: " + r.iliskiIhlal.join(", ") : ""}`);
  check("§4c ⭐ delete/deleteMany YOK (sil-yaz bitti)", r.silme.length === 0, r.silme.join(", ") || "0");
  check("§4d ham SQL başvuruları \"clearedAt\" IS NULL taşır", r.sqlIhlal.length === 0, `sql=${r.sqlSayisi}${r.sqlIhlal.length ? " İHLAL: " + r.sqlIhlal.join(", ") : ""}`);
  console.log(`   istisnalar: ${r.istisnalar.length ? r.istisnalar.join(", ") : "yok"}`);

  // ── §5 SQL ikizi ──────────────────────────────────────────────────────────
  for (const dosya of ["scripts/consistency-check.sql", "scripts/test_consistency.ts"]) {
    const metin = readFileSync(join(kok, dosya), "utf8");
    const eksik = sqlEksikSuzgec(metin, "sack_allocations", "clearedAt") ?? [];
    // TEK beyanlı istisna: alias'sız `qty <= 0` sondası (damgalı satırda da qty > 0) — "(alias yok) 0/1".
    // Alias'lı her başvuru (sal · sa) süzgeç taşımak zorunda; ikinci bir alias'sız başvuru da kırmızı.
    const gercek = eksik.filter((e) => e !== "(alias yok) 0/1");
    check(`§5 ${dosya}: sack_allocations başvuruları süzgeçli (tek beyanlı istisna: alias'sız qty≤0)`, gercek.length === 0 && eksik.length <= 1, gercek.join(", ") || `eksik: ${eksik.join(", ") || "yok"}`);
  }

  await bolum7();
}

// ── §7 sevkiyata girip çıkmış BOŞ çuval silinir; tahsis geçmişi numarayla kalır (2026-11-17) ──
// Canlı hata: CV1411260009 — damgalı tahsis FK Restrict'e çarptı, `removeSack` P2003 →
// "Geçersiz referans". Sayı okuyucuları (shippedQty · kapsama · sipariş sevk geçmişi) silmeden
// önce ve sonra AYNI olmalı; etkin tahsisli çuval silinmez (409).
async function bolum7(): Promise<void> {
  const orderSvc = new OrderService({
    modelName: "order", tableName: "ORDER", searchFields: [], codeSearchFields: ["orderNumber"],
    dateFields: ["createdAt", "deadline"], nestedCreateFields: ["lines"],
  });
  const orderC = await prisma.order.create({
    data: { orderNumber: `TEST-SAC-C-${ts}`, customerId, lines: { create: [{ itemId, quantity: 1000 }] } },
    select: { id: true, lines: { select: { id: true } } },
  });
  const lineC = orderC.lines[0]!.id;
  const sackB = await makeSack("B", 100);
  const sackC = await makeSack("C", 200);
  const rollB = rollIds[rollIds.length - 2]!;
  const rc = await svc.createShipment({ sackIds: [sackB, sackC], customerId, orderIds: [orderC.id] }, undefined);
  const shC = (rc.data as { id: string }).id;
  shipmentIds.push(shC);
  check("§7a fikstür: iki çuval tahsisli (B 100 + C 200)", (await etkinToplam(lineC)) === 300, `${await etkinToplam(lineC)}`);
  check("§7a2 tahsis numarası DOĞUŞTA yazıldı", (await prisma.sackAllocation.count({ where: { sackId: { in: [sackB, sackC] }, sackNo: null } })) === 0);

  // Etkin tahsisli çuval silinemez (sevkiyattan çıkmamış çuval zaten shipmentId kapısında 409).
  const yasak = await svc.removeSack(sackB, undefined, true).then(() => "SİLİNDİ", (e: { statusCode?: number }) => String(e.statusCode));
  check("§7b sevkiyattaki çuval silinemez (409)", yasak === "409", yasak);

  // Sevkiyattan çıkar → tahsis yeniden hesaplanır, B'nin satırları damgalı kalmalı.
  await svc.removeSackFromShipment(shC, sackB, undefined);
  const bSatirlari = await satirlar(sackB);
  check("§7c ⭐ çıkarılan çuvalın ETKİN tahsisi kalmadı (hepsi damgalı, en az 1 geçmiş satır)", bSatirlari.length >= 1 && bSatirlari.every((r) => r.clearedAt !== null), JSON.stringify(bSatirlari.map((r) => ({ c: r.clearedAt !== null }))));
  await svc.dispatchShipment(shC, {}, undefined);
  await svc.removeRollFromSack({ rollId: rollB }, undefined);

  const shippedOnce = await shippedOf(lineC);
  const kapsamaOnce = await prisma.$transaction((tx) => computeLineLedgerTx(tx, [lineC]));
  const gecmisOnce = JSON.stringify((await orderSvc.getOrderShipments(orderC.id)).data);
  const bIdler = bSatirlari.map((r) => r.id);
  bagsizTahsisIds.push(...bIdler);

  // ⭐ ASIL SENARYO: boş çuval silinir.
  const sil = await svc.removeSack(sackB, undefined, false).then(() => "OK", (e: { message?: string }) => e.message ?? String(e));
  check("§7d ⭐ sevkiyata girip çıkmış BOŞ çuval silindi (P2003 yok)", sil === "OK", sil);
  check("§7e çuval satırı gerçekten yok", (await prisma.sack.count({ where: { id: sackB } })) === 0);
  const sonra = await prisma.sackAllocation.findMany({
    // `clearedAt` SÜZÜLMEZ: bekçi damgalı geçmişin DURDUĞUNU ölçüyor
    where: { id: { in: bIdler } },
    select: { id: true, sackId: true, sackNo: true, qty: true, orderLineId: true, clearedAt: true },
  });
  check("§7f ⭐ geçmiş tahsis satırları SİLİNMEDİ, çuval numarasını donuk söylüyor", sonra.length === bIdler.length && sonra.every((r) => r.sackId === null && r.sackNo === `${TAG}-B` && r.clearedAt !== null), JSON.stringify(sonra.map((r) => ({ s: r.sackId, n: r.sackNo }))));
  const once = new Map(bSatirlari.map((r) => [r.id, r]));
  check("§7g geçmiş satırın ileri kaydı DEĞİŞMEDİ (qty · satır · damga)", sonra.every((r) => { const o = once.get(r.id); return !!o && o.qty === Number(r.qty) && o.orderLineId === r.orderLineId && o.clearedAt?.getTime() === r.clearedAt?.getTime(); }));
  const kapsamaSonra = await prisma.$transaction((tx) => computeLineLedgerTx(tx, [lineC]));
  check("§7h shippedQty önce = sonra (200)", shippedOnce === 200 && (await shippedOf(lineC)) === shippedOnce, `${shippedOnce} → ${await shippedOf(lineC)}`);
  check("§7i kapsama (defter Σ) önce = sonra", kapsamaOnce.get(lineC)!.shipped.equals(kapsamaSonra.get(lineC)!.shipped) && Number(kapsamaSonra.get(lineC)!.shipped) === 200, `${kapsamaOnce.get(lineC)!.shipped} → ${kapsamaSonra.get(lineC)!.shipped}`);
  check("§7j sipariş sevk geçmişi ekranı önce = sonra", JSON.stringify((await orderSvc.getOrderShipments(orderC.id)).data) === gecmisOnce);

  // DB seddi: etkin satırın bağı koparılamaz (CHECK sack_allocations_active_has_sack).
  const etkinSatir = await prisma.sackAllocation.findFirst({ where: { sackId: sackC, ...ACTIVE_SACK_ALLOCATION }, select: { id: true } });
  const sed = await prisma.$executeRawUnsafe(`UPDATE sack_allocations SET "sackId" = NULL WHERE id = $1::uuid`, etkinSatir?.id ?? "00000000-0000-0000-0000-000000000000").then(() => "GEÇTİ", (e: Error) => (/active_has_sack/.test(e.message) ? "RED" : e.message));
  check("§7k DB seddi: etkin tahsisin çuval bağı koparılamaz", etkinSatir !== null && sed === "RED", sed);

  // Havuzdaki çuvalda ETKİN tahsis (eski hayalet satır fikstürü) → silme 409, sayı korunur.
  const sackD = await makeSack("D", 50);
  await prisma.sackAllocation.create({ data: { sackId: sackD, sackNo: `${TAG}-D`, orderLineId: lineC, qty: 50 } }); // fikstür: hayalet tahsis
  const red = await svc.removeSack(sackD, undefined, true).then(() => "SİLİNDİ", (e: { statusCode?: number; details?: { code?: string } }) => `${e.statusCode}/${e.details?.code}`);
  check("§7l ⭐ etkin tahsisli havuz çuvalı silinmez (409 SACK_HAS_ACTIVE_ALLOCATION), çuval duruyor", red === "409/SACK_HAS_ACTIVE_ALLOCATION" && (await prisma.sack.count({ where: { id: sackD } })) === 1, red);
}

async function cleanup(): Promise<void> {
  if (onayEskiDeger !== null) {
    await prisma.systemSetting.update({ where: { key: SETTING_KEYS.SHIPMENT_CONFIRMATION_ENABLED }, data: { value: JSON.parse(onayEskiDeger) as boolean } }).catch(() => {});
  } else {
    await prisma.systemSetting.deleteMany({ where: { key: SETTING_KEYS.SHIPMENT_CONFIRMATION_ENABLED } }).catch(() => {});
  }
  const sids = [...new Set(shipmentIds)];
  await prisma.sackAllocation.deleteMany({ where: { sackId: { in: sackIds } } }).catch(() => {}); // fikstür temizliği — üretim yolu değil
  // §7: silinen çuvalın bağsız (sackId NULL) geçmiş satırları sipariş satırına bağlı kalır.
  if (bagsizTahsisIds.length) await prisma.sackAllocation.deleteMany({ where: { id: { in: bagsizTahsisIds } } }).catch(() => {});
  await prisma.printedDocument.deleteMany({ where: { sourceId: { in: sids } } }).catch(() => {});
  await prisma.shipmentEvent.deleteMany({ where: { shipmentId: { in: sids } } }).catch(() => {});
  await prisma.shipmentOrder.deleteMany({ where: { shipmentId: { in: sids } } }).catch(() => {});
  await prisma.warehouseMovement.deleteMany({ where: { rollId: { in: rollIds } } }).catch(() => {});
  await prisma.rollMovement.deleteMany({ where: { rollId: { in: rollIds } } }).catch(() => {});
  await prisma.rollVariance.deleteMany({ where: { rollId: { in: rollIds } } }).catch(() => {});
  await prisma.roll.deleteMany({ where: { id: { in: rollIds } } }).catch(() => {});
  await prisma.sack.deleteMany({ where: { id: { in: sackIds } } }).catch(() => {});
  await prisma.shipment.deleteMany({ where: { id: { in: sids } } }).catch(() => {});
  await prisma.orderLine.deleteMany({ where: { order: { orderNumber: { startsWith: "TEST-SAC-" } } } }).catch(() => {});
  await prisma.order.deleteMany({ where: { orderNumber: { startsWith: "TEST-SAC-" } } }).catch(() => {});
  if (itemId) await prisma.item.deleteMany({ where: { id: itemId } }).catch(() => {});
  if (customerId) await prisma.customer.deleteMany({ where: { id: customerId } }).catch(() => {});
}

main()
  .catch((err) => {
    console.error("Beklenmeyen hata:", err);
    fail++;
  })
  .finally(async () => {
    await cleanup();
    console.log(`\n=== Sonuç: ${pass} geçti, ${fail} başarısız ===`);
    await prisma.$disconnect();
    await pool.end();
    process.exit(fail > 0 ? 1 : 0);
  });
