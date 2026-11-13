// =============================================================================
// BEKÇİ — PATRON BULUTU KULLANICI LİSTESİ (üyelik = Electron şifresi; PLAN-uyelik-electron-sifresi F1)
// =============================================================================
// ÖLÇTÜĞÜ:
//  §1 izin: `patron:giris` katalogda (ADMIN/web) · "Admin (Tam Yetki)" çözümünde YOK · `*` ve `patron:*` jokeri
//     giriş saymaz · rol kapsamı muafı + ekransız muafı gerekçeli.
//  §2 türetme tablosu: her bulut izni beklenen fabrika izinlerinden doğar; giriş yoksa boş; finans türetilmez;
//     her kaynak kod katalogda; her çıktı tel desenine uyar.
//  §3 dışa aktarım (gerçek DB, kendi fixture'ı): giriş izinli aktif kullanıcı GİDER; pasif · silinmiş · izinsiz ·
//     süresi geçmiş izin · henüz başlamamış izin · teknik kullanıcı GİTMEZ; süperadmin satırı yüklemde düşer
//     (sorgu süzgeci ayrıca yapısal ölçülür); sıra `id`, özet yeniden hesaplanabilir.
//  §4 hijyen: select anahtar kümesi BİREBİR · fixture'ın PIN/kart/TOTP/oturum sayacı ne anahtar ne değer olarak
//     tel kaydında yok · katı şema fazladan alanı reddeder · kuru koşum aracı parola özeti ve küme özeti basmaz.
//  §5 fabrika işi (F2) kapatma düğmesi: ön koşul kapalıyken tur KAPALI, taşıma 0, küme kurulmaz; uzlaştırma kapalı
//     dalda işi başlatmaz, açık dalda başlatır; başlamamış işte zamanlayıcı yok.
//  §6 küme aynıysa gönderilmez; izin geri alınınca sonraki turda gider (kullanıcı kümede yok); değişmeyen küme
//     tam 10 dk dolunca yeniden gider.
//  §7 eski bulut 404 → tek satır log + 60 dk geri çekilme, tekrar yok; ağ/küme hatası fırlatmaz, log hata metni
//     taşımaz; 5xx aralığın katıyla geri çekilir.
//  §8 giden gövde `/v1/kullanicilar`, imzalı, katı şemaya uyar, özet tutar, sır yok; log yalnız sayı.
//
// DB: oturumun `_test` veritabanı (koşucu kapısı). Fixture `TEST-PBK` damgalı; kullanıcılar sert silinmez, sonda
// izinleri silinir, PIN/kart boşaltılır, pasif + silinmiş işaretlenir. Teknik kullanıcı kaydı yoksa bekçi kendi
// fixture'ını o kayda yazar ve sonda kaydı siler (vardıysa dokunmaz).
//
// NEGATİF SONDA (B, 2026-11-13, bu commit; o an 47 kontrol, dördü de kırmızı verdi, geri alındı → 47/0; bugün 48):
//   · `isCloudUserCandidate`ten `!row.isSystemAccount` çıkarıldı → §3 süperadmin yüklemi ✗ (46/1)
//   · `cloudUserCandidateWhere`ten `isSystemAccount: false` çıkarıldı → §3 sorgu süzgeci ✗ (46/1)
//   · `CLOUD_USER_SELECT`e `quickPin: true` eklendi → §4 select kümesi ✗ (46/1)
//   · `hasPatronLogin` `matchesPermission`e çevrildi (joker geçer) → §1 joker ✗ ×2 (45/2)
// NEGATİF SONDA F2 (B, 2026-11-13, 68 kontrol; dördü de kırmızı verdi, geri alındı → 68/0):
//   · uzlaştırmanın KAPALI dalında `users.start()` → §5 ✗ (67/1)
//   · turdan ön koşul sorusu kaldırıldı → §5 kapalıyken küme kuruldu ✗ (67/1)
//   · değişim tespiti kaldırıldı (yalnız süre) → §6 ✗ ×2 (66/2)
//   · 404 ayrımı kaldırıldı → §7 eski bulut ✗ (67/1)
// =============================================================================
import { createHash, randomBytes, randomUUID } from "node:crypto";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import * as bcrypt from "bcryptjs";
import prisma, { pool } from "../src/lib/prisma";
import { PERMISSION_CATALOG } from "../src/constants/permission-catalog";
import { ROLE_COVERAGE_EXEMPT, ROLE_TEMPLATE_CATALOG, resolveRoleTemplateCodes } from "../src/constants/role-template-catalog";
import { SCREENLESS_PERMISSIONS } from "../src/constants/screen-catalog";
import { reconcilePermissionCatalog } from "../src/jobs/permission-catalog.job";
import { PATRON_CLOUD_USER_SETTING_KEY } from "../src/constants/reserved-settings";
import { CLOUD_PERMISSION_CODES, CLOUD_PERMISSION_SOURCES, deriveCloudPermissions, hasPatronLogin } from "../src/cloud-sync/user-permission-map";
import {
  CLOUD_USER_SELECT,
  cloudUserCandidateWhere,
  cloudUsersDigest,
  collectCloudUsers,
  isCloudUserCandidate,
  type CloudUserRow,
} from "../src/cloud-sync/users-export";
import { CLOUD_PERMISSION_PATTERN, CloudUserSchema, SYNC_PATHS, UsersPushRequestSchema } from "../src/cloud-sync/wire";
import type { CloudEligibility } from "../src/cloud-sync/eligibility";
import type { CloudHttpRequest, CloudTransport } from "../src/cloud-sync/cloud-client";
import { generateKeyFile, loadKeyFile } from "../src/lib/cloud-signing/key-file";
import { reconcilePatronCloud, type ReconcileDeps } from "../src/jobs/patron-cloud.jobs";
import {
  __cloudUsersTimerArmedForTests,
  __configureCloudUsersForTests,
  isCloudUsersRunning,
  runCloudUsersOnce,
  startCloudUsers,
  stopCloudUsers,
  tickCloudUsers,
  USERS_OLD_CLOUD_BACKOFF_MS,
  USERS_RESEND_MS,
  USERS_TICK_MS,
} from "../src/jobs/cloud-users.job";

