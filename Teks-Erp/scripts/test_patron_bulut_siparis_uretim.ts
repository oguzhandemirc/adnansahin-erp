// =============================================================================
// BEKÇİ — PATRON BULUTU SİPARİŞ "ÜRETİM" CÜMLESİ (`siparis.uretim`, katalog 4)
// Çalıştır: npx tsx scripts/run-all-tests.ts test_patron_bulut_siparis_uretim
// =============================================================================
//  §1 Katalog: `uretim` türetilmiş alan, sürüm 4, finans sözcüğü yok; değişiklik kaynakları top · İE · bağ ·
//     istasyon · fason firma; kaynaklar fixture'da doğru siparişi kirletir, koparılmış bağ kirletmez.
//  §2 Fixture: yedi siparişin `uretim`i elle beklenen {tur, metin} ile BİREBİR (İE yok · tamamlandı + iptal İE ·
//     yalnız koparılmış bağ · fason firma adı + ek yer · kaba aşama birleşmesi · başlanmadı · hazır + karışık ·
//     gönderildi); metinde gün/top sayısı yok.
//  §3 Panel eşitliği: aynı siparişlerin panel "Nerede?" türü (`attachNerede`) telefon türüyle aynı; fasonda firma adı aynı.
//
// NEGATİF SONDALAR (2026-11-13, elle bozulup koşuldu, md5 ile geri alındı):
//  S1 `derived.ts` sipariş kalemi seçiminde `workOrderLinks.where: ACTIVE_ORDER_LINK` silindi (koparılmış bağ sayılır)
//     → 2 ✗ (§2 O3 "Kurşun" · §3 panel "İş emri açılmadı").
//  S2 `deriveOrderUretim` içindeki `NEREDE_ACTIVE_WO` süzgeci silindi (iptal İE sayılır) → 1 ✗ (§2 O2 "Sevke hazır").
//  S3 `uretimStepName` istasyon adına döndürüldü (kaba aşama yok) → 1 ✗ (§2 O5 "…TAMBUR1 · +3 yerde daha").
// =============================================================================
import { RollStatus } from "@prisma/client";
import prisma from "../src/lib/prisma";
import { findRecordProjection } from "../src/cloud-sync/projections";
import { buildRecords } from "../src/cloud-sync/record-builder";
import { mapToRoots } from "../src/cloud-sync/change-scan";
import { ACTIVE_ORDER_LINK } from "../src/services/helpers/order-link.helper";
import { attachNerede } from "../src/services/helpers/order-nerede-load.helper";

let pass = 0;
let fail = 0;
function check(l: string, ok: boolean, x = ""): void {
  if (ok) { pass++; console.log(`  ✓ ${l}${x ? ` — ${x}` : ""}`); }
  else { fail++; console.log(`  ✗ FAIL: ${l}${x ? ` — ${x}` : ""}`); }
}
const FINANCE = /fiyat|tutar|bakiye|maliyet|odeme|doviz|kdv|price|amount|balance|cost|currency/i;
const S = `TEST-PBSU-${Date.now()}-`;
const DAY = 86_400_000;
const j = (v: unknown): string => JSON.stringify(v);

/** `attachNerede` satıra `nerede` ekler ama tipi `T[]` döner: alanı zorlamadan, daraltarak oku. */
function neredeOf(r: object): { kind: string; text: string } {
  const n: unknown = "nerede" in r ? r.nerede : undefined;
  if (typeof n !== "object" || n === null || !("kind" in n) || !("text" in n)) throw new Error(`nerede yok: ${j(r)}`);
  const { kind, text } = n;
  if (typeof kind !== "string" || typeof text !== "string") throw new Error(`nerede biçimi bozuk: ${j(n)}`);
  return { kind, text };
}

const fx = {
  customers: [] as string[], items: [] as string[], colors: [] as string[], orders: [] as string[], wos: [] as string[],
  stations: [] as string[], firms: [] as string[], dispatches: [] as string[], rolls: [] as string[], batches: [] as string[],
};

type WoStatus = "IN_PROGRESS" | "COMPLETED" | "CANCELLED" | "PLANNED";

