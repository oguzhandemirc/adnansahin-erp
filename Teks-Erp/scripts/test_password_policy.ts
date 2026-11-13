// =============================================================================
// Test: PAROLA KURALI — tek helper + bütün yazma yolları (kullanıcı kararı 2026-11-13)
// Çalıştır: npx tsx scripts/run-all-tests.ts test_password_policy
// =============================================================================
// Kural: yeni ve sıfırlanan parolalar ≥ 10 karakter, ≤ 72 bayt; tekrar, düz
// dizi/klavye sırası, yaygın liste (gövde + yıl eki dahil), kullanıcı adı /
// ad-soyad tabanlı parola YASAK. Kural TEK helper'da yaşar
// (`src/services/helpers/password-policy.helper.ts`).
//
//   §1 SAF KURAL — ret ve kabul örnekleri + kural kodu + mesaj parolayı taşımaz.
//   §2 STATİK — `src/` içinde parola hash'i üreten (`bcrypt.hash`/`hashSync`)
//      tek yer helper'dır; muaflar gerekçeli ve İKİ YÖNLÜ (ölü muaf da kırmızı);
//      `AuthService.hashPassword` (kuralsız fixture hasher'ı) `src/`ten
//      çağrılmaz; bilinen her yazma yolu helper'ı çağırır. Körlük zemini: ≥ 300
//      dosya taranmalı.
//   §3 DB — `createUser` ve `resetUserPassword` zayıf parolayı 400
//      `PASSWORD_POLICY` ile reddeder ve hiçbir şey YAZMAZ; güçlü parola geçer.
//
// Gerekli mi: evet — kuralın doğduğu gün ağaçta üç ayrı eşik vardı (Zod min 6 ·
// servis `length < 6` · süperadmin betiği ≥ 8); ikisi aynı ucu ayrı ayrı
// koruyordu ve biri gevşeyince öbürü sessizce kural olurdu.
//
// Negatif sondalar (BİR KEZLİK, md5 ile geri alındı; sayılar commit mesajında):
//   S1 `createUser`da `hashNewPassword` → `bcrypt.hash` (kuralsız) — kırmızı.
//   S2 helper'da `isCommon` kontrolü kapatıldı — kırmızı.
//   S3 `resetUserPassword`da kural atlandı — kırmızı.
// =============================================================================
import { readFileSync } from "fs";
import { join, relative } from "path";
import prisma, { pool } from "../src/lib/prisma";
import {
  checkPasswordPolicy,
  PASSWORD_MIN_LENGTH,
  type PasswordPolicyCode,
} from "../src/services/helpers/password-policy.helper";
import { PermissionManagementService } from "../src/services/permission-management.service";
import { AppError } from "../src/utils/app-error";
import { hedefDbEngeli } from "./lib/hedef-db-kapisi";
import { walkTs } from "./lib/ts-tarama";

let pass = 0;
let fail = 0;
function check(label: string, ok: boolean, extra = ""): void {
  if (ok) {
    pass++;
    console.log(`✅ ${label}${extra ? " — " + extra : ""}`);
  } else {
    fail++;
    console.log(`❌ ${label}${extra ? " — " + extra : ""}`);
  }
}

const ROOT = join(__dirname, "..");
const SRC = join(ROOT, "src");