let pass = 0, fail = 0;
function check(l: string, ok: boolean, x = ""): void {
  if (ok) { pass++; console.log(`  ✓ ${l}${x ? ` — ${x}` : ""}`); }
  else { fail++; console.log(`  ✗ FAIL: ${l}${x ? ` — ${x}` : ""}`); }
}

const STAMP = "TEST-PBK";
const DAY = 86_400_000;
const createdUsers: string[] = [];
const secrets: string[] = [];

interface Fixture {
  readonly ok: string; readonly passive: string; readonly deleted: string; readonly noPerm: string;
  readonly expired: string; readonly future: string; readonly tech: string; readonly okHash: string;
}

function sameSet(a: readonly string[], b: readonly string[]): boolean {
  return a.length === b.length && [...a].sort().join("|") === [...b].sort().join("|");
}

// ── §1 ──────────────────────────────────────────────────────────────────────
function section1(): void {
  console.log("\n§1 izin kataloğu: patron:giris açık atamayla, joker geçmez");
  const row = PERMISSION_CATALOG.find((p) => p.code === "patron:giris");
  check("patron:giris katalogda, ADMIN/web", row?.module === "ADMIN" && row.category === "web", JSON.stringify(row ?? null));
  const all = ROLE_TEMPLATE_CATALOG.find((e) => e.mode === "all");
  check("⭐ 'Admin (Tam Yetki)' çözümü patron:giris TAŞIMAZ", !!all && !resolveRoleTemplateCodes(all).includes("patron:giris"));
  check("hiçbir dar rol patron:giris taşımaz", ROLE_TEMPLATE_CATALOG.every((e) => e.mode === "all" || !e.codes.includes("patron:giris")));
  check("⭐ süperadmin jokeri ['*'] giriş saymaz", !hasPatronLogin(["*"]) && deriveCloudPermissions(["*"]).length === 0);
  check("⭐ alan jokeri ['patron:*'] giriş saymaz", !hasPatronLogin(["patron:*", "order:read"]) && deriveCloudPermissions(["patron:*", "order:read"]).length === 0);
  check("rol kapsamı muafı gerekçeli", (ROLE_COVERAGE_EXEMPT["patron:giris"] ?? "").length > 20);
  check("ekransız muafı gerekçeli", SCREENLESS_PERMISSIONS.some((s) => s.code === "patron:giris" && s.reason.length > 20));
}

