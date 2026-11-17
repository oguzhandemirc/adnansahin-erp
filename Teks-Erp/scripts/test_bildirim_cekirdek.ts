// =============================================================================
// BEKÇİ — BİLDİRİM ÇEKİRDEĞİ (2.13.0, D1): olay defteri · teslim · alıcı hesabı · şalter · okuma uçları
// =============================================================================
// ÖLÇTÜĞÜ (servis + prisma + HTTP GERÇEK, aynı süreçte `app`):
//  §0 katalog ↔ çağrı yeri: her türün kaynak denetim çağrısı (`action` + `tableName`) src'de gerçekten var.
//  §a şalter KAPALI (kayıt yok): panelden sipariş 201, olay/teslim satırı DOĞMAZ.
//  §b şalter `SystemSettingService.set` ile açılır → kanca önbelleği düşürür (satır okumadan).
//  §c panel (POST /api/orders, masaüstü) · tablet (aynı uç, `mobile:siparis`, mobil oturum) · telefon (gelen
//     kutusu) yolları birer olay + doğru alıcılara teslim doğurur; yazar teslim almaz; telefon siparişinde
//     yazar teknik kullanıcı DEĞİL makbuzdaki gerçek hesaptır ve adı olayda dondurulur.
//  §d yeni iş emri ve yeni sevk (denetim çağrısıyla): yazar varlığın künyesinden (`createdById`), çağrının
//     aktöründen değil; alıcı kümesi türün veri iznine göre.
//  §e alıcı süzgeci: atamasız · pasif · veri izinsiz · yalnız saha · (`bildirim:tercih` + mute) ALMAZ;
//     tercih izni yokken mute bayrağı → ALIR (atanan tür zorunlu).
//  §f aynı varlık için ikinci çağrı ikinci olay doğurmaz (UNIQUE(kind, entityId)).
//  §g üreticinin içinde hata fırlatılsa da sipariş 201 döner ve kayıt yazılır.
//  §h okuma uçları: liste + okunmamış sayısı + şalter · okundu idempotent (readAt değişmez) · başkasının
//     teslimi 404 `BILDIRIM_YOK` · tümünü okundu · kimliksiz 401.
//
// DB: oturumun `_test` veritabanı (koşucu kapısı). Fixture `TEST-BLD` damgalı; `finally`de FK sırasıyla silinir.
// Kullanıcılar sert silinmez (system_logs FK): izinleri ve atamaları silinir, pasif + silinmiş işaretlenir.
// Şalter ayarı ve `bildirim:tercih` izin satırı koşum öncesi hâline döner (yoksa silinir).
//
// NEGATİF SONDA (2026-11-17, dördü de kırmızı verdi, geri alındı; 48 kontrol):
//   · `receivesNotification`da mute tercih izninden bağımsız susturdu → §c panel/tablet/telefon alıcı kümesi ×3
//     + §e "tercih izni yok + mute ALIR" ✗ (5 kırmızı)
//   · `audit.service` kancası üreticiyi BEKLEYEREK ve hatayı yutmadan çağırdı → §g "log fırlatmaz" + "log beklemez
//     (1509 ms)" ✗. Not: sipariş 201 kontrolü bu sondada YEŞİL kaldı — sipariş yolu hatayı token replay'iyle örter;
//     kancanın sözleşmesi bu yüzden doğrudan `AuditService.log` üstünde de ölçülür.
//   · şalter yok sayıldı → §a "kapalı: sıfır olay" + §h sayıları ✗
//   · teknik kullanıcı → makbuz çözümü kapatıldı → §c telefon yazarı/adı/alıcıları ×3 ✗ (yazar teknik kullanıcı oldu)
// =============================================================================
import http from "node:http";
import type { AddressInfo } from "node:net";
import { readFileSync } from "node:fs";
import path from "node:path";
import { randomBytes, randomUUID } from "node:crypto";
import * as bcrypt from "bcryptjs";
import prisma from "../src/lib/prisma";
import app from "../src/app";
import { customerService } from "../src/routes/customer.routes";
import { AuditService } from "../src/services/audit.service";
import { AuthService } from "../src/services/auth.service";
import { SETTING_KEYS, systemSettingService } from "../src/services/system-setting.service";
import { PASSWORD_POLICY_VERSION } from "../src/services/helpers/password-policy.helper";
import { ensurePatronCloudUser, readPatronCloudUserId } from "../src/services/patron-cloud-user.service";
import { PATRON_CLOUD_USER_SETTING_KEY } from "../src/constants/reserved-settings";
import { processInboxMessage, type ClaimedMessage } from "../src/services/patron-inbox/inbox.service";
import { flushNotificationHook } from "../src/services/notifications/audit-hook";
import { __setNotificationFaultForTests, produceNotification } from "../src/services/notifications/producer";
import { invalidateNotificationSwitch } from "../src/services/notifications/notification-switch";
import {
  NOTIFICATION_KINDS,
  NOTIFICATION_KIND_KEYS,
  NOTIFICATION_PREFERENCE_PERMISSION,
  notificationKindForAudit,
  type NotificationKind,
} from "../src/constants/notification-catalog";
import { PERMISSION_CATALOG } from "../src/constants/permission-catalog";
import { ensureTestAdmin } from "./fixture-test-user";
import { cleanupTestCustomers } from "./fixture-customer-cleanup";

