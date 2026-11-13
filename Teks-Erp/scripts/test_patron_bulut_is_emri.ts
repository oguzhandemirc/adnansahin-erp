// =============================================================================
// BEKÇİ — PATRON BULUTU İŞ EMRİ SATIRI (`is-emri` katalog 3) + `fason-acik` kırılımı
// Çalıştır: npx tsx scripts/run-all-tests.ts test_patron_bulut_is_emri
// =============================================================================
//  §1 Katalog: yeni alanlar türetilmiş olarak var, sürüm 3, finans sözcüğü yok; yeni ad/fason kaynakları değişiklik
//     tespitinde (müşteri · ürün · renk · istasyon · fason firma · kategori) ve top kaynağı PARTİ yolunu kapsar.
//  §2 Fixture: elle kurulan İE'lerde açık/kapanış/müşteri/sipariş/aşama/fason alanları elle beklenen değere eşit.
//  §3 Bağımsız SQL: DB'deki HER İE için kurucunun `asamaTop`u ve fason firması kurucudan bağımsız SQL ile aynı.
//  §4 `fason-acik`: fixture firmalarının müşteri/ürün kırılımı ve en eski gönderimi bağımsız SQL ile aynı; kategori
//     listesi aktif kategorilerin hepsi (0'lı dahil); katı şema tanımadığı alanda fırlar.
//
// NEGATİF SONDALAR (2026-11-13, elle bozulup koşuldu, geri alındı):
//  S1 `work-order-facts` STATUS_STAGE'den `WAREHOUSE: "depo"` silindi → 2 ✗ (§2 asamaTop + §3 bağımsız SQL).
//  S2 `loadOpenFasonOfWorkOrders` sıralaması ters çevrildi (az topu olan firma) → 2 ✗ (§2 + §3).
//  S3 `primaryWorkOrderOfRoll` yalnız `producedInStep`e daraltıldı (fason topunun müşterisi kayboldu) → 4 ✗ (§4).
// =============================================================================
import { randomUUID } from "node:crypto";
import { RollStatus } from "@prisma/client";
import prisma from "../src/lib/prisma";
import { findRecordProjection } from "../src/cloud-sync/projections";
import { buildRecords } from "../src/cloud-sync/record-builder";
import { buildSubcontractOpenData } from "../src/cloud-sync/snapshot-fason";
import { seal } from "../src/cloud-sync/snapshots";
import { mapToRoots } from "../src/cloud-sync/change-scan";

let pass = 0;
let fail = 0;
function check(l: string, ok: boolean, x = ""): void {
  if (ok) { pass++; console.log(`  ✓ ${l}${x ? ` — ${x}` : ""}`); }
  else { fail++; console.log(`  ✗ FAIL: ${l}${x ? ` — ${x}` : ""}`); }
}
const FINANCE = /fiyat|tutar|bakiye|maliyet|odeme|doviz|kdv|price|amount|balance|cost|currency/i;
const S = `TEST-PBIE-${Date.now()}-`;
const DAY = 86_400_000;
const j = (v: unknown): string => JSON.stringify(v);

type Stage = { anahtar: string; top: number; metre: number };
type Row = Record<string, unknown> & { id: string; asamaTop: Stage[] };
/** Tel satırını düz JSON üzerinden okur (tip zorlaması yok). */
const asRows = (rows: unknown): Row[] => JSON.parse(JSON.stringify(rows ?? []));

const fx = {
  customers: [] as string[], items: [] as string[], colors: [] as string[], orders: [] as string[], wos: [] as string[],
  stations: [] as string[], firms: [] as string[], cats: [] as string[], dispatches: [] as string[], rolls: [] as string[], batches: [] as string[],
};