// ── §2 ──────────────────────────────────────────────────────────────────────
function section2(): void {
  console.log("\n§2 türetme tablosu");
  const G = "patron:giris";
  const cases: Array<[string, readonly string[], readonly string[]]> = [
    ["yalnız giriş → özet", [G], ["bulut:ozet:oku"]],
    ["giriş yok → boş (izinler dolu olsa da)", ["order:write", "admin:users"], []],
    ["order:read → sipariş oku", [G, "order:read"], ["bulut:ozet:oku", "bulut:siparis:oku"]],
    ["order:write → sipariş oku + yaz", [G, "order:write"], ["bulut:ozet:oku", "bulut:siparis:oku", "bulut:siparis:yaz"]],
    ["mobile:siparis → sipariş oku + yaz", [G, "mobile:siparis"], ["bulut:ozet:oku", "bulut:siparis:oku", "bulut:siparis:yaz"]],
    ["shipping:read → sevkiyat", [G, "shipping:read"], ["bulut:ozet:oku", "bulut:sevkiyat:oku"]],
    ["workorder:read → üretim", [G, "workorder:read"], ["bulut:ozet:oku", "bulut:uretim:oku"]],
    ["report:production → üretim + rapor", [G, "report:production"], ["bulut:ozet:oku", "bulut:uretim:oku", "bulut:rapor:oku"]],
    ["roll:read → stok", [G, "roll:read"], ["bulut:ozet:oku", "bulut:stok:oku"]],
    ["report:inventory → stok + rapor", [G, "report:inventory"], ["bulut:ozet:oku", "bulut:stok:oku", "bulut:rapor:oku"]],
    ["customer:write → cari oku + yaz", [G, "customer:write"], ["bulut:ozet:oku", "bulut:cari:oku", "bulut:cari:yaz"]],
    ["report:sales → rapor", [G, "report:sales"], ["bulut:ozet:oku", "bulut:rapor:oku"]],
    ["admin:users → bulut yöneticisi", [G, "admin:users"], ["bulut:ozet:oku", "bulut:hesap:yonet"]],
    ["admin:* (tek eşleştirici) → bulut yöneticisi", [G, "admin:*"], ["bulut:ozet:oku", "bulut:hesap:yonet"]],
    ["finans izni türetilmez", [G, "finance:read", "report:finance"], ["bulut:ozet:oku"]],
  ];
  for (const [label, input, want] of cases) {
    const got = deriveCloudPermissions(input);
    check(label, sameSet(got, want), got.join(","));
  }
  const catalog = new Set<string>(PERMISSION_CATALOG.map((p) => p.code));
  const unknown = Object.values(CLOUD_PERMISSION_SOURCES).flat().map(String).filter((c) => !catalog.has(c));
  check("her kaynak kod fabrika kataloğunda", unknown.length === 0, unknown.join(","));
  const outs = Object.values(CLOUD_PERMISSION_CODES);
  const cloudCatalogPath = path.join(__dirname, "..", "..", "patron", "sunucu", "src", "catalog", "permissions.ts");
  const cloudCatalog = existsSync(cloudCatalogPath) ? readFileSync(cloudCatalogPath, "utf8") : "";
  const notInCloud = outs.filter((c) => !cloudCatalog.includes(`"${c}"`));
  check("her çıktı bulut izin kataloğunda tanımlı", cloudCatalog.length > 0 && notInCloud.length === 0, notInCloud.join(",") || `${outs.length} kod`);
  check("her çıktı tel desenine uyar, finans/oturum yok", outs.every((c) => CLOUD_PERMISSION_PATTERN.test(c)) && !outs.some((c) => /oturum|kasa|cek|fatura|tahsilat|fiyat|bakiye|maliyet|teklif/.test(c)), outs.join(","));
}