async function setup() {
  const now = Date.now();
  const cust = (await prisma.customer.create({ data: { code: `${S}C`, name: `${S}Müşteri` }, select: { id: true } })).id;
  fx.customers.push(cust);
  const item = (await prisma.item.create({ data: { code: `${S}I`, name: `${S}Kumaş`, itemType: "FABRIC" }, select: { id: true } })).id;
  const color = (await prisma.color.create({ data: { code: `${S}K`, name: `${S}Renk` }, select: { id: true } })).id;
  fx.items.push(item);
  fx.colors.push(color);

  const order = async (n: string) => {
    const o = await prisma.order.create({ data: { orderNumber: `${S}${n}`, customerId: cust, status: "APPROVED" }, select: { id: true } });
    fx.orders.push(o.id);
    const l = await prisma.orderLine.create({ data: { orderId: o.id, itemId: item, colorId: color, quantity: 100, unit: "MT" }, select: { id: true } });
    return { id: o.id, line: l.id };
  };
  const st = async (n: string, kind: "RAW_QC" | "SUBCONTRACTOR" | "PROCESS_QC" | "TAMBUR" | "OTHER", appliesQuality = false) => {
    const s = await prisma.station.create({ data: { code: `${S}${n}`, name: `${S}${n}`, type: kind === "SUBCONTRACTOR" ? "EXTERNAL" : "INTERNAL", kind, appliesQuality }, select: { id: true } });
    fx.stations.push(s.id);
    return s.id;
  };
  const sKk1 = await st("KK1", "RAW_QC");
  const sFason = await st("FASON", "SUBCONTRACTOR");
  const sKursun = await st("KURSUN", "PROCESS_QC", true);
  const sTambur1 = await st("TAMBUR1", "TAMBUR");
  const sTambur2 = await st("TAMBUR2", "TAMBUR");
  const sBoya = await st("Boya", "OTHER");

  const wo = async (n: string, status: WoStatus) => {
    const w = await prisma.workOrder.create({ data: { workOrderNumber: `${S}${n}`, status, targetItemId: item, targetColorId: color, ...(status === "CANCELLED" ? { cancelledAt: new Date() } : {}) }, select: { id: true } });
    fx.wos.push(w.id);
    return w.id;
  };
  const step = async (w: string, seq: number, stationId: string) =>
    (await prisma.workOrderStep.create({ data: { workOrderId: w, stepSequence: seq, stationId, status: "ACTIVE" }, select: { id: true } })).id;
  const link = (w: string, line: string, unlinked = false) =>
    prisma.workOrderToOrderLine.create({ data: { workOrderId: w, orderLineId: line, ...(unlinked ? { unlinkedAt: new Date() } : {}) } });
  const roll = async (n: string, status: RollStatus, links: { currentStepId?: string; producedInStepId?: string }) => {
    const r = await prisma.roll.create({
      data: { barcode: `${S}${n}`, itemId: item, colorId: color, initialQty: 50, currentQty: 50, status, entrySource: "SUPPLIER_RECEIPT", ...links },
      select: { id: true },
    });
    fx.rolls.push(r.id);
    return r.id;
  };

  // O1 — hiç bağ yok.
  const o1 = await order("O1");
  // O2 — tamamlanmış İE (depoda topu var) + İPTAL İE (Tambur'da topu var): iptal sayılmaz → "Tamamlandı".
  const o2 = await order("O2");
  const w2a = await wo("W2A", "COMPLETED");
  const w2b = await wo("W2B", "CANCELLED");
  await link(w2a, o2.line);
  await link(w2b, o2.line);
  await roll("R2A", RollStatus.WAREHOUSE, { producedInStepId: await step(w2a, 1, sTambur1) });
  await roll("R2B", RollStatus.IN_PRODUCTION, { currentStepId: await step(w2b, 1, sTambur1) });
  // O3 — yalnız KOPARILMIŞ bağ (İE çalışıyor, topu Kurşun'da) → "İş emri yok".
  const o3 = await order("O3");
  const w3 = await wo("W3", "IN_PROGRESS");
  await link(w3, o3.line, true);
  const r3 = await roll("R3", RollStatus.IN_PRODUCTION, { currentStepId: await step(w3, 1, sKursun) });
  // O4 — fasonda 3 top (F1) · Kurşun'da 1 · depoda 2 → "Fasonda – F1 · +2 yerde daha".
  const o4 = await order("O4");
  const w4 = await wo("W4", "IN_PROGRESS");
  await link(w4, o4.line);
  const w4kk1 = await step(w4, 1, sKk1);
  const w4fason = await step(w4, 2, sFason);
  const w4kursun = await step(w4, 3, sKursun);
  const f1 = (await prisma.subcontractor.create({ data: { code: `${S}F1`, name: `${S}Firma F1` }, select: { id: true } })).id;
  fx.firms.push(f1);
  const r4f = [
    await roll("R4F1", RollStatus.AT_SUBCONTRACTOR, { currentStepId: w4fason }),
    await roll("R4F2", RollStatus.AT_SUBCONTRACTOR, { currentStepId: w4fason }),
    await roll("R4F3", RollStatus.AT_SUBCONTRACTOR, { currentStepId: w4fason }),
  ];
  const batch = (await prisma.batch.create({ data: { batchNumber: `${S}P4`, workOrderId: w4 }, select: { id: true } })).id;
  fx.batches.push(batch);
  const d = await prisma.subcontractorDispatch.create({
    data: { dispatchNo: `${S}D1`, subcontractorId: f1, workOrderId: w4, stepId: w4fason, batchId: batch, dispatchedAt: new Date(now - 6 * DAY), items: { create: r4f.map((rollId) => ({ rollId, dispatchedQty: 50 })) } },
    select: { id: true },
  });
  fx.dispatches.push(d.id);
  await roll("R4K", RollStatus.IN_PRODUCTION, { currentStepId: w4kursun });
  await roll("R4D1", RollStatus.WAREHOUSE, { producedInStepId: w4kk1 });
  await roll("R4D2", RollStatus.WAREHOUSE, { producedInStepId: w4kk1 });
  // O5 — iki ayrı Tambur istasyonu (2 + 1 top: kaba adla TEK yer) · KK1'de 1 · "Boya" (OTHER) 1 → "Tambur · +2 yerde daha".
  const o5 = await order("O5");
  const w5 = await wo("W5", "IN_PROGRESS");
  await link(w5, o5.line);
  const w5t1 = await step(w5, 3, sTambur1);
  const w5t2 = await step(w5, 4, sTambur2);
  await roll("R5T1", RollStatus.IN_PRODUCTION, { currentStepId: w5t1 });
  await roll("R5T2", RollStatus.IN_PRODUCTION, { currentStepId: w5t1 });
  await roll("R5T3", RollStatus.IN_PRODUCTION, { currentStepId: w5t2 });
  await roll("R5K", RollStatus.IN_PRODUCTION, { currentStepId: await step(w5, 1, sKk1) });
  await roll("R5B", RollStatus.IN_PRODUCTION, { currentStepId: await step(w5, 2, sBoya) });
  // O6 — planlanmış İE, top yok → "İşe başlanmadı".
  const o6 = await order("O6");
  const w6 = await wo("W6", "PLANNED");
  await link(w6, o6.line);
  // O7 — tamamlanmış İE (depoda 2 top) + açık İE (KK1'de 1 top) → "Sevke hazır · +1 yerde daha".
  const o7 = await order("O7");
  const w7a = await wo("W7A", "COMPLETED");
  const w7b = await wo("W7B", "IN_PROGRESS");
  await link(w7a, o7.line);
  await link(w7b, o7.line);
  const w7aStep = await step(w7a, 1, sTambur1);
  await roll("R7A1", RollStatus.WAREHOUSE, { producedInStepId: w7aStep });
  await roll("R7A2", RollStatus.WAREHOUSE, { producedInStepId: w7aStep });
  await roll("R7B", RollStatus.IN_PRODUCTION, { currentStepId: await step(w7b, 1, sKk1) });
  // O8 — açık İE'nin bütün topları gönderilmiş → "Üretilen toplar gönderildi".
  const o8 = await order("O8");
  const w8 = await wo("W8", "IN_PROGRESS");
  await link(w8, o8.line);
  await roll("R8", RollStatus.SHIPPED, { producedInStepId: await step(w8, 1, sTambur1) });

  return { o1, o2, o3, o4, o5, o6, o7, o8, w3, w4, r3, r4f, f1, sKursun, o3line: o3.line };
}

