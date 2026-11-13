// =============================================================================
// Test: parola kural SÜRÜMÜ — yalnız yeni kuralla belirlenmiş parola buluta gider (Y8)
// Çalıştır: npx tsx scripts/run-all-tests.ts test_password_policy_version
// =============================================================================
// Bulgu Y8 (güvenlik denetimi 2026-11-13): üyelik tasarımında fabrikanın bcrypt
// özetleri patron bulutuna (internete açık VDS) gidiyor; eski kuralla (≥ 6, liste
// yok) belirlenmiş zayıf parolalar orada çevrimiçi/çevrimdışı denenebilir.
// Karar: zayıflık kararı FABRİKADA verilir — `User.passwordPolicyVersion`.
//
// Kilitlenen sözleşme:
//   §1 statik: `src/` içinde `passwordHash` YAZAN tek yer kural helper'ı (servisler
//      `...newPasswordFields(...)` yayar; sürümsüz hash yazımı KIRMIZI) · süperadmin
//      betiğinin iki yazımı sürümü taşır · `passwordPolicyVersion` hiçbir route/
//      controller/Zod gövdesinde yok (BaseController tuzağı: istemci yazamaz).
//   §2 DB: kullanıcı yarat, yönetici sıfırla, kendi değiştir → sürüm GÜNCEL;
//      helper'dan geçmeyen (fixture, eski) parola → 0.
//   §3 uçtan uca: `patron:giris` izinli ama sürümü eski kullanıcı buluta GİTMEZ;
//      yönetici parolasını yeniden belirleyince GİDER.
// Fixture `TSTPPV` damgalı; kullanıcılar sert silinmez (audit FK) — pasifleşir.
//
// Negatif sondalar (BİR KEZLİK, md5 ile geri alındı; sayılar commit mesajında):
//   V1 `resetUserPassword` sürümsüz yazdı (`passwordHash: passwordFields.passwordHash`) — kırmızı.
//   V2 `newPasswordFields` sürümü döndürmedi (0) — kırmızı.
// =============================================================================
import { readFileSync } from "node:fs";
import { join, relative } from "node:path";
import prisma, { pool } from "../src/lib/prisma";
import { AuthService } from "../src/services/auth.service";
import { PermissionManagementService } from "../src/services/permission-management.service";
import { PASSWORD_POLICY_VERSION } from "../src/services/helpers/password-policy.helper";
import { collectCloudUsers } from "../src/cloud-sync/users-export";
import { reconcilePermissionCatalog } from "../src/jobs/permission-catalog.job";
import { hedefDbEngeli } from "./lib/hedef-db-kapisi";
import { walkTs } from "./lib/ts-tarama";

let pass = 0;
let fail = 0;
function check(label: string, ok: boolean, extra = ""): void {
  if (ok) { pass++; console.log(`✅ ${label}${extra ? " — " + extra : ""}`); }
  else { fail++; console.log(`❌ ${label}${extra ? " — " + extra : ""}`); }
}

const ROOT = join(__dirname, "..");
const SRC = join(ROOT, "src");
const HELPER = "src/services/helpers/password-policy.helper.ts";

