// =============================================================================
// BEKÇİ — BİLDİRİM BULUT KÖPRÜSÜ (2.13.0, D4): `jobs/cloud-notify.job.ts` + `notifications/cloud-bridge.service.ts`
// =============================================================================
// ÖLÇTÜĞÜ (prisma GERÇEK, bulut SAHTE taşıma):
//  §1 kapatma: eşitleme ön koşulu kapalı ya da `notifications.enabled` kapalı ⇒ tur KAPALI, SIFIR istek; uzlaştırma
//     kapalıyken köprü işini başlatmaz/durdurur, açıkken başlatır; kurulmamış işte dürtme zamanlayıcı kurmaz.
//  §2 gönderim: yeni teslim imzalı istekte doğru alanlarla gider (hesapId = users.id, tekilAnahtar = tür:varlık),
//     2xx sonrası `cloudSentAt` damgalanır, sonraki turda yeniden gitmez; pencereden eski teslim gitmez.
//  §3 panelde okunan → istekte `okunanlar`; 2xx sonrası `cloudReadSentAt`, sonraki turda gitmez.
//  §4 bulutta okunan (yanıt `okunanlar`) → `readAt` yazılır (yalnız NULL iken; gelecek an şimdiye kırpılır) ve bir
//     sonraki istekte TEYİT olarak geri gider; zaten bildirilmiş okunduyu bulut yine sayıyorsa yeniden teyit edilir.
//  §5 eski bulut (404) → ESKI_BULUT + 60 dk geri çekilme, damga YOK · 5xx → BASARISIZ + artan geri çekilme · dürtme
//     senkron, fırlatmaz, geri çekilmede takvimi bozmaz · log'a başlık/metin/kişi adı düşmez.
//  §6 dürtme: iş kuruluyken yeni teslim ≈1 sn içinde gider (30 sn turu beklenmez).
//
// DB: oturumun `_test` veritabanı (koşucu kapısı). Fixture `TEST-BKP` damgalı; olay/teslim satırları silinir,
// kullanıcılar pasif + silinmiş işaretlenir.
//
// NEGATİF SONDA (2026-11-17, dosya DIŞI, geri alındı; md5 denetimli): turdaki `notificationsEnabled` sorusu kaldırıldı →
// §1b ❌ · `applyBridgeResult`ta okundu claim'inden `readAt: null` koşulu kaldırıldı → §4d ❌ · pencere süzgeci
// kaldırıldı → §2e ❌ · (D6a) tür kümesi süzgeci kaldırıldı → §7a ❌. Geri yüklenince yeşil.
// =============================================================================
import { randomBytes, randomUUID } from "node:crypto";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import * as bcrypt from "bcryptjs";
import prisma from "../src/lib/prisma";
import type { CloudEligibility } from "../src/cloud-sync/eligibility";
import type { CloudHttpRequest, CloudTransport } from "../src/cloud-sync/cloud-client";
import { generateKeyFile, loadKeyFile } from "../src/lib/cloud-signing/key-file";
import { REQUEST_HEADER } from "../src/lib/cloud-signing/istek";
import { PASSWORD_POLICY_VERSION } from "../src/services/helpers/password-policy.helper";
import { markNotificationRead } from "../src/services/notifications/notification-inbox.service";
import { CLOUD_NOTIFY_WINDOW_MS, cloudSupportedKinds } from "../src/services/notifications/cloud-bridge.service";
import { reconcilePatronCloud, type ReconcileDeps } from "../src/jobs/patron-cloud.jobs";
import { NotificationsPushResponseSchema } from "../src/cloud-sync/wire";
import { NOTIFICATION_KIND_KEYS, notificationKindDef } from "../src/constants/notification-catalog";
import {
  __cloudNotifyTimerArmedForTests,
  __configureCloudNotifyForTests,
  NOTIFY_OLD_CLOUD_BACKOFF_MS,
  NOTIFY_TICK_MS,
  nudgeCloudNotify,
  runCloudNotifyOnce,
  startCloudNotify,
  stopCloudNotify,
  tickCloudNotify,
} from "../src/jobs/cloud-notify.job";

