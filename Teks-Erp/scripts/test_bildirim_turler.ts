// =============================================================================
// Test: Bildirim KALAN TÜRLER (2.13.0, D6a) — sipariş iptal/tamamlandı · sevk çıkışı/iptali · fire/iptal ·
// mal kabul · fason sevk/kabul · gün sonu özeti
// =============================================================================
// Her tür kataloğun beyan ettiği GERÇEK denetim çağrısından doğar (§0 çağrı yerini kaynakta arar); kanca yalnız
// çağrının argümanını (eylem · tablo · `newData` etiketi) görür, yükleyici durumu + tazeliği DB'den doğrular.
// Sipariş iptali ve elle tamamlama SERVİS yolundan; sevk/fason satırları doğrudan kurulur ve servisin yaptığı
// denetim çağrısı birebir yapılır (sevk kurmak çuval+top+tartı fikstürü ister — çağrı biçimi §0'da kaynağa bağlı).
//
// NEGATİF SONDALAR (2026-11-17, elle koşuldu, hepsi kırmızı verdi):
//   1. `loadShipmentDispatched` tazelik denetimi silindi → §d "bayat sevk bildirim doğurmaz" kırmızı.
//   2. `withNotificationsSuppressed` getStore denetimi silindi (audit-hook) → §b "bastırılmış iptal" kırmızı.
//   3. katalogda sevkiyat-cikti `when` (kind=DISPATCH) silindi → §d "DISPATCH_NOTE çağrısı tür doğurmaz" kırmızı.
//   4. gün sonu işinde saat denetimi silindi → §g "saatten önce doğmaz" kırmızı.
// =============================================================================

import { readFileSync } from "node:fs";
import path from "node:path";
import { randomBytes, randomUUID } from "node:crypto";
import * as bcrypt from "bcryptjs";
import prisma from "../src/lib/prisma";
import { customerService } from "../src/routes/customer.routes";
import { orderService } from "../src/routes/order.routes";
import { AuditService } from "../src/services/audit.service";
import { SETTING_KEYS, systemSettingService } from "../src/services/system-setting.service";
import { PASSWORD_POLICY_VERSION } from "../src/services/helpers/password-policy.helper";
import { flushNotificationHook, withNotificationsSuppressed, auditCallTags } from "../src/services/notifications/audit-hook";
import { invalidateNotificationSwitch } from "../src/services/notifications/notification-switch";
import {
  NOTIFICATION_KINDS,
  NOTIFICATION_KIND_KEYS,
  NOTIFICATION_KINDS_D1,
  notificationMatchesForAudit,
  type NotificationKind,
  type NotificationSource,
} from "../src/constants/notification-catalog";
import { PERMISSION_CATALOG } from "../src/constants/permission-catalog";
import { ensureTestAdmin } from "./fixture-test-user";
import { cleanupTestCustomers } from "./fixture-customer-cleanup";
import { fixtureWarehouseId } from "./fixture-warehouse";
import { dailySummaryEntityId, runDailySummaryOnce } from "../src/jobs/daily-summary.job";
import { parseDailySummaryTime } from "../src/services/system-setting.service";

let pass = 0, fail = 0;
function check(l: string, ok: boolean, x = ""): void {
  if (ok) { pass++; console.log(`  ✓ ${l}${x ? ` — ${x}` : ""}`); }
  else { fail++; console.log(`  ✗ FAIL: ${l}${x ? ` — ${x}` : ""}`); }
}

const STAMP = "TEST-BLT";
const hex = (n: number): string => randomBytes(n).toString("hex");
const letters = (n: number): string => Array.from(randomBytes(n), (b) => "BCDFGHJKLMNPRSTVYZ"[b % 18]).join("");

const userIds: string[] = [];
const orderIds = new Set<string>();
const shipmentIds: string[] = [];
const receiptIds: string[] = [];
const customerIds: string[] = [];
const itemIds: string[] = [];
const extraEntityIds: string[] = [];

interface TestUser { id: string; fullName: string }

