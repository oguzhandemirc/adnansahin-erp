// =============================================================================
// Test: süperadmin ve yönetici hesabı PIN/kartla GİREMEZ (Y5, denetim 2026-11-13)
// Çalıştır: npx tsx scripts/run-all-tests.ts test_pin_privileged_refused
// =============================================================================
// Bulgu: hızlı PIN tek faktördür; 6 haneli uzayda her deneme HERHANGİ bir PIN'li
// hesabı açar (süperadmin dahil). D3 kapısı (yalnız onaylı saha cihazı) bir
// derinlik katmanıdır, sınır değil (`x-device-id` sır değil).
//
// Kilitlenen sözleşme:
//   §1 saf yüklem `isPrivilegedForFieldLogin`: `*`, `admin:*`, `admin:settings`,
//      `admin:users` → yasak; saha/web izinleri → serbest.
//   §2 PIN: `admin:settings` / `admin:*` / `admin:users` taşıyan hesap onaylı
//      tabletten bile 401 alır ve cevap TANINMAYAN PIN'le birebir aynıdır
//      (durum + metin + details) — PIN'in var olduğu sızmaz; sıradan hesap girer.
//   §3 kart: aynı kural ve aynı cevap eşitliği.
//   §4 statik: iki servis yolunda reddin `issueToken`dan ÖNCE olduğu.
// Süperadmin hesabı bu bekçide YARATILMAZ (sistem hesabı tektir); onun yolu
// `getEffectivePermissions` → `["*"]` (test_superadmin) + §1'deki `*` satırıdır.
//
// Negatif sondalar (BİR KEZLİK, md5 ile geri alındı; sayılar commit mesajında):
//   S1 PIN yolundaki `isFieldLoginForbidden` koşulu kaldırıldı — kırmızı.
//   S2 yüklemden `admin:` öneki kaldırıldı (yalnız `*`) — kırmızı.
// =============================================================================
import prisma from "../src/lib/prisma"; // İLK import: dotenv
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { Prisma } from "@prisma/client";
import {
  AuthService,
  CARD_UNKNOWN_MESSAGE,
  PIN_UNKNOWN_MESSAGE,
  isPrivilegedForFieldLogin,
  type LoginContext,
} from "../src/services/auth.service";
import { AppError } from "../src/utils/app-error";
import { SETTING_KEYS, invalidateFeatureFlagsCache } from "../src/services/system-setting.service";

const SAHA: LoginContext = { clientType: "mobile", fieldDevice: { kind: "TABLET" } };
const SERVICE = join(__dirname, "../src/services/auth.service.ts");

let pass = 0, fail = 0;
function check(label: string, ok: boolean, extra = ""): void {
  if (ok) { pass++; console.log(`✅ ${label}${extra ? " — " + extra : ""}`); }
  else { fail++; console.log(`❌ ${label}${extra ? " — " + extra : ""}`); }
}

type Outcome = { ok: boolean; status?: number; message?: string; details?: string };
async function outcome(fn: () => Promise<unknown>): Promise<Outcome> {
  try {
    await fn();
    return { ok: true };
  } catch (e) {
    if (e instanceof AppError) return { ok: false, status: e.statusCode, message: e.message, details: JSON.stringify(e.details ?? null) };
    throw e;
  }
}
const same = (a: Outcome, b: Outcome): boolean =>
  !a.ok && !b.ok && a.status === b.status && a.message === b.message && a.details === b.details;

function unitSection(): void {
  console.log("§1 Yüklem");
  const cases: Array<[string[], boolean]> = [
    [["*"], true],
    [["admin:*"], true],
    [["admin:settings"], true],
    [["admin:users"], true],
    [["mobile:kk1", "admin:settings"], true],
    [["mobile:kk1", "order:read"], false],
    [["mobile:*"], false],
    [[], false],
  ];
  for (const [perms, want] of cases) {
    check(`isPrivilegedForFieldLogin(${JSON.stringify(perms)}) = ${want}`, isPrivilegedForFieldLogin(perms) === want);
  }
}

function staticSection(): void {
  console.log("\n§4 Statik — ret issueToken'dan önce");
  const src = readFileSync(SERVICE, "utf8");
  for (const name of ["loginWithQuickPin", "loginWithCard"]) {
    const start = src.indexOf(`static async ${name}(`);
    const rest = start === -1 ? "" : src.slice(start + 1);
    const end = rest.search(/\n  (static|private static|\/\*\*)/);
    const body = end === -1 ? rest : rest.slice(0, end);
    const gate = body.indexOf("isFieldLoginForbidden(");
    const issue = body.indexOf("issueToken(");
    check(`${name}: yönetici reddi issueToken'dan ÖNCE`, gate !== -1 && issue !== -1 && gate < issue, `gate=${gate} issue=${issue}`);
  }
}