let pass = 0, fail = 0;
function check(l: string, ok: boolean, x = ""): void {
  if (ok) { pass++; console.log(`  ✓ ${l}${x ? ` — ${x}` : ""}`); }
  else { fail++; console.log(`  ✗ FAIL: ${l}${x ? ` — ${x}` : ""}`); }
}

const STAMP = "TEST-BKP";
const SIR_BASLIK = `${STAMP} gizli başlık ${randomBytes(3).toString("hex")}`;
const userIds: string[] = [];
const eventIds: string[] = [];

interface Read { teslimId: string; okundu: string }
interface Body { v: number; teslimler: Array<{ teslimId: string; hesapId: string; tur: string; tekilAnahtar: string; baslik: string; metin: string; rota: string | null; yazar: string; olusturulma: string }>; okunanlar: Read[] }
interface FakeCloud { readonly transport: CloudTransport; readonly seen: CloudHttpRequest[]; status: number; reads: Read[]; kinds?: string[] }
function fakeCloud(): FakeCloud {
  const fc: FakeCloud = {
    seen: [],
    status: 200,
    reads: [],
    transport: (req) => {
      fc.seen.push(req);
      if (fc.status !== 200) return Promise.resolve({ status: fc.status, body: Buffer.from(JSON.stringify({ success: false, message: "x", details: { code: fc.status === 404 ? "BULUNAMADI" : "SUNUCU_HATASI" } })) });
      const b = JSON.parse(req.body.toString("utf8")) as Body;
      return Promise.resolve({ status: 200, body: Buffer.from(JSON.stringify({ v: 1, alinan: b.teslimler.length, bagli: 0, atlanan: 0, okunanlar: fc.reads, tercihler: [], ...(fc.kinds ? { turler: fc.kinds } : {}) })) });
    },
  };
  return fc;
}
const body = (r: CloudHttpRequest | undefined): Body => JSON.parse(r?.body.toString("utf8") ?? "{\"teslimler\":[],\"okunanlar\":[]}") as Body;
const sentIds = (fc: FakeCloud, from = 0): Set<string> => new Set(fc.seen.slice(from).flatMap((r) => body(r).teslimler.map((t) => t.teslimId)));
const readIds = (fc: FakeCloud, from = 0): Set<string> => new Set(fc.seen.slice(from).flatMap((r) => body(r).okunanlar.map((t) => t.teslimId)));

async function mkUser(tag: string): Promise<string> {
  const u = await prisma.user.create({
    data: { username: `${STAMP}-${tag}-${randomBytes(3).toString("hex")}`, fullName: `${STAMP} ${tag}`, passwordHash: await bcrypt.hash(randomUUID(), 10), passwordPolicyVersion: PASSWORD_POLICY_VERSION },
    select: { id: true },
  });
  userIds.push(u.id);
  return u.id;
}

/** Olay + tek teslim (üreticinin yazdığı biçim); `ageMs` teslimin yaşı. */
async function mkDelivery(userId: string, kind: string, ageMs = 0): Promise<{ id: string; entityId: string }> {
  const entityId = randomUUID();
  const at = new Date(Date.now() - ageMs);
  const ev = await prisma.notificationEvent.create({
    data: { kind, entityId, authorName: `${STAMP} Yazar`, title: SIR_BASLIK, body: `${STAMP} metin`, route: `/x/${entityId}`, createdAt: at },
    select: { id: true },
  });
  eventIds.push(ev.id);
  const d = await prisma.notificationDelivery.create({ data: { userId, eventId: ev.id, createdAt: at }, select: { id: true } });
  return { id: d.id, entityId };
}
const row = (id: string) => prisma.notificationDelivery.findUniqueOrThrow({ where: { id }, select: { readAt: true, cloudSentAt: true, cloudReadSentAt: true } });

type Open = Extract<CloudEligibility, { ok: true }>;

