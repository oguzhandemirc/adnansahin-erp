// =============================================================================
// BEKÇİ — İŞ EMRİ METRESİNİ SİPARİŞLERE PAYLAŞTIRMA (2026-11-16, D1)
// Çalıştır: npx tsx scripts/run-all-tests.ts test_workorder_order_allocation
// =============================================================================
// Tek kaynak `services/helpers/order-link-allocation.helper.ts`; uçlar
// `PUT /api/work-orders/:id/order-links/allocations` + `POST /:id/order-links { allocations }`.
//  §1 Tavan: top yokken hedef metre (TARGET), top girince giren ham metre (INPUT); detayda `allocation`
//  §2 1000 m giren, iki satır: 800+200 kabul · 800+300 → 400 ALLOCATION_OVER_BASIS, yazım geri alınır
//  §3 Kısmi gönderim: gönderilmeyen satır korunur · defter FIELD_CHANGED `orderAllocation` satırı yazar
//  §4 Düzenle (replace, yalnız orderLineIds) paylaştırmayı EZMEZ
//  §5 Tambur bağlamı: `plannedQty` paylaştırılmış satırda dolu, paylaştırmasızda null; `orderedQty` aynen
//  §6 MT dışı satır 400 (bağ da kurulmaz) · bağlı olmayan satır 400 · açık aşımı uyarı
//  §7 POST order-links `allocations` tavanı aşınca 400 ve bağ KURULMAZ
//  §8 Koparılan bağ toplamdan düşer
//  §9 Klon (parti ayırma, orderMode=keep) paylaştırmayı taşımaz → 0
//  §10 CANCELLED iş emri → 409 WO_PLAN_FROZEN
//  §11 `shippedQty` · bulut `siparisMetre` (= `orderedMeters`, aynı türetme) + İE/sipariş bulut satırının tamamı önce-sonra AYNI
//
// NEGATİF SONDALAR (2026-11-16, elle bozulup koşuldu, geri alındı):
//  S1 helper'da `assertAllocationWithinBasisTx` içindeki `allocated.gt(basis)` → `false` → §2b/§7 kırmızı.
//  S2 replace'teki `if (wanted === undefined) continue;` silinip `?? 0` geri kondu → §4 kırmızı.
//  S3 tambur `plannedQty` yerine `Number(ol.quantity)` yazıldı → §5 kırmızı.
//  S4 klonda `allocatedQty: 0` yerine kaynak miktarı kopyalandı → §9 kırmızı.
// =============================================================================
import prisma from "../src/lib/prisma";
import { WorkOrderService } from "../src/services/workorder.service";
import { workOrderLinkService } from "../src/services/workorder-link.service";
import { TamburService } from "../src/services/tambur.service";
import { cloneWorkOrderTx } from "../src/services/helpers/workorder-clone.helper";
import { findRecordProjection } from "../src/cloud-sync/projections";
import { buildRecords } from "../src/cloud-sync/record-builder";
import { ensureTestAdmin } from "./fixture-test-user";

const svc = new WorkOrderService();
const link = workOrderLinkService;
const tambur = new TamburService();
const TAG = `TST-WOALLOC-${Date.now()}`;

let pass = 0, fail = 0;
function check(label: string, cond: boolean, extra = ""): void {
  if (cond) { pass++; console.log(`  ✓ ${label}${extra ? ` — ${extra}` : ""}`); }
  else { fail++; console.log(`  ✗ FAIL: ${label}${extra ? ` — ${extra}` : ""}`); }
}
async function hata(fn: () => Promise<unknown>): Promise<{ code?: string; status?: number; message?: string } | null> {
  try { await fn(); return null; }
  catch (e) {
    const err = e as { details?: { code?: string }; statusCode?: number; message?: string };
    return { code: err.details?.code, status: err.statusCode, message: err.message };
  }
}

let ITEM = "", ADMIN = "", ST_FASON = "", ST_TAMBUR = "", CUSTOMER = "";
const woIds: string[] = [];
const orderIds: string[] = [];
const rollIds: string[] = [];

type Alloc = { basis: number | null; basisKind: string; allocated: number; remaining: number | null };

