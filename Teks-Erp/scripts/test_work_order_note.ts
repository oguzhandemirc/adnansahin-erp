// =============================================================================
// BEKÇİ — İŞ EMRİ PLANLAMA NOTU (2026-11-16, D2)
// Çalıştır: npx tsx scripts/run-all-tests.ts test_work_order_note
// =============================================================================
// Not yalnız `GET/PUT /api/work-orders/:id/note` uçlarından okunur/yazılır (`workorder-note.service`).
//  §1 Yaz/oku: not kaydedilir, yazan + zaman döner; aynı metin tekrar → değişiklik yok
//  §2 2000 karakter sınırı: 2001 → 400; boşluk kırpılır
//  §3 Temizle: boş gövde → body null, satır SİLİNMEZ (body '')
//  §4 SIZINTI YOK: not metni iş emri detayında (`findById` = tablet/panel detay), Tambur
//     bağlamında (tablet), refakat kartı HTML'inde ve patron bulutu iş emri/sipariş yükünde GEÇMEZ
//  §5 Olmayan iş emri → 404
//
// NEGATİF SONDALAR (2026-11-16, elle bozulup koşuldu, geri alındı):
//  S1 `findById` include'una `planningNote: true` eklendi → §4a kırmızı.
//  S2 servis gövdeyi kırpmadan yazdı (`rawBody.trim()` → `rawBody`) → §1b/§1d/§1e kırmızı (3).
// =============================================================================
import prisma from "../src/lib/prisma";
import { WorkOrderService } from "../src/services/workorder.service";
import { workOrderNoteService } from "../src/services/workorder-note.service";
import { workOrderLinkService } from "../src/services/workorder-link.service";
import { TamburService } from "../src/services/tambur.service";
import { TravelerCardService } from "../src/services/traveler-card.service";
import { findRecordProjection } from "../src/cloud-sync/projections";
import { buildRecords } from "../src/cloud-sync/record-builder";
import { ensureTestAdmin } from "./fixture-test-user";

const svc = new WorkOrderService();
const TAG = `TST-WONOTE-${Date.now()}`;
const SECRET = `PLNOT-${Date.now()}-gizli-planlama`;

let pass = 0, fail = 0;
function check(label: string, cond: boolean, extra = ""): void {
  if (cond) { pass++; console.log(`  ✓ ${label}${extra ? ` — ${extra}` : ""}`); }
  else { fail++; console.log(`  ✗ FAIL: ${label}${extra ? ` — ${extra}` : ""}`); }
}
async function hata(fn: () => Promise<unknown>): Promise<{ status?: number; message?: string } | null> {
  try { await fn(); return null; }
  catch (e) { const err = e as { statusCode?: number; message?: string }; return { status: err.statusCode, message: err.message }; }
}

let ITEM = "", ADMIN = "", ST_FASON = "", ST_TAMBUR = "", CUSTOMER = "";
const woIds: string[] = [];
const orderIds: string[] = [];