async function setup() {
  const now = Date.now();
  const cust = async (n: string) => (await prisma.customer.create({ data: { code: `${S}${n}`, name: `${S}Müşteri ${n}` }, select: { id: true } })).id;
  const c1 = await cust("C1");
  const c2 = await cust("C2");
  fx.customers.push(c1, c2);
  const item = (await prisma.item.create({ data: { code: `${S}I`, name: `${S}Kumaş`, itemType: "FABRIC" }, select: { id: true } })).id;
  const color = (await prisma.color.create({ data: { code: `${S}K`, name: `${S}Renk` }, select: { id: true } })).id;
  fx.items.push(item);
  fx.colors.push(color);
  const order = async (n: string, customerId: string) => {
    const o = await prisma.order.create({ data: { orderNumber: `${S}${n}`, customerId, status: "APPROVED" }, select: { id: true } });
    fx.orders.push(o.id);
    const l = await prisma.orderLine.create({ data: { orderId: o.id, itemId: item, colorId: color, quantity: 100, unit: "MT" }, select: { id: true } });
    return { orderId: o.id, lineId: l.id };
  };
  const o1 = await order("O1", c1);
  const o2 = await order("O2", c2);
  const st = async (n: string, kind: "RAW_QC" | "SUBCONTRACTOR" | "PROCESS_QC" | "TAMBUR" | "OTHER", appliesQuality = false) => {
    const s = await prisma.station.create({ data: { code: `${S}${n}`, name: `${S}${n}`, type: kind === "SUBCONTRACTOR" ? "EXTERNAL" : "INTERNAL", kind, appliesQuality }, select: { id: true } });
    fx.stations.push(s.id);
    return s.id;
  };
  const sKk1 = await st("KK1", "RAW_QC");
  const sFason = await st("FASON", "SUBCONTRACTOR");
  const sKursun = await st("KURSUN", "PROCESS_QC", true);
  const sTambur = await st("TAMBUR", "TAMBUR");
  const sOtherQc = await st("DIGERKK", "OTHER", true); // tür OTHER ama kalite yürütür → "kursun"

  const wo = async (n: string, status: "IN_PROGRESS" | "COMPLETED" | "CANCELLED" | "PLANNED", extra: Record<string, unknown> = {}) => {
    const w = await prisma.workOrder.create({ data: { workOrderNumber: `${S}${n}`, status, targetItemId: item, targetColorId: color, ...extra }, select: { id: true } });
    fx.wos.push(w.id);
    return w.id;
  };
  const woA = await wo("A", "IN_PROGRESS");
  const woB = await wo("B", "COMPLETED");
  const cancelledAt = new Date(now - 2 * DAY);
  const woC = await wo("C", "CANCELLED", { cancelledAt });
  const woD = await wo("D", "PLANNED");
  const step = async (w: string, seq: number, stationId: string, status: "PENDING" | "ACTIVE" | "COMPLETED") =>
    (await prisma.workOrderStep.create({ data: { workOrderId: w, stepSequence: seq, stationId, status }, select: { id: true } })).id;
  const a1 = await step(woA, 1, sKk1, "COMPLETED");
  const a2 = await step(woA, 2, sFason, "ACTIVE");
  const a3 = await step(woA, 3, sKursun, "PENDING");
  const a4 = await step(woA, 4, sTambur, "PENDING");
  await step(woB, 1, sTambur, "COMPLETED");
  await step(woD, 1, sOtherQc, "PENDING");
  // Bağlar: önce O2 (C2) sonra O1 (C1) → bağlanma sırası C2, C1.
  await prisma.workOrderToOrderLine.create({ data: { workOrderId: woA, orderLineId: o2.lineId, createdAt: new Date(now - 3 * DAY) } });
  await prisma.workOrderToOrderLine.create({ data: { workOrderId: woA, orderLineId: o1.lineId, createdAt: new Date(now - 1 * DAY) } });
  // Koparılmış bağ girmez.
  await prisma.workOrderToOrderLine.create({ data: { workOrderId: woD, orderLineId: o1.lineId, unlinkedAt: new Date() } });
  const closedAt = new Date(now - 5 * DAY);
  await prisma.workOrderEvent.create({ data: { workOrderId: woB, type: "STATUS_CHANGED", field: "status", fromValue: "IN_PROGRESS", toValue: "COMPLETED", groupId: randomUUID(), channel: "SYSTEM", createdAt: closedAt } });
  const batch = (await prisma.batch.create({ data: { batchNumber: `${S}P1`, workOrderId: woA }, select: { id: true } })).id;
  fx.batches.push(batch);

  const roll = async (n: string, qty: number, status: RollStatus, links: { currentStepId?: string; producedInStepId?: string; batchId?: string }) => {
    const r = await prisma.roll.create({
      data: { barcode: `${S}${n}`, itemId: item, colorId: color, initialQty: qty, currentQty: qty, status, entrySource: "SUPPLIER_RECEIPT", ...links },
      select: { id: true },
    });
    fx.rolls.push(r.id);
    return r.id;
  };
  const r1 = await roll("R1", 100, RollStatus.AT_SUBCONTRACTOR, { currentStepId: a2 });
  const r2 = await roll("R2", 50, RollStatus.AT_SUBCONTRACTOR, { currentStepId: a2 });
  const r3 = await roll("R3", 70, RollStatus.AT_SUBCONTRACTOR, { currentStepId: a2 });
  await roll("R4", 40, RollStatus.IN_PRODUCTION, { currentStepId: a3 });
  await roll("R5", 30, RollStatus.IN_PRODUCTION, { currentStepId: a4 });
  await roll("R6", 20, RollStatus.WAREHOUSE, { producedInStepId: a1 });
  await roll("R7", 10, RollStatus.SHIPPED, { batchId: batch }); // yalnız parti yolu
  await roll("R8", 999, RollStatus.CANCELLED, { currentStepId: a3 }); // ölü küme sayılmaz
  await roll("R9", 5, RollStatus.STOCK, { currentStepId: a1 }); // bitmiş KK1 adımı → diğer

  const cat = async (n: string) => (await prisma.subcontractorCategory.create({ data: { code: `${S}${n}`, name: `${S}Kategori ${n}` }, select: { id: true } })).id;
  const catDye = await cat("BOYA");
  const catEmpty = await cat("BOS");
  fx.cats.push(catDye, catEmpty);
  const firm = async (n: string, catId: string) => {
    const f = await prisma.subcontractor.create({ data: { code: `${S}${n}`, name: `${S}Firma ${n}` }, select: { id: true } });
    await prisma.subcontractorToCategory.create({ data: { subcontractorId: f.id, categoryId: catId } });
    fx.firms.push(f.id);
    return f.id;
  };
  const f1 = await firm("F1", catDye);
  const f2 = await firm("F2", catDye);
  const sent1 = new Date(now - 10 * DAY);
  const dispatch = async (n: string, firmId: string, at: Date, rolls: Array<[string, number]>) => {
    const d = await prisma.subcontractorDispatch.create({
      data: { dispatchNo: `${S}${n}`, subcontractorId: firmId, workOrderId: woA, stepId: a2, batchId: batch, dispatchedAt: at, items: { create: rolls.map(([rollId, q]) => ({ rollId, dispatchedQty: q })) } },
      select: { id: true },
    });
    fx.dispatches.push(d.id);
  };
  await dispatch("D1", f1, sent1, [[r1, 100]]);
  await dispatch("D2", f1, new Date(now - 4 * DAY), [[r3, 70]]);
  await dispatch("D3", f2, new Date(now - 1 * DAY), [[r2, 50]]);
  return { woA, woB, woC, woD, c1, c2, o1, o2, f1, f2, catEmpty, sent1, closedAt, cancelledAt, item, r7: batch };
}

