// =============================================================================
// Test: ZAYIF PAROLAYLA GİRİŞ → KISITLI OTURUM + KENDİ PAROLASINI DEĞİŞTİR
// Çalıştır: npx tsx scripts/run-all-tests.ts test_password_change_required
// =============================================================================
// Kullanıcı kararı 2026-11-13: parolayla girişte parola kurala uymuyorsa giriş
// başarılı ama "parolanı değiştirmeden devam edemezsin" durumu döner; kısıtlı
// oturum YALNIZ kendi parolasını değiştirme ucunu ve çıkışı kullanabilir, diğer
// her uç 403 `PASSWORD_CHANGE_REQUIRED`.
//
//   §0 STATİK — allowlist tam iki uç; route verifyToken arkasında; login kuralı
//      helper'dan ölçüyor; değiştirme yeni parolayı helper'dan hash'liyor.
//   §1 MASAÜSTÜ ZAYIF GİRİŞ — 200 + `passwordChangeRequired` + token izinsiz ve
//      claim'li; `/auth/me`, `/api/items`, tercihler 403 PASSWORD_CHANGE_REQUIRED.
//   §2 DEĞİŞTİR — yanlış eski parola 400 CURRENT_PASSWORD_INVALID · zayıf yeni
//      400 PASSWORD_POLICY · aynı parola 400 · başarı: yeni TAM token, eski token
//      401, audit yükünde parola YOK, yeni parolayla giriş kısıtsız.
//   §3 SAHA ZAYIF GİRİŞ — mobil istemci kilitlenmez ama token yalnız mobile:*.
//   §4 kısıtlı oturum çıkış yapabilir; normal oturum da parolasını değiştirir.
//
// Uygulama süreç İÇİNDE `app.listen(0)` ile kurulur (ikinci Node süreci yok).
//
// Gerekli mi: evet — kapı doğduğu gün "izin kontrolü taşımayan" uçlar
// (`/auth/me`, `/auth/preferences`) izinsiz token'la açıktı; kapı yalnız
// izinleri boşaltsaydı onlar sızardı.
//
// Negatif sondalar (BİR KEZLİK, md5 ile geri alındı; sayılar commit mesajında):
//   S1 `verifyToken`daki kısıtlı oturum kapısı kaldırıldı — kırmızı.
//   S2 login'de kapsam daraltması kaldırıldı (zayıf parola tam token) — kırmızı.
//   S3 değiştirmede kural helper'ı atlandı (`AuthService.hashPassword`) — kırmızı.
// =============================================================================
import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { AddressInfo } from "node:net";
import jwt from "jsonwebtoken";
import app from "../src/app";
import prisma, { pool } from "../src/lib/prisma";
import { AuthService } from "../src/services/auth.service";
import { PASSWORD_CHANGE_ALLOWED } from "../src/middlewares/auth.middleware";
import { hedefDbEngeli } from "./lib/hedef-db-kapisi";

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
const WEAK = "123456";
const STRONG_1 = "Bekci-Yeni-Parola-91";
const STRONG_2 = "Bekci-Ikinci-Parola-37";