async function s1(open: Open, a: string): Promise<void> {
  console.log("\n§1 kapatma düğmeleri: sıfır istek");
  await mkDelivery(a, "yeni-siparis");
  const fc = fakeCloud();
  __configureCloudNotifyForTests({ reset: true });
  __configureCloudNotifyForTests({ transport: fc.transport, eligibility: async () => ({ ok: false, reason: "AYAR_KAPALI" }), enabled: async () => true });
  const r1 = await runCloudNotifyOnce();
  check("§1a ⭐ eşitleme kapalı: KAPALI · sıfır istek", r1.status === "KAPALI" && fc.seen.length === 0, `${r1.status} ${fc.seen.length}`);
  __configureCloudNotifyForTests({ eligibility: async () => open, enabled: async () => false });
  const r2 = await runCloudNotifyOnce();
  check("§1b ⭐ notifications.enabled kapalı: KAPALI · sıfır istek", r2.status === "KAPALI" && r2.reason === "BILDIRIM_KAPALI" && fc.seen.length === 0, `${r2.status} ${fc.seen.length}`);
  const calls: string[] = [];
  const base: Omit<ReconcileDeps, "eligibility"> = {
    switch: { setEnabled: async () => 0, enabledCount: async () => 0, sleep: async () => undefined },
    start: () => undefined,
    stop: () => undefined,
    inbox: { eligibility: async () => ({ ok: false, reason: "YAZMA_KAPALI" }), ensureUser: async () => ({ ok: false, reason: "x" }), start: () => undefined, stop: () => undefined },
    reports: { start: () => undefined, stop: () => undefined },
    users: { start: () => undefined, stop: () => undefined },
    notify: { start: () => { calls.push("start"); }, stop: () => { calls.push("stop"); } },
  };
  const rc = await reconcilePatronCloud("bekçi kapalı", { ...base, eligibility: async () => ({ ok: false, reason: "AYAR_KAPALI" }) });
  check("§1c uzlaştırma kapalı: köprü işi başlamadı, durduruldu", rc === "DURDU" && !calls.includes("start") && calls.includes("stop"), calls.join(","));
  calls.length = 0;
  const ro = await reconcilePatronCloud("bekçi açık", { ...base, eligibility: async () => open });
  check("§1d uzlaştırma açık: köprü işi başladı", ro === "BASLADI" && calls.includes("start"), calls.join(","));
  nudgeCloudNotify();
  check("§1e kurulmamış işte dürtme zamanlayıcı kurmaz", !__cloudNotifyTimerArmedForTests());
}

async function s2(open: Open, a: string, b: string): Promise<{ d1: string; d2: string }> {
  console.log("\n§2 gönderim + damga");
  const d1 = await mkDelivery(a, "yeni-is-emri");
  const d2 = await mkDelivery(b, "yeni-sevk");
  const eski = await mkDelivery(a, "yeni-siparis", CLOUD_NOTIFY_WINDOW_MS + 60_000);
  const fc = fakeCloud();
  __configureCloudNotifyForTests({ reset: true });
  __configureCloudNotifyForTests({ transport: fc.transport, eligibility: async () => open, enabled: async () => true });
  const r = await runCloudNotifyOnce();
  const t1 = fc.seen.flatMap((x) => body(x).teslimler).find((t) => t.teslimId === d1.id);
  check("§2a tur GONDERILDI · istek imzalı ve doğru uca", r.status === "GONDERILDI" && fc.seen.length >= 1 && fc.seen[0]!.url.endsWith("/v1/bildirimler") && typeof fc.seen[0]!.headers[REQUEST_HEADER] === "string", `${r.status} ${fc.seen[0]?.url ?? ""} ${Object.keys(fc.seen[0]?.headers ?? {}).join(",")}`);
  check("§2b teslim alanları: hesapId = users.id · tekilAnahtar = tür:varlık · başlık/metin/rota", !!t1 && t1.hesapId === a && t1.tur === "yeni-is-emri" && t1.tekilAnahtar === `yeni-is-emri:${d1.entityId}` && t1.baslik === SIR_BASLIK && t1.rota === `/x/${d1.entityId}`, JSON.stringify(t1 ?? {}));
  check("§2c iki alıcının teslimi de gitti", sentIds(fc).has(d1.id) && sentIds(fc).has(d2.id));
  check("§2d 2xx sonrası cloudSentAt damgalandı", !!(await row(d1.id)).cloudSentAt && !!(await row(d2.id)).cloudSentAt);
  check("§2e pencereden eski teslim gitmedi, damgasız kaldı", !sentIds(fc).has(eski.id) && !(await row(eski.id)).cloudSentAt);
  const n = fc.seen.length;
  await runCloudNotifyOnce();
  check("§2f sonraki tur aynı teslimi yeniden göndermez", !sentIds(fc, n).has(d1.id) && !sentIds(fc, n).has(d2.id));
  return { d1: d1.id, d2: d2.id };
}