/** Bağımsız SQL: İE başına aşama kırılımı (kurucunun yardımcılarını KULLANMAZ). */
async function sqlStages(woIds: string[]): Promise<Map<string, Stage[]>> {
  const rows = await prisma.$queryRawUnsafe<Array<{ wo: string; stage: string; top: number; metre: string }>>(`
    WITH wr AS (
      SELECT DISTINCT w.wo, r."id", r."status", r."currentQty", r."currentStepId"
      FROM "rolls" r
      CROSS JOIN LATERAL (
        SELECT s."workOrderId" AS wo FROM "work_order_steps" s WHERE s."id" IN (r."producedInStepId", r."currentStepId")
        UNION SELECT b."workOrderId" FROM "batches" b WHERE b."id" = r."batchId"
      ) w
      WHERE w.wo = ANY($1::uuid[])
        AND r."status" NOT IN ('SUBCONTRACTOR_CONSUMED', 'TAMBUR_CONSUMED', 'KARTELA_CONSUMED', 'CANCELLED')
    )
    SELECT wo::text, stage, count(*)::int AS top, sum("currentQty")::text AS metre FROM (
      SELECT wr.*, CASE
        WHEN "status" = 'AT_SUBCONTRACTOR' THEN 'fason'
        WHEN "status" = 'WAREHOUSE' THEN 'depo'
        WHEN "status" = 'SHIPPED' THEN 'sevkEdildi'
        WHEN EXISTS (SELECT 1 FROM "work_order_steps" s JOIN "stations" t ON t."id" = s."stationId"
                     WHERE s."id" = wr."currentStepId" AND s."status" <> 'COMPLETED' AND (t."kind" = 'PROCESS_QC' OR t."appliesQuality")) THEN 'kursun'
        WHEN EXISTS (SELECT 1 FROM "work_order_steps" s JOIN "stations" t ON t."id" = s."stationId"
                     WHERE s."id" = wr."currentStepId" AND s."status" <> 'COMPLETED' AND t."kind" = 'TAMBUR') THEN 'tambur'
        ELSE 'diger' END AS stage
      FROM wr) x
    GROUP BY 1, 2`, woIds);
  const order = ["fason", "kursun", "tambur", "depo", "sevkEdildi", "diger"];
  const out = new Map<string, Stage[]>();
  for (const r of rows) out.set(r.wo, [...(out.get(r.wo) ?? []), { anahtar: r.stage, top: r.top, metre: Number(Number(r.metre).toFixed(3)) }]);
  for (const [k, v] of out) out.set(k, v.sort((a, b) => order.indexOf(a.anahtar) - order.indexOf(b.anahtar)));
  return out;
}