function section0(): void {
  console.log("\n§0 statik");
  check(
    "allowlist tam iki uç: change-password + logout",
    PASSWORD_CHANGE_ALLOWED.size === 2 &&
      PASSWORD_CHANGE_ALLOWED.has("POST /api/auth/change-password") &&
      PASSWORD_CHANGE_ALLOWED.has("POST /api/auth/logout"),
    [...PASSWORD_CHANGE_ALLOWED].join(", "),
  );
  const routes = readFileSync(join(ROOT, "src/routes/auth.routes.ts"), "utf8");
  check("change-password route verifyToken arkasında", /router\.post\("\/change-password",\s*verifyToken,/.test(routes));
  const svc = readFileSync(join(ROOT, "src/services/auth.service.ts"), "utf8");
  check("login kuralı helper'dan ölçüyor (checkPasswordPolicy)", /checkPasswordPolicy\(password,/.test(svc));
  check("değiştirme yeni parolayı helper'dan hash'liyor (newPasswordFields, Y8 sürümüyle)", /newPasswordFields\(newPassword,/.test(svc));
  const mw = readFileSync(join(ROOT, "src/middlewares/auth.middleware.ts"), "utf8");
  check("verifyToken kısıtlı claim'i soruyor", /payload\.passwordChangeRequired === true/.test(mw));
}

async function main(): Promise<void> {
  section0();
  const engel = hedefDbEngeli();
  if (engel) {
    check("hedef DB yazılabilir", false, engel);
    return finish();
  }

  const ts = Date.now().toString(36);
  const perms = await prisma.permission.findMany({
    where: { code: { in: ["item:read", "mobile:kk1"] } },
    select: { id: true, code: true },
  });
  check("fixture izinleri DB'de (item:read, mobile:kk1)", perms.length === 2);
  const mkUser = async (suffix: string, password: string): Promise<{ id: string; username: string }> => {
    const username = `TSTPCR${ts}${suffix}`;
    const u = await prisma.user.create({
      data: {
        username,
        fullName: `TST Kisitli ${suffix}`,
        passwordHash: await AuthService.hashPassword(password),
        permissions: { create: perms.map((p) => ({ permissionId: p.id })) },
      },
      select: { id: true, username: true },
    });
    created.push(u.id);
    return u;
  };
  const created: string[] = [];

  const server = app.listen(0, "127.0.0.1");
  await new Promise<void>((r) => server.once("listening", () => r()));
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  type Resp = { status: number; body: { success?: boolean; message?: string; data?: Record<string, unknown>; details?: { code?: string; reason?: string } } };
  const call = async (method: string, path: string, token: string | null, body?: unknown): Promise<Resp> => {
    const r = await fetch(`${base}${path}`, {
      method,
      headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
    });
    const text = await r.text();
    let parsed: Resp["body"] = {};
    try {
      parsed = JSON.parse(text) as Resp["body"];
    } catch {
      /* boş gövde (204) */
    }
    return { status: r.status, body: parsed };
  };
  const claims = (t: string): Record<string, unknown> => (jwt.decode(t) as Record<string, unknown>) ?? {};

  try {
    // ── §1 masaüstü zayıf giriş ──────────────────────────────────────────────
    console.log("\n§1 masaüstü zayıf parolayla giriş");
    const weak = await mkUser("a", WEAK);
    const login = await call("POST", "/api/auth/login", null, { username: weak.username, password: WEAK, clientType: "electron" });
    check("giriş 200", login.status === 200, String(login.status));
    check("yanıtta passwordChangeRequired:true", login.body.data?.passwordChangeRequired === true);
    const rToken = String(login.body.data?.token ?? "");
    const rc = claims(rToken);
    check("token claim'i passwordChangeRequired:true", rc.passwordChangeRequired === true);
    check("token izinleri BOŞ", Array.isArray(rc.permissions) && (rc.permissions as unknown[]).length === 0, JSON.stringify(rc.permissions));
    for (const [m, p] of [["GET", "/api/auth/me"], ["GET", "/api/auth/me?x=1"], ["GET", "/api/items"], ["GET", "/api/auth/preferences"], ["PUT", "/api/auth/preferences"], ["GET", "/api/sessions/active"]] as const) {
      const r = await call(m, p, rToken, m === "PUT" ? {} : undefined);
      check(`kısıtlı oturum ${m} ${p} → 403 PASSWORD_CHANGE_REQUIRED`, r.status === 403 && r.body.details?.code === "PASSWORD_CHANGE_REQUIRED", `${r.status} ${r.body.details?.code ?? ""}`);
    }

    // ── §2 değiştir ──────────────────────────────────────────────────────────
    console.log("\n§2 kendi parolasını değiştir");
    const wrong = await call("POST", "/api/auth/change-password", rToken, { currentPassword: "yanlis-parola", newPassword: STRONG_1, clientType: "electron" });
    check("yanlış eski parola → 400 CURRENT_PASSWORD_INVALID", wrong.status === 400 && wrong.body.details?.code === "CURRENT_PASSWORD_INVALID", `${wrong.status} ${wrong.body.details?.code ?? ""}`);
    const weakNew = await call("POST", "/api/auth/change-password", rToken, { currentPassword: WEAK, newPassword: "1234567890", clientType: "electron" });
    check("zayıf yeni parola → 400 PASSWORD_POLICY", weakNew.status === 400 && weakNew.body.details?.code === "PASSWORD_POLICY", `${weakNew.status} ${weakNew.body.details?.reason ?? ""}`);
    check("  hata mesajı yeni parolayı taşımıyor", !(weakNew.body.message ?? "").includes("1234567890"));
    const once = await prisma.user.findUnique({ where: { id: weak.id }, select: { passwordHash: true, tokenVersion: true } });
    const ok = await call("POST", "/api/auth/change-password", rToken, { currentPassword: WEAK, newPassword: STRONG_1, clientType: "electron" });
    check("değiştirme 200", ok.status === 200, `${ok.status} ${ok.body.message ?? ""}`);
    const nToken = String(ok.body.data?.token ?? "");
    const nc = claims(nToken);
    check("yeni token kısıtsız ve TAM izinli", nc.passwordChangeRequired === undefined && Array.isArray(nc.permissions) && (nc.permissions as string[]).includes("item:read"), JSON.stringify(nc.permissions));
    const sonra = await prisma.user.findUnique({ where: { id: weak.id }, select: { passwordHash: true, tokenVersion: true } });
    check("hash değişti + tokenVersion arttı", sonra?.passwordHash !== once?.passwordHash && sonra?.tokenVersion === (once?.tokenVersion ?? -9) + 1);
    const old = await call("GET", "/api/auth/me", rToken);
    check("eski (kısıtlı) token artık 401", old.status === 401, String(old.status));
    const me = await call("GET", "/api/auth/me", nToken);
    check("yeni token /auth/me 200", me.status === 200, String(me.status));
    const audit = await prisma.systemLog.findFirst({
      where: { tableName: "USER_PASSWORD", recordId: weak.id },
      orderBy: { createdAt: "desc" },
      select: { newData: true, userId: true },
    });
    const auditJson = JSON.stringify(audit?.newData ?? null);
    check("audit USER_PASSWORD selfService yazıldı (aktör = kendisi)", /"selfService":true/.test(auditJson) && audit?.userId === weak.id, auditJson);
    check("audit yükünde eski/yeni parola YOK", !auditJson.includes(STRONG_1) && !auditJson.includes(WEAK));
    const same = await call("POST", "/api/auth/change-password", nToken, { currentPassword: STRONG_1, newPassword: STRONG_1 });
    check("aynı parola → 400", same.status === 400, `${same.status} ${same.body.details?.reason ?? ""}`);
    const relog = await call("POST", "/api/auth/login", null, { username: weak.username, password: STRONG_1, clientType: "electron" });
    check("yeni parolayla giriş kısıtsız", relog.status === 200 && relog.body.data?.passwordChangeRequired === undefined && claims(String(relog.body.data?.token)).passwordChangeRequired === undefined);

    // ── §3 saha zayıf giriş ──────────────────────────────────────────────────
    console.log("\n§3 saha (mobil) zayıf parolayla giriş");
    const field = await mkUser("b", WEAK);
    const ml = await call("POST", "/api/auth/login", null, { username: field.username, password: WEAK, clientType: "mobile" });
    const mc = claims(String(ml.body.data?.token ?? ""));
    check("mobil giriş 200 (kilitlenmez) + passwordChangeRequired bilgisi", ml.status === 200 && ml.body.data?.passwordChangeRequired === true, String(ml.status));
    check("mobil token kısıtlı claim TAŞIMAZ", mc.passwordChangeRequired === undefined);
    check("mobil token YALNIZ mobile:* izinleri", JSON.stringify(mc.permissions) === JSON.stringify(["mobile:kk1"]), JSON.stringify(mc.permissions));
    const nl = await call("POST", "/api/auth/login", null, { username: field.username, password: WEAK });
    check("clientType'sız (eski tablet) giriş de mobil kapsam", nl.status === 200 && JSON.stringify(claims(String(nl.body.data?.token ?? "")).permissions) === JSON.stringify(["mobile:kk1"]));

    // ── §4 çıkış + normal oturum ─────────────────────────────────────────────
    console.log("\n§4 kısıtlı çıkış · normal oturumda değiştirme");
    const third = await mkUser("c", WEAK);
    const tl = await call("POST", "/api/auth/login", null, { username: third.username, password: WEAK, clientType: "web" });
    const tToken = String(tl.body.data?.token ?? "");
    check("web istemcisi de kısıtlı", claims(tToken).passwordChangeRequired === true);
    const lo = await call("POST", "/api/auth/logout", tToken, {});
    check("kısıtlı oturum çıkış yapabilir (200)", lo.status === 200, String(lo.status));
    const strongUser = await mkUser("d", STRONG_1);
    const sl = await call("POST", "/api/auth/login", null, { username: strongUser.username, password: STRONG_1, clientType: "electron" });
    check("güçlü parolayla giriş kısıtsız", sl.status === 200 && sl.body.data?.passwordChangeRequired === undefined);
    const sItems = await call("GET", "/api/items", String(sl.body.data?.token ?? ""));
    check("güçlü oturum /api/items 200", sItems.status === 200, String(sItems.status));
    const sc = await call("POST", "/api/auth/change-password", String(sl.body.data?.token ?? ""), { currentPassword: STRONG_1, newPassword: STRONG_2, clientType: "electron" });
    check("normal oturum da parolasını değiştirir", sc.status === 200, String(sc.status));
  } finally {
    await new Promise<void>((r) => server.close(() => r()));
    // Bekçi kullanıcısı sert silinmez (audit FK) — pasifleştirilir.
    if (created.length) await prisma.user.updateMany({ where: { id: { in: created } }, data: { isActive: false } });
  }
  return finish();
}

async function finish(): Promise<void> {
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
