// =============================================================================
// BEKÇİ — PATRON BULUTU GELEN KUTUSU: telefondan yeni sipariş + yeni müşteri (D4)
// =============================================================================
// ÖLÇTÜĞÜ (servis + prisma GERÇEK, yalnız bulut ağ katmanı taklit):
//  §a aynı mesajId SIRAYLA iki kez → tek kayıt; ikinci sonuç ilkinin makbuzunu taşır (sipariş + müşteri).
//  §b aynı mesajId EŞZAMANLI ×5 (8036 kilidi dış bağlantıda elle tutulur → hepsi tx'e girip bekler) → tek
//     kayıt, tek makbuz, kaybeden fırlatmaz, hepsi aynı varlığı görür.
//  §c retler (makbuzlu, okunur TR neden, kayıt DOĞMADAN): bilinmeyen müşteri/ürün/renk · telefon görürken
//     pasife alınmış müşteri · pasif (ARCHIVED) ürün · pasif renk · izinli renk dışı · başka carinin şubesi ·
//     geçersiz birim · miktar 0 · boş kalem · geçersiz döviz · geçmiş termin · gövde sözleşme dışı · vergi no mükerrer.
//  §d benzer ad → RET "Benzer müşteri var"; eşik panelin uyarı yüzeyiyle AYNI fonksiyon/yapılandırma; kısa ad ölçümü.
//  §e KARŞILAŞTIRMA panel ↔ telefon: sipariş + kalem + audit, müşteri kartı + cari hesap + audit alan alan.
//  §f telefondan gelen birim fiyat yok sayılır; fiyatsız sipariş panel liste/detay ucunda 200.
//  §g atomiklik: sipariş tx'te yazıldıktan SONRA makbuz düşer → ne sipariş ne kalem ne makbuz; numara boşluğu yok.
//  §h yazma ayarı kapalı (okuma açık): iş yok, zamanlayıcı yok, sıfır dış istek, teknik kullanıcı doğmaz;
//     açılınca doğar ve iş başlar; kapanınca iş durur, kullanıcı aktif kalır (girişsiz, izinsiz).
//  §i teknik kullanıcı: parola/PIN/kart 401 · listede yok · izin 0 · süperadmin değil · kimliği ham ayar ucuna kapalı.
//  §j desteklenmeyen tür → makbuzsuz ret buluta gider; belirsiz hata 3 turda makbuzlu ret; yeniden başlatma
//     (sayaç sıfırı) ve kaybolan sonuç bildirimi zararsız — ikinci kayıt doğmaz.
//  §k iş hatası istek yolunu etkilemez: bulut erişilemezken tur fırlatmaz, aynı süreçte API 200.
//  §l yazar denetimi (F3): yazar = bulut hesabı = fabrika kullanıcısı, işlendiği AN güncel izniyle denetlenir —
//     bilinmeyen id · pasif · `patron:giris` geri alınmış · `order:write` yok (SIPARIS RET, CARI
//     geçer) · teknik kullanıcı yazar → makbuzlu RET IS_KURALI "Yetkiniz fabrikada kaldırılmış", kayıt doğmaz;
//     ret makbuzu kalıcı, izin geri verilince YENİ mesaj işlenir. (UUID olmayan kimlik işleyiciye ulaşmaz: `al`
//     yanıtı `hesapId: z.uuid()` ile süzülür.)
//
// DB: oturumun `_test` veritabanı (koşucu kapısı). Fixture `TEST-D4` damgalı ve `finally`de FK sırasıyla silinir.
// Yazar kullanıcıları (`TEST-D4-yazar-*`) sert silinmez: izinleri silinir, kullanıcı pasif + silinmiş işaretlenir.
// §d kısa ad ölçümü `TST-` damgalı 8 harflik adlarla yapılır (katlanmış uzunluk ≤ 8 → kısa ad eşiği).
// Teknik kullanıcı satırı silinemez (audit FK'sı): bu koşum doğurduysa sonunda kaydı silinir, kullanıcı
// `TEST-pb-*` adıyla pasif + silinmiş işaretlenir — sonraki koşum yine "doğmadı → doğdu" ölçer.
//
// NEGATİF SONDA (2026-11-12, altısı da kırmızı verdi, geri alındı; 85 kontrol):
//   · makbuz replay'i kör (`find` → null) → §a ×3 · §b ×2 · §j ×2 ✗ (DB UNIQUE sedleri yine tek kayıt bıraktı)
//   · `prepareInboxOrder`dan `validateCustomer` çıkarıldı → §c pasif müşteri ✗ (sipariş açıldı)
//   · sipariş ayrı tx'te yazıldı (makbuzla aynı tx değil) → §g ×3 ✗ (sipariş kaldı, numara N+2)
//   · `issueToken` teknik kullanıcı reddi kaldırıldı → §i parola/PIN/kart ✗ — üçü de TOKEN aldı (koruma tek engel)
//   · benzer ad reddi kaldırıldı → §d ×3 ✗ · yazma ayarı uygunluktan çıkarıldı → §h ×7 ✗ (kullanıcı doğdu, 3 dış istek)
// NEGATİF SONDA (2026-11-13, F3; ikisi de kırmızı verdi, geri alındı; 96 kontrol):
//   · `assertAuthorStillAllowed` çağrısı kaldırıldı → §l ×8 ✗ (bilinmeyen/pasif/geri alınmış/siparişsiz/teknik yazar
//     kayıt açtı; ret makbuzu kalıcılığı da düştü)
//   · CARI türü `bulut:siparis:yaz` istedi (tür→izin eşlemesi bozuldu) → §l siparişsiz yazarın müşteri kartı ✗
// =============================================================================
import http from "node:http";
import https from "node:https";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { randomBytes, randomUUID } from "node:crypto";
import type { AddressInfo } from "node:net";
import { Client } from "pg";
import * as bcrypt from "bcryptjs";
import { Prisma } from "@prisma/client";
import prisma from "../src/lib/prisma";
import app from "../src/app";
import { orderService } from "../src/routes/order.routes";
import { customerService } from "../src/routes/customer.routes";
import { ENVELOPE_VERSION, InboxResultRequestSchema, SYNC_PATHS, type InboxOutcome } from "../src/cloud-sync/wire";
import { inboxEligibility, type InboxEligibility } from "../src/cloud-sync/eligibility";
import type { CloudTransport } from "../src/cloud-sync/cloud-client";
import { generateKeyFile, loadKeyFile } from "../src/lib/cloud-signing/key-file";
import { reconcilePermissionCatalog } from "../src/jobs/permission-catalog.job";
import { reconcilePatronCloud, type InboxReconcileDeps, type ReconcileDeps } from "../src/jobs/patron-cloud.jobs";
import {
  __cloudInboxTimerArmedForTests,
  __configureCloudInboxForTests,
  isCloudInboxRunning,
  MAX_UNCERTAIN_ATTEMPTS,
  runCloudInboxOnce,
  startCloudInbox,
  stopCloudInbox,
} from "../src/jobs/cloud-inbox.job";
import { AUTHOR_REVOKED_MESSAGE, PRICE_IGNORED_NOTE, processInboxMessage, UNPROCESSABLE_MESSAGE, UNSUPPORTED_KIND_MESSAGE, type ClaimedMessage } from "../src/services/patron-inbox/inbox.service";
import { INBOX_CUSTOMER_CONFIG, inboxCardWriter } from "../src/services/patron-inbox/customer-create";
import { ensurePatronCloudUser, PATRON_CLOUD_USERNAME, readPatronCloudUserId } from "../src/services/patron-cloud-user.service";
import { PATRON_CLOUD_USER_SETTING_KEY, isReservedSettingKey } from "../src/constants/reserved-settings";
import { AuthService } from "../src/services/auth.service";
import { PermissionManagementService } from "../src/services/permission-management.service";
import { SETTING_KEYS, readPatronCloudInboxEnabled } from "../src/services/system-setting.service";
import { ensureTestAdmin } from "./fixture-test-user";
import { PASSWORD_POLICY_VERSION } from "../src/services/helpers/password-policy.helper";
import { cleanupTestCustomers } from "./fixture-customer-cleanup";

let pass = 0, fail = 0;
function check(l: string, ok: boolean, x = ""): void {
  if (ok) { pass++; console.log(`  ✓ ${l}${x ? ` — ${x}` : ""}`); }
  else { fail++; console.log(`  ✗ FAIL: ${l}${x ? ` — ${x}` : ""}`); }
}