// ── §1 SAF KURAL ─────────────────────────────────────────────────────────────
function section1(): void {
  console.log("\n§1 saf kural");
  check("eşik 10", PASSWORD_MIN_LENGTH === 10);
  const reddet: Array<[string, PasswordPolicyCode, { username?: string; fullName?: string }?]> = [
    ["123456789", "TOO_SHORT"],
    ["Ab3$kLm9q", "TOO_SHORT"],
    ["ğüşöçıİĞÜŞÖÇ".repeat(4), "TOO_LONG"],
    ["aaaaaaaaaa", "REPEATED"],
    ["1111111111", "REPEATED"],
    ["abcabcabcabc", "REPEATED"],
    ["1212121212", "REPEATED"],
    ["1234567890", "SEQUENCE"],
    ["0987654321", "SEQUENCE"],
    ["abcdefghijk", "SEQUENCE"],
    ["qwertyuiop", "SEQUENCE"],
    ["QWERTYUIOP", "SEQUENCE"],
    ["asdfghjklş", "SEQUENCE"],
    ["1q2w3e4r5t", "SEQUENCE"],
    ["adnansahin", "COMMON"],
    ["Adnan.Şahin", "COMMON"],
    ["AdnanSahin2026", "COMMON"],
    ["tekserp123", "COMMON"],
    ["Galatasaray1905", "COMMON"],
    ["password123", "COMMON"],
    ["Şifre12345", "COMMON"],
    ["fabrika2026!", "COMMON"],
    ["kdemirtas123", "PERSONAL", { username: "kdemirtas" }],
    ["Kdemirtas!!!", "PERSONAL", { username: "kdemirtas" }],
    ["satrimedk99", "PERSONAL", { username: "kdemirtas" }],
    ["demirtas.kemal", "PERSONAL", { username: "kd", fullName: "Kemal Demirtaş" }],
  ];
  for (const [pw, kod, ctx] of reddet) {
    const v = checkPasswordPolicy(pw, ctx ?? {});
    check(`ret ${kod} (${pw.length} karakter)`, v?.code === kod, `gelen=${v?.code ?? "kabul"}`);
    // Sır hijyeni: mesaj parolayı ya da 4+ karakterlik parçasını taşımaz.
    if (v) check(`  mesaj parolayı taşımaz (${kod})`, !v.message.toLowerCase().includes(pw.toLowerCase().slice(0, 4)));
  }
  // `kdemirtaskdemirtas` hem tekrar hem kişisel — hangisi önce gelirse gelsin RET.
  check("kullanıcı adının tekrarı reddedilir", checkPasswordPolicy("kdemirtaskdemirtas", { username: "kdemirtas" }) !== null);
  const kabul: Array<[string, { username?: string; fullName?: string }?]> = [
    ["Bekci-Parola-2026x"],
    ["Kirmizi.Top-Kesim7"],
    ["tz8#Lm2qPw"],
    ["4829175036"],
    ["Mavi Gökyüzü 77"],
    ["kdemirtas-Yaz.Kis-88", { username: "kdemirtas" }],
  ];
  for (const [pw, ctx] of kabul) {
    const v = checkPasswordPolicy(pw, ctx ?? {});
    check(`kabul (${pw.length} karakter)`, v === null, `gelen=${v?.code ?? "kabul"}`);
  }
}