async function main(): Promise<void> {
  unitSection();
  staticSection();

  const ts = Date.now();
  const strong = `Tst-${ts}-Kz9!q`;
  const mk = async (tag: string) =>
    prisma.user.create({
      data: { username: `TEST-y5-${tag}-${ts}`, passwordHash: await AuthService.hashPassword(strong), fullName: `TEST Y5 ${tag}` },
      select: { id: true, username: true },
    });
  const users = {
    field: await mk("saha"),
    settings: await mk("ayar"),
    star: await mk("yildiz"),
    usersAdm: await mk("kullanici"),
  };
  const ids = Object.values(users).map((u) => u.id);
  const permIds = new Map(
    (await prisma.permission.findMany({
      where: { code: { in: ["mobile:kk1", "admin:settings", "admin:*", "admin:users"] } },
      select: { id: true, code: true },
    })).map((p) => [p.code, p.id]),
  );
  const grant = async (userId: string, code: string) => {
    const permissionId = permIds.get(code);
    if (!permissionId) throw new Error(`izin satırı yok: ${code}`);
    await prisma.userPermission.create({ data: { userId, permissionId } });
  };

  const methodsKey = SETTING_KEYS.AUTH_LOGIN_METHODS;
  const prev = await prisma.systemSetting.findUnique({ where: { key: methodsKey }, select: { value: true, updatedById: true } });
  try {
    await grant(users.field.id, "mobile:kk1");
    await grant(users.settings.id, "mobile:kk1");
    await grant(users.settings.id, "admin:settings");
    await grant(users.star.id, "admin:*");
    await grant(users.usersAdm.id, "admin:users");
    await prisma.systemSetting.upsert({
      where: { key: methodsKey },
      create: { key: methodsKey, value: { enabled: ["list", "pin", "card"], primary: "list" } },
      update: { value: { enabled: ["list", "pin", "card"], primary: "list" } },
    });
    invalidateFeatureFlagsCache();

    console.log("\n§2 PIN");
    const pins: Record<string, string> = {};
    for (const [k, u] of Object.entries(users)) {
      const r = await AuthService.setQuickPin(u.id, {}, undefined);
      if (!r.pin) throw new Error("PIN atanamadı");
      pins[k] = r.pin;
    }
    let unknownPin = "";
    for (let i = 0; i < 1000 && !unknownPin; i++) {
      const cand = String((313131 + i * 7) % 1_000_000).padStart(6, "0");
      if (!(await prisma.user.findFirst({ where: { quickPin: cand }, select: { id: true } }))) unknownPin = cand;
    }
    const unknown = await outcome(() => AuthService.loginWithQuickPin(unknownPin, SAHA));
    check("ön koşul: tanınmayan PIN 401 + sabit metin", unknown.status === 401 && unknown.message === PIN_UNKNOWN_MESSAGE, JSON.stringify(unknown));
    const fieldOk = await outcome(() => AuthService.loginWithQuickPin(pins.field, SAHA));
    check("sıradan saha hesabı PIN'le girer", fieldOk.ok, JSON.stringify(fieldOk));
    for (const k of ["settings", "star", "usersAdm"] as const) {
      const r = await outcome(() => AuthService.loginWithQuickPin(pins[k], SAHA));
      check(`${k}: yönetici hesabı PIN'le GİREMEZ ve cevap tanınmayan PIN'le birebir aynı`, same(r, unknown), JSON.stringify(r));
    }

    console.log("\n§3 Kart");
    const fieldCard = await AuthService.rotateCardToken(users.field.id, users.field.id);
    const adminCard = await AuthService.rotateCardToken(users.settings.id, users.settings.id);
    const bogus = `TEKSU:${users.settings.id}:${"0".repeat(32)}`;
    const unknownCard = await outcome(() => AuthService.loginWithCard(bogus, SAHA));
    check("ön koşul: geçersiz kart 401 + sabit metin", unknownCard.status === 401 && unknownCard.message === CARD_UNKNOWN_MESSAGE, JSON.stringify(unknownCard));
    check("sıradan saha hesabı kartla girer", (await outcome(() => AuthService.loginWithCard(fieldCard.cardCode, SAHA))).ok);
    const adminCardRes = await outcome(() => AuthService.loginWithCard(adminCard.cardCode, SAHA));
    check("yönetici hesabı kartla GİREMEZ ve cevap geçersiz kartla birebir aynı", same(adminCardRes, unknownCard), JSON.stringify(adminCardRes));
  } finally {
    if (prev) {
      await prisma.systemSetting.update({
        where: { key: methodsKey },
        data: { value: prev.value as Prisma.InputJsonValue, updatedById: prev.updatedById },
      }).catch(() => {});
    } else {
      await prisma.systemSetting.deleteMany({ where: { key: methodsKey } }).catch(() => {});
    }
    invalidateFeatureFlagsCache();
    await prisma.session.deleteMany({ where: { userId: { in: ids } } }).catch(() => {});
    await prisma.systemLog.deleteMany({ where: { userId: { in: ids } } }).catch(() => {});
    await prisma.userPermission.deleteMany({ where: { userId: { in: ids } } }).catch(() => {});
    await prisma.user.deleteMany({ where: { id: { in: ids } } }).catch(() => {});
  }

  console.log(`\n=== Sonuç: ${pass} geçti, ${fail} başarısız ===`);
  await prisma.$disconnect();
  process.exit(fail > 0 ? 1 : 0);
}

main().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect();
  process.exit(1);
});