async function mkUser(tag: string, codes: readonly string[]): Promise<TestUser> {
  const fullName = `${STAMP} ${tag} ${letters(4)}`;
  const u = await prisma.user.create({
    data: { username: `${STAMP}-${tag}-${hex(3)}`, fullName, passwordHash: await bcrypt.hash(`Zq-${hex(8)}`, 4), passwordPolicyVersion: PASSWORD_POLICY_VERSION },
    select: { id: true },
  });
  userIds.push(u.id);
  for (const code of codes) {
    const p = await prisma.permission.findUnique({ where: { code }, select: { id: true } });
    if (!p) throw new Error(`izin DB'de yok: ${code}`);
    await prisma.userPermission.create({ data: { userId: u.id, permissionId: p.id } });
  }
  return { id: u.id, fullName };
}

async function assign(userId: string, kinds: readonly NotificationKind[]): Promise<void> {
  for (const kind of kinds) await prisma.notificationAssignment.create({ data: { userId, kind } });
}

async function events(kind: NotificationKind, entityId: string) {
  return prisma.notificationEvent.findMany({ where: { kind, entityId }, include: { deliveries: { select: { userId: true } } } });
}

/** §0'ın kaynak haritası: tür → (eylem tablo [etiket]) → çağrıyı taşıyan dosya (`src/services/` altı). */
const SOURCE_FILES: Readonly<Record<string, string>> = {
  "DELETE ORDER": "order.service.ts",
  "UPDATE ORDER_LINE cancelled": "order.service.ts",
  "UPDATE ORDER": "order.service.ts",
  "UPDATE SHIPMENT kind": "shipping.service.ts",
  "CREATE SHIPMENT": "shipping.service.ts",
  "UPDATE ROLL mode": "inventory.service.ts",
  "CREATE GOODS_RECEIPT": "goods-receipt.service.ts",
  "CREATE SUBCONTRACTOR_DISPATCH": "subcontractor.service.ts",
  "CREATE SUBCONTRACTOR_RECEIPT": "subcontractor.service.ts",
};