async function s3(open: Open, a: string, d1: string): Promise<void> {
  console.log("\n§3 panelde okunan → buluta");
  await markNotificationRead(d1, a);
  const fc = fakeCloud();
  __configureCloudNotifyForTests({ transport: fc.transport, eligibility: async () => open, enabled: async () => true });
  await runCloudNotifyOnce();
  const okundu = fc.seen.flatMap((x) => body(x).okunanlar).find((o) => o.teslimId === d1);
  const r = await row(d1);
  check("§3a panel okuması istekte okunanlar'da, anı readAt", !!okundu && !!r.readAt && okundu.okundu === r.readAt.toISOString(), JSON.stringify(okundu ?? {}));
  check("§3b 2xx sonrası cloudReadSentAt damgalandı", !!r.cloudReadSentAt);
  const n = fc.seen.length;
  await runCloudNotifyOnce();
  check("§3c sonraki turda yeniden gitmez", !readIds(fc, n).has(d1));
}

async function s4(open: Open, d1: string, d2: string): Promise<void> {
  console.log("\n§4 bulutta okunan → fabrika readAt + teyit");
  const telefon = new Date(Date.now() - 45_000).toISOString();
  const fc = fakeCloud();
  fc.reads = [{ teslimId: d2, okundu: telefon }];
  __configureCloudNotifyForTests({ transport: fc.transport, eligibility: async () => open, enabled: async () => true });
  await runCloudNotifyOnce();
  const r = await row(d2);
  check("§4a ⭐ bulut okuması fabrika readAt'e yazıldı (telefonun anıyla)", r.readAt?.toISOString() === telefon, r.readAt?.toISOString() ?? "yok");
  fc.reads = [];
  const n = fc.seen.length;
  await runCloudNotifyOnce();
  check("§4b bir sonraki istekte teyit olarak geri gitti", readIds(fc, n).has(d2));
  check("§4c teyitten sonra cloudReadSentAt dolu", !!(await row(d2)).cloudReadSentAt);
  const panelAni = (await row(d1)).readAt!.toISOString();
  fc.reads = [{ teslimId: d1, okundu: new Date().toISOString() }];
  const m = fc.seen.length;
  await runCloudNotifyOnce();
  fc.reads = [];
  await runCloudNotifyOnce();
  check("§4d ⭐ zaten okunmuş teslimin readAt'i değişmez (ilk okuma kazanır)", (await row(d1)).readAt!.toISOString() === panelAni);
  check("§4e bulut teyitsiz sayıyorsa yeniden teyit edilir", readIds(fc, m).has(d1) && !!(await row(d1)).cloudReadSentAt);
}

async function s4b(open: Open, a: string): Promise<void> {
  const d = await mkDelivery(a, "yeni-sevk");
  const fc = fakeCloud();
  __configureCloudNotifyForTests({ transport: fc.transport, eligibility: async () => open, enabled: async () => true });
  await runCloudNotifyOnce();
  fc.reads = [{ teslimId: d.id, okundu: new Date(Date.now() + 3_600_000).toISOString() }];
  const once = Date.now();
  await runCloudNotifyOnce();
  const r = await row(d.id);
  check("§4f gelecek anlı okundu şimdiye kırpılır", !!r.readAt && r.readAt.getTime() <= Date.now() && r.readAt.getTime() >= once - 1000, r.readAt?.toISOString() ?? "yok");
}