async function fikstur(): Promise<void> {
  const need = <T,>(v: T | null, label: string): T => {
    if (!v) throw new Error(`Seed fixture eksik: ${label} (önce 'npm run seed' + 'seed:fixtures')`);
    return v;
  };
  ITEM = need(await prisma.item.findFirst({ where: { code: "PATOS" }, select: { id: true } }), "Item PATOS").id;
  ADMIN = (await ensureTestAdmin()).id;
  ST_FASON = need(await prisma.station.findFirst({ where: { code: "BOYA_FASON" }, select: { id: true } }), "BOYA_FASON").id;
  ST_TAMBUR = need(await prisma.station.findFirst({ where: { code: "TAMBUR_1" }, select: { id: true } }), "TAMBUR_1").id;
  CUSTOMER = (await prisma.customer.create({ data: { code: `${TAG}-CUS`, name: `${TAG} müşteri` }, select: { id: true } })).id;
}

async function yeniWo(targetQuantity: number | null): Promise<string> {
  const res = await svc.create(
    { type: "STOCK_PRODUCTION", targetItemId: ITEM, width: 180, steps: [{ stationId: ST_TAMBUR }, { stationId: ST_FASON }], ...(targetQuantity != null ? { targetQuantity } : {}) } as Parameters<typeof svc.create>[0],
    ADMIN,
  );
  const id = (res.data as { id: string }).id;
  woIds.push(id);
  return id;
}

async function yeniSiparis(lines: { quantity: number; unit?: "MT" | "KG" }[]): Promise<string[]> {
  const o = await prisma.order.create({
    data: {
      orderNumber: `${TAG}-S${orderIds.length + 1}`,
      customerId: CUSTOMER,
      lines: { create: lines.map((l) => ({ itemId: ITEM, quantity: l.quantity, unit: l.unit ?? "MT" })) },
    },
    select: { id: true, lines: { select: { id: true }, orderBy: { quantity: "desc" } } },
  });
  orderIds.push(o.id);
  return o.lines.map((l) => l.id);
}

async function allocOf(woId: string): Promise<Alloc> {
  const r = await svc.findById(woId);
  return (r.data as { allocation: Alloc }).allocation;
}
async function qtyOf(woId: string, lineId: string): Promise<number | null> {
  const r = await prisma.workOrderToOrderLine.findFirst({ where: { workOrderId: woId, orderLineId: lineId, unlinkedAt: null }, select: { allocatedQty: true } });
  return r ? Number(r.allocatedQty) : null;
}