// ── fixture ─────────────────────────────────────────────────────────────────
async function mkUser(tag: string, over: Record<string, unknown> = {}): Promise<{ id: string; hash: string }> {
  const hash = await bcrypt.hash(`Pbk-${randomUUID()}`, 10);
  const pin = String(100000 + (randomBytes(3).readUIntBE(0, 3) % 899999));
  const card = randomBytes(16).toString("hex");
  const totp = randomBytes(20).toString("hex").toUpperCase().slice(0, 32);
  secrets.push(pin, card, totp);
  const u = await prisma.user.create({
    data: { username: `${STAMP}-${tag}-${randomBytes(3).toString("hex")}`, fullName: `${STAMP} ${tag}`, passwordHash: hash, quickPin: pin, cardToken: card, totpSecret: totp, totpEnabledAt: new Date(), tokenVersion: 7, ...over },
    select: { id: true },
  });
  createdUsers.push(u.id);
  return { id: u.id, hash };
}

async function grant(userId: string, code: string, window: { validFrom?: Date; validUntil?: Date } = {}): Promise<void> {
  const p = await prisma.permission.findUnique({ where: { code }, select: { id: true } });
  if (!p) throw new Error(`izin DB'de yok: ${code}`);
  await prisma.userPermission.create({ data: { userId, permissionId: p.id, ...window } });
}

async function buildFixture(): Promise<Fixture> {
  await reconcilePermissionCatalog();
  const ok = await mkUser("ok");
  await grant(ok.id, "patron:giris");
  await grant(ok.id, "order:write");
  const passive = await mkUser("pasif", { isActive: false });
  await grant(passive.id, "patron:giris");
  const deleted = await mkUser("silinmis", { deletedAt: new Date() });
  await grant(deleted.id, "patron:giris");
  const noPerm = await mkUser("izinsiz");
  await grant(noPerm.id, "order:read");
  const expired = await mkUser("suresi-gecmis");
  await grant(expired.id, "patron:giris", { validFrom: new Date(Date.now() - 3 * DAY), validUntil: new Date(Date.now() - DAY) });
  const future = await mkUser("baslamamis");
  await grant(future.id, "patron:giris", { validFrom: new Date(Date.now() + DAY) });
  const tech = await mkUser("teknik");
  await grant(tech.id, "patron:giris");
  return { ok: ok.id, passive: passive.id, deleted: deleted.id, noPerm: noPerm.id, expired: expired.id, future: future.id, tech: tech.id, okHash: ok.hash };
}

/** Teknik kullanıcı kaydı: yoksa fixture'ı yazar (sonda silinir), varsa olduğu gibi kalır. Dönüş: bu koşum yazdı mı. */
async function claimTechnicalSlot(techFixtureId: string): Promise<{ wrote: boolean; techId: string }> {
  const row = await prisma.systemSetting.findUnique({ where: { key: PATRON_CLOUD_USER_SETTING_KEY }, select: { value: true } });
  if (typeof row?.value === "string" && row.value.length > 0) return { wrote: false, techId: row.value };
  await prisma.systemSetting.create({ data: { key: PATRON_CLOUD_USER_SETTING_KEY, value: techFixtureId } });
  return { wrote: true, techId: techFixtureId };
}