const OUTSTANDING_SQL = `
  FROM "subcontractor_dispatch_items" i
  JOIN "subcontractor_dispatches" d ON d."id" = i."dispatchId"
  JOIN "subcontractors" f ON f."id" = d."subcontractorId"
  JOIN "rolls" r ON r."id" = i."rollId"
  WHERE d."cancelledAt" IS NULL AND d."directShippedAt" IS NULL AND i."remainderClosedAt" IS NULL AND r."directShipmentId" IS NULL
    AND NOT EXISTS (SELECT 1 FROM "subcontractor_receipt_items" ri JOIN "subcontractor_receipts" rc ON rc."id" = ri."receiptId"
                    WHERE ri."sourceDispatchItemId" = i."id" AND ri."isPartial" = false AND rc."cancelledAt" IS NULL)`;

/** Bağımsız SQL: İE başına en çok topu olan açık fason firması + o firmadaki en eski gönderim. */
async function sqlFason(woIds: string[]): Promise<Map<string, { id: string; at: string; ids: string[] }>> {
  const rows = await prisma.$queryRawUnsafe<Array<{ wo: string; firm: string; name: string; tops: number; oldest: Date; outside: boolean }>>(`
    SELECT w.wo::text, f."id"::text AS firm, f."name", count(DISTINCT r."id")::int AS tops, min(d."dispatchedAt") AS oldest,
           bool_or(r."status" = 'AT_SUBCONTRACTOR') AS outside
    ${OUTSTANDING_SQL.replace("WHERE", `CROSS JOIN LATERAL (
        SELECT s."workOrderId" AS wo FROM "work_order_steps" s WHERE s."id" IN (r."producedInStepId", r."currentStepId")
        UNION SELECT b."workOrderId" FROM "batches" b WHERE b."id" = r."batchId") w WHERE w.wo = ANY($1::uuid[]) AND`)}
    GROUP BY 1, 2, 3`, woIds);
  const byWo = new Map<string, typeof rows>();
  for (const r of rows) byWo.set(r.wo, [...(byWo.get(r.wo) ?? []), r]);
  const out = new Map<string, { id: string; at: string; ids: string[] }>();
  for (const [wo, rs] of byWo) {
    const best = [...rs].sort((a, b) => b.tops - a.tops || a.name.localeCompare(b.name, "tr") || a.firm.localeCompare(b.firm))[0]!;
    out.set(wo, { id: best.firm, at: best.oldest.toISOString(), ids: rs.filter((r) => r.outside).map((r) => r.firm).sort() });
  }
  return out;
}

