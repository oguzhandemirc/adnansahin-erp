// =============================================================================
// Test: PIN VE KART GİRİŞİ YALNIZ ONAYLI SAHA CİHAZINDAN
// Çalıştır: npx tsx scripts/run-all-tests.ts test_pin_field_only
// =============================================================================
// Şifre sıkılaştırma D3 (2026-11-13): hızlı PIN ve QR kart tek başına kimliktir;
// panelden ya da cihazsız bir betikten denenebilselerdi 6 haneli uzay masaüstünden
// taranabilirdi. Kapı (`AuthService.assertFieldDevice`): masaüstü `clientType`
// (electron/web) · onaylı + aktif cihaz kaydı yok · cihaz DESKTOP → 403
// `details.code = PIN_FIELD_ONLY` / `CARD_FIELD_ONLY`. Kapı PIN/kart DB'ye
// sorulmadan ÖNCE çalışır: panelden geçerli ve geçersiz PIN AYNI cevabı alır.
//
//   §0 STATİK — controller `fieldDevice`i `req.device`ten doldurur (gövdeden değil);
//      iki serviste kapı DB sorgusundan önce.
//   §1 PIN (HTTP) — cihazsız, panel clientType (electron/web), DESKTOP, PENDING,
//      pasif, bilinmeyen cihaz → 403; geçerli/yanlış PIN aynı cevap;
//      onaylı TABLET + PHONE → 200; 403 kilit sayacına yazılmaz; PIN hiçbir
//      cevap gövdesine ve giriş olayı (SystemLog) yüküne yazılmaz.
//   §2 KART (HTTP) — aynı kapı, `CARD_FIELD_ONLY`.
//   §3 SERVİS — ctx'siz çağrı 403; uzak istek kapıdan önce 404 (uç gizli kalır).
//
// Uygulama süreç İÇİNDE `app.listen(0)` ile kurulur (ikinci Node süreci yok).
//
// Gerekli mi: evet — PIN girişinin cihaz şartı yoktu; panelden PIN taranabiliyordu.
//
// Negatif sondalar (BİR KEZLİK, md5 ile geri alındı; sayılar commit mesajında):
//   S1 iki servisteki `assertFieldDevice` çağrısı kaldırıldı — kırmızı.
//   S2 kapıdaki masaüstü `clientType` koşulu kaldırıldı (panel istemcisi onaylı
//      tablet kimliğiyle PIN'le girebilir) — kırmızı.
// =============================================================================
import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { AddressInfo } from "node:net";
import { randomUUID } from "node:crypto";
import app from "../src/app";
import prisma, { pool } from "../src/lib/prisma";
import { AuthService } from "../src/services/auth.service";
import { SETTING_KEYS } from "../src/services/system-setting.service";
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

function section0(): void {
  console.log("\n§0 statik");
  const ctl = readFileSync(join(ROOT, "src/controllers/auth.controller.ts"), "utf8");
  const fd = ctl.match(/fieldDevice: req\.device \? \{ kind: req\.device\.kind \} : null,/g) ?? [];
  check("controller iki girişte fieldDevice'ı req.device'tan dolduruyor", fd.length === 2, `${fd.length}`);
  check("controller fieldDevice'ı gövdeden okumuyor", !/fieldDevice:\s*body\./.test(ctl));
  const svc = readFileSync(join(ROOT, "src/services/auth.service.ts"), "utf8");
  for (const [fn, method, lookup] of [
    ["loginWithQuickPin", "pin", "quickPin: normalized"],
    ["loginWithCard", "card", "cardToken: m[2]"],
  ] as const) {
    const start = svc.indexOf(`static async ${fn}(`);
    const body = svc.slice(start, svc.indexOf("\n  }\n", start));
    const gate = body.indexOf(`this.assertFieldDevice(ctx, "${method}")`);
    const db = body.indexOf(lookup);
    check(`${fn}: kapı DB sorgusundan ÖNCE`, start > 0 && gate > 0 && db > gate, `gate=${gate} db=${db}`);
  }
}

