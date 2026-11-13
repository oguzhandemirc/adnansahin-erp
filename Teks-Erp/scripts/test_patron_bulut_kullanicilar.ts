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
// =============================================================================
import { createHash, randomBytes, randomUUID } from "node:crypto";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { existsSync, readFileSync } from "node:fs";
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
import { CLOUD_PERMISSION_PATTERN, CloudUserSchema } from "../src/cloud-sync/wire";

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

async function cleanupFixture(wroteTechSlot: boolean): Promise<void> {
  if (wroteTechSlot) await prisma.systemSetting.deleteMany({ where: { key: PATRON_CLOUD_USER_SETTING_KEY } });
  await prisma.userPermission.deleteMany({ where: { userId: { in: createdUsers } } });
  for (const id of createdUsers) {
    await prisma.user.update({ where: { id }, data: { isActive: false, deletedAt: new Date(), quickPin: null, cardToken: null, totpSecret: null, totpEnabledAt: null } }).catch(() => undefined);
  }
}

async function main(): Promise<void> {
  let wrote = false;
  try {
    section1();
    section2();
    const f = await buildFixture();
    const slot = await claimTechnicalSlot(f.tech);
    wrote = slot.wrote;
    await section3(f, slot.techId);
    await section4(f);
  } finally {
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
