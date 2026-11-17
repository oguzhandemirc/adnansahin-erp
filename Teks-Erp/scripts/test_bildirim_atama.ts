// =============================================================================
// BEKÇİ — BİLDİRİM ATAMA YÖNETİMİ (2.13.0, D2): kişi + rol şablonu + kendi tercihi
// =============================================================================
// ÖLÇTÜĞÜ (servis + prisma + HTTP GERÇEK, aynı süreçte `app`):
//  §0 iki izin kodu katalogda + DB'de (test_permission_catalog bu bekçiye devreder).
//  §a kapı: `/api/bildirim-atamalari/*` `bildirim:yonet` yoksa 403 PERMISSION_DENIED; kimliksiz 401.
//  §b kişi listesi: yalnız-saha · pasif · teknik kullanıcı LİSTELENMEZ; atanabilir kişi görünür.
//  §c kişi ataması: hedef kümeye eşitlenir · veri izni olmayan tür 409 BILDIRIM_VERI_IZNI_YOK ve HİÇBİR ŞEY yazılmaz ·
//     tanınmayan tür 400 · yalnız-saha kişi 409 · `tokenVersion` ARTMAZ · audit izi düşer · kanca bildirim üretmez.
//  §d şablon: set yazılır, veri izni şablonun izinlerinden · şablon kişiye uygulanınca set KOPYALANIR (replace/merge),
//     veri izni olmayan tür ATLANIR · şablon sonradan değişince kişi ETKİLENMEZ.
//  §e kendi tercihi: tercih izni yoksa PUT 403, GET `required:true` · izinliyken mute yazılır · atanmamış tür 409 ·
//     mute edilen tür D1 alıcı helper'ında teslim ALMAZ; tercih izni yokken mute yok sayılır (uçtan uca).
//  §f katalog: konu başlıkları sırasıyla, türlerin veri izni + kilit metni.
//
// DB: oturumun `_test` veritabanı (koşucu kapısı). Fixture `TEST-BLA` damgalı; `finally`de silinir.
//
// NEGATİF SONDA (2026-11-17, üçü de kırmızı verdi, md5 ile geri alındı; 40 kontrol):
//   S1 kişi yazımında `assertDataPermissions` kaldırıldı → §c 409 + "küme değişmedi" ✗ (2)
//   S2 `applyTemplate` replace dalında bildirim kopyası kaldırıldı → §d replace + "kişi etkilenmedi" ✗ (2)
//   S3 `PUT /api/bildirimler/tercihler` izin kapısı `next()`e indirildi → §e 403 + "mute yazılmadı" ✗ (2)
// =============================================================================
import http from "node:http";
import type { AddressInfo } from "node:net";
import { randomBytes, randomUUID } from "node:crypto";
import * as bcrypt from "bcryptjs";
import prisma from "../src/lib/prisma";
import app from "../src/app";
import { AuthService } from "../src/services/auth.service";
import { PermissionManagementService } from "../src/services/permission-management.service";
import { PASSWORD_POLICY_VERSION } from "../src/services/helpers/password-policy.helper";
import { reconcilePermissionCatalog } from "../src/jobs/permission-catalog.job";
import { resolveNotificationRecipients } from "../src/services/notifications/recipients";
import {
  NOTIFICATION_MANAGE_PERMISSION,
  NOTIFICATION_PREFERENCE_PERMISSION,
  NOTIFICATION_TOPICS,
  notificationKindForAudit,
  type NotificationKind,
} from "../src/constants/notification-catalog";
import { PERMISSION_CATALOG } from "../src/constants/permission-catalog";
import { ensureTestAdmin } from "./fixture-test-user";

let pass = 0, fail = 0;
function check(l: string, ok: boolean, x = ""): void {
  if (ok) { pass++; console.log(`  ✓ ${l}${x ? ` — ${x}` : ""}`); }
  else { fail++; console.log(`  ✗ FAIL: ${l}${x ? ` — ${x}` : ""}`); }
}

const STAMP = "TEST-BLA";
const hex = (n: number): string => randomBytes(n).toString("hex");
const userIds: string[] = [];
const templateIds: string[] = [];

interface TestUser { id: string; username: string; password: string }

