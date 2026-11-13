// =============================================================================
// Test: başarılı giriş IP kovasını SIFIRLAMAZ (Y4, güvenlik denetimi 2026-11-13)
// Çalıştır: npx tsx scripts/run-all-tests.ts test_login_lockout_success_settle
// =============================================================================
// Bulgu: başarılı giriş geniş (IP) kovanın sayacını ve bloğunu sıfırlıyordu.
// Herhangi bir operatör hesabı olan kişi (eşik-1) yanlış deneme → kendi geçerli
// girişi → tekrar döngüsüyle başka hesabın parolasını ya da PIN uzayını
// SINIRSIZ tarıyordu; sayaç eşiğe hiç varmadığı için ceza basamağı da artmıyordu.
//
// Kilitlenen sözleşme (`settleLoginSuccess`):
//   §1 hesap kimliği (parola, parola değiştirme): dar kova sıfırlanır, geniş
//      kovadan YALNIZ o kimliğin kendi hataları düşülür → araya giriş sokan
//      saldırgan fabrika ve vekil kipinde eşiğe varır; meşru kullanıcının
//      kendi yanlışları silinir.
//   §2 cihaz kimliği (PIN, kart): yalnız kendi rezervasyonu geri alınır.
//   §3 geniş kovanın aktif bloğu başarıyla kalkmaz; hatalar boşta çürür.
//   §4 statik: controller giriş yollarında `resetLoginLockout` YOK, dört yol
//      `settleLoginSuccess`i doğru kimlik türüyle çağırır (körlük zemini 4).
//
// Global ayar YAZMAZ: kilit ayarını okur; kapalıysa davranış bölümü KIRMIZI
// (atlama yeşil sayılmaz). Kova anahtarları rastgele belgeleme IP'lerinden.
//
// Negatif sondalar (BİR KEZLİK, md5 ile geri alındı; sayılar commit mesajında):
//   P1 hesap kipinde geniş kova tamamen sıfırlandı (eski davranış) — 2 ❌.
//   P2 cihaz kipinde kovalar tamamen sıfırlandı — 1 ❌.
//   P3 PIN/kart controller'ında settle yerine resetLoginLockout — 4 ❌.
// =============================================================================
import { readFileSync } from "fs";
import { join } from "path";
import type { Request } from "express";
import prisma, { pool } from "../src/lib/prisma";
import {
  reserveLoginAttempt,
  resetLoginLockout,
  resolveLoginLockoutKeys,
  settleLoginSuccess,
  type LockoutKeySpec,
} from "../src/middlewares/login-lockout";
import { readPinLockoutConfig } from "../src/services/system-setting.service";

const CTRL = join(__dirname, "../src/controllers/auth.controller.ts");

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

const FACTORY_ENV: NodeJS.ProcessEnv = { NODE_ENV: "development" };
const PROXY_ENV: NodeJS.ProcessEnv = { NODE_ENV: "development", TRUST_PROXY: "1" };
const used: LockoutKeySpec[][] = [];

function keysFor(ip: string, identity: string, env: NodeJS.ProcessEnv): LockoutKeySpec[] {
  const req = { method: "POST", originalUrl: "/api/auth/login", ip, headers: {} } as unknown as Request;
  const k = resolveLoginLockoutKeys(req, identity, env);
  used.push(k);
  return k;
}
function randomIp(): string {
  return `198.51.100.${Math.floor(Math.random() * 250) + 1}`;
}

/**
 * Y4 saldırısı: her turda (eşik-1) kurban denemesi + kendi geçerli girişi.
 * Kaçıncı kurban denemesinde 429 alındığını döner (-1 = hiç kilitlenmedi).
 */
async function interleaveAttack(env: NodeJS.ProcessEnv, attempts: number, rounds: number): Promise<number> {
  const ip = randomIp();
  const victim = keysFor(ip, "u:tst-kurban", env);
  const self = keysFor(ip, "u:tst-saldirgan", env);
  let n = 0;
  for (let r = 0; r < rounds; r++) {
    for (let i = 0; i < attempts - 1; i++) {
      n++;
      if ((await reserveLoginAttempt(victim)).blocked) return n;
    }
    const own = await reserveLoginAttempt(self);
    if (own.blocked) return n;
    settleLoginSuccess(self, "account");
  }
  return -1;
}