// ── §3 ──────────────────────────────────────────────────────────────────────
async function section3(f: Fixture, techId: string): Promise<void> {
  console.log("\n§3 dışa aktarım: kim gider, kim gitmez");
  const set = await collectCloudUsers();
  const ids = new Set(set.users.map((u) => u.id));
  const okRec = set.users.find((u) => u.id === f.ok);
  check("⭐ giriş izinli aktif kullanıcı GİDER, izinleri türetilmiş", !!okRec && sameSet(okRec.izinler, ["bulut:ozet:oku", "bulut:siparis:oku", "bulut:siparis:yaz"]), okRec?.izinler.join(",") ?? "yok");
  check("parola özeti fabrikadaki bcrypt özetiyle aynı (yeniden kodlanmaz)", okRec?.parolaOzeti === f.okHash);
  const absent: Array<[string, string]> = [["pasif", f.passive], ["silinmiş", f.deleted], ["izinsiz", f.noPerm], ["süresi geçmiş izin", f.expired], ["henüz başlamamış izin", f.future]];
  for (const [label, id] of absent) check(`⭐ ${label} GİTMEZ`, !ids.has(id));
  check(`⭐ teknik kullanıcı GİTMEZ${techId === f.tech ? "" : " (kayıtlı teknik kullanıcı)"}`, !ids.has(techId) && (techId !== f.tech || !ids.has(f.tech)));
  const sys = await prisma.user.findMany({ where: { isSystemAccount: true }, select: { id: true } });
  check("DB'deki süperadmin (varsa) GİTMEZ", sys.every((s) => !ids.has(s.id)), `${sys.length} sistem hesabı`);
  const fakeSys: CloudUserRow = { id: randomUUID(), username: "x", fullName: "x", passwordHash: "x", isActive: true, deletedAt: null, isSystemAccount: true };
  check("⭐ süperadmin satırı yüklemde düşer (birebir giriş izni olsa da)", !isCloudUserCandidate(fakeSys, null, ["patron:giris"]));
  check("kontrol: aynı satır süperadmin değilse yüklemden geçer", isCloudUserCandidate({ ...fakeSys, isSystemAccount: false }, null, ["patron:giris"]));
  const w = cloudUserCandidateWhere("00000000-0000-4000-8000-000000000001");
  check("⭐ sorgu süzgeci: aktif ∧ silinmemiş ∧ süperadmin değil ∧ teknik değil ∧ giriş izni satırı",
    w.isActive === true && w.deletedAt === null && w.isSystemAccount === false && JSON.stringify(w.id) === JSON.stringify({ not: "00000000-0000-4000-8000-000000000001" }) && JSON.stringify(w.permissions).includes("patron:giris"), JSON.stringify(w));
  const sorted = set.users.map((u) => u.id);
  check("küme id'ye göre sıralı, tekrar yok", sorted.join() === [...sorted].sort().join() && new Set(sorted).size === sorted.length);
  check("özet = sha256(JSON(kullanicilar))", set.digest === createHash("sha256").update(JSON.stringify(set.users)).digest("hex") && set.digest === cloudUsersDigest(set.users));
}

// ── §4 ──────────────────────────────────────────────────────────────────────
async function section4(f: Fixture): Promise<void> {
  console.log("\n§4 hijyen: açık select, sır yok, katı şema, kuru koşum basmaz");
  check("⭐ select anahtar kümesi BİREBİR", sameSet(Object.keys(CLOUD_USER_SELECT), ["id", "username", "fullName", "passwordHash", "isActive", "deletedAt", "isSystemAccount"]), Object.keys(CLOUD_USER_SELECT).join(","));
  const set = await collectCloudUsers();
  const text = JSON.stringify(set.users);
  check("tel kaydında yasak anahtar yok", !/quickPin|cardToken|totp|tokenVersion|isSystemAccount|passwordHash/i.test(text));
  const leaked = secrets.filter((s) => text.includes(s));
  check("⭐ fixture'ın PIN/kart/TOTP değeri tel kaydında YOK", leaked.length === 0, `${leaked.length} sızıntı`);
  const okRec = set.users.find((u) => u.id === f.ok);
  check("katı şema fazladan alanı reddeder", !!okRec && !CloudUserSchema.safeParse({ ...okRec, quickPin: "123456" }).success);
  check("katı şema maliyeti < 10 bcrypt özetini reddeder", !!okRec && !CloudUserSchema.safeParse({ ...okRec, parolaOzeti: bcrypt.hashSync("x", 4) }).success);
  const run = spawnSync(process.execPath, ["--import", "tsx", path.join(__dirname, "patron-bulut-kullanicilar.ts"), "--kuru"], { encoding: "utf8", env: process.env, timeout: 90_000 });
  const out = `${run.stdout}${run.stderr}`;
  check("kuru koşum 0 ile biter ve fixture'ı listeler", run.status === 0 && out.includes(`${STAMP}-ok-`), `çıkış ${run.status}`);
  check("⭐ kuru koşum parola özeti ve küme özeti BASMAZ", !out.includes(f.okHash) && !/\$2[aby]\$/.test(out) && !out.includes(set.digest));
  check("kuru koşum PIN/kart/TOTP basmaz", secrets.every((s) => !out.includes(s)));
  const bad = spawnSync(process.execPath, ["--import", "tsx", path.join(__dirname, "patron-bulut-kullanicilar.ts")], { encoding: "utf8", env: process.env, timeout: 60_000 });
  check("bayraksız koşum reddedilir (gönderim yolu yok)", bad.status === 2);
}