async function s5(open: Open, a: string): Promise<void> {
  console.log("\n§5 eski bulut · hata · log");
  const d = await mkDelivery(a, "yeni-siparis");
  const fc = fakeCloud();
  fc.status = 404;
  const logs: string[] = [];
  const orig = { log: console.log, warn: console.warn, error: console.error };
  const grab = (...x: unknown[]): void => { logs.push(x.map(String).join(" ")); };
  __configureCloudNotifyForTests({ reset: true });
  __configureCloudNotifyForTests({ transport: fc.transport, eligibility: async () => open, enabled: async () => true });
  console.warn = grab; console.error = grab;
  let next404 = 0, next500 = 0, r500 = "";
  try {
    next404 = await tickCloudNotify();
    fc.status = 500;
    const r = await runCloudNotifyOnce();
    r500 = r.status;
    next500 = await tickCloudNotify();
  } finally {
    console.warn = orig.warn; console.error = orig.error;
  }
  check("§5a ⭐ eski bulut 404: 60 dk geri çekilme, teslim damgasız (sonra yeniden denenir)", next404 === NOTIFY_OLD_CLOUD_BACKOFF_MS && !(await row(d.id)).cloudSentAt, String(next404));
  check("§5b 5xx: BASARISIZ + aralıktan uzun geri çekilme", r500 === "BASARISIZ" && next500 > NOTIFY_TICK_MS, `${r500} ${next500}`);
  check("§5c uyarı log'u yazıldı, başlık/metin/kişi adı YOK", logs.some((l) => /eski bulut/.test(l)) && !logs.some((l) => l.includes(STAMP)), logs.join(" | ").slice(0, 200));
  startCloudNotify();
  await tickCloudNotify(); // geri çekilme durumuna gir
  const t0 = performance.now();
  let threw = false;
  try { nudgeCloudNotify(); } catch { threw = true; }
  const ms = performance.now() - t0;
  stopCloudNotify();
  check("§5d dürtme senkron, fırlatmaz (yazma yolunu beklemez)", !threw && ms < 20, `${ms.toFixed(1)} ms`);
  fc.status = 200;
}

async function s6(open: Open, a: string): Promise<void> {
  console.log("\n§6 dürtme ≈1 sn");
  const fc = fakeCloud();
  __configureCloudNotifyForTests({ reset: true });
  __configureCloudNotifyForTests({ transport: fc.transport, eligibility: async () => open, enabled: async () => true });
  await runCloudNotifyOnce(); // birikmişi boşalt
  startCloudNotify();
  try {
    const d = await mkDelivery(a, "yeni-is-emri");
    const n = fc.seen.length;
    nudgeCloudNotify();
    const t0 = Date.now();
    while (!sentIds(fc, n).has(d.id) && Date.now() - t0 < 5000) await new Promise((r) => setTimeout(r, 100));
    check("§6a ⭐ dürtülen teslim 30 sn beklemeden gitti", sentIds(fc, n).has(d.id), `${Date.now() - t0} ms`);
  } finally {
    stopCloudNotify();
  }
  check("§6b durdurunca zamanlayıcı yok", !__cloudNotifyTimerArmedForTests());
}

/** D6a tür kümesi koruması: bulutun tanımadığı tür gönderilmez ve damgalanmaz (bulut atlar, fabrika damgalarsa kaybolurdu). */
async function s7(open: Open, a: string): Promise<void> {
  console.log("\n§7 tür kümesi: eski bulut yalnız D1 türlerini alır; 'turler' bildiren bulut yenileri de alır");
  const known = await mkDelivery(a, "yeni-siparis");
  const fresh = await mkDelivery(a, "sevkiyat-cikti");
  const fc = fakeCloud();
  __configureCloudNotifyForTests({ reset: true });
  __configureCloudNotifyForTests({ transport: fc.transport, eligibility: async () => open, enabled: async () => true });
  await runCloudNotifyOnce();
  check("§7a ⭐ eski bulut: D1 türü gitti, yeni tür GİTMEDİ ve damgasız (kayıp yok)", sentIds(fc).has(known.id) && !sentIds(fc).has(fresh.id) && !(await row(fresh.id)).cloudSentAt);
  fc.kinds = ["yeni-siparis", "yeni-is-emri", "yeni-sevk", "sevkiyat-cikti"];
  await runCloudNotifyOnce();
  const n = fc.seen.length;
  await runCloudNotifyOnce();
  check("§7b 'turler' bildiren bulut: bekleyen yeni tür sonraki turda gitti ve damgalandı", sentIds(fc, n).has(fresh.id) && !!(await row(fresh.id)).cloudSentAt);
  const base = { v: 1, alinan: 0, bagli: 0, atlanan: 0, aynaAlinan: 0 };
  const bad = NotificationsPushResponseSchema.safeParse({ ...base, okunanlar: [], turler: ["Gecersiz Tur"] });
  const none = NotificationsPushResponseSchema.safeParse(base);
  const good = NotificationsPushResponseSchema.safeParse({ ...base, turler: ["a-b"] });
  check("§7c bozuk 'turler' yanıtı düşürmez, yok sayılır (eski küme); alan yoksa da eski küme",
    bad.success && cloudSupportedKinds(bad.data) === null && none.success && cloudSupportedKinds(none.data) === null && good.success && cloudSupportedKinds(good.data)?.has("a-b") === true);
  check("§7d geçersiz yanıt → eski küme", cloudSupportedKinds(null) === null);
}