const STAMP = "TEST-D4";
/** Telefon yazısının yazarı — fixture fabrika kullanıcısı (`patron:giris` + `order:write` + `customer:write`). */
let authorId = "";
const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));
const letters = (n: number): string => Array.from(randomBytes(n), (b) => "BCDFGHJKLMNPRSTVYZ"[b % 18]).join("");

// ── fixture izleri ──────────────────────────────────────────────────────────
const messageIds: string[] = [];
const orderIds = new Set<string>();
const customerIds = new Set<string>();
const itemIds: string[] = [];
const colorIds: string[] = [];
const authorUserIds: string[] = [];

async function mkAuthor(tag: string, codes: readonly string[], over: Record<string, unknown> = {}): Promise<string> {
  const u = await prisma.user.create({
    data: { username: `${STAMP}-yazar-${tag}-${randomBytes(3).toString("hex")}`, fullName: `${STAMP} yazar ${tag}`, passwordHash: await bcrypt.hash(`D4-${randomUUID()}`, 10), passwordPolicyVersion: PASSWORD_POLICY_VERSION, ...over },
    select: { id: true },
  });
  authorUserIds.push(u.id);
  for (const code of codes) {
    const p = await prisma.permission.findUnique({ where: { code }, select: { id: true } });
    if (!p) throw new Error(`izin DB'de yok: ${code}`);
    await prisma.userPermission.create({ data: { userId: u.id, permissionId: p.id } });
  }
  return u.id;
}
const AUTHOR_CODES = ["patron:giris", "order:write", "customer:write"] as const;

function msg(tur: string, govde: unknown, over: Partial<ClaimedMessage> = {}): ClaimedMessage {
  const m: ClaimedMessage = { mesajId: randomUUID(), tur, govde, hesapId: authorId, hesapAdi: `${STAMP} Patron`, olusturulma: new Date().toISOString(), ...over };
  messageIds.push(m.mesajId);
  return m;
}

// ── ağ sayacı (§h) ──────────────────────────────────────────────────────────
let netCalls = 0;
const origHttp = http.request;
const origHttps = https.request;
const origFetch = globalThis.fetch;
function armNet(): void {
  netCalls = 0;
  (http as { request: unknown }).request = ((...a: Parameters<typeof http.request>) => { netCalls++; return origHttp(...a); }) as typeof http.request;
  (https as { request: unknown }).request = ((...a: Parameters<typeof https.request>) => { netCalls++; return origHttps(...a); }) as typeof https.request;
  globalThis.fetch = ((...a: Parameters<typeof fetch>) => { netCalls++; return origFetch(...a); }) as typeof fetch;
}
function disarmNet(): void {
  (http as { request: unknown }).request = origHttp;
  (https as { request: unknown }).request = origHttps;
  globalThis.fetch = origFetch;
}

// ── karşılaştırma yardımcıları ──────────────────────────────────────────────
function scalarFields(model: string): string[] {
  const m = Prisma.dmmf.datamodel.models.find((x) => x.name === model);
  return (m?.fields ?? []).filter((f) => f.kind === "scalar" || f.kind === "enum").map((f) => f.name);
}
function norm(v: unknown): unknown {
  if (v instanceof Date) return v.toISOString();
  if (v instanceof Prisma.Decimal) return v.toString();
  return v;
}
function canonical(v: unknown): string {
  if (Array.isArray(v)) return `[${v.map(canonical).join(",")}]`;
  if (v && typeof v === "object" && !(v instanceof Date)) {
    const o = v as Record<string, unknown>;
    return `{${Object.keys(o).filter((k) => o[k] !== undefined).sort().map((k) => `${k}:${canonical(o[k])}`).join(",")}}`;
  }
  return JSON.stringify(norm(v) ?? null);
}
/** Beyanlı fark dışındaki HER skaler alan eşit mi; eşit değilse farkları döner. */
function diffRows(a: Record<string, unknown>, b: Record<string, unknown>, fields: string[], declared: ReadonlySet<string>, nearTime: ReadonlySet<string> = new Set()): string[] {
  const out: string[] = [];
  for (const f of fields) {
    if (declared.has(f)) continue;
    const x = a[f], y = b[f];
    if (nearTime.has(f) && x instanceof Date && y instanceof Date) {
      if (Math.abs(x.getTime() - y.getTime()) > 120_000) out.push(`${f}: ${x.toISOString()} ≠ ${y.toISOString()}`);
      continue;
    }
    if (canonical(x) !== canonical(y)) out.push(`${f}: ${canonical(x)} ≠ ${canonical(y)}`);
  }
  return out;
}
function omit(o: unknown, keys: readonly string[]): Record<string, unknown> {
  const r = { ...((o ?? {}) as Record<string, unknown>) };
  for (const k of keys) delete r[k];
  return r;
}
const SOURCE_KEYS = ["kaynak", "kaynakAciklama", "bulutHesapId", "bulutHesapAdi", "mesajId", "birimFiyatYokSayildi"];

async function lastAudit(tableName: string, recordId: string): Promise<{ userId: string | null; newData: unknown } | null> {
  for (let i = 0; i < 40; i++) {
    const r = await prisma.systemLog.findFirst({ where: { tableName, recordId, action: "CREATE" }, orderBy: { createdAt: "desc" }, select: { userId: true, newData: true } });
    if (r) return r;
    await sleep(50);
  }
  return null;
}
const seqOf = (n: string): number => Number(/(\d+)$/.exec(n)?.[1] ?? NaN);
const prefixOf = (n: string): string => n.replace(/\d+$/, "");
const ordersFor = (mesajId: string): Promise<number> => prisma.order.count({ where: { clientToken: mesajId } });
const receiptsFor = (mesajId: string): Promise<number> => prisma.cloudInboxReceipt.count({ where: { messageId: mesajId } });