async function main(): Promise<void> {
  const settingBefore = await prisma.systemSetting.findUnique({ where: { key: SETTING_KEYS.NOTIFICATIONS_ENABLED } });
  const timeBefore = await prisma.systemSetting.findUnique({ where: { key: SETTING_KEYS.NOTIFICATIONS_DAILY_SUMMARY_TIME } });
  try {
    // ── §0 katalog ↔ çağrı yeri ──────────────────────────────────────────────
    console.log("\n§0 katalog: D6a türlerinin her kaynağı src'de bir denetim çağrısı; etiket süzgeci; veri izni");
    const SRC = path.join(__dirname, "..", "src", "services");
    for (const kind of NOTIFICATION_KIND_KEYS.filter((k) => !NOTIFICATION_KINDS_D1.includes(k))) {
      const def = NOTIFICATION_KINDS[kind];
      for (const s of def.sources as readonly NotificationSource[]) {
        const key = `${s.action} ${s.tableName}${s.when ? ` ${s.when.field}` : ""}`;
        const file = SOURCE_FILES[key];
        check(`${kind}: '${key}' kaynak haritasında`, !!file);
        if (!file) continue;
        const txt = readFileSync(path.join(SRC, file), "utf8");
        const head = `action:\\s*"${s.action}"[\\s\\S]{0,80}tableName:\\s*(?:"${s.tableName}"|this\\.config\\.tableName)`;
        const tag = s.when ? `[\\s\\S]{0,400}${s.when.field}:\\s*(?:${s.when.oneOf.map((v) => (v === "true" ? "true" : `"${v}"|isScrap \\? "${v}"`)).join("|")})` : "";
        check(`${kind}: ${file} '${key}' çağrısı taşır`, new RegExp(head + tag).test(txt));
        const tags = s.when ? { [s.when.field]: s.when.oneOf[0]! } : {};
        check(`${kind}: süzgeç '${key}' çağrısını tanır`, notificationMatchesForAudit({ action: s.action, tableName: s.tableName, tags }).some((m) => m.kind === kind));
      }
      check(`${kind}: veri izni '${def.dataPermission}' izin kataloğunda (web)`, PERMISSION_CATALOG.some((p) => p.code === def.dataPermission && !def.dataPermission.startsWith("mobile:")));
    }
    check("süzgeç: sevk notu (UPDATE SHIPMENT kind=DISPATCH_NOTE) tür doğurmaz",
      notificationMatchesForAudit({ action: "UPDATE", tableName: "SHIPMENT", tags: { kind: "DISPATCH_NOTE" } }).length === 0);
    check("süzgeç: top barkod düzeltmesi (UPDATE ROLL etiketsiz) tür doğurmaz", notificationMatchesForAudit({ action: "UPDATE", tableName: "ROLL" }).length === 0);
    check("etiket: yalnız katalog alanları, boolean 'true'", JSON.stringify(Object.entries(auditCallTags({ kind: "X", cancelled: true, reason: "gizli", n: 3 })).sort()) === JSON.stringify([["cancelled", "true"], ["kind", "X"]]));
    check("sevk çıkışı çağrısı iki tür doğurur (sevkiyat-cikti + siparis-tamamlandi)",
      notificationMatchesForAudit({ action: "UPDATE", tableName: "SHIPMENT", tags: { kind: "DISPATCH" } }).map((m) => m.kind).sort().join(",") === "sevkiyat-cikti,siparis-tamamlandi");

    // ── kurulum ──────────────────────────────────────────────────────────────
    const admin = await ensureTestAdmin();
    const actor = await mkUser("yapan", ["order:read", "order:write", "shipping:read", "workorder:read"]);
    const recv = await mkUser("alici", ["order:read", "shipping:read", "workorder:read", "roll:read", "goods-receipt:read", "report:sales"]);
    const noPerm = await mkUser("izinsiz", ["workorder:read"]);
    const ALL = NOTIFICATION_KIND_KEYS;
    await assign(actor.id, ALL.filter((k) => ["siparis-iptal", "siparis-tamamlandi", "sevkiyat-cikti", "sevkiyat-iptal", "fason-gitti"].includes(k)));
    await assign(recv.id, ALL);
    await assign(noPerm.id, ["siparis-iptal", "sevkiyat-cikti"]);
    const item = await prisma.item.create({ data: { code: `${STAMP}-${letters(6)}`, name: `${STAMP} Kumaş ${letters(6)}`, itemType: "FABRIC", unit: "MT" }, select: { id: true } });
    itemIds.push(item.id);
    const custRes = await customerService.create({ name: `${STAMP} Cari ${letters(10)}`, isCustomerRole: true }, admin.id);
    const cust = String((custRes.data as { id: string }).id);
    customerIds.push(cust);
    const custName = (await prisma.customer.findUnique({ where: { id: cust }, select: { name: true } }))!.name;
    const deadline = new Date(Date.now() + 10 * 86_400_000).toISOString();
    const mkOrder = async (): Promise<string> => {
      const r = await orderService.create({ customerId: cust, currency: "TRY", deadline, lines: [{ itemId: item.id, quantity: 10, width: 150 }], clientToken: randomUUID() }, admin.id);
      const id = String((r.data as { id: string }).id);
      orderIds.add(id);
      return id;
    };
    const mkShipment = async (data: Record<string, unknown>): Promise<string> => {
      const s = await prisma.shipment.create({ data: { shipmentNo: `${STAMP}-${hex(4)}`, customerId: cust, ...data }, select: { id: true } });
      shipmentIds.push(s.id);
      return s.id;
    };
    await systemSettingService.set(SETTING_KEYS.NOTIFICATIONS_ENABLED, true, "bekçi", admin.id);
    await flushNotificationHook();

    // ── §a sipariş iptali (servis yolu) ──────────────────────────────────────
    console.log("\n§a sipariş iptali: orderService.softDelete → tek siparis-iptal olayı");
    const o1 = await mkOrder();
    await flushNotificationHook();
    await orderService.softDelete(o1, actor.id);
    await flushNotificationHook();
    const e1 = await events("siparis-iptal", o1);
    check("⭐ tek olay", e1.length === 1, String(e1.length));
    check("metin: başlık + yapan + cari", e1[0]?.title === "Sipariş iptal edildi" && !!e1[0]?.body.includes(actor.fullName) && !!e1[0]?.body.includes(custName), e1[0]?.body);
    const to1 = new Set(e1[0]?.deliveries.map((d) => d.userId));
    check("⭐ alıcı: atanmış + izinli alır; yazar ALMAZ; veri izni olmayan ALMAZ", to1.has(recv.id) && !to1.has(actor.id) && !to1.has(noPerm.id) && to1.size === 1, String(to1.size));
    check("rota telefon biçimi", e1[0]?.route === `/siparisler/${o1}`);

    // ── §b toplu işlem bastırması ────────────────────────────────────────────
    console.log("\n§b içe aktarım geri alma deseni: bastırılmış iptal bildirim doğurmaz");
    const o2 = await mkOrder();
    await withNotificationsSuppressed(() => orderService.softDelete(o2, actor.id));
    await flushNotificationHook();
    check("⭐ bastırılmış iptal: sıfır olay", (await events("siparis-iptal", o2)).length === 0);
    const revertSrc = readFileSync(path.join(SRC, "import", "import-revert.branches.ts"), "utf8");
    const grSrc = readFileSync(path.join(SRC, "goods-receipt.service.ts"), "utf8");
    check("içe aktarım geri alma + mal kabul fişi iptali bastırma içinde", /withNotificationsSuppressed\(\(\) => orderCancelService\.softDelete/.test(revertSrc) && /withNotificationsSuppressed\(\(\) => inventory\.softDelete/.test(grSrc));

    // ── §c elle tamamlama (servis yolu) ──────────────────────────────────────
    console.log("\n§c sipariş elle tamamlama: orderService.manualComplete → siparis-tamamlandi");
    const o3 = await mkOrder();
    await flushNotificationHook();
    await orderService.manualComplete(o3, "bekçi kapatma", actor.id);
    await flushNotificationHook();
    const e3 = await events("siparis-tamamlandi", o3);
    check("⭐ tek olay, yazar almaz", e3.length === 1 && !e3[0]!.deliveries.some((d) => d.userId === actor.id) && e3[0]!.deliveries.some((d) => d.userId === recv.id), String(e3.length));
    await AuditService.log({ userId: actor.id, action: "UPDATE", tableName: "ORDER", recordId: o3, newData: { note: "ikinci yazım" } });
    await flushNotificationHook();
    check("aynı siparişe ikinci UPDATE ORDER yeni olay doğurmaz (tekil)", (await events("siparis-tamamlandi", o3)).length === 1);

    // ── §d sevk çıkışı / iptali ──────────────────────────────────────────────
    console.log("\n§d sevk: DISPATCH çağrısı → sevkiyat-cikti (+ tamamlanan siparişe siparis-tamamlandi); bayat/yanlış etiket doğurmaz");
    const o4 = await mkOrder();
    await prisma.order.update({ where: { id: o4 }, data: { status: "COMPLETED", completedAt: new Date() } });
    const s1 = await mkShipment({ status: "DISPATCHED", dispatchedAt: new Date() });
    await prisma.shipmentOrder.create({ data: { shipmentId: s1, orderId: o4 } });
    await AuditService.log({ userId: actor.id, action: "UPDATE", tableName: "SHIPMENT", recordId: s1, newData: { kind: "DISPATCH", rollCount: 0 } });
    await flushNotificationHook();
    const es1 = await events("sevkiyat-cikti", s1);
    check("⭐ sevkiyat-cikti tek olay; metin cari + BRÜT top/metre", es1.length === 1 && !!es1[0]?.body.includes(custName) && !!es1[0]?.body.includes("0 top") && !!es1[0]?.body.includes("0 m"), es1[0]?.body);
    check("⭐ yan etki: sevkle tamamlanan siparişe siparis-tamamlandi", (await events("siparis-tamamlandi", o4)).length === 1);
    const s2 = await mkShipment({ status: "DISPATCHED", dispatchedAt: new Date(Date.now() - 60 * 60 * 1000) });
    await AuditService.log({ userId: actor.id, action: "UPDATE", tableName: "SHIPMENT", recordId: s2, newData: { kind: "DISPATCH" } });
    await flushNotificationHook();
    check("⭐ bayat sevk (1 sa önce çıkmış) bildirim doğurmaz", (await events("sevkiyat-cikti", s2)).length === 0);
    const s3 = await mkShipment({ status: "DISPATCHED", dispatchedAt: new Date() });
    await AuditService.log({ userId: actor.id, action: "UPDATE", tableName: "SHIPMENT", recordId: s3, newData: { kind: "DISPATCH_NOTE", dispatchNote: "x" } });
    await flushNotificationHook();
    check("⭐ DISPATCH_NOTE çağrısı tür doğurmaz", (await events("sevkiyat-cikti", s3)).length === 0);
    const s4 = await mkShipment({ status: "CANCELLED", cancelledAt: new Date() });
    await AuditService.log({ userId: actor.id, action: "UPDATE", tableName: "SHIPMENT", recordId: s4, newData: { kind: "CANCEL", freedSacks: 0 } });
    await flushNotificationHook();
    const es4 = await events("sevkiyat-iptal", s4);
    check("sevkiyat-iptal: tek olay, başlık 'iptal edildi'", es4.length === 1 && es4[0]?.title === "Sevkiyat iptal edildi", es4[0]?.title);
    const s5 = await mkShipment({ status: "PLANNED" });
    await AuditService.log({ userId: actor.id, action: "UPDATE", tableName: "SHIPMENT", recordId: s5, newData: { kind: "UNDO_DISPATCH" } });
    await flushNotificationHook();
    check("sevk geri alma: başlık 'geri alındı'", (await events("sevkiyat-iptal", s5))[0]?.title === "Sevkiyat geri alındı");

    // ── §e mal kabul girişi (belge düzeyi) ───────────────────────────────────
    // Fason sevk satırı iş emri adımı başlığı ister (CHECK) — belge düzeyi tekillik mal kabul fişiyle sınanır;
    // fason türlerinin çağrı yeri ve süzgeci §0'da.
    console.log("\n§e mal kabul: fiş başına tek olay; tekrar çağrı yeni olay doğurmaz; yazar almaz");
    const wh = await fixtureWarehouseId();
    const g1 = await prisma.goodsReceipt.create({ data: { receiptNo: `${STAMP}-${hex(4)}`, warehouseId: wh, createdById: actor.id }, select: { id: true } });
    receiptIds.push(g1.id);
    for (let i = 0; i < 2; i++) await AuditService.log({ userId: actor.id, action: "CREATE", tableName: "GOODS_RECEIPT", recordId: g1.id, newData: {} });
    await flushNotificationHook();
    const eg1 = await events("ham-giris", g1.id);
    check("⭐ tek olay; başlık + 0 top; rota /stok", eg1.length === 1 && eg1[0]?.title === "Mal kabul girişi yapıldı" && !!eg1[0]?.body.includes("0 top") && eg1[0]?.route === "/stok", `${eg1.length} ${eg1[0]?.body}`);
    check("alıcı alır, yazar (ataması olmasa da) yok", !!eg1[0]?.deliveries.some((d) => d.userId === recv.id) && !eg1[0]?.deliveries.some((d) => d.userId === actor.id));

    // ── §g gün sonu özeti ────────────────────────────────────────────────────
    console.log("\n§g gün sonu özeti: saatten önce doğmaz · sonra günde BİR kez · yazarsız, izinli atanmış alır");
    check("saat ayrıştırma: '18:30' → 1110, '24:00'/'abc' → null", parseDailySummaryTime("18:30") === 1110 && parseDailySummaryTime("24:00") === null && parseDailySummaryTime("abc") === null);
    await prisma.systemSetting.deleteMany({ where: { key: SETTING_KEYS.NOTIFICATIONS_DAILY_SUMMARY_TIME } });
    // Geçmiş bir fabrika günü (İstanbul UTC+3): gerçek "bugün"ün olayına dokunulmaz.
    const day = "2020-01-15";
    const dayId = dailySummaryEntityId(day);
    extraEntityIds.push(dayId);
    check("gün kimliği deterministik UUID", dayId === dailySummaryEntityId(day) && /^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(dayId), dayId);
    const at = (hhmm: string): Date => new Date(`${day}T${hhmm}:00+03:00`);
    const early = await runDailySummaryOnce({ now: at("18:29") });
    check("⭐ varsayılan 18:30'dan önce doğmaz", early === "ERKEN" && (await events("gun-sonu-ozeti", dayId)).length === 0, early);
    const first = await runDailySummaryOnce({ now: at("18:31") });
    const second = await runDailySummaryOnce({ now: at("21:00") });
    const eg = await events("gun-sonu-ozeti", dayId);
    check("⭐ günde bir kez (ikinci tur VAR, tek olay)", first === "URETILDI" && second === "VAR" && eg.length === 1, `${first} ${second} ${eg.length}`);
    check("metin: gün + üç sayı", eg[0]?.title === `Gün sonu özeti · ${day}` && /Açılan sipariş \d+ · Üretim \d+ top · .* · Sevk \d+ top · /.test(eg[0]?.body ?? ""), eg[0]?.body);
    check("yazarsız; alıcı (report:sales + atanmış) alır, izinsiz/atamasız almaz", eg[0]?.authorUserId === null && !!eg[0]?.deliveries.some((d) => d.userId === recv.id) && !eg[0]?.deliveries.some((d) => d.userId === actor.id || d.userId === noPerm.id));
    await systemSettingService.set(SETTING_KEYS.NOTIFICATIONS_DAILY_SUMMARY_TIME, "20:00", "bekçi", admin.id);
    const day2Id = dailySummaryEntityId("2020-01-16");
    extraEntityIds.push(day2Id);
    const e2 = await runDailySummaryOnce({ now: new Date("2020-01-16T19:00:00+03:00") });
    check("ayar 20:00: 19:00'da ERKEN", e2 === "ERKEN", e2);

    // ── §f şalter kapalı ─────────────────────────────────────────────────────
    console.log("\n§f şalter KAPALI: aynı çağrı olay doğurmaz");
    await prisma.systemSetting.deleteMany({ where: { key: SETTING_KEYS.NOTIFICATIONS_ENABLED } });
    invalidateNotificationSwitch();
    const s6 = await mkShipment({ status: "CANCELLED", cancelledAt: new Date() });
    await AuditService.log({ userId: actor.id, action: "UPDATE", tableName: "SHIPMENT", recordId: s6, newData: { kind: "CANCEL" } });
    await flushNotificationHook();
    check("⭐ kapalı: sıfır olay", (await events("sevkiyat-iptal", s6)).length === 0);
    const off = await runDailySummaryOnce({ now: new Date("2020-01-16T21:00:00+03:00") });
    check("⭐ kapalı: gün sonu özeti doğmaz", off === "KAPALI" && (await events("gun-sonu-ozeti", day2Id)).length === 0, off);
  } finally {
    await flushNotificationHook().catch(() => undefined);
    await temizlik();
    if (settingBefore) await prisma.systemSetting.upsert({ where: { key: settingBefore.key }, update: { value: settingBefore.value as never }, create: { key: settingBefore.key, value: settingBefore.value as never } });
    else await prisma.systemSetting.deleteMany({ where: { key: SETTING_KEYS.NOTIFICATIONS_ENABLED } });
    if (timeBefore) await prisma.systemSetting.upsert({ where: { key: timeBefore.key }, update: { value: timeBefore.value as never }, create: { key: timeBefore.key, value: timeBefore.value as never } });
    else await prisma.systemSetting.deleteMany({ where: { key: SETTING_KEYS.NOTIFICATIONS_DAILY_SUMMARY_TIME } });
    invalidateNotificationSwitch();
  }
}

/** Yalnız bu bekçinin TEST satırları (test DB'si). FK sırası: teslim → olay → bağ → kalem → sipariş → sevk → fiş → cari → ürün → kullanıcı. */
async function temizlik(): Promise<void> {
  const ords = [...orderIds];
  const entities = [...ords, ...shipmentIds, ...receiptIds, ...extraEntityIds];
  await prisma.notificationDelivery.deleteMany({ where: { event: { entityId: { in: entities } } } });
  await prisma.notificationEvent.deleteMany({ where: { entityId: { in: entities } } });
  await prisma.shipmentOrder.deleteMany({ where: { shipmentId: { in: shipmentIds } } });
  await prisma.orderLine.deleteMany({ where: { orderId: { in: ords } } });
  await prisma.order.deleteMany({ where: { id: { in: ords } } });
  await prisma.shipment.deleteMany({ where: { id: { in: shipmentIds } } });
  await prisma.goodsReceipt.deleteMany({ where: { id: { in: receiptIds } } });
  await prisma.customerItemAlias.deleteMany({ where: { customerId: { in: customerIds } } });
  await prisma.customerColorAlias.deleteMany({ where: { customerId: { in: customerIds } } });
  await cleanupTestCustomers(customerIds);
  await prisma.item.deleteMany({ where: { id: { in: itemIds } } });
  await prisma.notificationAssignment.deleteMany({ where: { userId: { in: userIds } } });
  await prisma.userPermission.deleteMany({ where: { userId: { in: userIds } } });
  for (const id of userIds) await prisma.user.update({ where: { id }, data: { isActive: false, deletedAt: new Date() } }).catch(() => undefined);
}

main()
  .catch((e: unknown) => { fail++; console.log(`  ✗ FAIL: beklenmeyen hata — ${e instanceof Error ? e.stack ?? e.message : String(e)}`); })
  .finally(() => {
    console.log(`\n=== Sonuç: ${pass} geçti, ${fail} başarısız ===\n`);
    process.exit(fail > 0 ? 1 : 0);
  });