async function main(): Promise<void> {
  section0();
  const engel = hedefDbEngeli();
  if (engel) {
    check("hedef DB yazılabilir", false, engel);
    return finish();
  }

  const ts = Date.now().toString(36);
  const startedAt = new Date();
  const prevMethods = await prisma.systemSetting.findUnique({
    where: { key: SETTING_KEYS.AUTH_LOGIN_METHODS },
    select: { value: true },
  });
  const prevPairing = await prisma.systemSetting.findUnique({
    where: { key: SETTING_KEYS.DEVICE_PAIRING_REQUIRED },
    select: { value: true },
  });
  const setSetting = async (key: string, value: unknown): Promise<void> => {
    await prisma.systemSetting.upsert({
      where: { key },
      update: { value: value as never },
      create: { key, value: value as never },
    });
  };
  await setSetting(SETTING_KEYS.AUTH_LOGIN_METHODS, { enabled: ["list", "pin", "card"], primary: "list" });
  // Eşleştirme KAPALI (fabrika varsayılanı): onaysız cihaz middleware'de kesilmez,
  // req.device'sız geçer — kapı tam da bu durumda kendi işini yapmalı.
  await setSetting(SETTING_KEYS.DEVICE_PAIRING_REQUIRED, false);

  const user = await prisma.user.create({
    data: {
      username: `TSTPFO${ts}`,
      fullName: "TST Saha PIN",
      passwordHash: await AuthService.hashPassword(`Pfo-${randomUUID()}`),
    },
    select: { id: true, username: true },
  });
  const pin = (await AuthService.setQuickPin(user.id, {}, user.id)).pin ?? "";
  const card = (await AuthService.rotateCardToken(user.id, user.id)).cardCode;
  check("fixture PIN 6 hane + kart üretildi", /^\d{6}$/.test(pin) && card.startsWith("TEKSU:"));

  const devices: string[] = [];
  const mkDevice = async (suffix: string, data: { kind: "TABLET" | "PHONE" | "DESKTOP"; status: "APPROVED" | "PENDING"; isActive?: boolean }): Promise<string> => {
    const deviceId = `tst-pfo-${ts}-${suffix}`;
    await prisma.device.create({
      data: { deviceId, name: `TST PFO ${suffix}`, kind: data.kind, status: data.status, isActive: data.isActive ?? true },
    });
    devices.push(deviceId);
    return deviceId;
  };
  const tablet = await mkDevice("tab", { kind: "TABLET", status: "APPROVED" });
  const phone = await mkDevice("phone", { kind: "PHONE", status: "APPROVED" });
  const desktop = await mkDevice("desk", { kind: "DESKTOP", status: "APPROVED" });
  const pending = await mkDevice("pend", { kind: "TABLET", status: "PENDING" });
  const inactive = await mkDevice("pasif", { kind: "TABLET", status: "APPROVED", isActive: false });
  const unknown = `tst-pfo-${ts}-yok`;

  const server = app.listen(0, "127.0.0.1");
  await new Promise<void>((r) => server.once("listening", () => r()));
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  type Resp = { status: number; text: string; body: { message?: string; data?: { user?: { userId?: string } }; details?: { code?: string } } };
  const post = async (path: string, body: Record<string, unknown>, deviceId?: string): Promise<Resp> => {
    const r = await fetch(`${base}${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...(deviceId ? { "x-device-id": deviceId } : {}) },
      body: JSON.stringify(body),
    });
    const text = await r.text();
    let parsed: Resp["body"] = {};
    try {
      parsed = JSON.parse(text) as Resp["body"];
    } catch {
      /* boş gövde */
    }
    return { status: r.status, text, body: parsed };
  };
  const denied = (r: Resp, code: string): boolean => r.status === 403 && r.body.details?.code === code;
  const bodies: string[] = [];

  try {
    // ── §1 PIN ───────────────────────────────────────────────────────────────
    console.log("\n§1 PIN girişi");
    const pinCases: Array<[string, Record<string, unknown>, string | undefined]> = [
      ["cihazsız (x-device-id yok)", { pin, clientType: "mobile" }, undefined],
      ["cihazsız + clientType yok", { pin }, undefined],
      ["⭐ panel istemcisi (electron) + onaylı tablet kimliği", { pin, clientType: "electron" }, tablet],
      ["⭐ web istemcisi + onaylı tablet kimliği", { pin, clientType: "web" }, tablet],
      ["onaylı DESKTOP cihaz", { pin, clientType: "mobile" }, desktop],
      ["PENDING cihaz (eşleştirme kapalı)", { pin, clientType: "mobile" }, pending],
      ["pasif cihaz", { pin, clientType: "mobile" }, inactive],
      ["kayıtsız cihaz kimliği", { pin, clientType: "mobile" }, unknown],
    ];
    for (const [label, body, dev] of pinCases) {
      const r = await post("/api/auth/login-quick-pin", body, dev);
      bodies.push(r.text);
      check(`PIN ${label} → 403 PIN_FIELD_ONLY`, denied(r, "PIN_FIELD_ONLY"), `${r.status} ${r.body.details?.code ?? ""}`);
    }
    const valid = await post("/api/auth/login-quick-pin", { pin, clientType: "electron" });
    const wrongPin = pin === "000001" ? "000002" : "000001";
    const invalid = await post("/api/auth/login-quick-pin", { pin: wrongPin, clientType: "electron" });
    bodies.push(valid.text, invalid.text);
    // (Biçimi bozuk PIN Zod şemasında 400 alır — sırdan bağımsız, kâhin değil.)
    check(
      "⭐ kâhin yok: panelden geçerli ve yanlış PIN birebir aynı cevap",
      valid.text === invalid.text && denied(valid, "PIN_FIELD_ONLY"),
      `${valid.status}/${invalid.status}`,
    );
    check("ret mesajı Türkçe ve yönlendirici", /saha cihazından/.test(valid.body.message ?? ""), valid.body.message ?? "");
    let locked = 0;
    for (let i = 0; i < 15; i++) {
      const r = await post("/api/auth/login-quick-pin", { pin: wrongPin, clientType: "electron" });
      if (r.status === 429) locked++;
    }
    check("403 kilit sayacına yazılmaz (15 panel denemesi, 429 yok)", locked === 0, `429=${locked}`);
    const ok = await post("/api/auth/login-quick-pin", { pin, clientType: "mobile" }, tablet);
    check("onaylı TABLET → 200 + doğru kullanıcı", ok.status === 200 && ok.body.data?.user?.userId === user.id, String(ok.status));
    const okPhone = await post("/api/auth/login-quick-pin", { pin, confirmKick: true }, phone);
    check("onaylı PHONE + clientType yok (eski tablet) → 200", okPhone.status === 200, String(okPhone.status));
    const wrongOnTablet = await post("/api/auth/login-quick-pin", { pin: wrongPin, clientType: "mobile" }, tablet);
    check("kontrol: tablette yanlış PIN hâlâ 401", wrongOnTablet.status === 401, String(wrongOnTablet.status));

    // ── §2 KART ──────────────────────────────────────────────────────────────
    console.log("\n§2 kart girişi");
    const cardCases: Array<[string, Record<string, unknown>, string | undefined]> = [
      ["cihazsız", { cardCode: card, clientType: "mobile" }, undefined],
      ["⭐ panel istemcisi (electron) + onaylı tablet kimliği", { cardCode: card, clientType: "electron" }, tablet],
      ["onaylı DESKTOP cihaz", { cardCode: card, clientType: "mobile" }, desktop],
      ["PENDING cihaz", { cardCode: card, clientType: "mobile" }, pending],
    ];
    for (const [label, body, dev] of cardCases) {
      const r = await post("/api/auth/login-card", body, dev);
      bodies.push(r.text);
      check(`kart ${label} → 403 CARD_FIELD_ONLY`, denied(r, "CARD_FIELD_ONLY"), `${r.status} ${r.body.details?.code ?? ""}`);
    }
    const cardOk = await post("/api/auth/login-card", { cardCode: card, clientType: "mobile", confirmKick: true }, tablet);
    check("onaylı TABLET kartla → 200", cardOk.status === 200 && cardOk.body.data?.user?.userId === user.id, String(cardOk.status));

    // ── sır sızıntısı ─────────────────────────────────────────────────────────
    const cardSecret = card.split(":")[2] ?? "";
    check("PIN / kart sırrı hiçbir ret gövdesinde yok", bodies.every((b) => !b.includes(pin) && !b.includes(cardSecret)));
    await new Promise((r) => setTimeout(r, 300)); // logEvent fire-and-forget
    const events = await prisma.systemLog.findMany({
      where: { category: "AUTH", createdAt: { gte: startedAt } },
      select: { recordId: true, newData: true },
    });
    const dump = JSON.stringify(events);
    check("giriş olayları yazıldı (ölçüm boş değil)", events.length > 0, String(events.length));
    check("PIN / kart sırrı SystemLog giriş olaylarında yok", !dump.includes(pin) && !dump.includes(cardSecret));

    // ── §3 servis ─────────────────────────────────────────────────────────────
    console.log("\n§3 servis katmanı");
    const st = async (f: () => Promise<unknown>): Promise<string> => {
      try {
        await f();
        return "TOKEN";
      } catch (e) {
        const x = e as { statusCode?: number; details?: { code?: string } };
        return `${x.statusCode ?? "?"} ${x.details?.code ?? ""}`.trim();
      }
    };
    check("ctx'siz PIN → 403 PIN_FIELD_ONLY", (await st(() => AuthService.loginWithQuickPin(pin))) === "403 PIN_FIELD_ONLY");
    check("ctx'siz kart → 403 CARD_FIELD_ONLY", (await st(() => AuthService.loginWithCard(card))) === "403 CARD_FIELD_ONLY");
    const remote = await st(() => AuthService.loginWithQuickPin(pin, { isRemote: true, fieldDevice: { kind: "TABLET" } }));
    check("uzak istek kapıdan önce 404 (uç gizli kalır)", remote === "404", remote);
  } finally {
    await new Promise<void>((r) => server.close(() => r()));
    // Bekçi kullanıcısı sert silinmez (audit FK) — pasifleştirilir, PIN/kart sökülür.
    await prisma.user.updateMany({ where: { id: user.id }, data: { isActive: false, quickPin: null, cardToken: null } });
    await prisma.session.deleteMany({ where: { userId: user.id } }).catch(() => undefined);
    await prisma.device.deleteMany({ where: { deviceId: { in: devices } } }).catch(() => undefined);
    const restore = async (key: string, prev: { value: unknown } | null): Promise<void> => {
      if (prev) await prisma.systemSetting.update({ where: { key }, data: { value: prev.value as never } }).catch(() => undefined);
      else await prisma.systemSetting.deleteMany({ where: { key } }).catch(() => undefined);
    };
    await restore(SETTING_KEYS.AUTH_LOGIN_METHODS, prevMethods);
    await restore(SETTING_KEYS.DEVICE_PAIRING_REQUIRED, prevPairing);
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