async function main(): Promise<void> {
  delete process.env.PATRON_CLOUD_URL;
  delete process.env.PATRON_CLOUD_KEY_FILE;
  const dir = mkdtempSync(path.join(tmpdir(), "tst-patron-gelen-"));
  const keyPath = path.join(dir, "kurulum.key");
  generateKeyFile(keyPath);
  const key = loadKeyFile(keyPath);
  if (!key.ok) throw new Error("anahtar dosyası kurulamadı");
  const installationId = randomUUID();
  const openInbox: Extract<InboxEligibility, { ok: true }> = {
    ok: true, baseUrl: "http://127.0.0.1:9", installationId, privateKey: key.key.privateKey, intervalMinutes: 5, inboxIntervalSeconds: 30,
  };
  const syncOnSettings = { systemSetting: { findUnique: () => Promise.resolve({ value: true }) } } as unknown as NonNullable<Parameters<typeof inboxEligibility>[0]>["settings"];
  const fourOk = { cloudUrl: () => "http://127.0.0.1:9", keyFilePath: () => keyPath, installationId: () => installationId, settings: syncOnSettings };

  const preexistingTech = await readPatronCloudUserId();
  const settingsBefore = await prisma.systemSetting.findMany({ where: { key: { in: [SETTING_KEYS.PATRON_CLOUD_INBOX_ENABLED, SETTING_KEYS.AUTH_LOGIN_METHODS, SETTING_KEYS.FINANCE_ENABLED] } } });
  let techId: string | null = preexistingTech;
  let createdTech = false;
  const server = http.createServer(app);
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", () => r()));
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;

  try {
    const admin = await ensureTestAdmin();
    await reconcilePermissionCatalog();
    authorId = await mkAuthor("tam", AUTHOR_CODES);

    // ── §h yazma KAPALI (okuma açık) ─────────────────────────────────────────
    console.log("\n§h yazma ayarı: kapalıyken iş yok · istek yok · teknik kullanıcı doğmaz; açınca doğar; kapatınca durur");
    await prisma.systemSetting.deleteMany({ where: { key: SETTING_KEYS.PATRON_CLOUD_INBOX_ENABLED } });
    check("varsayılan: kayıt yokken yazma KAPALI", (await readPatronCloudInboxEnabled()) === false);
    const liveElig = (): Promise<InboxEligibility> => inboxEligibility({ ...fourOk, inboxEnabled: () => readPatronCloudInboxEnabled() });
    const e0 = await liveElig();
    check("okuma açık + yazma kayıtsız → YAZMA_KAPALI", !e0.ok && e0.reason === "YAZMA_KAPALI", e0.ok ? "açık" : e0.reason);
    let ensureCalls = 0;
    const inboxDeps: InboxReconcileDeps = {
      eligibility: liveElig,
      ensureUser: async () => { ensureCalls++; return ensurePatronCloudUser(); },
      start: startCloudInbox,
      stop: stopCloudInbox,
    };
    const deps: ReconcileDeps = {
      eligibility: async () => ({ ok: true, baseUrl: openInbox.baseUrl, installationId, privateKey: openInbox.privateKey, intervalMinutes: 5 }),
      switch: { setEnabled: async () => 0, enabledCount: async () => 0, sleep: async () => undefined },
      start: () => undefined,
      stop: () => undefined,
      inbox: inboxDeps,
    };
    const usersBefore = await prisma.user.count({ where: { username: PATRON_CLOUD_USERNAME } });
    armNet();
    const rh1 = await reconcilePatronCloud("bekçi yazma kapalı", deps);
    __configureCloudInboxForTests({ eligibility: liveElig });
    const r0 = await runCloudInboxOnce();
    __configureCloudInboxForTests({ reset: true });
    disarmNet();
    check("uzlaştırma: okuma BASLADI ama gelen kutusu işi kurulmadı, zamanlayıcı yok", rh1 === "BASLADI" && !isCloudInboxRunning() && !__cloudInboxTimerArmedForTests(), rh1);
    check("kapalıyken teknik kullanıcı hazırlanmadı (ensure çağrısı 0)", ensureCalls === 0, `${ensureCalls}`);
    check("⭐ kapalıyken teknik kullanıcı satırı DOĞMADI", (await prisma.user.count({ where: { username: PATRON_CLOUD_USERNAME } })) === usersBefore, `${usersBefore}`);
    if (!preexistingTech) check("kapalıyken teknik kullanıcı kaydı yok", (await readPatronCloudUserId()) === null);
    check("⭐ kapalıyken tur: KAPALI · sıfır dış istek", r0.status === "KAPALI" && r0.reason === "YAZMA_KAPALI" && netCalls === 0, `${r0.status}/${r0.reason} istek=${netCalls}`);

    await prisma.systemSetting.create({ data: { key: SETTING_KEYS.PATRON_CLOUD_INBOX_ENABLED, value: true } });
    const rh2 = await reconcilePatronCloud("bekçi yazma açık", deps);
    techId = await readPatronCloudUserId();
    createdTech = !preexistingTech && techId !== null;
    check("açınca teknik kullanıcı hazır ve iş başladı", rh2 === "BASLADI" && techId !== null && isCloudInboxRunning(), `${rh2} id=${techId}`);
    if (!preexistingTech) check("açınca teknik kullanıcı DOĞDU (ilk koşum)", createdTech);
    await prisma.systemSetting.update({ where: { key: SETTING_KEYS.PATRON_CLOUD_INBOX_ENABLED }, data: { value: false } });
    await reconcilePatronCloud("bekçi yazma kapandı", deps);
    const techRow = techId ? await prisma.user.findUnique({ where: { id: techId }, select: { isActive: true, deletedAt: true } }) : null;
    check("kapatınca iş durdu, zamanlayıcı yok", !isCloudInboxRunning() && !__cloudInboxTimerArmedForTests());
    check("kapatınca teknik kullanıcı AKTİF kalır (girişsiz; yeniden açılış aynı kimliği kullanır)", techRow?.isActive === true && techRow.deletedAt === null);
    const again = await ensurePatronCloudUser();
    check("ikinci hazırlama yeni kullanıcı doğurmaz (aynı kimlik)", again.ok && again.userId === techId && !again.created);
    if (!techId) throw new Error("teknik kullanıcı yok — kalan bölümler koşamaz");
    const actor: string = techId;
    /** Ad kayıtta BÜYÜK HARFE normalize edilir ⇒ kart sayımı adla değil, teknik kullanıcının doğurduğu kart sayısıyla. */
    const telCards = (): Promise<number> => prisma.customer.count({ where: { createdById: actor } });

    // ── §i teknik kullanıcı ──────────────────────────────────────────────────
    console.log("\n§i teknik kullanıcı: giriş 401 · listede yok · izin yok · süperadmin değil");
    const knownPw = `Pb-${randomUUID()}`;
    const pin = String(100000 + (randomBytes(3).readUIntBE(0, 3) % 899999));
    const cardToken = randomBytes(16).toString("hex");
    await prisma.user.update({ where: { id: actor }, data: { passwordHash: await bcrypt.hash(knownPw, 10), quickPin: pin, cardToken } });
    await prisma.systemSetting.upsert({
      where: { key: SETTING_KEYS.AUTH_LOGIN_METHODS },
      update: { value: { enabled: ["list", "pin", "card"], primary: "list" } },
      create: { key: SETTING_KEYS.AUTH_LOGIN_METHODS, value: { enabled: ["list", "pin", "card"], primary: "list" } },
    });
    const status = async (f: () => Promise<unknown>): Promise<string> => {
      try { await f(); return "TOKEN"; } catch (e) { return String((e as { statusCode?: number }).statusCode ?? (e as Error).message); }
    };
    const sPw = await status(() => AuthService.login(PATRON_CLOUD_USERNAME, knownPw));
    const sPin = await status(() => AuthService.loginWithQuickPin(pin, { fieldDevice: { kind: "TABLET" } }));
    const sCard = await status(() => AuthService.loginWithCard(`TEKSU:${actor}:${cardToken}`, { fieldDevice: { kind: "TABLET" } }));
    check("⭐ parola bilinse de giriş 401", sPw === "401", sPw);
    check("⭐ PIN verilse de giriş 401", sPin === "401", sPin);
    check("⭐ kart verilse de giriş 401", sCard === "401", sCard);
    const sAdmin = await status(() => AuthService.login(admin.username, admin.password));
    check("kontrol: insan kullanıcının girişi aynı süreçte TOKEN", sAdmin === "TOKEN", sAdmin);
    await prisma.user.update({ where: { id: actor }, data: { passwordHash: await bcrypt.hash(randomBytes(48).toString("base64url"), 10), quickPin: null, cardToken: null } });
    const listed = (await PermissionManagementService.listUsers()).map((u) => u.id);
    check("kullanıcı listesinde görünmez; insan kullanıcı görünür", !listed.includes(actor) && listed.includes(admin.id));
    check("izin yok (etkin izin 0, izin satırı 0)", (await AuthService.getEffectivePermissions(actor)).length === 0 && (await prisma.userPermission.count({ where: { userId: actor } })) === 0);
    const techFull = await prisma.user.findUnique({ where: { id: actor }, select: { isSystemAccount: true, quickPin: true, cardToken: true } });
    check("süperadmin değil · PIN/kart yok", techFull?.isSystemAccount === false && techFull.quickPin === null && techFull.cardToken === null);
    check("kimlik kaydı ham ayar ucuna kapalı", isReservedSettingKey(PATRON_CLOUD_USER_SETTING_KEY));

    // ── fixture ──────────────────────────────────────────────────────────────
    const mkItem = async (tag: string, extra: Prisma.ItemUncheckedCreateInput | Record<string, never> = {}): Promise<string> => {
      const it = await prisma.item.create({ data: { code: `${STAMP}-${letters(6)}`, name: `${STAMP} ${tag} ${letters(6)}`, itemType: "FABRIC", unit: "MT", ...extra }, select: { id: true } });
      itemIds.push(it.id);
      return it.id;
    };
    const mkColor = async (tag: string, isActive = true): Promise<string> => {
      const c = await prisma.color.create({ data: { code: `${STAMP}-${letters(6)}`, name: `${STAMP} ${tag} ${letters(6)}`, isActive }, select: { id: true } });
      colorIds.push(c.id);
      return c.id;
    };
    const mkCustomer = async (tag: string): Promise<string> => {
      const r = await customerService.create({ name: `${STAMP} ${tag} ${letters(10)}`, isCustomerRole: true }, admin.id);
      const id = String((r.data as { id: string }).id);
      customerIds.add(id);
      return id;
    };
    const itemA = await mkItem("Kumaş A");
    const itemB = await mkItem("Kumaş B");
    const itemArch = await mkItem("Arşiv");
    await prisma.item.update({ where: { id: itemArch }, data: { lifecycleStatus: "ARCHIVED", isActive: false } });
    const itemLimited = await mkItem("Sınırlı");
    const colorA = await mkColor("Renk A");
    const colorPassive = await mkColor("Pasif Renk", false);
    const colorOther = await mkColor("Başka Renk");
    await prisma.itemAllowedColor.create({ data: { itemId: itemLimited, colorId: colorA } });
    const cust = await mkCustomer("Sipariş Carisi");
    const custOther = await mkCustomer("Öteki Cari");
    const branchOther = await prisma.customerBranch.create({ data: { customerId: custOther, name: `${STAMP} Şube` }, select: { id: true } });
    const termin = new Date(Date.now() + 10 * 86_400_000).toISOString().slice(0, 10);
    const orderWire = (over: Record<string, unknown> = {}, line: Record<string, unknown> = {}): Record<string, unknown> => ({
      cariKartId: cust, doviz: "TRY", termin,
      kalemler: [{ urunId: itemA, renkId: colorA, miktar: "12.5", en: "150", musteriUrunAdi: `${STAMP} müşteri ürün adı`, ...line }, { urunId: itemB, miktar: "40", birim: "KG" }],
      ...over,
    });

    // ── §a sıralı tekrar ─────────────────────────────────────────────────────
    console.log("\n§a aynı mesajId sıralı iki kez → tek kayıt, aynı makbuz");
    const mA = msg("SIPARIS", orderWire());
    const a1 = await processInboxMessage(mA, actor);
    const a2 = await processInboxMessage(mA, actor);
    if (a1?.varlikId) orderIds.add(a1.varlikId);
    check("ilk işleme ISLENDI + belge no", a1?.durum === "ISLENDI" && !!a1.varlikId && !!a1.belgeNo, JSON.stringify(a1));
    check("⭐ ikinci sonuç ilkinin makbuzu (aynı varlık + belge no)", canonical(a1) === canonical(a2), JSON.stringify(a2));
    check("⭐ tek sipariş · tek makbuz", (await ordersFor(mA.mesajId)) === 1 && (await receiptsFor(mA.mesajId)) === 1);
    const cardWire = (ad: string): Record<string, unknown> => ({ ad, roller: { musteri: true, tedarikci: false }, il: "İstanbul", ilce: "Esenyurt", ulke: "Türkiye", adres: `${STAMP} adres`, yetkili: "Ayşe Yılmaz", telefon: "0212 555 00 00", eposta: "d4@example.com" });
    const mC = msg("CARI", cardWire(`${STAMP} Telefon Cari ${letters(10)}`));
    const cardsC0 = await telCards();
    const c1 = await processInboxMessage(mC, actor);
    const c2 = await processInboxMessage(mC, actor);
    if (c1?.varlikId) customerIds.add(c1.varlikId);
    check("müşteri: ilk işleme ISLENDI + kod", c1?.durum === "ISLENDI" && !!c1.belgeNo, JSON.stringify(c1));
    check("⭐ müşteri: ikinci sonuç ilkinin makbuzu", canonical(c1) === canonical(c2), JSON.stringify(c2));
    check("⭐ müşteri: tek kart · tek makbuz", (await telCards()) === cardsC0 + 1 && (await receiptsFor(mC.mesajId)) === 1);
    const mCollide = { ...mA, govde: orderWire({ doviz: "USD" }) };
    const aX = await processInboxMessage(mCollide, actor);
    check("aynı mesajId FARKLI içerik → MESAJ_CAKISMASI, yeni kayıt yok", aX?.durum === "REDDEDILDI" && aX.kod === "MESAJ_CAKISMASI" && (await ordersFor(mA.mesajId)) === 1, `${aX?.kod}`);

    // ── §b eşzamanlı yarış ───────────────────────────────────────────────────
    console.log("\n§b aynı mesajId eşzamanlı ×5 (8036 dış bağlantıda tutulur) → tek kayıt");
    const race = async (m: ClaimedMessage): Promise<Array<InboxOutcome | null | string>> => {
      const pg = new Client({ connectionString: process.env.DATABASE_URL });
      await pg.connect();
      try {
        await pg.query("BEGIN");
        await pg.query("SELECT pg_advisory_xact_lock(8036, hashtext($1))", [m.mesajId]);
        const runs = Array.from({ length: 5 }, () => processInboxMessage(m, actor).catch((e: unknown) => `FIRLATTI: ${(e as Error).message}`));
        await sleep(1500);
        await pg.query("COMMIT");
        return await Promise.all(runs);
      } finally {
        await pg.end();
      }
    };
    const mB = msg("SIPARIS", orderWire());
    const rb = await race(mB);
    const okB = rb.filter((o): o is InboxOutcome => typeof o === "object" && o !== null);
    if (okB[0]?.varlikId) orderIds.add(okB[0].varlikId);
    check("⭐ beşi de kesin sonuç, hiçbiri fırlatmadı", okB.length === 5, rb.map((o) => (typeof o === "string" ? o : o?.durum ?? "null")).join(","));
    check("⭐ hepsi AYNI sipariş", new Set(okB.map((o) => o.varlikId)).size === 1 && okB.every((o) => o.durum === "ISLENDI"));
    check("⭐ tek sipariş · tek makbuz", (await ordersFor(mB.mesajId)) === 1 && (await receiptsFor(mB.mesajId)) === 1);
    const mBc = msg("CARI", cardWire(`${STAMP} Yarış Cari ${letters(10)}`));
    const cardsB0 = await telCards();
    const rbc = await race(mBc);
    const okBc = rbc.filter((o): o is InboxOutcome => typeof o === "object" && o !== null);
    if (okBc[0]?.varlikId) customerIds.add(okBc[0].varlikId);
    check("⭐ müşteri yarışı: beşi aynı kart, tek kart, tek makbuz", okBc.length === 5 && new Set(okBc.map((o) => o.varlikId)).size === 1 && okBc.every((o) => o.durum === "ISLENDI") &&
      (await telCards()) === cardsB0 + 1 && (await receiptsFor(mBc.mesajId)) === 1,
      rbc.map((o) => (typeof o === "string" ? o : `${o?.durum}/${o?.kod ?? ""}`)).join(","));

    // ── §c retler ────────────────────────────────────────────────────────────
    console.log("\n§c retler: makbuzlu, okunur Türkçe neden, kayıt doğmadan");
    const custPassive = await mkCustomer("Pasife Alınacak");
    const passiveWire = orderWire({ cariKartId: custPassive });
    await prisma.customer.update({ where: { id: custPassive }, data: { isActive: false } });
    const yesterday = new Date(Date.now() - 2 * 86_400_000).toISOString().slice(0, 10);
    const cases: Array<[string, Record<string, unknown>, string, RegExp]> = [
      ["bilinmeyen müşteri", orderWire({ cariKartId: randomUUID() }), "CARI_BULUNAMADI", /müşteri.*bulunamadı/i],
      ["telefon görürken fabrikada pasife alınmış müşteri", passiveWire, "IS_KURALI", /pasif/i],
      ["bilinmeyen ürün", orderWire({}, { urunId: randomUUID() }), "URUN_BULUNAMADI", /ürün.*bulunamadı/i],
      ["pasif (ARCHIVED) ürün", orderWire({}, { urunId: itemArch, renkId: undefined }), "IS_KURALI", /pasif|arşiv|kullanılamaz|emekli/i],
      ["bilinmeyen renk", orderWire({}, { renkId: randomUUID() }), "RENK_BULUNAMADI", /renk.*bulunamadı/i],
      ["pasif renk", orderWire({}, { renkId: colorPassive }), "IS_KURALI", /pasif renk/i],
      ["ürünün izinli renk listesi dışı", orderWire({}, { urunId: itemLimited, renkId: colorOther }), "IS_KURALI", /izinli renk/i],
      ["başka carinin şubesi", orderWire({ subeId: branchOther.id }), "IS_KURALI", /şube bu müşteriye ait değil/i],
      ["geçersiz birim", orderWire({}, { birim: "XX" }), "IS_KURALI", /geçersiz kalem birimi/i],
      ["miktar 0", orderWire({}, { miktar: "0" }), "IS_KURALI", /miktar pozitif/i],
      ["boş kalem listesi", orderWire({ kalemler: [] }), "GOVDE_GECERSIZ", /sözleşme/i],
      ["geçersiz döviz", orderWire({ doviz: "XYZ" }), "IS_KURALI", /para birimi/i],
      ["geçmiş termin", orderWire({ termin: yesterday }), "IS_KURALI", /termin/i],
      ["sözleşme dışı alan", orderWire({ fiyatListesi: "x" }), "GOVDE_GECERSIZ", /sözleşme/i],
    ];
    for (const [label, govde, code, re] of cases) {
      const m = msg("SIPARIS", govde);
      const o = await processInboxMessage(m, actor);
      const rec = await prisma.cloudInboxReceipt.findUnique({ where: { messageId: m.mesajId }, select: { outcome: true, entityId: true } });
      const ok = o?.durum === "REDDEDILDI" && o.kod === code && re.test(o.mesaj ?? "") && (await ordersFor(m.mesajId)) === 0 && rec?.outcome === "REDDEDILDI" && rec.entityId === null;
      check(`⭐ ${label} → ${code}`, ok, `${o?.kod}: ${o?.mesaj}`);
    }
    const taxNo = `9${String(Date.now()).slice(-9)}`;
    const mTax1 = msg("CARI", { ...cardWire(`${STAMP} Vergi Bir ${letters(10)}`), vergiNo: taxNo });
    const t1 = await processInboxMessage(mTax1, actor);
    if (t1?.varlikId) customerIds.add(t1.varlikId);
    const mTax2 = msg("CARI", { ...cardWire(`${STAMP} Vergi İki ${letters(10)}`), vergiNo: taxNo });
    const cardsT0 = await telCards();
    const t2 = await processInboxMessage(mTax2, actor);
    check("⭐ aynı vergi no ikinci kart → ret (panel mesajı), kart yok", t1?.durum === "ISLENDI" && t2?.durum === "REDDEDILDI" && /vergi numarası/i.test(t2.mesaj ?? "") &&
      (await telCards()) === cardsT0, `${t2?.kod}: ${t2?.mesaj}`);
    const mNoRole = msg("CARI", { ...cardWire(`${STAMP} Rolsüz ${letters(10)}`), roller: { musteri: false, tedarikci: false } });
    const tr = await processInboxMessage(mNoRole, actor);
    check("rolsüz kart → GOVDE_GECERSIZ", tr?.durum === "REDDEDILDI" && tr.kod === "GOVDE_GECERSIZ", `${tr?.kod}`);

    // ── §d benzer ad ─────────────────────────────────────────────────────────
    console.log("\n§d benzer ad → RET; eşik panelin uyarı yüzeyiyle aynı kod yolu");
    check("⭐ benzerlik fonksiyonu panel servisininkiyle AYNI (kopya eşik yok)", inboxCardWriter.findSimilarNames === customerService.findSimilarNames);
    // `config` korumalı üye: imza değil DEĞER karşılaştırılır, okuma tipsiz kalır.
    const panelConfig: unknown = Reflect.get(customerService, "config");
    check("⭐ telefon kart yazıcısının yapılandırması panelinkiyle birebir", canonical(INBOX_CUSTOMER_CONFIG) === canonical(panelConfig));
    const inputName = (mC.govde as { ad: string }).ad;
    const baseName = (await prisma.customer.findUniqueOrThrow({ where: { id: c1?.varlikId ?? "" }, select: { name: true } })).name;
    const near = `${inputName.slice(0, -1)}X`;
    const cardsD0 = await telCards();
    const panelSays = await customerService.findSimilarNames(near);
    const mNear = msg("CARI", cardWire(near));
    const dn = await processInboxMessage(mNear, actor);
    check("⭐ benzer ad → CARI_AD_MUKERRER 'Benzer müşteri var: <ad>', ikinci kart yok", dn?.durum === "REDDEDILDI" && dn.kod === "CARI_AD_MUKERRER" && (dn.mesaj ?? "").startsWith("Benzer müşteri var:") &&
      (dn.mesaj ?? "").includes(baseName) && (await telCards()) === cardsD0, dn?.mesaj ?? "");
    check("panel aynı girdide aynı adayı UYARI olarak gösterir", panelSays.some((s) => s.name === baseName), panelSays.map((s) => `${s.name}:${s.score}`).join(" | "));
    const mExact = msg("CARI", cardWire(inputName.toLowerCase()));
    const de = await processInboxMessage(mExact, actor);
    check("birebir aynı ad (harf büyüklüğü farkı) → ret", de?.durum === "REDDEDILDI" && de.kod === "CARI_AD_MUKERRER", `${de?.kod}`);
    // Kısa ad (katlanmış ≤ 8 harf → eşik 0.35): `TST-` + 4 harf.
    const shortA = `TST-${letters(4)}`;
    const rShort = await customerService.create({ name: shortA, isCustomerRole: true }, admin.id);
    customerIds.add(String((rShort.data as { id: string }).id));
    const shortB = `${shortA.slice(0, 6)}${letters(2)}`;
    const shortPanel = await customerService.findSimilarNames(shortB);
    const mShort = msg("CARI", cardWire(shortB));
    const ds = await processInboxMessage(mShort, actor);
    if (ds?.durum === "ISLENDI" && ds.varlikId) customerIds.add(ds.varlikId);
    const panelWarns = shortPanel.length > 0;
    check("⭐ kısa ad: telefon kararı = panel uyarısı (uyarı varsa ret, yoksa kart)", panelWarns ? ds?.durum === "REDDEDILDI" : ds?.durum === "ISLENDI",
      `${shortA} ↔ ${shortB}: panel ${panelWarns ? `UYARIR (${shortPanel.map((s) => s.score).join(",")}), kaydı ENGELLEMEZ` : "sessiz"} · telefon ${ds?.durum}`);
    const shortC = `${shortA.slice(0, 6)}${letters(2)}`;
    const shortCWarn = await customerService.findSimilarNames(shortC);
    const rPanelShort = await customerService.create({ name: shortC, isCustomerRole: true }, admin.id).catch((e: unknown) => e);
    const panelShortId = (rPanelShort as { data?: { id?: string } }).data?.id;
    if (panelShortId) customerIds.add(panelShortId);
    check("kontrol: panel, uyarı gösterdiği benzer kısa adda kartı AÇAR (uyarı engel değil)", shortCWarn.length > 0 && !!panelShortId, `${shortC}: uyarı ${shortCWarn.length}`);

    // ── §e karşılaştırma ─────────────────────────────────────────────────────
    console.log("\n§e KARŞILAŞTIRMA panel ↔ telefon (beyanlı farklar: kimlik, numara, zaman, clientToken, Oluşturan, kaynak izi)");
    const panelBody = {
      customerId: cust, currency: "TRY", deadline: new Date(termin).toISOString(),
      lines: [{ itemId: itemA, colorId: colorA, quantity: 12.5, width: 150, customerItemName: `${STAMP} müşteri ürün adı` }, { itemId: itemB, quantity: 40, unit: "KG" }],
      clientToken: randomUUID(),
    };
    const pRes = await orderService.create({ ...panelBody, lines: panelBody.lines.map((l) => ({ ...l })) }, admin.id);
    const pId = String((pRes.data as { id: string }).id);
    orderIds.add(pId);
    const mE = msg("SIPARIS", orderWire());
    const eo = await processInboxMessage(mE, actor);
    const tId = eo?.varlikId ?? "";
    if (tId) orderIds.add(tId);
    check("iki yol da sipariş doğurdu", !!pId && eo?.durum === "ISLENDI", `${eo?.durum}: ${eo?.mesaj}`);
    const orderFields = scalarFields("Order");
    const P = (await prisma.order.findUnique({ where: { id: pId } })) as unknown as Record<string, unknown>;
    const T = (await prisma.order.findUnique({ where: { id: tId } })) as unknown as Record<string, unknown> | null;
    const orderDeclared = new Set(["id", "orderNumber", "clientToken", "createdAt", "updatedAt", "createdById", "updatedById"]);
    const od = T ? diffRows(P, T, orderFields, orderDeclared, new Set(["orderDate"])) : ["telefon siparişi yok"];
    check("⭐ sipariş başlığı alan alan eşit", od.length === 0, od.join(" | ") || `${orderFields.length} alan`);
    check("numara: aynı seri kuralı (ön ek + hane)", !!T && prefixOf(String(P.orderNumber)) === prefixOf(String(T.orderNumber)) && String(P.orderNumber).length === String(T.orderNumber).length,
      `${String(P.orderNumber)} / ${String(T?.orderNumber)}`);
    check("Oluşturan: panel boş · telefon teknik kullanıcı (beyanlı)", P.createdById === null && T?.createdById === actor && T?.updatedById === actor, `${String(P.createdById)} / ${String(T?.createdById)}`);
    const lineFields = scalarFields("OrderLine");
    const pl = await prisma.orderLine.findMany({ where: { orderId: pId }, orderBy: { itemId: "asc" } });
    const tl = await prisma.orderLine.findMany({ where: { orderId: tId }, orderBy: { itemId: "asc" } });
    const lineDeclared = new Set(["id", "orderId", "createdAt", "updatedAt", "createdById", "updatedById"]);
    const ld = pl.length === tl.length ? pl.flatMap((l, i) => diffRows(l as unknown as Record<string, unknown>, tl[i] as unknown as Record<string, unknown>, lineFields, lineDeclared).map((d) => `#${i + 1} ${d}`)) : [`kalem sayısı ${pl.length} ≠ ${tl.length}`];
    check("⭐ kalemler alan alan eşit (birim, miktar, en, renk, müşteri adı, sevk/iptal sayaçları)", ld.length === 0, ld.join(" | ") || `${pl.length} kalem × ${lineFields.length} alan`);
    const pa = await lastAudit("ORDER", pId);
    const ta = await lastAudit("ORDER", tId);
    const auditDrop = ["clientToken", "orderNumber", ...SOURCE_KEYS];
    check("⭐ sipariş audit yükü eşit (kaynak izi + clientToken + numara hariç)", !!pa && !!ta && canonical(omit(pa.newData, auditDrop)) === canonical(omit(ta.newData, auditDrop)),
      `${canonical(omit(pa?.newData, auditDrop))} ≠ ${canonical(omit(ta?.newData, auditDrop))}`);
    check("audit: telefon kaydı kaynak izi + teknik kullanıcı taşır", ta?.userId === actor && (ta.newData as Record<string, unknown>).kaynak === "PATRON_BULUTU" && (ta.newData as Record<string, unknown>).mesajId === mE.mesajId);
    check("audit: makbuz satırı da yazıldı", !!(await lastAudit("CLOUD_INBOX_RECEIPT", (await prisma.cloudInboxReceipt.findUniqueOrThrow({ where: { messageId: mE.mesajId } })).id)));
    const aliasCount = async (oid: string): Promise<number> => {
      const o = await prisma.order.findUnique({ where: { id: oid }, select: { customerId: true } });
      return o ? prisma.customerItemAlias.count({ where: { customerId: o.customerId, itemId: itemA } }) : -1;
    };
    check("müşteriye-özel ürün adı terfisi iki yolda aynı (tek alias)", (await aliasCount(pId)) === 1 && (await aliasCount(tId)) === 1);
    // Terminsiz sipariş: varsayılan termin iki yolda da "oluşturma anı + N gün" (süreç saat diliminden bağımsız).
    const pNoDl = await orderService.create({ ...panelBody, deadline: undefined, clientToken: randomUUID(), lines: panelBody.lines.map((l) => ({ ...l })) }, admin.id);
    const pNoDlId = String((pNoDl.data as { id: string }).id);
    orderIds.add(pNoDlId);
    const wireNoDl = orderWire();
    delete wireNoDl.termin;
    const eNoDl = await processInboxMessage(msg("SIPARIS", wireNoDl), actor);
    if (eNoDl?.varlikId) orderIds.add(eNoDl.varlikId);
    const span = async (oid: string): Promise<number> => {
      const o = await prisma.order.findUnique({ where: { id: oid }, select: { deadline: true, createdAt: true } });
      return o?.deadline ? o.deadline.getTime() - o.createdAt.getTime() : NaN;
    };
    const [pSpan, tSpan] = [await span(pNoDlId), await span(eNoDl?.varlikId ?? "")];
    check("⭐ terminsiz: varsayılan termin iki yolda aynı ofset (±5 sn)", eNoDl?.durum === "ISLENDI" && Math.abs(pSpan - tSpan) < 5_000 && pSpan > 0, `${pSpan} / ${tSpan} ms`);

    // Müşteri karşılaştırması — telefon önce (benzer ad reddi), adlar birbirine benzemez.
    const telName = `${STAMP} Karşı Telefon ${letters(12)}`;
    const panName = `${STAMP} Karşı Panel ${letters(12)}`;
    const mCe = msg("CARI", cardWire(telName));
    const ce = await processInboxMessage(mCe, actor);
    const tcId = ce?.varlikId ?? "";
    if (tcId) customerIds.add(tcId);
    const pcRes = await customerService.create({ name: panName, isCustomerRole: true, isSupplierRole: false, city: "İstanbul", district: "Esenyurt", country: "Türkiye", address: `${STAMP} adres`, contactName: "Ayşe Yılmaz", contactPhone: "0212 555 00 00", email: "d4@example.com" }, admin.id);
    const pcId = String((pcRes.data as { id: string }).id);
    customerIds.add(pcId);
    check("iki yol da kart doğurdu", ce?.durum === "ISLENDI" && !!pcId, `${ce?.durum}: ${ce?.mesaj}`);
    const PC = (await prisma.customer.findUnique({ where: { id: pcId } })) as unknown as Record<string, unknown>;
    const TC = (await prisma.customer.findUnique({ where: { id: tcId } })) as unknown as Record<string, unknown> | null;
    const custDeclared = new Set(["id", "code", "name", "nameFold", "createdAt", "updatedAt", "createdById", "updatedById"]);
    const cd = TC ? diffRows(PC, TC, scalarFields("Customer"), custDeclared) : ["telefon kartı yok"];
    check("⭐ müşteri kartı alan alan eşit", cd.length === 0, cd.join(" | ") || `${scalarFields("Customer").length} alan`);
    check("kod: aynı seri kuralı", !!TC && prefixOf(String(PC.code)) === prefixOf(String(TC.code)), `${String(PC.code)} / ${String(TC?.code)}`);
    check("Oluşturan: panel insan · telefon teknik kullanıcı (beyanlı)", PC.createdById === admin.id && TC?.createdById === actor);
    const accOf = (id: string): Promise<number> => prisma.cariAccount.count({ where: { customerId: id } });
    check("finans KAPALI: iki yolda da cari hesap doğmaz", (await accOf(pcId)) === 0 && (await accOf(tcId)) === 0, `${await accOf(pcId)} / ${await accOf(tcId)}`);
    await prisma.systemSetting.upsert({ where: { key: SETTING_KEYS.FINANCE_ENABLED }, update: { value: true }, create: { key: SETTING_KEYS.FINANCE_ENABLED, value: true } });
    const ceF = await processInboxMessage(msg("CARI", cardWire(`${STAMP} Finans Telefon ${letters(12)}`)), actor);
    if (ceF?.varlikId) customerIds.add(ceF.varlikId);
    const pcF = String(((await customerService.create({ name: `${STAMP} Finans Panel ${letters(12)}`, isCustomerRole: true }, admin.id)).data as { id: string }).id);
    customerIds.add(pcF);
    await prisma.systemSetting.update({ where: { key: SETTING_KEYS.FINANCE_ENABLED }, data: { value: false } });
    check("⭐ finans AÇIK: iki yolda da kartla aynı tx'te TEK cari hesap doğar", ceF?.durum === "ISLENDI" && (await accOf(ceF.varlikId ?? "")) === 1 && (await accOf(pcF)) === 1, `${await accOf(ceF?.varlikId ?? "")} / ${await accOf(pcF)}`);
    const pca = await lastAudit("CUSTOMER", pcId);
    const tca = await lastAudit("CUSTOMER", tcId);
    const cDrop = ["code", "name", "nameFold", ...SOURCE_KEYS];
    check("⭐ müşteri audit yükü eşit (kod/ad/kaynak izi hariç)", !!pca && !!tca && canonical(omit(pca.newData, cDrop)) === canonical(omit(tca.newData, cDrop)),
      `${canonical(omit(pca?.newData, cDrop))} ≠ ${canonical(omit(tca?.newData, cDrop))}`);

    // ── §f fiyat ─────────────────────────────────────────────────────────────
    console.log("\n§f birim fiyat telefondan alınmaz; fiyatsız sipariş panelde normal");
    const mF = msg("SIPARIS", orderWire({}, { birimFiyat: "123.45" }));
    const fo = await processInboxMessage(mF, actor);
    if (fo?.varlikId) orderIds.add(fo.varlikId);
    const fLines = fo?.varlikId ? await prisma.orderLine.findMany({ where: { orderId: fo.varlikId }, select: { unitPrice: true } }) : [];
    const fOrder = fo?.varlikId ? await prisma.order.findUnique({ where: { id: fo.varlikId }, select: { totalAmount: true } }) : null;
    check("⭐ birim fiyat yok sayıldı: kalemde fiyat boş, toplam boş", fo?.durum === "ISLENDI" && fLines.length === 2 && fLines.every((l) => l.unitPrice === null) && fOrder?.totalAmount === null);
    check("makbuz mesajı fiyatın yok sayıldığını söyler", (fo?.mesaj ?? "").includes(PRICE_IGNORED_NOTE), fo?.mesaj ?? "");
    const fa = fo?.varlikId ? await lastAudit("ORDER", fo.varlikId) : null;
    check("audit: birimFiyatYokSayildi işareti", (fa?.newData as Record<string, unknown> | undefined)?.birimFiyatYokSayildi === true);
    const token = await (async () => {
      const r = await fetch(`${base}/api/auth/login`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ username: admin.username, password: admin.password }) });
      return String(((await r.json()) as { data?: { token?: string } }).data?.token ?? "");
    })();
    const api = (p: string): Promise<Response> => fetch(`${base}${p}`, { headers: { Authorization: `Bearer ${token}` } });
    const det = await api(`/api/orders/${fo?.varlikId ?? ""}`);
    const lst = await api(`/api/orders?search=${encodeURIComponent(String(fo?.belgeNo ?? ""))}`);
    check("⭐ panel detay + liste ucu fiyatsız siparişte 200", det.status === 200 && lst.status === 200, `${det.status}/${lst.status}`);

    // ── §g atomiklik ─────────────────────────────────────────────────────────
    // Makbuz bozucu: hesap adında NUL — sipariş tx'te yazılır (ad siparişe girmez), makbuz satırı PG'de düşer.
    console.log("\n§g atomiklik: sipariş yazıldıktan sonra makbuz düşer → hiçbir şey kalmaz, numara boşluğu yok");
    const g1 = await processInboxMessage(msg("SIPARIS", orderWire()), actor);
    if (g1?.varlikId) orderIds.add(g1.varlikId);
    const mBad = msg("SIPARIS", orderWire(), { hesapAdi: `${STAMP} \u0000 bozuk` });
    const gx = await processInboxMessage(mBad, actor);
    const g2 = await processInboxMessage(msg("SIPARIS", orderWire()), actor);
    if (g2?.varlikId) orderIds.add(g2.varlikId);
    check("⭐ makbuz yazılamadı → belirsiz (null), sipariş YOK, makbuz YOK", gx === null && (await ordersFor(mBad.mesajId)) === 0 && (await receiptsFor(mBad.mesajId)) === 0, JSON.stringify(gx));
    check("⭐ geri alınan tx kalem bırakmadı", (await prisma.orderLine.count({ where: { order: { clientToken: mBad.mesajId } } })) === 0);
    check("⭐ numara serisinde boşluk yok (önceki N → sonraki N+1)", !!g1?.belgeNo && !!g2?.belgeNo && seqOf(g2.belgeNo) === seqOf(g1.belgeNo) + 1, `${g1?.belgeNo} → ${g2?.belgeNo}`);

    // ── §l yazar denetimi ────────────────────────────────────────────────────
    console.log("\n§l yazar denetimi: yetkisi fabrikada kalkan yazarın kaydı makbuzlu RET, kayıt doğmaz");
    const revoked = await mkAuthor("geri-alinan", AUTHOR_CODES);
    await prisma.userPermission.deleteMany({ where: { userId: revoked, permission: { code: "patron:giris" } } });
    const passiveAuthor = await mkAuthor("pasif", AUTHOR_CODES, { isActive: false });
    const noOrderWrite = await mkAuthor("siparissiz", ["patron:giris", "customer:write"]);
    // Y8: parolası yeni kuralla belirlenmemiş yazar buluta gitmez → yazısı da işlenmez.
    const legacyPwAuthor = await mkAuthor("eski-parola", AUTHOR_CODES, { passwordPolicyVersion: 0 });
    const authorCases: Array<[string, string, "SIPARIS" | "CARI"]> = [
      ["bilinmeyen yazar kimliği", randomUUID(), "SIPARIS"],
      ["pasif yazar", passiveAuthor, "SIPARIS"],
      ["parolası yeni kuralla belirlenmemiş yazar (Y8)", legacyPwAuthor, "SIPARIS"],
      ["`patron:giris` geri alınmış yazar (sipariş)", revoked, "SIPARIS"],
      ["`patron:giris` geri alınmış yazar (müşteri)", revoked, "CARI"],
      ["`order:write` olmayan yazar → sipariş", noOrderWrite, "SIPARIS"],
      ["teknik kullanıcı yazar", actor, "SIPARIS"],
      ["teknik kullanıcı yazar (müşteri)", actor, "CARI"],
    ];
    for (const [label, hesapId, tur] of authorCases) {
      const m = msg(tur, tur === "SIPARIS" ? orderWire() : cardWire(`${STAMP} Yazar Cari ${letters(10)}`), { hesapId });
      const cards0 = await telCards();
      const o = await processInboxMessage(m, actor);
      const rec = await prisma.cloudInboxReceipt.findUnique({ where: { messageId: m.mesajId }, select: { outcome: true, entityId: true } });
      const none = tur === "SIPARIS" ? (await ordersFor(m.mesajId)) === 0 : (await telCards()) === cards0;
      if (o?.varlikId) (tur === "SIPARIS" ? orderIds : customerIds).add(o.varlikId);
      check(`⭐ ${label} → RET IS_KURALI "Yetkiniz fabrikada kaldırılmış", kayıt yok`,
        o?.durum === "REDDEDILDI" && o.kod === "IS_KURALI" && o.mesaj === AUTHOR_REVOKED_MESSAGE && none && rec?.outcome === "REDDEDILDI" && rec.entityId === null, `${o?.durum}/${o?.kod}: ${o?.mesaj}`);
    }
    const lc = await processInboxMessage(msg("CARI", cardWire(`${STAMP} Siparişsiz Yazar ${letters(10)}`), { hesapId: noOrderWrite }), actor);
    if (lc?.varlikId) customerIds.add(lc.varlikId);
    check("`order:write` olmayan ama `customer:write` taşıyan yazarın müşteri kartı İŞLENİR", lc?.durum === "ISLENDI" && !!lc.varlikId, `${lc?.durum}: ${lc?.mesaj}`);
    const mRetry = msg("SIPARIS", orderWire(), { hesapId: revoked });
    const lr1 = await processInboxMessage(mRetry, actor);
    await prisma.userPermission.create({ data: { userId: revoked, permissionId: (await prisma.permission.findUniqueOrThrow({ where: { code: "patron:giris" }, select: { id: true } })).id } });
    const lr2 = await processInboxMessage(mRetry, actor);
    check("ret makbuzu kalıcı: izin sonradan geri verilse de aynı mesajId yeniden işlenmez", lr1?.durum === "REDDEDILDI" && canonical(lr1) === canonical(lr2) && (await ordersFor(mRetry.mesajId)) === 0, `${lr2?.durum}`);
    const lok = await processInboxMessage(msg("SIPARIS", orderWire(), { hesapId: revoked }), actor);
    if (lok?.varlikId) orderIds.add(lok.varlikId);
    check("izin geri verilince YENİ mesaj işlenir (denetim güncel izni okur)", lok?.durum === "ISLENDI", `${lok?.durum}: ${lok?.mesaj}`);

    // ── §j iş: tür, sınırlı tekrar, yeniden başlatma ─────────────────────────
    console.log("\n§j iş turu: desteklenmeyen tür · 3 denemede makbuzlu ret · yeniden başlatma ve kayıp bildirim zararsız");
    let queue: unknown[] = [];
    const results: Array<{ body: unknown; schemaOk: boolean }> = [];
    let dropResults = false;
    const fakeCloud: CloudTransport = (req) => {
      if (req.url.endsWith(SYNC_PATHS.INBOX_CLAIM)) return Promise.resolve({ status: 200, body: Buffer.from(JSON.stringify({ v: ENVELOPE_VERSION, kayitlar: queue })) });
      const body = JSON.parse(req.body.toString("utf8")) as { sonuclar: InboxOutcome[] };
      results.push({ body, schemaOk: InboxResultRequestSchema.safeParse(body).success });
      if (dropResults) return Promise.resolve({ status: 503, body: Buffer.from("{}") });
      return Promise.resolve({ status: 200, body: Buffer.from(JSON.stringify({ v: ENVELOPE_VERSION, kabul: body.sonuclar.map((s) => s.mesajId), ret: [] })) });
    };
    const ghostActor = randomUUID();
    let jobActor: string = actor;
    __configureCloudInboxForTests({ transport: fakeCloud, eligibility: async () => openInbox, actor: async () => jobActor });
    const asWire = (m: ClaimedMessage): Record<string, unknown> => ({ ...m });
    const mU = msg("TAHSILAT", { tutar: "5" });
    queue = [asWire(mU)];
    const ju = await runCloudInboxOnce();
    const uOut = ju.outcomes[0];
    check("⭐ desteklenmeyen tür → REDDEDILDI buluta bildirildi, makbuz yazılmadı", ju.status === "BASARILI" && uOut?.durum === "REDDEDILDI" && uOut.mesaj === UNSUPPORTED_KIND_MESSAGE && (await receiptsFor(mU.mesajId)) === 0 &&
      results.at(-1)?.schemaOk === true, `${ju.status} ${uOut?.kod}`);
    const mUnc = msg("SIPARIS", orderWire());
    queue = [asWire(mUnc)];
    jobActor = ghostActor; // var olmayan aktör → createdById FK hatası → belirsiz
    const tours: string[] = [];
    for (let i = 0; i < MAX_UNCERTAIN_ATTEMPTS; i++) {
      const r = await runCloudInboxOnce();
      tours.push(`${r.uncertain}b/${r.outcomes.length}k`);
    }
    const last = results.at(-1)?.body as { sonuclar?: InboxOutcome[] } | undefined;
    const lastOut = last?.sonuclar?.find((s) => s.mesajId === mUnc.mesajId);
    check("⭐ ilk iki tur belirsiz, üçüncüde makbuzlu ret 'işlenemedi'", tours.join(",") === "1b/0k,1b/0k,0b/1k" && lastOut?.durum === "REDDEDILDI" && lastOut.mesaj === UNPROCESSABLE_MESSAGE, tours.join(","));
    check("işlenemeyen mesaj sipariş bırakmadı, tek makbuz (REDDEDILDI)", (await ordersFor(mUnc.mesajId)) === 0 && (await receiptsFor(mUnc.mesajId)) === 1);
    jobActor = actor;
    __configureCloudInboxForTests({ reset: true });
    __configureCloudInboxForTests({ transport: fakeCloud, eligibility: async () => openInbox, actor: async () => jobActor });
    const jr = await runCloudInboxOnce();
    check("⭐ yeniden başlatma (sayaç sıfır) + aynı mesaj yeniden gelir → makbuzdaki ret, yeni sipariş YOK", jr.outcomes[0]?.durum === "REDDEDILDI" && (await ordersFor(mUnc.mesajId)) === 0, `${jr.outcomes[0]?.durum}`);
    const mLost = msg("SIPARIS", orderWire());
    queue = [asWire(mLost)];
    dropResults = true;
    const jl1 = await runCloudInboxOnce();
    dropResults = false;
    __configureCloudInboxForTests({ reset: true });
    __configureCloudInboxForTests({ transport: fakeCloud, eligibility: async () => openInbox, actor: async () => jobActor });
    const jl2 = await runCloudInboxOnce();
    if (jl2.outcomes[0]?.varlikId) orderIds.add(jl2.outcomes[0].varlikId);
    check("⭐ bildirim kaybolur + yeniden başlatma → bulut yeniden verir, AYNI sipariş, tek kayıt", jl1.status === "BASARISIZ" && jl2.outcomes[0]?.durum === "ISLENDI" &&
      jl2.outcomes[0].varlikId === jl1.outcomes[0]?.varlikId && (await ordersFor(mLost.mesajId)) === 1, `${jl1.status} → ${jl2.outcomes[0]?.durum}`);
    check("gönderilen her sonuç gövdesi InboxResultRequestSchema'ya uyar", results.length > 0 && results.every((r) => r.schemaOk), `${results.length}`);

    // ── §k hata yalıtımı ─────────────────────────────────────────────────────
    console.log("\n§k iş hatası istek yolunu etkilemez");
    __configureCloudInboxForTests({ transport: () => Promise.reject(new Error("ECONNREFUSED")), eligibility: async () => openInbox, actor: async () => actor });
    const [jk, hk, ak] = await Promise.all([runCloudInboxOnce(), fetch(`${base}/health`), api("/api/orders?limit=1")]);
    check("⭐ bulut erişilemez: tur fırlatmaz (BASARISIZ) · aynı anda /health ve /api 200", jk.status === "BASARISIZ" && hk.status === 200 && ak.status === 200, `${jk.status}/${jk.reason} · ${hk.status} · ${ak.status}`);
    __configureCloudInboxForTests({ eligibility: async () => { throw new Error("ön koşul patladı"); } });
    const jk2 = await runCloudInboxOnce();
    check("ön koşul fırlatsa da tur fırlatmaz", jk2.status === "BASARISIZ" && jk2.reason === "PROGRAM_HATASI", `${jk2.status}/${jk2.reason}`);
  } finally {
    disarmNet();
    stopCloudInbox();
    __configureCloudInboxForTests({ reset: true });
    await temizlik(createdTech ? techId : null);
    for (const s of settingsBefore) await prisma.systemSetting.update({ where: { key: s.key }, data: { value: s.value as Prisma.InputJsonValue } }).catch(() => undefined);
    const keep = new Set(settingsBefore.map((s) => s.key));
    for (const k of [SETTING_KEYS.PATRON_CLOUD_INBOX_ENABLED, SETTING_KEYS.AUTH_LOGIN_METHODS, SETTING_KEYS.FINANCE_ENABLED]) if (!keep.has(k)) await prisma.systemSetting.deleteMany({ where: { key: k } });
    await new Promise<void>((r) => { server.closeAllConnections(); server.close(() => r()); });
    rmSync(dir, { recursive: true, force: true });
  }
}