let pass = 0, fail = 0;
function check(l: string, ok: boolean, x = ""): void {
  if (ok) { pass++; console.log(`  ✓ ${l}${x ? ` — ${x}` : ""}`); }
  else { fail++; console.log(`  ✗ FAIL: ${l}${x ? ` — ${x}` : ""}`); }
}

const STAMP = "TEST-BLD";
const hex = (n: number): string => randomBytes(n).toString("hex");
const letters = (n: number): string => Array.from(randomBytes(n), (b) => "BCDFGHJKLMNPRSTVYZ"[b % 18]).join("");

const userIds: string[] = [];
const orderIds = new Set<string>();
const workOrderIds: string[] = [];
const shipmentIds: string[] = [];
const customerIds: string[] = [];
const itemIds: string[] = [];
const messageIds: string[] = [];
let createdPrefPermissionId: string | null = null;

interface TestUser { id: string; username: string; password: string; fullName: string }

async function mkUser(tag: string, codes: readonly string[], over: { isActive?: boolean } = {}): Promise<TestUser> {
  const username = `${STAMP}-${tag}-${hex(3)}`;
  const password = `Zq-${randomBytes(12).toString("base64url")}`;
  const fullName = `${STAMP} ${tag} ${letters(4)}`;
  const u = await prisma.user.create({
    data: { username, fullName, passwordHash: await bcrypt.hash(password, 10), passwordPolicyVersion: PASSWORD_POLICY_VERSION, ...over },
    select: { id: true },
  });
  userIds.push(u.id);
  for (const code of codes) {
    const p = await prisma.permission.findUnique({ where: { code }, select: { id: true } });
    if (!p) throw new Error(`izin DB'de yok: ${code}`);
    await prisma.userPermission.create({ data: { userId: u.id, permissionId: p.id } });
  }
  return { id: u.id, username, password, fullName };
}

async function assign(userId: string, kinds: readonly NotificationKind[], muted = false): Promise<void> {
  for (const kind of kinds) await prisma.notificationAssignment.create({ data: { userId, kind, mutedByUser: muted } });
}

async function deliveredTo(kind: NotificationKind, entityId: string): Promise<Set<string>> {
  const ev = await prisma.notificationEvent.findUnique({ where: { kind_entityId: { kind, entityId } }, select: { deliveries: { select: { userId: true } } } });
  return new Set(ev?.deliveries.map((d) => d.userId) ?? []);
}