async function mkUser(tag: string, codes: readonly string[], over: { isActive?: boolean } = {}): Promise<TestUser> {
  const username = `${STAMP}-${tag}-${hex(3)}`;
  const password = `Zq-${randomBytes(12).toString("base64url")}`;
  const u = await prisma.user.create({
    data: { username, fullName: `${STAMP} ${tag}`, passwordHash: await bcrypt.hash(password, 10), passwordPolicyVersion: PASSWORD_POLICY_VERSION, ...over },
    select: { id: true },
  });
  userIds.push(u.id);
  for (const code of codes) {
    const p = await prisma.permission.findUnique({ where: { code }, select: { id: true } });
    if (!p) throw new Error(`izin DB'de yok: ${code}`);
    await prisma.userPermission.create({ data: { userId: u.id, permissionId: p.id } });
  }
  return { id: u.id, username, password };
}

async function mkTemplate(codes: readonly string[]): Promise<string> {
  const perms = await prisma.permission.findMany({ where: { code: { in: [...codes] } }, select: { id: true } });
  const t = await prisma.permissionTemplate.create({
    data: { name: `${STAMP}-${hex(4)}`, permissions: { create: perms.map((p) => ({ permissionId: p.id })) } },
    select: { id: true },
  });
  templateIds.push(t.id);
  return t.id;
}

const kindsOf = async (userId: string): Promise<string[]> =>
  (await prisma.notificationAssignment.findMany({ where: { userId }, select: { kind: true } })).map((r) => r.kind).sort();
const tokenVersion = async (userId: string): Promise<number> =>
  (await prisma.user.findUniqueOrThrow({ where: { id: userId }, select: { tokenVersion: true } })).tokenVersion;
const code = (j: Record<string, unknown>): string | undefined => (j.details as { code?: string } | undefined)?.code;