// ── §5–§8 fabrika işi (F2) ──────────────────────────────────────────────────
interface FakeCloud { readonly transport: CloudTransport; readonly seen: CloudHttpRequest[]; status: number }
function fakeCloud(): FakeCloud {
  const fc: FakeCloud = {
    seen: [],
    status: 200,
    transport: (req) => {
      fc.seen.push(req);
      if (fc.status !== 200) return Promise.resolve({ status: fc.status, body: Buffer.from(JSON.stringify({ success: false, message: "x", details: { code: fc.status === 404 ? "BULUNAMADI" : "SUNUCU_HATASI" } })) });
      const n = (JSON.parse(req.body.toString("utf8")) as { kullanicilar: unknown[] }).kullanicilar.length;
      return Promise.resolve({ status: 200, body: Buffer.from(JSON.stringify({ v: 1, ozet: "x", eklenen: n, guncellenen: 0, kapatilan: 0 })) });
    },
  };
  return fc;
}

/** Konsol yakalayıcı — iş log'unun yalnız sayı taşıdığını ölçer. */
function captureLogs(): { lines: string[]; restore: () => void } {
  const lines: string[] = [];
  const orig = { log: console.log, warn: console.warn, error: console.error };
  const grab = (...a: unknown[]): void => { lines.push(a.map(String).join(" ")); };
  console.log = grab; console.warn = grab; console.error = grab;
  return { lines, restore: () => { console.log = orig.log; console.warn = orig.warn; console.error = orig.error; } };
}

type Open = Extract<CloudEligibility, { ok: true }>;

async function section5(open: Open): Promise<void> {
  console.log("\n§5 kapatma düğmesi: kapalıyken iş yok · zamanlayıcı yok · sıfır istek · DB okuması yok");
  const fc = fakeCloud();
  let collects = 0;
  __configureCloudUsersForTests({ reset: true });
  __configureCloudUsersForTests({ transport: fc.transport, eligibility: async () => ({ ok: false, reason: "AYAR_KAPALI" }), collect: async () => { collects++; return collectCloudUsers(); } });
  const r = await runCloudUsersOnce();
  check("⭐ kapalıyken tur KAPALI · taşıma çağrısı 0 · küme kurulmadı", r.status === "KAPALI" && fc.seen.length === 0 && collects === 0, `${r.status} istek=${fc.seen.length} küme=${collects}`);
  const calls: string[] = [];
  const base: Omit<ReconcileDeps, "eligibility"> = {
    switch: { setEnabled: async () => 0, enabledCount: async () => 0, sleep: async () => undefined },
    start: () => undefined,
    stop: () => undefined,
    inbox: { eligibility: async () => ({ ok: false, reason: "YAZMA_KAPALI" }), ensureUser: async () => ({ ok: false, reason: "x" }), start: () => undefined, stop: () => undefined },
    reports: { start: () => undefined, stop: () => undefined },
    users: { start: () => { calls.push("start"); }, stop: () => { calls.push("stop"); } },
  };
  const rc = await reconcilePatronCloud("bekçi kapalı", { ...base, eligibility: async () => ({ ok: false, reason: "AYAR_KAPALI" }) });
  check("⭐ uzlaştırma kapalı: kullanıcı işi BAŞLATILMADI, durduruldu", rc === "DURDU" && !calls.includes("start") && calls.includes("stop"), `${rc} ${calls.join(",")}`);
  calls.length = 0;
  const ro = await reconcilePatronCloud("bekçi açık", { ...base, eligibility: async () => open });
  check("uzlaştırma açık: kullanıcı işi başladı", ro === "BASLADI" && calls.includes("start") && !calls.includes("stop"), `${ro} ${calls.join(",")}`);
  check("başlatılmamış işte zamanlayıcı yok", !isCloudUsersRunning() && !__cloudUsersTimerArmedForTests());
  startCloudUsers();
  const armed = isCloudUsersRunning() && __cloudUsersTimerArmedForTests();
  stopCloudUsers();
  check("başlat → zamanlayıcı kurulu; durdur → yok", armed && !isCloudUsersRunning() && !__cloudUsersTimerArmedForTests());
}