async function main(): Promise<void> {
  console.log("\n§1 Katalog");
  const p = findRecordProjection("is-emri")!;
  const NEW = ["acik", "kapanisTarihi", "musteriAdi", "musteriAdlari", "siparisIdleri", "siparisNolari", "urunAdi", "renkAdi", "asama", "asamaTop",
    "topSayisi", "metre", "fasonFirmaId", "fasonFirmaAdi", "fasonKategoriler", "fasonGonderim", "fasonFirmaIdleri"];
  const wires = p.derived.map((d) => d.wire);
  check("yeni alanların hepsi türetilmiş olarak var; eskiler duruyor", [...NEW, "cariKartIdleri", "aktifIstasyonId", "uretilenMetre"].every((w) => wires.includes(w)), wires.join(","));
  check("katalog sürümü 3", p.catalogVersion === 3, `${p.catalogVersion}`);
  check("finans sözcüğü yok", !wires.some((w) => FINANCE.test(w)));
  const srcTables = new Set(p.sources.map((s) => s.table));
  const needSrc = ["rolls", "customers", "items", "colors", "stations", "subcontractors", "subcontractor_categories", "orders", "work_order_to_order_lines"];
  check("yeni ad/fason kaynakları değişiklik tespitinde", needSrc.every((t) => srcTables.has(t)), needSrc.filter((t) => !srcTables.has(t)).join(","));

  const fxIds = await setup();
  try {
    const rollSrc = p.sources.find((s) => s.table === "rolls")!;
    const viaBatch = await mapToRoots(rollSrc.root, [fx.rolls[6]!]);
    check("top kaynağı PARTİ yolunu kapsar (yalnız partiye bağlı top → İE kirli)", viaBatch.includes(fxIds.woA), j(viaBatch));
    const custSrc = p.sources.find((s) => s.table === "customers")!;
    check("müşteri adı değişince açık bağlı İE kirlenir, koparılmış bağlı kirlenmez",
      (await mapToRoots(custSrc.root, [fxIds.c1])).includes(fxIds.woA) && !(await mapToRoots(custSrc.root, [fxIds.c1])).includes(fxIds.woD));
    const firmSrc = p.sources.find((s) => s.table === "subcontractors")!;
    check("fason firma adı değişince açık kalemli İE kirlenir", (await mapToRoots(firmSrc.root, [fxIds.f2])).includes(fxIds.woA));

    console.log("\n§2 Fixture değerleri");
    const built = await buildRecords(p, fx.wos, Date.now());
    const rows = new Map(asRows(built.rows.get("is-emri")).map((r) => [r.id, r]));
    const A = rows.get(fxIds.woA)!;
    const B = rows.get(fxIds.woB)!;
    const C = rows.get(fxIds.woC)!;
    const D = rows.get(fxIds.woD)!;
    check("acik: IN_PROGRESS/PLANNED true, COMPLETED/CANCELLED false", A.acik === true && D.acik === true && B.acik === false && C.acik === false);
    check("kapanisTarihi: açıkta null · tamamlanmışta STATUS_CHANGED olayı · iptalde cancelledAt",
      A.kapanisTarihi === null && B.kapanisTarihi === fxIds.closedAt.toISOString() && C.kapanisTarihi === fxIds.cancelledAt.toISOString(), `${B.kapanisTarihi} ${C.kapanisTarihi}`);
    check("müşteri: bağlanma sırası (C2, C1); musteriAdi ilkinin adı; cariKartIdleri aynı sıra",
      j(A.cariKartIdleri) === j([fxIds.c2, fxIds.c1]) && A.musteriAdi === `${S}Müşteri C2` && j(A.musteriAdlari) === j([`${S}Müşteri C2`, `${S}Müşteri C1`]));
    check("sipariş: farklı siparişler bağlanma sırasıyla; nolar aynı sırada",
      j(A.siparisIdleri) === j([fxIds.o2.orderId, fxIds.o1.orderId]) && j(A.siparisNolari) === j([`${S}O2`, `${S}O1`]));
    check("koparılmış bağ: müşteri/sipariş boş", j(D.cariKartIdleri) === "[]" && j(D.siparisIdleri) === "[]" && D.musteriAdi === null);
    check("urunAdi/renkAdi", A.urunAdi === `${S}Kumaş` && A.renkAdi === `${S}Renk`);
    check("asama: aktif fason adımı → fason · tür OTHER ama kalite yürüten → kursun · kapalıda null",
      A.asama === "fason" && D.asama === "kursun" && B.asama === null && C.asama === null, `${A.asama} ${D.asama} ${B.asama}`);
    const expA = [
      { anahtar: "fason", top: 3, metre: 220 }, { anahtar: "kursun", top: 1, metre: 40 }, { anahtar: "tambur", top: 1, metre: 30 },
      { anahtar: "depo", top: 1, metre: 20 }, { anahtar: "sevkEdildi", top: 1, metre: 10 }, { anahtar: "diger", top: 1, metre: 5 },
    ];
    check("asamaTop: sabit sıra, ölü top yok, parti yolu dahil", j(A.asamaTop) === j(expA), j(A.asamaTop));
    check("topSayisi/metre = asamaTop toplamı", A.topSayisi === 8 && A.metre === 325, `${A.topSayisi} ${A.metre}`);
    check("fason: en çok topu olan firma (F1: 2 top), gönderim = F1'in en eski açık sevki",
      A.fasonFirmaId === fxIds.f1 && A.fasonFirmaAdi === `${S}Firma F1` && A.fasonGonderim === fxIds.sent1.toISOString() && j(A.fasonKategoriler) === j([`${S}Kategori BOYA`]));
    check("fasonFirmaIdleri: tekil, sıralı", j(A.fasonFirmaIdleri) === j([fxIds.f1, fxIds.f2].sort()), j(A.fasonFirmaIdleri));
    check("fasonsuz İE: null/[]", B.fasonFirmaId === null && j(B.fasonFirmaIdleri) === "[]" && j(B.fasonKategoriler) === "[]" && B.fasonGonderim === null);

    console.log("\n§3 Bağımsız SQL ↔ kurucu (DB'deki HER iş emri)");
    const allIds = (await prisma.workOrder.findMany({ select: { id: true } })).map((w) => w.id);
    const allBuilt = await buildRecords(p, allIds, Date.now());
    const allRows = asRows(allBuilt.rows.get("is-emri"));
    const stagesSql = await sqlStages(allIds);
    const fasonSql = await sqlFason(allIds);
    const stageDiff = allRows.filter((r) => j(r.asamaTop) !== j(stagesSql.get(r.id) ?? []));
    check(`asamaTop eşit (${allRows.length} İE)`, allRows.length >= 4 && stageDiff.length === 0, stageDiff.slice(0, 3).map((r) => `${r.id}: ${j(r.asamaTop)} ≠ ${j(stagesSql.get(r.id))}`).join(" | "));
    const fasonDiff = allRows.filter((r) => {
      const e = fasonSql.get(r.id);
      return (r.fasonFirmaId ?? null) !== (e?.id ?? null) || (r.fasonGonderim ?? null) !== (e?.at ?? null) || j(r.fasonFirmaIdleri) !== j(e?.ids ?? []);
    });
    check("fason firması + gönderim + firma listesi eşit", fasonDiff.length === 0, fasonDiff.slice(0, 3).map((r) => r.id).join(","));

    console.log("\n§4 fason-acik kırılımı");
    const snap = await buildSubcontractOpenData();
    seal("fason-acik", snap);
    check("katı şemadan geçer", true);
    let threw = false;
    try { seal("fason-acik", { ...snap, firmalar: snap.firmalar.map((f) => ({ ...f, tutar: 1 })) }); } catch { threw = true; }
    check("tanınmayan alan mühürde fırlar", threw);
    const kat = new Map(snap.kategoriler.map((k) => [k.kod, k]));
    check("kategori listesi 0'lıları da taşır", kat.get(`${S}BOS`)?.acikTop === 0 && kat.get(`${S}BOS`)?.kalanMiktar === "0.000" && (kat.get(`${S}BOYA`)?.acikTop ?? 0) >= 3);
    const custSql = await prisma.$queryRawUnsafe<Array<{ firm: string; cust: string | null; name: string | null; top: number; metre: string }>>(`
      WITH rr AS (
        SELECT DISTINCT d."subcontractorId" AS firm, r."id", r."currentQty",
          COALESCE((SELECT s."workOrderId" FROM "work_order_steps" s WHERE s."id" = r."currentStepId"),
                   (SELECT b."workOrderId" FROM "batches" b WHERE b."id" = r."batchId"),
                   (SELECT s."workOrderId" FROM "work_order_steps" s WHERE s."id" = r."producedInStepId")) AS wo
        ${OUTSTANDING_SQL} AND d."subcontractorId" = ANY($1::uuid[])
      ), fc AS (
        SELECT DISTINCT ON (l."workOrderId") l."workOrderId" AS wo, c."id" AS cust, c."name"
        FROM "work_order_to_order_lines" l JOIN "order_lines" ol ON ol."id" = l."orderLineId" JOIN "orders" o ON o."id" = ol."orderId"
        JOIN "customers" c ON c."id" = o."customerId"
        WHERE l."unlinkedAt" IS NULL ORDER BY l."workOrderId", l."createdAt", l."id"
      )
      SELECT rr.firm::text, fc.cust::text, fc."name", count(*)::int AS top, sum(rr."currentQty")::text AS metre
      FROM rr LEFT JOIN fc ON fc.wo = rr.wo GROUP BY 1, 2, 3`, fx.firms);
    for (const fid of [fxIds.f1, fxIds.f2]) {
      const f = snap.firmalar.find((x) => x.fasonFirmaId === fid);
      const exp = custSql.filter((r) => r.firm === fid).map((r) => ({ cariKartId: r.cust, ad: r.name, top: r.top, metre: Number(r.metre) }))
        .sort((a, b) => b.top - a.top || b.metre - a.metre || (a.ad ?? "").localeCompare(b.ad ?? "", "tr"));
      check(`firma ${fid === fxIds.f1 ? "F1" : "F2"}: müşteri kırılımı bağımsız SQL ile aynı`, !!f && j(f.musteriler) === j(exp), `${j(f?.musteriler)} ≠ ${j(exp)}`);
    }
    const F1 = snap.firmalar.find((x) => x.fasonFirmaId === fxIds.f1);
    check("F1: müşteri = topun İE'sinin ilk müşterisi (C2), 2 top 170 m", j(F1?.musteriler) === j([{ cariKartId: fxIds.c2, ad: `${S}Müşteri C2`, top: 2, metre: 170 }]), j(F1?.musteriler));
    check("F1: ürün kırılımı (ürün+renk), en eski gönderim, İE sayısı",
      j(F1?.urunler) === j([{ urunId: fxIds.item, urunAdi: `${S}Kumaş`, renkId: fx.colors[0], renkAdi: `${S}Renk`, top: 2, metre: 170 }]) &&
      F1?.enEskiGonderim === fxIds.sent1.toISOString() && F1?.isEmriSayisi === 1, j(F1?.urunler));
  } finally {
    await cleanup();
  }
  console.log(`\n=== Sonuç: ${pass} geçti, ${fail} başarısız ===`);
  await prisma.$disconnect();
  process.exit(fail === 0 ? 0 : 1);
}