/** `passwordHash` YAZIMI: anahtar olarak (kısaltma ya da `: <değer>`); `select`teki `: true` ve `row.passwordHash` okuması hariç. */
const HASH_WRITE = /(?<![.\w"'])passwordHash\s*(?:,|\}|:(?!\s*true\b))/;
/** Deseni taşıyan ama parola YAZMAYAN dosyalar — gerekçeli, iki yönlü (ölü muaf da kırmızı). */
const MUAF: Record<string, string> = {
  "src/constants/audit-field-labels.ts": "denetim alan etiketi (`passwordHash: \"Parola\"`) — yazım değil",
};

function stripComments(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
}

function section1(): void {
  console.log("§1 statik");
  check("desen sentetik yazımı yakalar (kör desen değil)", HASH_WRITE.test("data: { passwordHash, x }") && HASH_WRITE.test("data: { passwordHash: h }"));
  check("desen select ve okumayı yakalamaz", !HASH_WRITE.test("select: { passwordHash: true }") && !HASH_WRITE.test("user.passwordHash)"));
  const files = walkTs(SRC);
  check("körlük zemini: ≥ 300 dosya tarandı", files.length >= 300, `${files.length}`);
  const writers: string[] = [];
  for (const abs of files) {
    const rel = relative(ROOT, abs);
    if (rel === HELPER) continue;
    const body = stripComments(readFileSync(abs, "utf8"));
    if (HASH_WRITE.test(body)) writers.push(rel);
  }
  for (const [f, why] of Object.entries(MUAF)) console.log(`   muaf: ${f} — ${why}`);
  const dead = Object.keys(MUAF).filter((f) => !writers.includes(f));
  check("muaf listesi canlı (ölü muaf yok)", dead.length === 0, dead.join(", ") || "0");
  writers.splice(0, writers.length, ...writers.filter((f) => !(f in MUAF)));
  check("⭐ src'de sürümsüz passwordHash yazımı YOK (yazım yalnız newPasswordFields yayılımıyla)", writers.length === 0, writers.join(", ") || "0");
  const spreads = ["src/services/permission-management.service.ts", "src/services/auth.service.ts"]
    .map((f) => (readFileSync(join(ROOT, f), "utf8").match(/\.\.\.passwordFields/g) ?? []).length);
  check("yazıcılar sürümlü alanları yayıyor (yarat + sıfırla + kendi değiştir = 3)", spreads[0] + spreads[1] === 3, spreads.join("+"));

  const script = readFileSync(join(ROOT, "scripts/superadmin-olustur.ts"), "utf8");
  const scriptWrites = (script.match(/passwordHash,\s*\n(?:\s*\/\/.*\n)*\s*passwordPolicyVersion: PASSWORD_POLICY_VERSION,/g) ?? []).length;
  check("süperadmin kur/--rotate iki yazımda sürümü taşır", scriptWrites === 2, `${scriptWrites}`);

  const surface = walkTs(SRC).filter((f) => /\/(routes|controllers|validators|schemas)\//.test(f));
  const leaks = surface.filter((f) => readFileSync(f, "utf8").includes("passwordPolicyVersion")).map((f) => relative(ROOT, f));
  check("körlük zemini: istemci yüzeyi taranıyor (≥ 20 dosya)", surface.length >= 20, `${surface.length}`);
  check("⭐ passwordPolicyVersion hiçbir route/controller/şema dosyasında yok (istemci yazamaz)", leaks.length === 0, leaks.join(", ") || "0");
}

async function section2and3(): Promise<void> {
  console.log("\n§2 DB — yazma yolları sürümü günceller");
  const engel = hedefDbEngeli();
  if (engel) { check("hedef DB yazılabilir", false, engel); return; }
  await reconcilePermissionCatalog();
  const ts = Date.now().toString(36);
  const created: string[] = [];
  const version = async (id: string) =>
    (await prisma.user.findUnique({ where: { id }, select: { passwordPolicyVersion: true } }))?.passwordPolicyVersion;
  try {
    check("güncel sürüm ≥ 1 (0 = eski parola)", PASSWORD_POLICY_VERSION >= 1, String(PASSWORD_POLICY_VERSION));
    const made = await PermissionManagementService.createUser(
      { username: `TSTPPV${ts}a`, fullName: "TST Surum", password: "Bekci-Surum-2026x", grantOperatorDefaults: false, generateMobileCredentials: false },
      undefined,
    );
    created.push(made.id);
    check("createUser → güncel sürüm", (await version(made.id)) === PASSWORD_POLICY_VERSION);

    const legacy = await prisma.user.create({
      data: { username: `TSTPPV${ts}b`, fullName: "TST Eski Parola", passwordHash: await AuthService.hashPassword("Eski-Parola-Bekci-1") },
      select: { id: true },
    });
    created.push(legacy.id);
    check("helper'dan geçmeyen (eski) parola → sürüm 0 (varsayılan)", (await version(legacy.id)) === 0);

    const self = await prisma.user.create({
      data: { username: `TSTPPV${ts}c`, fullName: "TST Kendi", passwordHash: await AuthService.hashPassword("Eski-Parola-Bekci-2") },
      select: { id: true },
    });
    created.push(self.id);
    await AuthService.changeOwnPassword(self.id, "Eski-Parola-Bekci-2", "Yepyeni-Surum-Parola-9", { clientType: "mobile" });
    check("changeOwnPassword → güncel sürüm", (await version(self.id)) === PASSWORD_POLICY_VERSION);

    console.log("\n§3 uçtan uca — eski parolalı kullanıcı buluta gitmez");
    const perm = await prisma.permission.findUnique({ where: { code: "patron:giris" }, select: { id: true } });
    if (!perm) throw new Error("patron:giris izni DB'de yok");
    await prisma.userPermission.create({ data: { userId: legacy.id, permissionId: perm.id } });
    const before = await collectCloudUsers();
    check("⭐ patron:giris izinli ama eski parolalı kullanıcı buluta GİTMEZ", !before.users.some((u) => u.id === legacy.id));
    await PermissionManagementService.resetUserPassword(legacy.id, "Yonetici-Sifirladi-2026", undefined);
    check("resetUserPassword → güncel sürüm", (await version(legacy.id)) === PASSWORD_POLICY_VERSION);
    const after = await collectCloudUsers();
    check("⭐ parola yeni kuralla belirlenince buluta GİDER", after.users.some((u) => u.id === legacy.id));
  } finally {
    if (created.length) {
      await prisma.userPermission.deleteMany({ where: { userId: { in: created } } }).catch(() => undefined);
      await prisma.session.deleteMany({ where: { userId: { in: created } } }).catch(() => undefined);
      await prisma.user.updateMany({ where: { id: { in: created } }, data: { isActive: false } });
    }
  }
}

async function main(): Promise<void> {
  section1();
  await section2and3();
  console.log(`\n=== Sonuç: ${pass} geçti, ${fail} başarısız ===`);
  await prisma.$disconnect();
  await pool.end();
  process.exit(fail > 0 ? 1 : 0);
}

main().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect().catch(() => undefined);
  process.exit(1);
});