async function section6(open: Open, f: Fixture): Promise<void> {
  console.log("\n§6 değişince ya da 10 dk'da bir gönder");
  const fc = fakeCloud();
  let now = Date.now();
  __configureCloudUsersForTests({ reset: true });
  __configureCloudUsersForTests({ transport: fc.transport, eligibility: async () => open, now: () => now });
  const r1 = await runCloudUsersOnce();
  check("ilk tur gönderir", r1.status === "GONDERILDI" && fc.seen.length === 1, `${r1.status} ${fc.seen.length}`);
  now += USERS_TICK_MS;
  const r2 = await runCloudUsersOnce();
  check("⭐ küme aynı → gönderilmez", r2.status === "DEGISMEDI" && fc.seen.length === 1, r2.status);
  await prisma.userPermission.deleteMany({ where: { userId: f.ok, permission: { code: "patron:giris" } } });
  now += USERS_TICK_MS;
  const r3 = await runCloudUsersOnce();
  const body3 = JSON.parse(fc.seen.at(-1)?.body.toString("utf8") ?? "{}") as { kullanicilar?: Array<{ id: string }> };
  check("⭐ izin geri alındı → sonraki turda gönderilir, kullanıcı kümede YOK", r3.status === "GONDERILDI" && fc.seen.length === 2 && !(body3.kullanicilar ?? []).some((u) => u.id === f.ok), r3.status);
  now += USERS_RESEND_MS - 1;
  const r4 = await runCloudUsersOnce();
  now += 1;
  const r5 = await runCloudUsersOnce();
  check("⭐ değişmeyen küme 10 dk dolunca yeniden gönderilir (öncesinde değil)", r4.status === "DEGISMEDI" && r5.status === "GONDERILDI" && fc.seen.length === 3, `${r4.status}/${r5.status}`);
  await grant(f.ok, "patron:giris");
}

async function section7(open: Open): Promise<void> {
  console.log("\n§7 eski bulut (404) · hata yalıtımı");
  const fc = fakeCloud();
  fc.status = 404;
  __configureCloudUsersForTests({ reset: true });
  __configureCloudUsersForTests({ transport: fc.transport, eligibility: async () => open });
  const cap = captureLogs();
  let d1 = 0, d2 = 0;
  try { d1 = await tickCloudUsers(); d2 = await tickCloudUsers(); } finally { cap.restore(); }
  const warns = cap.lines.filter((l) => l.includes("eski bulut"));
  check("⭐ 404 → ESKI_BULUT: tek satır log, 60 dk geri çekilme, fırlatmaz", d1 === USERS_OLD_CLOUD_BACKOFF_MS && d2 === USERS_OLD_CLOUD_BACKOFF_MS && warns.length === 1, `${d1}/${d2} log=${warns.length}`);
  check("404 tekrar edilmez (tur başına tek istek)", fc.seen.length === 2, `${fc.seen.length}`);
  __configureCloudUsersForTests({ transport: () => Promise.reject(new Error("ECONNREFUSED")) });
  const r = await runCloudUsersOnce();
  check("ağ hatası: tur fırlatmaz (BASARISIZ)", r.status === "BASARISIZ", `${r.status}/${r.reason}`);
  __configureCloudUsersForTests({ collect: async () => { throw new Error("TST-PBK gizli hata metni"); } });
  const cap2 = captureLogs();
  let r2: Awaited<ReturnType<typeof runCloudUsersOnce>> | null = null;
  try { r2 = await runCloudUsersOnce(); } finally { cap2.restore(); }
  check("küme hatası: tur fırlatmaz, log hata METNİ taşımaz", r2?.status === "BASARISIZ" && !cap2.lines.join("\n").includes("gizli hata metni"), r2?.status ?? "yok");
  fc.status = 503;
  __configureCloudUsersForTests({ reset: true });
  __configureCloudUsersForTests({ transport: fc.transport, eligibility: async () => open });
  const cap3 = captureLogs();
  let d3 = 0;
  try { d3 = await tickCloudUsers(); } finally { cap3.restore(); }
  check("5xx → geri çekilme aralığın katı, eski-bulut tavanının altında", d3 > USERS_TICK_MS && d3 < USERS_OLD_CLOUD_BACKOFF_MS, `${d3}`);
}