// ── §2 STATİK ────────────────────────────────────────────────────────────────
/** `src/` içinde parola/sır hash'i üretmesine İZİN verilen dosyalar — gerekçeli. */
const HASH_MUAF: Record<string, string> = {
  "src/services/helpers/password-policy.helper.ts": "kuralın kendisi — hashNewPassword",
  "src/services/auth.service.ts": "AuthService.hashPassword: KURALSIZ fixture hasher'ı (yalnız scripts/); src'den çağrısı ayrıca yasak",
  "src/services/settings-password.service.ts": "ayar şifresi — ayrı sır, ayrı kural (8–72 ASCII)",
  "src/services/totp-account.service.ts": "TOTP kurtarma kodları — kullanıcı parolası değil",
};
/** Kullanıcı parolası yazan bilinen yollar → helper'ı çağırmak ZORUNDA. */
const YAZICILAR: Array<{ dosya: string; en_az: number; desen: RegExp }> = [
  { dosya: "src/services/permission-management.service.ts", en_az: 2, desen: /hashNewPassword\(/g },
  { dosya: "scripts/superadmin-olustur.ts", en_az: 1, desen: /checkPasswordPolicy\(/g },
  { dosya: "scripts/superadmin-olustur.ts", en_az: 1, desen: /hashNewPassword\(/g },
];

function section2(): void {
  console.log("\n§2 statik — tek hash üreticisi");
  const files = walkTs(SRC);
  check("körlük zemini: ≥ 300 dosya tarandı", files.length >= 300, `${files.length}`);
  const hashBulan = new Set<string>();
  const fixtureCagri: string[] = [];
  for (const f of files) {
    const rel = relative(ROOT, f);
    const src = readFileSync(f, "utf8");
    if (/\bbcrypt\.(hash|hashSync)\s*\(/.test(src)) hashBulan.add(rel);
    if (/\b(AuthService|this)\.hashPassword\s*\(/.test(src)) fixtureCagri.push(rel);
  }
  const izinsiz = [...hashBulan].filter((r) => !(r in HASH_MUAF));
  check("src'de izinsiz parola hash'i üreticisi yok", izinsiz.length === 0, izinsiz.join(", "));
  const olu = Object.keys(HASH_MUAF).filter((r) => !hashBulan.has(r));
  check("ölü muaf yok (her muaf hâlâ hash üretiyor)", olu.length === 0, olu.join(", "));
  check("AuthService.hashPassword src'den çağrılmıyor", fixtureCagri.length === 0, fixtureCagri.join(", "));
  for (const y of YAZICILAR) {
    const n = (readFileSync(join(ROOT, y.dosya), "utf8").match(y.desen) ?? []).length;
    check(`yazıcı ${y.dosya} → ${y.desen.source} ≥ ${y.en_az}`, n >= y.en_az, `${n}`);
  }
  const pm = readFileSync(join(ROOT, "src/services/permission-management.service.ts"), "utf8");
  check("permission-management bcrypt import ETMİYOR", !/from\s+"bcryptjs"/.test(pm));
  const sa = readFileSync(join(ROOT, "scripts/superadmin-olustur.ts"), "utf8");
  check("süperadmin betiğinde ikinci eşik yok (PASSWORD_MIN sabiti yok)", !/PASSWORD_MIN\b/.test(sa));
}

// ── §3 DB ────────────────────────────────────────────────────────────────────
async function expect400(label: string, f: () => Promise<unknown>, reason: PasswordPolicyCode): Promise<void> {
  try {
    await f();
    check(label, false, "hata fırlatmadı");
  } catch (e) {
    const ok =
      e instanceof AppError &&
      e.statusCode === 400 &&
      (e.details as { code?: string; reason?: string } | undefined)?.code === "PASSWORD_POLICY" &&
      (e.details as { reason?: string } | undefined)?.reason === reason;
    check(label, ok, e instanceof AppError ? `${e.statusCode} ${JSON.stringify(e.details)}` : String(e));
  }
}

async function section3(): Promise<void> {
  console.log("\n§3 DB — yazma yolları");
  const engel = hedefDbEngeli();
  if (engel) {
    check("hedef DB yazılabilir", false, engel);
    return;
  }
  const ts = Date.now().toString(36);
  const created: string[] = [];
  try {
    const u1 = `TSTPWPOL${ts}a`;
    await expect400("createUser kısa parola → 400 TOO_SHORT", () =>
      PermissionManagementService.createUser({ username: u1, fullName: "TST Parola", password: "123456", grantOperatorDefaults: false, generateMobileCredentials: false }, undefined), "TOO_SHORT");
    await expect400("createUser yaygın parola → 400 COMMON", () =>
      PermissionManagementService.createUser({ username: u1, fullName: "TST Parola", password: "Adnansahin2026", grantOperatorDefaults: false, generateMobileCredentials: false }, undefined), "COMMON");
    await expect400("createUser kullanıcı adı tabanlı → 400 PERSONAL", () =>
      PermissionManagementService.createUser({ username: u1, fullName: "TST Parola", password: `${u1}!!`, grantOperatorDefaults: false, generateMobileCredentials: false }, undefined), "PERSONAL");
    check("reddedilen kullanıcı YAZILMADI", (await prisma.user.count({ where: { username: u1 } })) === 0);

    const ok = await PermissionManagementService.createUser(
      { username: u1, fullName: "TST Parola", password: "Bekci-Parola-2026x", grantOperatorDefaults: false, generateMobileCredentials: false },
      undefined,
    );
    created.push(ok.id);
    check("createUser güçlü parola → yaratıldı", !!ok.id);

    const once = await prisma.user.findUnique({ where: { id: ok.id }, select: { passwordHash: true, tokenVersion: true } });
    await expect400("resetUserPassword kısa → 400 TOO_SHORT", () => PermissionManagementService.resetUserPassword(ok.id, "kisa123", undefined), "TOO_SHORT");
    await expect400("resetUserPassword dizi → 400 SEQUENCE", () => PermissionManagementService.resetUserPassword(ok.id, "1234567890", undefined), "SEQUENCE");
    await expect400("resetUserPassword ad-soyad → 400 PERSONAL", () => PermissionManagementService.resetUserPassword(ok.id, "ParolaTST123", undefined), "PERSONAL");
    const ara = await prisma.user.findUnique({ where: { id: ok.id }, select: { passwordHash: true, tokenVersion: true } });
    check("reddedilen sıfırlama hash'i DEĞİŞTİRMEDİ", ara?.passwordHash === once?.passwordHash);
    check("reddedilen sıfırlama oturumları DÜŞÜRMEDİ (tokenVersion aynı)", ara?.tokenVersion === once?.tokenVersion);
    await PermissionManagementService.resetUserPassword(ok.id, "Yeni-Guclu-Parola-77", undefined);
    const sonra = await prisma.user.findUnique({ where: { id: ok.id }, select: { passwordHash: true, tokenVersion: true } });
    check("güçlü sıfırlama hash'i değiştirdi", sonra?.passwordHash !== once?.passwordHash);
  } finally {
    // Bekçi kullanıcısı sert silinmez (audit FK) — pasifleştirilir.
    if (created.length) await prisma.user.updateMany({ where: { id: { in: created } }, data: { isActive: false } });
  }
}

async function main(): Promise<void> {
  section1();
  section2();
  await section3();
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