async function main(): Promise<void> {
  console.log("=== İş emri metresini siparişlere paylaştırma ===");
  await fikstur();
  try {
    const wo = await yeniWo(1200);
    const [L1, L2] = await yeniSiparis([{ quantity: 900 }, { quantity: 150 }]);
    await link.linkOrderLines(wo, [L1, L2], ADMIN);

    // ── §11 önce ölçümü (paylaştırmadan ÖNCE) ──
    const isEmriP = findRecordProjection("is-emri")!;
    const siparisP = findRecordProjection("siparis")!;
    const NOW = Date.now();
    const shot = async () => {
      const ie = await buildRecords(isEmriP, [wo], NOW);
      const sp = await buildRecords(siparisP, [orderIds[0]], NOW);
      const lines = await prisma.orderLine.findMany({ where: { id: { in: [L1, L2] } }, select: { id: true, shippedQty: true, quantity: true }, orderBy: { id: "asc" } });
      return { ie: JSON.stringify(ie.rows.get("is-emri") ?? []), sp: JSON.stringify(sp.rows.get("siparis") ?? []), lines: JSON.stringify(lines) };
    };

    // ── §1 tavan ──
    console.log("\n§1 Tavan");
    let a = await allocOf(wo);
    check("§1a top yok → tavan hedef metre (TARGET 1200), paylaştırılan 0", a.basisKind === "TARGET" && a.basis === 1200 && a.allocated === 0 && a.remaining === 1200, JSON.stringify(a));
    const step1 = (await prisma.workOrderStep.findFirstOrThrow({ where: { workOrderId: wo, stepSequence: 1 }, select: { id: true } })).id;
    const roll = await prisma.roll.create({
      data: { barcode: `${TAG}-R1`, itemId: ITEM, initialQty: 1000, currentQty: 1000, status: "IN_PRODUCTION", currentStepId: step1 },
      select: { id: true },
    });
    rollIds.push(roll.id);
    a = await allocOf(wo);
    check("§1b top girince → tavan giren ham metre (INPUT 1000)", a.basisKind === "INPUT" && a.basis === 1000, JSON.stringify(a));
    const before = await shot();

    // ── §2 800+200 kabul, 800+300 red ──
    console.log("\n§2 Toplam tavanı");
    const ok = await link.setOrderLinkAllocations(wo, [{ orderLineId: L1, allocatedQty: 800 }, { orderLineId: L2, allocatedQty: 200 }], ADMIN);
    check("§2a 800+200 kabul, kalan 0", ok.data.allocation.allocated === 1000 && ok.data.allocation.remaining === 0 && ok.data.changed === 2, JSON.stringify(ok.data));
    check("§2a' açığı (150 m) aşan satır UYARI alır, engel değil", ok.data.warnings.some((w) => w.includes("açığı")), ok.data.warnings.join(" | "));
    const h = await hata(() => link.setOrderLinkAllocations(wo, [{ orderLineId: L1, allocatedQty: 800 }, { orderLineId: L2, allocatedQty: 300 }], ADMIN));
    check("§2b 800+300 → 400 ALLOCATION_OVER_BASIS", h?.code === "ALLOCATION_OVER_BASIS" && h.status === 400, JSON.stringify(h));
    check("§2c red sonrası değerler geri alındı (800/200)", (await qtyOf(wo, L1)) === 800 && (await qtyOf(wo, L2)) === 200);
    check("§2d red mesajı Türkçe ve fazlayı söyler", !!h?.message?.includes("fazla"), h?.message ?? "");

    // ── §3 kısmi + defter ──
    console.log("\n§3 Kısmi gönderim + defter");
    await link.setOrderLinkAllocations(wo, [{ orderLineId: L2, allocatedQty: 100 }], ADMIN);
    check("§3a yalnız L2 gönderildi → L1 800 korunur, L2 100", (await qtyOf(wo, L1)) === 800 && (await qtyOf(wo, L2)) === 100);
    const ev = await prisma.workOrderEvent.findMany({ where: { workOrderId: wo, field: "orderAllocation" }, select: { trigger: true, fromValue: true, toValue: true, toLabel: true } });
    check("§3b defterde 3 FIELD_CHANGED orderAllocation satırı (2 + 1), tetik ORDER_ALLOCATION", ev.length === 3 && ev.every((e) => e.trigger === "ORDER_ALLOCATION"), JSON.stringify(ev));
    const noop = await link.setOrderLinkAllocations(wo, [{ orderLineId: L2, allocatedQty: 100 }], ADMIN);
    check("§3c aynı değer → değişiklik yok, defter satırı yok", noop.data.changed === 0 && (await prisma.workOrderEvent.count({ where: { workOrderId: wo, field: "orderAllocation" } })) === 3);

    // ── §4 replace korur ──
    console.log("\n§4 Düzenle (replace) paylaştırmayı ezmez");
    const w0 = await prisma.workOrder.findUniqueOrThrow({ where: { id: wo }, select: { status: true, plannedStartDate: true, plannedEndDate: true, targetQuantity: true } });
    const curSteps = await prisma.workOrderStep.findMany({ where: { workOrderId: wo }, orderBy: { stepSequence: "asc" }, select: { id: true, stationId: true } });
    const r4 = await hata(() => svc.replace(wo, {
      type: "ORDER_PRODUCTION", targetItemId: ITEM, width: 180, targetQuantity: Number(w0.targetQuantity),
      steps: curSteps, orderLineIds: [L1, L2],
      plannedStartDate: w0.plannedStartDate?.toISOString(), plannedEndDate: w0.plannedEndDate?.toISOString(),
    } as Parameters<typeof svc.replace>[1], ADMIN));
    check("§4a replace geçti", r4 === null, JSON.stringify(r4));
    check("§4b replace sonrası L1 800 · L2 100 korunur", (await qtyOf(wo, L1)) === 800 && (await qtyOf(wo, L2)) === 100, `${await qtyOf(wo, L1)} / ${await qtyOf(wo, L2)}`);

    // ── §5 tambur ──
    console.log("\n§5 Tambur bağlamı");
    const card = await prisma.travelerCard.findUniqueOrThrow({ where: { workOrderId: wo }, select: { barcode: true, status: true } });
    if (card.status !== "ACTIVE") await prisma.travelerCard.update({ where: { workOrderId: wo }, data: { status: "ACTIVE" } });
    const ctx1 = await tambur.getTamburContext(card.barcode, { allowEmptyStep: true });
    const lines1 = ctx1.data.orders.flatMap((o) => o.lines) as { lineId: string; orderedQty: number; plannedQty: number | null }[];
    const c1 = lines1.find((l) => l.lineId === L1);
    const c2 = lines1.find((l) => l.lineId === L2);
    check("§5a paylaştırılan satırda plannedQty dolu (800), orderedQty siparişin kendisi (900)", c1?.plannedQty === 800 && c1?.orderedQty === 900, JSON.stringify(c1));
    check("§5b ikinci satır plannedQty 100", c2?.plannedQty === 100, JSON.stringify(c2));
    await link.setOrderLinkAllocations(wo, [{ orderLineId: L2, allocatedQty: 0 }], ADMIN);
    const ctx2 = await tambur.getTamburContext(card.barcode, { allowEmptyStep: true });
    const c2b = (ctx2.data.orders.flatMap((o) => o.lines) as { lineId: string; orderedQty: number; plannedQty: number | null }[]).find((l) => l.lineId === L2);
    check("§5c paylaştırma 0 → plannedQty null, orderedQty 150", c2b?.plannedQty === null && c2b?.orderedQty === 150, JSON.stringify(c2b));

    // ── §6 MT dışı / bağlı değil ──
    console.log("\n§6 Satır kuralları");
    const [L3] = await yeniSiparis([{ quantity: 50, unit: "KG" }]);
    const h6 = await hata(() => link.linkOrderLines(wo, [L3], ADMIN, [{ orderLineId: L3, allocatedQty: 5 }]));
    check("§6a KG satıra metre → 400 ALLOCATION_UNIT_NOT_MEASURED", h6?.code === "ALLOCATION_UNIT_NOT_MEASURED" && h6.status === 400, JSON.stringify(h6));
    check("§6b red sonrası KG satırı bağlanmadı (tx geri alındı)", (await qtyOf(wo, L3)) === null);
    const h6c = await hata(() => link.setOrderLinkAllocations(wo, [{ orderLineId: L3, allocatedQty: 0 }], ADMIN));
    check("§6c bağlı olmayan satır → 400 ORDER_LINK_NOT_ACTIVE", h6c?.code === "ORDER_LINK_NOT_ACTIVE", JSON.stringify(h6c));
    const ok6 = await link.linkOrderLines(wo, [L3], ADMIN, [{ orderLineId: L3, allocatedQty: 0 }]);
    check("§6d KG satıra 0 ile bağlama geçer", ok6.data.linked === 1 && (await qtyOf(wo, L3)) === 0);

    // ── §7 POST tavan ──
    console.log("\n§7 Bağlarken paylaştırma");
    const [L4] = await yeniSiparis([{ quantity: 400 }]);
    const h7 = await hata(() => link.linkOrderLines(wo, [L4], ADMIN, [{ orderLineId: L4, allocatedQty: 300 }]));
    check("§7a 800 + 300 > 1000 → 400 ve bağ KURULMAZ", h7?.code === "ALLOCATION_OVER_BASIS" && (await qtyOf(wo, L4)) === null, JSON.stringify(h7));
    const ok7 = await link.linkOrderLines(wo, [L4], ADMIN, [{ orderLineId: L4, allocatedQty: 200 }]);
    check("§7b 800 + 200 = 1000 → bağ kuruldu, yanıtta allocation", ok7.data.linked === 1 && ok7.data.allocation?.allocated === 1000 && (await qtyOf(wo, L4)) === 200, JSON.stringify(ok7.data.allocation));

    // ── §8 koparılan bağ ──
    console.log("\n§8 Koparılan bağ");
    await link.unlinkOrderLine(wo, L4, ADMIN);
    a = await allocOf(wo);
    check("§8 L4 koparıldı → toplam 800, kalan 200", a.allocated === 800 && a.remaining === 200, JSON.stringify(a));

    // ── §11 önce-sonra ──
    console.log("\n§11 Sevk · sipariş metresi · bulut aynen");
    // L4 bağı/koparması ve KG satırı ölçümü kirletmesin: aynı kapsamı (wo + ilk sipariş) yeniden ölç.
    await link.unlinkOrderLine(wo, L3, ADMIN);
    const after = await shot();
    check("§11a sipariş satırı miktar + shippedQty aynen", before.lines === after.lines);
    check("§11b bulut is-emri satırı (siparisMetre dahil) aynen", before.ie === after.ie, before.ie === after.ie ? "" : `${before.ie.slice(0, 300)} ≠ ${after.ie.slice(0, 300)}`);
    check("§11c bulut siparis satırı aynen", before.sp === after.sp);
    check("§11d bulut yükünde paylaştırma alanı YOK", !/allocat|paylast/i.test(after.ie + after.sp));

    // ── §9 klon ──
    console.log("\n§9 Klon");
    const clone = await prisma.$transaction((tx) => cloneWorkOrderTx(tx, { sourceWorkOrderId: wo, reEntryStepSequence: 1, targetColorId: null, orderMode: "keep", movedTotalQty: 0, userId: ADMIN }));
    woIds.push(clone.newWo.id);
    const cl = await prisma.workOrderToOrderLine.findMany({ where: { workOrderId: clone.newWo.id }, select: { allocatedQty: true } });
    check("§9 klonda bağlar var, paylaştırma 0", cl.length >= 2 && cl.every((x) => Number(x.allocatedQty) === 0), JSON.stringify(cl));

    // ── §10 CANCELLED ──
    console.log("\n§10 İptal edilmiş iş emri");
    const wo2 = await yeniWo(500);
    const [L5] = await yeniSiparis([{ quantity: 300 }]);
    await link.linkOrderLines(wo2, [L5], ADMIN);
    await prisma.workOrder.update({ where: { id: wo2 }, data: { status: "CANCELLED" } });
    const h10 = await hata(() => link.setOrderLinkAllocations(wo2, [{ orderLineId: L5, allocatedQty: 100 }], ADMIN));
    check("§10 CANCELLED → 409 WO_PLAN_FROZEN", h10?.status === 409 && h10.code === "WO_PLAN_FROZEN", JSON.stringify(h10));
  } finally {
    await temizle();
  }
  console.log(`\n=== Sonuç: ${pass} geçti, ${fail} başarısız ===`);
  await prisma.$disconnect();
  process.exit(fail > 0 ? 1 : 0);
}