async function section8(open: Open, f: Fixture): Promise<void> {
  console.log("\n§8 giden gövde: uç, katı şema, özet, sır yok, log yalnız sayı");
  const fc = fakeCloud();
  __configureCloudUsersForTests({ reset: true });
  __configureCloudUsersForTests({ transport: fc.transport, eligibility: async () => open });
  const cap = captureLogs();
  try { await runCloudUsersOnce(); } finally { cap.restore(); }
  const req = fc.seen[0];
  check("istek /v1/kullanicilar ucuna, imzalı", !!req && req.url === `${open.baseUrl}${SYNC_PATHS.USERS}` && Object.keys(req.headers).some((h) => /^x-tkl/i.test(h)), req?.url ?? "istek yok");
  const text = req?.body.toString("utf8") ?? "{}";
  const parsed = UsersPushRequestSchema.safeParse(JSON.parse(text));
  check("⭐ gövde katı UsersPushRequestSchema'ya uyar", parsed.success);
  check("özet = sha256(JSON(kullanicilar))", parsed.success && parsed.data.ozet === cloudUsersDigest(parsed.data.kullanicilar));
  check("fixture kullanıcısı gövdede", parsed.success && parsed.data.kullanicilar.some((u) => u.id === f.ok));
  check("⭐ gövdede PIN/kart/TOTP değeri ve yasak anahtar YOK", secrets.every((x) => !text.includes(x)) && !/quickPin|cardToken|totp|tokenVersion/i.test(text));
  const logs = cap.lines.join("\n");
  const digestLeak = parsed.success && logs.includes(parsed.data.ozet);
  check("⭐ log parola özeti, küme özeti, kullanıcı adı taşımaz; sayı taşır", !/\$2[aby]\$/.test(logs) && !digestLeak && !logs.includes(STAMP) && /kullanıcı listesi gönderildi: \d+ kullanıcı/.test(logs), logs.split("\n").find((l) => l.includes("kullanıcı listesi")) ?? "");
}

async function cleanupFixture(wroteTechSlot: boolean): Promise<void> {
  if (wroteTechSlot) await prisma.systemSetting.deleteMany({ where: { key: PATRON_CLOUD_USER_SETTING_KEY } });
  await prisma.userPermission.deleteMany({ where: { userId: { in: createdUsers } } });
  for (const id of createdUsers) {
    await prisma.user.update({ where: { id }, data: { isActive: false, deletedAt: new Date(), quickPin: null, cardToken: null, totpSecret: null, totpEnabledAt: null } }).catch(() => undefined);
  }
}

async function main(): Promise<void> {
  let wrote = false;
  const keyDir = mkdtempSync(path.join(tmpdir(), "tst-pbk-"));
  const keyPath = path.join(keyDir, "kurulum.key");
  try {
    section1();
    section2();
    const f = await buildFixture();
    const slot = await claimTechnicalSlot(f.tech);
    wrote = slot.wrote;
    await section3(f, slot.techId);
    await section4(f);
    generateKeyFile(keyPath);
    const key = loadKeyFile(keyPath);
    if (!key.ok) throw new Error("anahtar dosyası kurulamadı");
    const open: Extract<CloudEligibility, { ok: true }> = { ok: true, baseUrl: "https://bulut.tst.invalid", installationId: randomUUID(), privateKey: key.key.privateKey, intervalMinutes: 5 };
    await section5(open);
    await section6(open, f);
    await section7(open);
    await section8(open, f);
  } finally {
    stopCloudUsers();
    __configureCloudUsersForTests({ reset: true });
    rmSync(keyDir, { recursive: true, force: true });
    await cleanupFixture(wrote);
  }
}

main()
  .catch((e: unknown) => { fail++; console.log(`  ✗ FAIL: beklenmeyen hata — ${e instanceof Error ? e.stack ?? e.message : String(e)}`); })
  .finally(async () => {
    console.log(`\n=== Sonuç: ${pass} geçti, ${fail} başarısız ===\n`);
    await prisma.$disconnect().catch(() => undefined);
    await pool.end().catch(() => undefined);
    process.exit(fail > 0 ? 1 : 0);
  });