/** FK sırası: makbuz → kalem → sipariş → alias → cari (hesap + şube) → renk izni → ürün/renk → teknik kullanıcı kaydı → yazarlar. */
async function temizlik(createdTechId: string | null): Promise<void> {
  const receipts = await prisma.cloudInboxReceipt.findMany({ where: { messageId: { in: messageIds } }, select: { entityId: true, kind: true } });
  for (const r of receipts) if (r.entityId) (r.kind === "SIPARIS" ? orderIds : customerIds).add(r.entityId);
  const byToken = await prisma.order.findMany({ where: { clientToken: { in: messageIds } }, select: { id: true } });
  for (const o of byToken) orderIds.add(o.id);
  await prisma.cloudInboxReceipt.deleteMany({ where: { messageId: { in: messageIds } } });
  const ords = [...orderIds];
  await prisma.orderLine.deleteMany({ where: { orderId: { in: ords } } });
  await prisma.order.deleteMany({ where: { id: { in: ords } } });
  const custs = [...customerIds];
  await prisma.customerItemAlias.deleteMany({ where: { customerId: { in: custs } } });
  await prisma.customerColorAlias.deleteMany({ where: { customerId: { in: custs } } });
  await cleanupTestCustomers(custs);
  await prisma.itemAllowedColor.deleteMany({ where: { itemId: { in: itemIds } } });
  await prisma.item.deleteMany({ where: { id: { in: itemIds } } });
  await prisma.color.deleteMany({ where: { id: { in: colorIds } } });
  if (createdTechId) {
    await prisma.systemSetting.deleteMany({ where: { key: PATRON_CLOUD_USER_SETTING_KEY } });
    await prisma.user.update({ where: { id: createdTechId }, data: { username: `TEST-pb-${createdTechId.slice(0, 8)}`, isActive: false, deletedAt: new Date() } });
  }
  await prisma.userPermission.deleteMany({ where: { userId: { in: authorUserIds } } });
  for (const id of authorUserIds) await prisma.user.update({ where: { id }, data: { isActive: false, deletedAt: new Date() } }).catch(() => undefined);
}

main()
  .catch((e: unknown) => { fail++; console.log(`  ✗ FAIL: beklenmeyen hata — ${e instanceof Error ? e.stack ?? e.message : String(e)}`); })
  .finally(() => {
    console.log(`\n=== Sonuç: ${pass} geçti, ${fail} başarısız ===\n`);
    process.exit(fail > 0 ? 1 : 0);
  });