async function behaviour(): Promise<void> {
  const cfg = await readPinLockoutConfig();
  console.log(`(ayar: enabled=${cfg.enabled} attempts=${cfg.attempts} longPenaltyMin=${cfg.longPenaltyMin})`);
  if (!cfg.enabled) {
    check("davranış bölümü koşulabildi (auth.pinLockoutEnabled açık)", false, "ayar kapalı");
    return;
  }
  const A = cfg.attempts;

  console.log("\n§1 Hesap kimliği — araya giriş sokan saldırgan");
  const f = await interleaveAttack(FACTORY_ENV, A, 20);
  check("fabrika kipi: araya kendi girişini sokan saldırgan eşiğe varır", f !== -1 && f <= A + 1, `kilit ${f}. kurban denemesinde`);
  const p = await interleaveAttack(PROXY_ENV, A, 40);
  check("vekil kipi: aynı saldırı kurbanın dar kovasında kilitlenir", p !== -1 && p <= A + 1, `kilit ${p}. kurban denemesinde`);

  // Meşru kullanıcı: kendi (eşik-1) yanlışı + başarı → yeni tam bütçe.
  for (const [name, env] of [["fabrika", FACTORY_ENV], ["vekil", PROXY_ENV]] as const) {
    const ip = randomIp();
    const me = keysFor(ip, "u:tst-mesru", env);
    for (let i = 0; i < A - 1; i++) await reserveLoginAttempt(me);
    await reserveLoginAttempt(me);
    settleLoginSuccess(me, "account");
    let blockedEarly = false;
    for (let i = 0; i < A - 1; i++) if ((await reserveLoginAttempt(me)).blocked) blockedEarly = true;
    check(`${name}: meşru kullanıcının kendi yanlışları başarıyla silinir (bütçe tazelenir)`, !blockedEarly);
  }

  console.log("\n§2 Cihaz kimliği (PIN/kart) — başarı önceki hataları silmez");
  {
    const ip = randomIp();
    const dev = keysFor(ip, "pin:tst-tablet", FACTORY_ENV);
    let blockedAt = -1;
    for (let r = 0; r < 10 && blockedAt === -1; r++) {
      for (let i = 0; i < A - 1; i++) {
        if ((await reserveLoginAttempt(dev)).blocked) { blockedAt = r; break; }
      }
      if (blockedAt !== -1) break;
      await reserveLoginAttempt(dev);
      settleLoginSuccess(dev, "device");
    }
    check("PIN: araya geçerli PIN sokmak kilidi sıfırlamaz", blockedAt !== -1 && blockedAt <= 1, `kilit ${blockedAt}. turda`);

    const ip2 = randomIp();
    const dev2 = keysFor(ip2, "pin:tst-tablet2", FACTORY_ENV);
    await reserveLoginAttempt(dev2);
    settleLoginSuccess(dev2, "device");
    let early = false;
    for (let i = 0; i < A; i++) if ((await reserveLoginAttempt(dev2)).blocked) early = true;
    check("PIN: başarılı denemenin kendi rezervasyonu geri alınır (net sıfır)", !early);
  }

  console.log("\n§3 Blok kalkmaz · boşta çürüme");
  {
    const ip = randomIp();
    const other = keysFor(ip, "u:tst-baska", FACTORY_ENV);
    const self = keysFor(ip, "u:tst-ben", FACTORY_ENV);
    for (let i = 0; i < A; i++) await reserveLoginAttempt(other);
    const blocked = await reserveLoginAttempt(self);
    check("ön koşul: geniş kova kilitli (başka kimlikle bile)", blocked.blocked);
    settleLoginSuccess(self, "account");
    const after = await reserveLoginAttempt(self);
    check("başarı geniş kovanın AKTİF bloğunu kaldırmaz", after.blocked, JSON.stringify(after));

    // Yarış: benim rezervasyonum bcrypt'teyken başkası kilidi kurar → benim
    // başarım o kilidi geri alamaz (yalnız kendi kurduğu kilidi alır).
    const ip3 = randomIp();
    const mine = keysFor(ip3, "u:tst-yaris-ben", FACTORY_ENV);
    const theirs = keysFor(ip3, "u:tst-yaris-o", FACTORY_ENV);
    await reserveLoginAttempt(mine);
    for (let i = 0; i < A - 1; i++) await reserveLoginAttempt(theirs);
    settleLoginSuccess(mine, "account");
    const race = await reserveLoginAttempt(mine);
    check("yarış: başkasının kurduğu kilit sonradan biten başarıyla kalkmaz", race.blocked, JSON.stringify(race));

    const ip2 = randomIp();
    const k = keysFor(ip2, "u:tst-curume", FACTORY_ENV);
    for (let i = 0; i < A - 1; i++) await reserveLoginAttempt(k);
    const realNow = Date.now;
    const skew = cfg.longPenaltyMin * 60_000 + 5_000;
    Date.now = () => realNow() + skew;
    try {
      let early = false;
      for (let i = 0; i < A - 1; i++) if ((await reserveLoginAttempt(k)).blocked) early = true;
      check("boşta çürüme: pencere geçince hatalar sıfırdan sayılır", !early);
    } finally {
      Date.now = realNow;
    }
  }
}

function staticSection(): void {
  console.log("\n§4 Statik — controller giriş yolları");
  const src = readFileSync(CTRL, "utf8");
  check("auth.controller resetLoginLockout ÇAĞIRMAZ (tam temizlik giriş yolunda yasak)", !/resetLoginLockout\(/.test(src));
  const calls = [...src.matchAll(/settleLoginSuccess\(lockoutKey,\s*"(account|device)"\)/g)].map((m) => m[1]);
  check("körlük zemini: 4 settleLoginSuccess çağrısı bulundu", calls.length === 4, `${calls.length}`);
  const want: Record<string, string> = { login: "account", loginCard: "device", loginQuickPin: "device", changePassword: "account" };
  for (const [name, kind] of Object.entries(want)) {
    const start = src.indexOf(`static async ${name}(`);
    const rest = start === -1 ? "" : src.slice(start + 1);
    const nextAt = rest.search(/\n  static async \w+\(/);
    const body = nextAt === -1 ? rest : rest.slice(0, nextAt);
    check(`${name}: settleLoginSuccess(..., "${kind}")`, body.includes(`settleLoginSuccess(lockoutKey, "${kind}")`));
  }
}

async function main(): Promise<void> {
  console.log("=== Başarılı giriş IP kovasını sıfırlamaz (Y4) ===\n");
  try {
    await behaviour();
    staticSection();
  } finally {
    for (const k of used) resetLoginLockout(k);
  }
  console.log(`\n=== Sonuç: ${pass} geçti, ${fail} başarısız ===`);
  await prisma.$disconnect();
  await pool.end();
  process.exitCode = fail > 0 ? 1 : 0;
}

main().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect();
  await pool.end();
  process.exit(1);
});