/** D6b: fabrika kataloğunun her türü bulutun tel listesinde, fabrika kaynaklı kümede ve kuralında AYNI etiketle var. */
function s8(): void {
  console.log("\n§8 fabrika kataloğu ↔ bulut kataloğu (tür anahtarı + etiket)");
  const cloudRoot = path.join(__dirname, "..", "..", "patron", "sunucu", "src");
  const api = readFileSync(path.join(cloudRoot, "wire", "api.ts"), "utf8");
  const rules = readFileSync(path.join(cloudRoot, "catalog", "notifications.ts"), "utf8");
  const block = (name: string): string => api.slice(api.indexOf(`export const ${name}`), api.indexOf("];", api.indexOf(`export const ${name}`)));
  const wireKinds = block("NOTIFICATION_KINDS =");
  const factoryKinds = block("FACTORY_NOTIFICATION_KINDS");
  const missWire = NOTIFICATION_KIND_KEYS.filter((k) => !wireKinds.includes(`"${k}"`));
  const missFactory = NOTIFICATION_KIND_KEYS.filter((k) => !factoryKinds.includes(`"${k}"`));
  const badLabel = NOTIFICATION_KIND_KEYS.filter((k) => !rules.includes(`"${k}": {\n    label: ${JSON.stringify(notificationKindDef(k).label)},`));
  check("§8a ⭐ her fabrika türü bulut tel listesinde (NOTIFICATION_KINDS)", missWire.length === 0, missWire.join(","));
  check("§8b ⭐ her fabrika türü bulutun fabrika kaynaklı kümesinde (FACTORY_NOTIFICATION_KINDS — kişisel forma sızmaz)", missFactory.length === 0, missFactory.join(","));
  check("§8c ⭐ bulut kuralı var ve etiketi fabrika etiketiyle aynı", badLabel.length === 0, badLabel.join(","));
}

async function main(): Promise<void> {
  const dir = mkdtempSync(path.join(tmpdir(), "tst-bkp-"));
  try {
    const keyPath = path.join(dir, "anahtar.json");
    generateKeyFile(keyPath);
    const key = loadKeyFile(keyPath);
    if (!key.ok) throw new Error("anahtar dosyası kurulamadı");
    const open: Open = { ok: true, baseUrl: "https://bulut.tst.invalid", installationId: randomUUID(), privateKey: key.key.privateKey, intervalMinutes: 5 };
    const a = await mkUser("a");
    const b = await mkUser("b");
    await s1(open, a);
    const { d1, d2 } = await s2(open, a, b);
    await s3(open, a, d1);
    await s4(open, d1, d2);
    await s4b(open, a);
    await s5(open, a);
    await s6(open, a);
    await s7(open, a);
    s8();
  } finally {
    stopCloudNotify();
    __configureCloudNotifyForTests({ reset: true });
    rmSync(dir, { recursive: true, force: true });
    await prisma.notificationDelivery.deleteMany({ where: { eventId: { in: eventIds } } });
    await prisma.notificationEvent.deleteMany({ where: { id: { in: eventIds } } });
    for (const id of userIds) await prisma.user.update({ where: { id }, data: { isActive: false, deletedAt: new Date() } }).catch(() => undefined);
  }
}

main()
  .catch((e: unknown) => { fail++; console.log(`  ✗ FAIL: beklenmeyen hata — ${e instanceof Error ? e.stack ?? e.message : String(e)}`); })
  .finally(() => {
    console.log(`\n=== Sonuç: ${pass} geçti, ${fail} başarısız ===\n`);
    process.exit(fail > 0 ? 1 : 0);
  });