async function cleanup(): Promise<void> {
  await prisma.subcontractorDispatchItem.deleteMany({ where: { dispatchId: { in: fx.dispatches } } });
  await prisma.subcontractorDispatch.deleteMany({ where: { id: { in: fx.dispatches } } });
  await prisma.roll.deleteMany({ where: { id: { in: fx.rolls } } });
  await prisma.batch.deleteMany({ where: { id: { in: fx.batches } } });
  await prisma.workOrderToOrderLine.deleteMany({ where: { workOrderId: { in: fx.wos } } });
  await prisma.workOrderStep.deleteMany({ where: { workOrderId: { in: fx.wos } } });
  await prisma.workOrder.deleteMany({ where: { id: { in: fx.wos } } });
  await prisma.orderLine.deleteMany({ where: { orderId: { in: fx.orders } } });
  await prisma.order.deleteMany({ where: { id: { in: fx.orders } } });
  await prisma.subcontractorToCategory.deleteMany({ where: { subcontractorId: { in: fx.firms } } });
  await prisma.subcontractor.deleteMany({ where: { id: { in: fx.firms } } });
  await prisma.subcontractorCategory.deleteMany({ where: { id: { in: fx.cats } } });
  await prisma.station.deleteMany({ where: { id: { in: fx.stations } } });
  await prisma.color.deleteMany({ where: { id: { in: fx.colors } } });
  await prisma.item.deleteMany({ where: { id: { in: fx.items } } });
  await prisma.customer.deleteMany({ where: { id: { in: fx.customers } } });
}

main().catch(async (err: unknown) => {
  console.error(err);
  try { await cleanup(); } catch (e) { console.error("temizlik:", e); }
  await prisma.$disconnect();
  process.exit(1);
});