async function main(): Promise<void> {
  console.log("=== İş emri planlama notu ===");
  ITEM = (await prisma.item.findFirstOrThrow({ where: { code: "PATOS" }, select: { id: true } })).id;
  ADMIN = (await ensureTestAdmin()).id;
  ST_FASON = (await prisma.station.findFirstOrThrow({ where: { code: "BOYA_FASON" }, select: { id: true } })).id;
  ST_TAMBUR = (await prisma.station.findFirstOrThrow({ where: { code: "TAMBUR_1" }, select: { id: true } })).id;
  CUSTOMER = (await prisma.customer.create({ data: { code: `${TAG}-CUS`, name: `${TAG} müşteri` }, select: { id: true } })).id;
  try {
    const res = await svc.create({ type: "STOCK_PRODUCTION", targetItemId: ITEM, width: 180, steps: [{ stationId: ST_TAMBUR }, { stationId: ST_FASON }] } as Parameters<typeof svc.create>[0], ADMIN);
    const wo = (res.data as { id: string }).id;
    woIds.push(wo);
    const order = await prisma.order.create({
      data: { orderNumber: `${TAG}-S1`, customerId: CUSTOMER, lines: { create: [{ itemId: ITEM, quantity: 300 }] } },
      select: { id: true, lines: { select: { id: true } } },
    });
    orderIds.push(order.id);
    await workOrderLinkService.linkOrderLines(wo, [order.lines[0].id], ADMIN);

    console.log("\n§1 Yaz / oku");
    const empty = await workOrderNoteService.get(wo);
    check("§1a not yokken body null", empty.data.body === null && empty.data.updatedBy === null, JSON.stringify(empty.data));
    const w = await workOrderNoteService.set(wo, `  ${SECRET}\nikinci satır  `, ADMIN);
    check("§1b kaydedildi, kırpıldı, yazan döner", w.data.body === `${SECRET}\nikinci satır` && w.data.updatedBy?.id === ADMIN && !!w.data.updatedAt, JSON.stringify(w.data));
    const g = await workOrderNoteService.get(wo);
    check("§1c GET aynı notu döner", g.data.body === w.data.body);
    const again = await workOrderNoteService.set(wo, `${SECRET}\nikinci satır`, ADMIN);
    check("§1d aynı metin → 'Not değişmedi.'", again.message === "Not değişmedi.");
    const audits = await prisma.systemLog.count({ where: { recordId: wo, tableName: "WORK_ORDER", newData: { path: ["event"], equals: "PLANNING_NOTE_SET" } } }).catch(() => -1);
    check("§1e audit tek satır (PLANNING_NOTE_SET)", audits === 1, String(audits));

    console.log("\n§2 Sınır");
    const h = await hata(() => workOrderNoteService.set(wo, "x".repeat(2001), ADMIN));
    check("§2a 2001 karakter → 400", h?.status === 400, JSON.stringify(h));
    const edge = await workOrderNoteService.set(wo, `${"y".repeat(2000)}   `, ADMIN);
    check("§2b 2000 karakter + sondaki boşluk kabul (kırpılır)", edge.data.body?.length === 2000, String(edge.data.body?.length));
    await workOrderNoteService.set(wo, SECRET, ADMIN);

    console.log("\n§4 Sızıntı yok");
    const detail = JSON.stringify((await svc.findById(wo)).data);
    check("§4a iş emri detayında (findById) not yok", !detail.includes(SECRET) && !detail.includes("planningNote"));
    const card = await prisma.travelerCard.findUniqueOrThrow({ where: { workOrderId: wo }, select: { id: true, barcode: true, status: true } });
    if (card.status !== "ACTIVE") await prisma.travelerCard.update({ where: { id: card.id }, data: { status: "ACTIVE" } });
    const tamburCtx = JSON.stringify((await new TamburService().getTamburContext(card.barcode, { allowEmptyStep: true })).data);
    check("§4b Tambur bağlamında (tablet) not yok", tamburCtx.length > 50 && !tamburCtx.includes(SECRET));
    const html = await new TravelerCardService().getCardHtml(card.id);
    check("§4c refakat kartı HTML'inde not yok", html.length > 200 && !html.includes(SECRET), `html=${html.length}`);
    const ie = await buildRecords(findRecordProjection("is-emri")!, [wo], Date.now());
    const sp = await buildRecords(findRecordProjection("siparis")!, [order.id], Date.now());
    const cloud = JSON.stringify([...ie.rows.values(), ...sp.rows.values()]);
    check("§4d patron bulutu iş emri + sipariş yükünde not yok", cloud.length > 50 && !cloud.includes(SECRET) && !/planningNote|planlamaNot/i.test(cloud));

    console.log("\n§3 Temizle");
    const cl = await workOrderNoteService.set(wo, "   ", ADMIN);
    const row = await prisma.workOrderNote.findUnique({ where: { workOrderId: wo }, select: { body: true } });
    check("§3 boş → body null, satır duruyor (body '')", cl.data.body === null && row?.body === "", JSON.stringify(row));

    console.log("\n§5 Olmayan iş emri");
    const h5 = await hata(() => workOrderNoteService.get("00000000-0000-4000-8000-000000000000"));
    check("§5 404", h5?.status === 404, JSON.stringify(h5));
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
  await prisma.workOrderNote.deleteMany({ where: { workOrderId: { in: woIds } } });
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