async function main(): Promise<void> {
  const settingBefore = await prisma.systemSetting.findUnique({ where: { key: SETTING_KEYS.NOTIFICATIONS_ENABLED } });
  const preexistingTech = await readPatronCloudUserId();
  let createdTech: string | null = null;
  const server = http.createServer(app);
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", () => r()));
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  const call = async (method: string, p: string, token: string | null, body?: unknown): Promise<{ status: number; json: Record<string, unknown> }> => {
    const r = await fetch(`${base}${p}`, {
      method,
      headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
    });
    const text = await r.text();
    let json: Record<string, unknown> = {};
    try { json = JSON.parse(text) as Record<string, unknown>; } catch { json = { raw: text }; }
    return { status: r.status, json };
  };
  const login = async (u: TestUser, clientType: "electron" | "mobile"): Promise<string> => (await AuthService.login(u.username, u.password, { clientType })).token;

  try {
    // ── §0 katalog ↔ çağrı yeri ──────────────────────────────────────────────
    console.log("\n§0 katalog: her türün kaynak denetim çağrısı src'de var; süzgeç türsüz çağrıda null");
    const SRC = path.join(__dirname, "..", "src", "services");
    const sources: Record<NotificationKind, string[]> = {
      "yeni-siparis": ["order.service.ts", "patron-inbox/order-create.ts"],
      "yeni-is-emri": ["workorder.service.ts"],
      "yeni-sevk": ["shipping.service.ts"],
    };
    for (const kind of NOTIFICATION_KIND_KEYS) {
      const s = NOTIFICATION_KINDS[kind].source;
      for (const f of sources[kind]) {
        const txt = readFileSync(path.join(SRC, f), "utf8");
        const literal = new RegExp(`action:\\s*"${s.action}"[\\s\\S]{0,80}tableName:\\s*(?:"${s.tableName}"|this\\.config\\.tableName)`);
        check(`${kind}: ${f} '${s.action} ${s.tableName}' denetim çağrısı taşır`, literal.test(txt));
      }
      check(`${kind}: süzgeç çağrıyı tanır`, notificationKindForAudit(s.action, s.tableName) === kind);
      const perm = NOTIFICATION_KINDS[kind].dataPermission;
      check(`${kind}: veri izni '${perm}' izin kataloğunda (web, mobil değil)`, PERMISSION_CATALOG.some((p) => p.code === perm && !perm.startsWith("mobile:")));
    }
    check("süzgeç: türsüz çağrı (UPDATE ORDER, CREATE ROLL) → null", notificationKindForAudit("UPDATE", "ORDER") === null && notificationKindForAudit("CREATE", "ROLL") === null);

    // ── fixture ──────────────────────────────────────────────────────────────
    const admin = await ensureTestAdmin();
    let pref = await prisma.permission.findUnique({ where: { code: NOTIFICATION_PREFERENCE_PERMISSION }, select: { id: true } });
    if (!pref) {
      pref = await prisma.permission.create({ data: { code: NOTIFICATION_PREFERENCE_PERMISSION, module: "ADMIN", description: `${STAMP} geçici (D2 kataloğa ekler)` }, select: { id: true } });
      createdPrefPermissionId = pref.id;
    }
    const ALL: NotificationKind[] = ["yeni-siparis", "yeni-is-emri", "yeni-sevk"];
    const READ_ALL = ["order:read", "workorder:read", "shipping:read"];
    const panel = await mkUser("panel", ["order:write", ...READ_ALL]);
    const tablet = await mkUser("tablet", ["mobile:siparis"]);
    const phone = await mkUser("telefon", ["patron:giris", "order:write", "order:read"]);
    const rAll = await mkUser("alici", READ_ALL);
    const rNoAssign = await mkUser("atamasiz", READ_ALL);
    const rPassive = await mkUser("pasif", READ_ALL, { isActive: false });
    const rNoPerm = await mkUser("izinsiz", ["workorder:read"]);
    const rField = await mkUser("saha", ["mobile:*"]);
    const rPrefMuted = await mkUser("tercihli-sessiz", ["order:read", NOTIFICATION_PREFERENCE_PERMISSION]);
    const rMutedNoPref = await mkUser("tercihsiz-sessiz", ["order:read"]);
    await assign(panel.id, ALL);
    await assign(phone.id, ["yeni-siparis"]);
    await assign(rAll.id, ALL);
    await assign(rPassive.id, ALL);
    await assign(rNoPerm.id, ["yeni-siparis"]);
    await assign(rField.id, ["yeni-siparis"]);
    await assign(rPrefMuted.id, ["yeni-siparis"], true);
    await assign(rMutedNoPref.id, ["yeni-siparis"], true);

    const item = await prisma.item.create({ data: { code: `${STAMP}-${letters(6)}`, name: `${STAMP} Kumaş ${letters(6)}`, itemType: "FABRIC", unit: "MT" }, select: { id: true } });
    itemIds.push(item.id);
    const custRes = await customerService.create({ name: `${STAMP} Cari ${letters(10)}`, isCustomerRole: true }, admin.id);
    const cust = String((custRes.data as { id: string }).id);
    customerIds.push(cust);
    const custName = (await prisma.customer.findUnique({ where: { id: cust }, select: { name: true } }))!.name;
    const deadline = new Date(Date.now() + 10 * 86_400_000).toISOString();
    const orderBody = (): Record<string, unknown> => ({ customerId: cust, currency: "TRY", deadline, lines: [{ itemId: item.id, quantity: 10, width: 150 }], clientToken: randomUUID() });
    const panelToken = await login(panel, "electron");
    const tabletToken = await login(tablet, "mobile");
    const postOrder = async (token: string): Promise<{ status: number; id: string | null }> => {
      const r = await call("POST", "/api/orders", token, orderBody());
      const id = (r.json.data as { id?: string } | undefined)?.id ?? null;
      if (id) orderIds.add(id);
      return { status: r.status, id };
    };
    const tableCounts = async (): Promise<number> => (await prisma.notificationEvent.count()) + (await prisma.notificationDelivery.count());

    // ── §a şalter KAPALI ─────────────────────────────────────────────────────
    console.log("\n§a şalter kayıtsız (KAPALI): sipariş açılır, bildirim satırı doğmaz");
    await prisma.systemSetting.deleteMany({ where: { key: SETTING_KEYS.NOTIFICATIONS_ENABLED } });
    invalidateNotificationSwitch();
    const before = await tableCounts();
    const off = await postOrder(panelToken);
    await flushNotificationHook();
    check("kapalı: panel siparişi 201", off.status === 201 && !!off.id, String(off.status));
    check("⭐ kapalı: sıfır olay, sıfır teslim (tablolar değişmedi)", (await tableCounts()) === before && (await prisma.notificationEvent.count({ where: { entityId: off.id ?? "" } })) === 0);

    // ── §b şalteri aç ────────────────────────────────────────────────────────
    console.log("\n§b şalter SystemSettingService.set ile açılır; kanca önbelleği düşürür");
    await systemSettingService.set(SETTING_KEYS.NOTIFICATIONS_ENABLED, true, "bekçi", admin.id);
    await flushNotificationHook();

    // ── §c üç sipariş yolu ───────────────────────────────────────────────────
    console.log("\n§c panel · tablet · telefon siparişi birer olay + doğru alıcılar");
    const expectOrder = new Set([rAll.id, rMutedNoPref.id, phone.id, panel.id]);
    const pOrd = await postOrder(panelToken);
    await flushNotificationHook();
    check("panel siparişi 201", pOrd.status === 201 && !!pOrd.id, String(pOrd.status));
    const pEv = await prisma.notificationEvent.findMany({ where: { entityId: pOrd.id ?? "" } });
    check("⭐ panel: tek olay (yeni-siparis)", pEv.length === 1 && pEv[0]?.kind === "yeni-siparis");
    check("panel: yazar = panel kullanıcısı, ad dondurulmuş, metinde ad + cari", pEv[0]?.authorUserId === panel.id && pEv[0]?.authorName === panel.fullName && !!pEv[0]?.body.includes(panel.fullName) && !!pEv[0]?.body.includes(custName), pEv[0]?.body);
    check("panel: rota telefon biçimi", pEv[0]?.route === `/siparisler/${pOrd.id}`);
    const pTo = await deliveredTo("yeni-siparis", pOrd.id ?? "");
    const pExp = new Set([...expectOrder].filter((x) => x !== panel.id));
    check("⭐ panel: alıcılar = {alıcı, tercihsiz-sessiz, telefon}; yazar ALMAZ", pTo.size === pExp.size && [...pExp].every((x) => pTo.has(x)) && !pTo.has(panel.id), [...pTo].length.toString());

    const tOrd = await postOrder(tabletToken);
    await flushNotificationHook();
    check("tablet siparişi 201 (mobile:siparis)", tOrd.status === 201 && !!tOrd.id, String(tOrd.status));
    const tEv = await prisma.notificationEvent.findUnique({ where: { kind_entityId: { kind: "yeni-siparis", entityId: tOrd.id ?? "" } } });
    check("tablet: olay doğdu, yazar = tablet kullanıcısı", tEv?.authorUserId === tablet.id && tEv.authorName === tablet.fullName);
    const tTo = await deliveredTo("yeni-siparis", tOrd.id ?? "");
    check("⭐ tablet: panel kullanıcısı da alır (yazar değil), tablet yazarı almaz", tTo.has(panel.id) && tTo.has(rAll.id) && !tTo.has(tablet.id) && tTo.size === 4, String(tTo.size));

    const ensured = await ensurePatronCloudUser();
    if (!ensured.ok) throw new Error(`teknik kullanıcı kurulamadı: ${ensured.reason}`);
    if (ensured.created && !preexistingTech) createdTech = ensured.userId;
    const msg: ClaimedMessage = {
      mesajId: randomUUID(), tur: "SIPARIS", hesapId: phone.id, hesapAdi: `${STAMP} Telefon Hesabı`, olusturulma: new Date().toISOString(),
      govde: { cariKartId: cust, doviz: "TRY", termin: deadline.slice(0, 10), kalemler: [{ urunId: item.id, miktar: "12.5", en: "150" }] },
    };
    messageIds.push(msg.mesajId);
    const out = await processInboxMessage(msg, ensured.userId);
    await flushNotificationHook();
    const fOrdId = out?.varlikId ?? null;
    if (fOrdId) orderIds.add(fOrdId);
    check("telefon siparişi ISLENDI", out?.durum === "ISLENDI" && !!fOrdId, JSON.stringify(out));
    const fEv = await prisma.notificationEvent.findUnique({ where: { kind_entityId: { kind: "yeni-siparis", entityId: fOrdId ?? "" } } });
    check("⭐ telefon: yazar teknik kullanıcı DEĞİL, makbuzdaki gerçek hesap", fEv?.authorUserId === phone.id && fEv.authorUserId !== ensured.userId, `${fEv?.authorUserId}`);
    check("telefon: yazar adı fabrika kullanıcısının adı (dondurulmuş)", fEv?.authorName === phone.fullName, fEv?.authorName);
    const fTo = await deliveredTo("yeni-siparis", fOrdId ?? "");
    check("⭐ telefon: telefon yazarı ALMAZ, teknik kullanıcı ALMAZ, panel kullanıcısı alır", !fTo.has(phone.id) && !fTo.has(ensured.userId) && fTo.has(panel.id) && fTo.has(rAll.id) && fTo.size === 3, String(fTo.size));

    // ── §e alıcı süzgeci (üç siparişin birleşimi) ───────────────────────────
    console.log("\n§e süzgeç: atamasız · pasif · veri izinsiz · saha · tercihli-sessiz ALMAZ; tercihsiz-sessiz ALIR");
    const anyGot = async (uid: string): Promise<number> => prisma.notificationDelivery.count({ where: { userId: uid, event: { entityId: { in: [pOrd.id ?? "", tOrd.id ?? "", fOrdId ?? ""] } } } });
    check("atamasız almaz", (await anyGot(rNoAssign.id)) === 0);
    check("pasif almaz", (await anyGot(rPassive.id)) === 0);
    check("veri izinsiz (workorder:read, sipariş ataması) almaz", (await anyGot(rNoPerm.id)) === 0);
    check("yalnız saha (mobile:*) almaz", (await anyGot(rField.id)) === 0);
    check("⭐ bildirim:tercih + mute → almaz", (await anyGot(rPrefMuted.id)) === 0);
    check("⭐ tercih izni yok + mute bayrağı → ALIR (zorunlu)", (await anyGot(rMutedNoPref.id)) === 3);

    // ── §d iş emri + sevk ────────────────────────────────────────────────────
    console.log("\n§d yeni iş emri + yeni sevk: yazar künyeden, alıcılar veri iznine göre");
    const wo = await prisma.workOrder.create({ data: { workOrderNumber: `${STAMP}-${letters(8)}`, createdById: rAll.id }, select: { id: true, workOrderNumber: true } });
    workOrderIds.push(wo.id);
    await AuditService.log({ userId: admin.id, action: "CREATE", tableName: "WORK_ORDER", recordId: wo.id, newData: { workOrderNumber: wo.workOrderNumber } });
    await flushNotificationHook();
    const woEv = await prisma.notificationEvent.findUnique({ where: { kind_entityId: { kind: "yeni-is-emri", entityId: wo.id } } });
    check("⭐ iş emri: olay doğdu, yazar KÜNYEDEN (createdById), çağrı aktörü değil", woEv?.authorUserId === rAll.id && woEv.authorName === rAll.fullName && !!woEv.body.includes(wo.workOrderNumber));
    const woTo = await deliveredTo("yeni-is-emri", wo.id);
    check("iş emri: alıcı yalnız panel (yazar alıcı ALMAZ; sipariş atamalılar ALMAZ)", woTo.size === 1 && woTo.has(panel.id), String(woTo.size));
    const sh = await prisma.shipment.create({ data: { shipmentNo: `${STAMP}-${letters(8)}`, customerId: cust, createdById: panel.id }, select: { id: true, shipmentNo: true } });
    shipmentIds.push(sh.id);
    await AuditService.log({ userId: admin.id, action: "CREATE", tableName: "SHIPMENT", recordId: sh.id, newData: { shipmentNo: sh.shipmentNo } });
    await flushNotificationHook();
    const shEv = await prisma.notificationEvent.findUnique({ where: { kind_entityId: { kind: "yeni-sevk", entityId: sh.id } } });
    check("sevk: olay doğdu, yazar künyeden, metinde cari + sevk no", shEv?.authorUserId === panel.id && !!shEv.body.includes(custName) && !!shEv.body.includes(sh.shipmentNo));
    const shTo = await deliveredTo("yeni-sevk", sh.id);
    check("⭐ sevk: alıcı yalnız 'alıcı'; yazar (panel) ALMAZ", shTo.size === 1 && shTo.has(rAll.id), String(shTo.size));

    // ── §f tekillik ──────────────────────────────────────────────────────────
    console.log("\n§f aynı varlık için ikinci çağrı ikinci olay doğurmaz");
    const again = await produceNotification("yeni-siparis", pOrd.id ?? "", panel.id);
    await AuditService.log({ userId: panel.id, action: "CREATE", tableName: "ORDER", recordId: pOrd.id ?? "", newData: {} });
    await flushNotificationHook();
    check("⭐ doğrudan ikinci üretim null + tek olay + teslim sayısı aynı",
      again === null && (await prisma.notificationEvent.count({ where: { kind: "yeni-siparis", entityId: pOrd.id ?? "" } })) === 1 && (await deliveredTo("yeni-siparis", pOrd.id ?? "")).size === pTo.size);

    // ── §g üretici hatası fabrikayı durdurmaz ────────────────────────────────
    console.log("\n§g üretici içinde hata → sipariş yine 201");
    __setNotificationFaultForTests(() => { throw new Error(`${STAMP} sonda: üretici hatası`); });
    const gOrd = await postOrder(panelToken);
    await flushNotificationHook();
    __setNotificationFaultForTests(null);
    check("⭐ üretici fırlatsa da sipariş 201 + kayıt DB'de", gOrd.status === 201 && !!gOrd.id && (await prisma.order.count({ where: { id: gOrd.id ?? "" } })) === 1, String(gOrd.status));
    check("hatalı üretimde olay yok", (await prisma.notificationEvent.count({ where: { entityId: gOrd.id ?? "" } })) === 0);
    // Sipariş yolu kendi hatasını token replay'iyle örtebilir; kancanın sözleşmesi doğrudan da ölçülür.
    const gWo = await prisma.workOrder.create({ data: { workOrderNumber: `${STAMP}-${letters(8)}`, createdById: panel.id }, select: { id: true } });
    workOrderIds.push(gWo.id);
    __setNotificationFaultForTests(() => { throw new Error(`${STAMP} sonda: üretici hatası`); });
    const threw = await AuditService.log({ userId: admin.id, action: "CREATE", tableName: "WORK_ORDER", recordId: gWo.id }).then(() => false, () => true);
    await flushNotificationHook();
    check("⭐ üretici fırlatınca AuditService.log yine de çözülür (fırlatmaz)", !threw);
    __setNotificationFaultForTests(() => new Promise<void>((r) => setTimeout(r, 1500)));
    const t0 = Date.now();
    await AuditService.log({ userId: admin.id, action: "UPDATE", tableName: "WORK_ORDER", recordId: gWo.id });
    await AuditService.log({ userId: admin.id, action: "CREATE", tableName: "SHIPMENT", recordId: randomUUID() });
    const took = Date.now() - t0;
    await flushNotificationHook();
    __setNotificationFaultForTests(null);
    check("⭐ üretici 1,5 sn beklese de AuditService.log beklemez (< 500 ms)", took < 500, `${took} ms`);

    // ── §h okuma uçları ──────────────────────────────────────────────────────
    console.log("\n§h okuma uçları: liste · okundu (idempotent) · başkasının 404 · tümü · kimliksiz 401");
    const rToken = await login(rAll, "electron");
    const l1 = await call("GET", "/api/bildirimler?limit=2", rToken);
    const d1 = l1.json.data as { items: Array<{ id: string; kind: string; readAt: string | null; topic: string | null }>; unreadCount: number; enabled: boolean; nextCursor: string | null; hasMore: boolean };
    const rAllTotal = await prisma.notificationDelivery.count({ where: { userId: rAll.id } });
    check("liste 200 + okunmamış = teslim sayısı (4: 3 sipariş + sevk; iş emrinin yazarı) + şalter açık", l1.status === 200 && d1.unreadCount === rAllTotal && rAllTotal === 4 && d1.enabled === true, `${d1?.unreadCount}/${rAllTotal}`);
    check("sayfa: 2 kayıt + imleç + konu alanı", d1.items.length === 2 && d1.hasMore && !!d1.nextCursor && d1.items.every((i) => i.topic !== null));
    const l2 = await call("GET", `/api/bildirimler?limit=10&cursor=${encodeURIComponent(d1.nextCursor ?? "")}`, rToken);
    const d2 = l2.json.data as { items: Array<{ id: string }>; hasMore: boolean };
    const seen = new Set([...d1.items, ...d2.items].map((i) => i.id));
    check("imleçle kalan sayfa: toplam 4, tekrar yok", d2.items.length === 2 && !d2.hasMore && seen.size === 4);
    const target = d1.items[0]!.id;
    const m1 = await call("POST", `/api/bildirimler/${target}/okundu`, rToken);
    const read1 = (m1.json.data as { readAt: string; unreadCount: number }).readAt;
    const m2 = await call("POST", `/api/bildirimler/${target}/okundu`, rToken);
    check("okundu 200 + okunmamış 3", m1.status === 200 && (m1.json.data as { unreadCount: number }).unreadCount === 3);
    check("⭐ ikinci okundu idempotent: 200, readAt DEĞİŞMEDİ", m2.status === 200 && (m2.json.data as { readAt: string }).readAt === read1);
    const foreign = await prisma.notificationDelivery.findFirst({ where: { userId: rMutedNoPref.id }, select: { id: true, readAt: true } });
    const foreignId = foreign?.id ?? randomUUID();
    check("kontrol: başka kullanıcının okunmamış teslimi var", !!foreign && foreign.readAt === null);
    const m3 = await call("POST", `/api/bildirimler/${foreignId}/okundu`, rToken);
    const foreignAfter = await prisma.notificationDelivery.findUnique({ where: { id: foreignId }, select: { readAt: true } });
    check("⭐ başkasının teslimi 404 BILDIRIM_YOK ve okunmadı", m3.status === 404 && (m3.json.details as { code?: string } | undefined)?.code === "BILDIRIM_YOK" && m3.json.code === undefined && foreignAfter?.readAt === null, String(m3.status));
    const m4 = await call("POST", `/api/bildirimler/${randomUUID()}/okundu`, rToken);
    check("olmayan teslim 404", m4.status === 404);
    const m5 = await call("POST", "/api/bildirimler/xyz/okundu", rToken);
    check("geçersiz kimlik 400", m5.status === 400);
    const all = await call("POST", "/api/bildirimler/tumu/okundu", rToken);
    check("tümünü okundu: 3 güncellendi, sonra okunmamış 0", all.status === 200 && (all.json.data as { updated: number }).updated === 3 && (await prisma.notificationDelivery.count({ where: { userId: rAll.id, readAt: null } })) === 0);
    const unauth = await call("GET", "/api/bildirimler", null);
    check("kimliksiz 401", unauth.status === 401);
  } finally {
    __setNotificationFaultForTests(null);
    await flushNotificationHook().catch(() => undefined);
    await temizlik(createdTech);
    if (settingBefore) await prisma.systemSetting.upsert({ where: { key: settingBefore.key }, update: { value: settingBefore.value as never }, create: { key: settingBefore.key, value: settingBefore.value as never } });
    else await prisma.systemSetting.deleteMany({ where: { key: SETTING_KEYS.NOTIFICATIONS_ENABLED } });
    invalidateNotificationSwitch();
    await new Promise<void>((r) => { server.closeAllConnections(); server.close(() => r()); });
  }
}