async function temizle(): Promise<void> {
  const cards = await prisma.travelerCard.findMany({ where: { workOrderId: { in: woIds } }, select: { id: true } });
  const cardIds = cards.map((c) => c.id);
  const stepIds = (await prisma.workOrderStep.findMany({ where: { workOrderId: { in: woIds } }, select: { id: true } })).map((x) => x.id);
  await prisma.travelerCardScan.deleteMany({ where: { cardId: { in: cardIds } } });
  await prisma.travelerCard.deleteMany({ where: { id: { in: cardIds } } });
  await prisma.systemLog.deleteMany({ where: { recordId: { in: [...woIds, ...stepIds, ...orderIds] } } });
  await prisma.rollMovement.deleteMany({ where: { rollId: { in: rollIds } } });
  await prisma.roll.deleteMany({ where: { id: { in: rollIds } } });
  await prisma.batch.deleteMany({ where: { workOrderId: { in: woIds } } });
  await prisma.workOrderToOrderLine.deleteMany({ where: { workOrderId: { in: woIds } } });
  await prisma.workOrderStep.deleteMany({ where: { workOrderId: { in: woIds } } });
  await prisma.workOrder.deleteMany({ where: { id: { in: woIds } } });
  await prisma.orderLine.deleteMany({ where: { orderId: { in: orderIds } } });
  await prisma.order.deleteMany({ where: { id: { in: orderIds } } });
  if (CUSTOMER) await prisma.customer.deleteMany({ where: { id: CUSTOMER } });
}

main().catch(async (e) => {
  console.error("HATA:", e);
  await temizle().catch((err) => console.error("temizlik hatası:", err));
  await prisma.$disconnect();
  process.exit(1);
});