async function main(): Promise<void> {
  console.log("\n§1 Katalog");
  const p = findRecordProjection("siparis")!;
  const spec = p.derived.find((x) => x.wire === "uretim");
  check("`uretim` türetilmiş alan olarak var; eski alanlar duruyor", !!spec && ["acik", "toplamMiktar", "musteriAdi", "acikMiktar"].every((w) => p.derived.some((x) => x.wire === w)));
  check("katalog sürümü 4", p.catalogVersion === 4, `${p.catalogVersion}`);
  check("finans sözcüğü yok", !p.derived.some((x) => FINANCE.test(x.wire)));
  const src = new Map(p.sources.map((s) => [s.table, s]));
  const need = ["orders", "order_lines", "customers", "rolls", "work_orders", "work_order_to_order_lines", "stations", "subcontractors"];
  check("değişiklik kaynakları: top · İE · bağ · istasyon · fason firma", need.every((t) => src.has(t)), need.filter((t) => !src.has(t)).join(","));

  const f = await setup();
  try {
    const roots = (t: string, keys: string[]) => mapToRoots(src.get(t)!.root, keys);
    const byRoll = await roots("rolls", [f.r4f[0]!, f.r3]);
    check("top hareketi bağlı siparişi kirletir, koparılmış bağın siparişini kirletmez", byRoll.includes(f.o4.id) && !byRoll.includes(f.o3.id), j(byRoll));
    check("İE durumu değişince bağlı sipariş kirlenir", (await roots("work_orders", [f.w4])).includes(f.o4.id));
    check("bağ koparılınca (bağ satırı) siparişi kirlenir", (await roots("work_order_to_order_lines", [f.o3line])).includes(f.o3.id));
    check("istasyon değişince o adımda üretimde topu olan sipariş kirlenir", (await roots("stations", [f.sKursun])).includes(f.o4.id));
    check("fason firma adı değişince açık kalemli sipariş kirlenir", (await roots("subcontractors", [f.f1])).includes(f.o4.id));

    console.log("\n§2 Fixture değerleri");
    const built = await buildRecords(p, fx.orders, Date.now());
    const rows = new Map((JSON.parse(JSON.stringify(built.rows.get("siparis") ?? [])) as Array<{ id: string; uretim: unknown }>).map((r) => [r.id, r.uretim]));
    const exp: Array<[string, string, { tur: string; metin: string }]> = [
      ["O1 bağ yok", f.o1.id, { tur: "IS_EMRI_YOK", metin: "İş emri yok" }],
      ["O2 tamamlandı (iptal İE sayılmaz)", f.o2.id, { tur: "TAMAMLANDI", metin: "Tamamlandı" }],
      ["O3 yalnız koparılmış bağ", f.o3.id, { tur: "IS_EMRI_YOK", metin: "İş emri yok" }],
      ["O4 fasonda firma adı + ek yer", f.o4.id, { tur: "FASON", metin: `Fasonda – ${S}Firma F1 · +2 yerde daha` }],
      ["O5 kaba aşama (iki Tambur tek yer)", f.o5.id, { tur: "ASAMA", metin: "Tambur · +2 yerde daha" }],
      ["O6 başlanmadı", f.o6.id, { tur: "BASLAMADI", metin: "İşe başlanmadı" }],
      ["O7 hazır + açık İE", f.o7.id, { tur: "HAZIR", metin: "Sevke hazır · +1 yerde daha" }],
      ["O8 gönderildi", f.o8.id, { tur: "GONDERILDI", metin: "Üretilen toplar gönderildi" }],
    ];
    for (const [label, id, e] of exp) check(label, j(rows.get(id)) === j(e), j(rows.get(id)));
    check("metinde gün ve top sayısı yok", [...rows.values()].every((u) => !/gün|\btop\b/i.test(String((u as { metin?: string } | null)?.metin ?? ""))));

    console.log("\n§3 Panel \"Nerede?\" ile aynı tür");
    const panelRows = await prisma.order.findMany({
      where: { id: { in: fx.orders } },
      select: {
        id: true, status: true, manualClosedById: true, deadline: true,
        lines: { select: { quantity: true, shippedQty: true, unit: true, cancelledAt: true, workOrderLinks: { where: ACTIVE_ORDER_LINK, select: { workOrder: { select: { id: true, status: true } } } } } },
      },
    });
    const panel = new Map((await attachNerede(panelRows)).map((r) => [r.id, neredeOf(r)]));
    const KIND: Record<string, string> = { IS_EMRI_YOK: "NO_WORK_ORDER", HAZIR: "READY", FASON: "FASON", ASAMA: "STEP", GONDERILDI: "PRODUCED_SHIPPED", BASLAMADI: "NOT_STARTED" };
    const diff = fx.orders.filter((id) => {
      const u = rows.get(id) as { tur: string; metin: string };
      if (u.tur === "TAMAMLANDI") return false; // panelde "bitti" kavramı yok — bilinçli fark
      const n = panel.get(id)!;
      if (KIND[u.tur] !== n.kind) return true;
      return u.tur === "FASON" && !n.text.startsWith(u.metin.split(" · ")[0]!);
    });
    check(`telefon türü panel türüyle aynı (${fx.orders.length} sipariş, "Tamamlandı" hariç)`, diff.length === 0, diff.map((id) => `${j(rows.get(id))} ≠ ${j(panel.get(id))}`).join(" | "));
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
  await prisma.subcontractor.deleteMany({ where: { id: { in: fx.firms } } });
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