/** FK sırası: teslim → olay → makbuz → kalem → sipariş → iş emri → sevk → cari → ürün → atama/izin → kullanıcılar. */
async function temizlik(createdTechId: string | null): Promise<void> {
  const entities = [...orderIds, ...workOrderIds, ...shipmentIds];
  await prisma.notificationDelivery.deleteMany({ where: { event: { entityId: { in: entities } } } });
  await prisma.notificationEvent.deleteMany({ where: { entityId: { in: entities } } });
  await prisma.cloudInboxReceipt.deleteMany({ where: { messageId: { in: messageIds } } });
  const ords = [...orderIds];
  await prisma.orderLine.deleteMany({ where: { orderId: { in: ords } } });
  await prisma.order.deleteMany({ where: { id: { in: ords } } });
  await prisma.workOrder.deleteMany({ where: { id: { in: workOrderIds } } });
  await prisma.shipment.deleteMany({ where: { id: { in: shipmentIds } } });
  await prisma.customerItemAlias.deleteMany({ where: { customerId: { in: customerIds } } });
  await prisma.customerColorAlias.deleteMany({ where: { customerId: { in: customerIds } } });
  await cleanupTestCustomers(customerIds);
  await prisma.item.deleteMany({ where: { id: { in: itemIds } } });
  if (createdTechId) {
    await prisma.systemSetting.deleteMany({ where: { key: PATRON_CLOUD_USER_SETTING_KEY } });
    await prisma.user.update({ where: { id: createdTechId }, data: { username: `TEST-pb-${createdTechId.slice(0, 8)}`, isActive: false, deletedAt: new Date() } });
  }
  await prisma.notificationAssignment.deleteMany({ where: { userId: { in: userIds } } });
  await prisma.userPermission.deleteMany({ where: { userId: { in: userIds } } });
  if (createdPrefPermissionId) await prisma.permission.deleteMany({ where: { id: createdPrefPermissionId } });
  for (const id of userIds) await prisma.user.update({ where: { id }, data: { isActive: false, deletedAt: new Date() } }).catch(() => undefined);
}

main()
  .catch((e: unknown) => { fail++; console.log(`  ✗ FAIL: beklenmeyen hata — ${e instanceof Error ? e.stack ?? e.message : String(e)}`); })
  .finally(() => {
    console.log(`\n=== Sonuç: ${pass} geçti, ${fail} başarısız ===\n`);
    process.exit(fail > 0 ? 1 : 0);
  });