async function main(): Promise<void> {
  await reconcilePermissionCatalog();
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
  const login = async (u: TestUser): Promise<string> => (await AuthService.login(u.username, u.password, { clientType: "electron" })).token;

  try {
    const admin = await ensureTestAdmin();
    const manager = await mkUser("yonetici", ["bildirim:yonet"]);
    const plain = await mkUser("sade", ["order:read"]);
    const orderOnly = await mkUser("siparisci", ["order:read"]);
    const field = await mkUser("saha", ["mobile:siparis"]);
    const passive = await mkUser("pasif", ["order:read"], { isActive: false });
    const prefUser = await mkUser("tercihli", ["order:read", "workorder:read", "bildirim:tercih"]);
    const mToken = await login(manager);
    const pToken = await login(plain);

    // ── §0 izin kodları katalogda ──────────────────────────────────────────────
    console.log("\n§0 iki izin kodu katalogda ve DB'de");
    const codes = new Set(PERMISSION_CATALOG.map((p) => p.code));
    check("katalog: bildirim:yonet + bildirim:tercih (sabitlerle aynı)", codes.has(NOTIFICATION_MANAGE_PERMISSION) && codes.has(NOTIFICATION_PREFERENCE_PERMISSION) && NOTIFICATION_MANAGE_PERMISSION === "bildirim:yonet" && NOTIFICATION_PREFERENCE_PERMISSION === "bildirim:tercih");
    check("DB'de iki satır (boot uzlaştırması)", (await prisma.permission.count({ where: { code: { in: [NOTIFICATION_MANAGE_PERMISSION, NOTIFICATION_PREFERENCE_PERMISSION] } } })) === 2);

    // ── §a kapı ────────────────────────────────────────────────────────────────
    console.log("\n§a kapı: `bildirim:yonet` yoksa 403");
    const tplProbe = randomUUID();
    const gated: Array<[string, string, unknown?]> = [
      ["GET", "/api/bildirim-atamalari/kullanicilar"],
      ["GET", `/api/bildirim-atamalari/kullanicilar/${orderOnly.id}`],
      ["PUT", `/api/bildirim-atamalari/kullanicilar/${orderOnly.id}`, { kinds: ["yeni-siparis"] }],
      ["GET", "/api/bildirim-atamalari/sablonlar"],
      ["GET", `/api/bildirim-atamalari/sablonlar/${tplProbe}`],
      ["PUT", `/api/bildirim-atamalari/sablonlar/${tplProbe}`, { kinds: [] }],
    ];
    for (const [m, p, b] of gated) {
      const r = await call(m, p, pToken, b);
      check(`⭐ ${m} ${p.replace(/[0-9a-f-]{36}/, ":id")} → 403 PERMISSION_DENIED`, r.status === 403 && code(r.json) === "PERMISSION_DENIED", String(r.status));
    }
    check("izinsiz PUT hiçbir şey yazmadı", (await kindsOf(orderOnly.id)).length === 0);
    check("kimliksiz 401", (await call("GET", "/api/bildirim-atamalari/kullanicilar", null)).status === 401);

    // ── §b liste ───────────────────────────────────────────────────────────────
    console.log("\n§b kişi listesi");
    const list = await call("GET", "/api/bildirim-atamalari/kullanicilar", mToken);
    const ids = new Set(((list.json.data as { items: Array<{ id: string }> }).items ?? []).map((i) => i.id));
    check("200 + atanabilir kişi görünür", list.status === 200 && ids.has(orderOnly.id) && ids.has(prefUser.id));
    check("⭐ yalnız-saha · pasif LİSTELENMEZ", !ids.has(field.id) && !ids.has(passive.id));

    // ── §c kişi ataması ────────────────────────────────────────────────────────
    console.log("\n§c kişi ataması");
    const tvBefore = await tokenVersion(orderOnly.id);
    const okPut = await call("PUT", `/api/bildirim-atamalari/kullanicilar/${orderOnly.id}`, mToken, { kinds: ["yeni-siparis"] });
    check("veri izinli tür yazılır (200)", okPut.status === 200 && (await kindsOf(orderOnly.id)).join() === "yeni-siparis", String(okPut.status));
    const bad = await call("PUT", `/api/bildirim-atamalari/kullanicilar/${orderOnly.id}`, mToken, { kinds: [] as string[] });
    check("boş küme kaldırır", bad.status === 200 && (await kindsOf(orderOnly.id)).length === 0);
    await call("PUT", `/api/bildirim-atamalari/kullanicilar/${orderOnly.id}`, mToken, { kinds: ["yeni-siparis"] });
    const denied = await call("PUT", `/api/bildirim-atamalari/kullanicilar/${orderOnly.id}`, mToken, { kinds: ["yeni-siparis", "yeni-sevk"] });
    check("⭐ veri izni olmayan tür 409 BILDIRIM_VERI_IZNI_YOK", denied.status === 409 && code(denied.json) === "BILDIRIM_VERI_IZNI_YOK" && denied.json.code === undefined, String(denied.status));
    check("⭐ ret sonrası küme DEĞİŞMEDİ (yarım yazım yok)", (await kindsOf(orderOnly.id)).join() === "yeni-siparis");
    const unknown = await call("PUT", `/api/bildirim-atamalari/kullanicilar/${orderOnly.id}`, mToken, { kinds: ["yok-boyle"] });
    check("tanınmayan tür 400 BILDIRIM_TURU_GECERSIZ", unknown.status === 400 && code(unknown.json) === "BILDIRIM_TURU_GECERSIZ");
    const fieldPut = await call("PUT", `/api/bildirim-atamalari/kullanicilar/${field.id}`, mToken, { kinds: [] });
    check("yalnız-saha kişiye atama 409 BILDIRIM_KULLANICI_UYGUN_DEGIL", fieldPut.status === 409 && code(fieldPut.json) === "BILDIRIM_KULLANICI_UYGUN_DEGIL");
    check("⭐ atama tokenVersion ARTIRMAZ (oturum düşmez)", (await tokenVersion(orderOnly.id)) === tvBefore, `${tvBefore}`);
    const get = await call("GET", `/api/bildirim-atamalari/kullanicilar/${orderOnly.id}`, mToken);
    const rows = (get.json.data as { kinds: Array<{ kind: string; assigned: boolean; lockedReason: string | null }> }).kinds;
    const sevk = rows.find((r) => r.kind === "yeni-sevk");
    check("GET: atanan işaretli, izinsiz tür KİLİTLİ + neden", rows.find((r) => r.kind === "yeni-siparis")?.assigned === true && sevk?.lockedReason === "Sevkiyatları görme izni yok");
    await new Promise((r) => setTimeout(r, 300));
    const audit = await prisma.systemLog.count({ where: { tableName: "NOTIFICATION_ASSIGNMENT", recordId: orderOnly.id } });
    check("audit izi düştü (NOTIFICATION_ASSIGNMENT)", audit >= 2, String(audit));
    check("kanca bu tablolardan tür üretmez", ["NOTIFICATION_ASSIGNMENT", "NOTIFICATION_TEMPLATE", "NOTIFICATION_PREFERENCE"].every((t) => notificationKindForAudit("UPDATE", t) === null));

    // ── §d şablon ──────────────────────────────────────────────────────────────
    console.log("\n§d şablon: kopya, atlama, sonradan değişiklik");
    const tpl = await mkTemplate(["order:read", "shipping:read"]);
    const tDenied = await call("PUT", `/api/bildirim-atamalari/sablonlar/${tpl}`, mToken, { kinds: ["yeni-is-emri"] });
    check("şablonda veri izni olmayan tür 409", tDenied.status === 409 && code(tDenied.json) === "BILDIRIM_VERI_IZNI_YOK");
    const tPut = await call("PUT", `/api/bildirim-atamalari/sablonlar/${tpl}`, mToken, { kinds: ["yeni-siparis", "yeni-sevk"] });
    check("şablon seti yazılır", tPut.status === 200 && (await prisma.permissionTemplateNotification.count({ where: { templateId: tpl } })) === 2);
    const tList = await call("GET", "/api/bildirim-atamalari/sablonlar", mToken);
    check("şablon listesinde sayı 2", ((tList.json.data as { items: Array<{ id: string; assignedCount: number }> }).items.find((i) => i.id === tpl)?.assignedCount) === 2);
    const target = await mkUser("hedef", ["workorder:read"]);
    await prisma.notificationAssignment.create({ data: { userId: target.id, kind: "yeni-is-emri", mutedByUser: true } });
    await PermissionManagementService.applyTemplate(target.id, tpl, "replace", admin.id);
    check("⭐ replace: kişinin seti = şablonun seti (izinler de kopyalandı)", (await kindsOf(target.id)).join() === "yeni-sevk,yeni-siparis", (await kindsOf(target.id)).join());
    const narrow = await mkUser("dar", ["order:read"]);
    const narrowTpl = await mkTemplate(["order:read"]);
    await prisma.permissionTemplateNotification.createMany({ data: [{ templateId: narrowTpl, kind: "yeni-siparis" }, { templateId: narrowTpl, kind: "yeni-sevk" }] });
    await PermissionManagementService.applyTemplate(narrow.id, narrowTpl, "merge", admin.id);
    check("⭐ merge: veri izni olmayan tür ATLANDI (yalnız yeni-siparis)", (await kindsOf(narrow.id)).join() === "yeni-siparis", (await kindsOf(narrow.id)).join());
    const tvTarget = await tokenVersion(target.id);
    await call("PUT", `/api/bildirim-atamalari/sablonlar/${tpl}`, mToken, { kinds: ["yeni-siparis"] });
    check("⭐ şablon sonradan değişti → kişi ETKİLENMEDİ", (await kindsOf(target.id)).join() === "yeni-sevk,yeni-siparis");
    check("şablon değişimi kişinin tokenVersion'ını artırmaz", (await tokenVersion(target.id)) === tvTarget);
    // Saha şablonu yalnız `mobile:*` taşır ⇒ kişi uygulamadan sonra da yalnız-saha kalır (satır doğrudan yazıldı).
    const fieldTpl = await mkTemplate(["mobile:siparis"]);
    await prisma.permissionTemplateNotification.create({ data: { templateId: fieldTpl, kind: "yeni-siparis" } });
    await PermissionManagementService.applyTemplate(field.id, fieldTpl, "merge", admin.id);
    check("yalnız-saha kişiye şablon: bildirim seti yazılmaz", (await kindsOf(field.id)).length === 0);

    // ── §e kendi tercihi ───────────────────────────────────────────────────────
    console.log("\n§e kendi tercihi");
    await prisma.notificationAssignment.createMany({ data: [{ userId: plain.id, kind: "yeni-siparis" }, { userId: prefUser.id, kind: "yeni-siparis" }] });
    const noPrefGet = await call("GET", "/api/bildirimler/tercihler", pToken);
    const npd = noPrefGet.json.data as { canChange: boolean; items: Array<{ kind: string; required: boolean }> };
    check("tercih izni yok: GET canChange=false, tür zorunlu", noPrefGet.status === 200 && npd.canChange === false && npd.items.length === 1 && npd.items[0]?.required === true);
    const noPrefPut = await call("PUT", "/api/bildirimler/tercihler", pToken, { items: [{ kind: "yeni-siparis", muted: true }] });
    check("⭐ tercih izni yokken kendi tercih yazımı 403", noPrefPut.status === 403 && code(noPrefPut.json) === "PERMISSION_DENIED", String(noPrefPut.status));
    check("403 sonrası mute yazılmadı", (await prisma.notificationAssignment.findFirstOrThrow({ where: { userId: plain.id, kind: "yeni-siparis" } })).mutedByUser === false);
    const prToken = await login(prefUser);
    const tvPref = await tokenVersion(prefUser.id);
    const mute = await call("PUT", "/api/bildirimler/tercihler", prToken, { items: [{ kind: "yeni-siparis", muted: true }] });
    check("tercih izniyle mute 200", mute.status === 200 && (mute.json.data as { items: Array<{ mutedByUser: boolean }> }).items[0]?.mutedByUser === true, String(mute.status));
    check("tercih yazımı tokenVersion ARTIRMAZ", (await tokenVersion(prefUser.id)) === tvPref);
    const unassigned = await call("PUT", "/api/bildirimler/tercihler", prToken, { items: [{ kind: "yeni-is-emri", muted: false }] });
    check("⭐ atanmamış türü açamaz: 409 BILDIRIM_ATANMAMIS", unassigned.status === 409 && code(unassigned.json) === "BILDIRIM_ATANMAMIS");
    check("atanmamış tür satırı doğmadı", (await kindsOf(prefUser.id)).join() === "yeni-siparis");
    await prisma.notificationAssignment.updateMany({ where: { userId: plain.id, kind: "yeni-siparis" }, data: { mutedByUser: true } });
    const recipients = await resolveNotificationRecipients("yeni-siparis" as NotificationKind, null);
    check("⭐ uçtan uca: mute eden (tercih izinli) teslim ALMAZ", !recipients.includes(prefUser.id));
    check("uçtan uca: tercih izni yokken mute YOK SAYILIR, alır", recipients.includes(plain.id));
    await call("PUT", "/api/bildirimler/tercihler", prToken, { items: [{ kind: "yeni-siparis", muted: false }] });
    check("mute geri açılınca yeniden alır", (await resolveNotificationRecipients("yeni-siparis", null)).includes(prefUser.id));

    // ── §f katalog ─────────────────────────────────────────────────────────────
    console.log("\n§f katalog");
    const cat = await call("GET", "/api/bildirimler/katalog", pToken);
    const topics = (cat.json.data as { topics: Array<{ key: string; kinds: Array<{ kind: string; dataPermission: string; missingPermissionText: string }> }> }).topics;
    check("konu başlıkları katalog sırasıyla", cat.status === 200 && topics.map((t) => t.key).join() === NOTIFICATION_TOPICS.map((t) => t.key).join());
    const ord = topics.find((t) => t.key === "siparisler")?.kinds.find((k) => k.kind === "yeni-siparis");
    check("tür veri izni + kilit metni taşır", ord?.dataPermission === "order:read" && ord.missingPermissionText === "Siparişleri görme izni yok");
  } finally {
    await prisma.notificationAssignment.deleteMany({ where: { userId: { in: userIds } } });
    await prisma.permissionTemplateNotification.deleteMany({ where: { templateId: { in: templateIds } } });
    await prisma.permissionTemplateItem.deleteMany({ where: { templateId: { in: templateIds } } });
    await prisma.permissionTemplate.deleteMany({ where: { id: { in: templateIds } } });
    await prisma.userPermission.deleteMany({ where: { userId: { in: userIds } } });
    for (const id of userIds) await prisma.user.update({ where: { id }, data: { isActive: false, deletedAt: new Date() } }).catch(() => undefined);
    await new Promise<void>((r) => { server.closeAllConnections(); server.close(() => r()); });
  }
}

main()
  .then(async () => {
    console.log(`\n=== Sonuç: ${pass} geçti, ${fail} başarısız ===`);
    await prisma.$disconnect();
    process.exit(fail > 0 ? 1 : 0);
  })
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
