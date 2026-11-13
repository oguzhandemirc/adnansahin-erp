// =============================================================================
// BEKÇİ — BAĞLI CİHAZLAR (`GET /api/sessions/active`)
// =============================================================================
// Çalıştırma: npx tsx scripts/run-all-tests.ts active_sessions   (DB gerekir)
//
// Ölçtüğü iddialar:
//   §1 KAPI — uç `verifyToken` + (`admin:settings` ∨ `system:sessions`) arkasında;
//      izinsiz ve komşu ekranın dar izni (`system:clients`) 403 alır; router
//      `/api/sessions` altına bağlı; izin katalogda, ekran manifestoda.
//   §2 KAPSAM — yalnız açık oturum (iptal edilmemiş + süresi dolmamış) listelenir.
//   §3 SIRA — son görülme azalan, hiç görülmemiş oturum sonda.
//   §4 SIR — yanıtta jti/token/parola alanı yok, jti ve tam cihaz kimliği metin
//      olarak bile geçmiyor; cihaz yalnız 8 haneli kısaltmayla + Device adıyla.
//   §5 SINIR — `limit` uygulanır ve kesilme `truncated` ile söylenir.
//
// Gerekli mi: bugün ağaçta yakaladığı bir kusur YOK (uç bu commit'te doğdu);
// gerekçe ÖLÇÜLMEMİŞ — koruduğu şey token sızıntısı ve izinsiz okuma sınıfı.
// NEGATİF SONDA (bir kez, 2026-11-13): select'e `jti` eklenince §4 KIRMIZI ·
// izin kapısına `system:clients` eklenince §1c KIRMIZI · toplu kapı satırı
// silinince §1a-e KIRMIZI · orderBy `asc` yapılınca §3 KIRMIZI (4 ayrı iddia;
// md5 ile geri alındı).
// =============================================================================
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { NextFunction, Request, Response } from "express";
import prisma from "../src/lib/prisma";
import { PERMISSION_CATALOG } from "../src/constants/permission-catalog";
import { SCREEN_CATALOG } from "../src/constants/screen-catalog";
import sessionRouter from "../src/routes/session.routes";
import { listActiveSessions } from "../src/services/active-session.service";

let pass = 0;
let fail = 0;
function check(label: string, ok: boolean, detail = ""): void {
  if (ok) {
    pass++;
    console.log(`✅ ${label}${detail ? ` — ${detail}` : ""}`);
  } else {
    fail++;
    console.log(`❌ ${label}${detail ? ` — ${detail}` : ""}`);
  }
}


/**
 * `/active` ucuna giden zinciri (router düzeyi toplu kapı + uç kapıları)
 * verifyToken ve handler HARİÇ koşturur; status kodunu döner (200 = geçti).
 */
function gateStatus(permissions: string[]): number | null {
  // Router'da tek uç var (GET /active); yöntem ayrımı gerekmez, tipli `stack` yeter.
  const stack = sessionRouter.stack;
  const at = stack.findIndex((l) => l.route?.path === "/active");
  if (at < 0) return null;
  const chain = [
    ...stack.slice(0, at).filter((l) => !l.route),
    ...stack[at]!.route!.stack.slice(0, -1),
  ];
  if (chain.length < 2 || chain[0]!.name !== "verifyToken") return null;
  const req = { user: { userId: "t", permissions }, isSystemAccount: false } as unknown as Request;
  for (const link of chain.slice(1)) {
    let called = false;
    let err: unknown;
    link.handle(req, {} as Response, ((e?: unknown) => {
      called = true;
      err = e;
    }) as NextFunction);
    if (!called) return null;
    if (err) return (err as { statusCode?: number }).statusCode ?? 500;
  }
  return 200;
}

const TS = Date.now();
const STAMP = `TEST-SESS-${TS}`;
const DEVICE_ID = `${STAMP}-tablet-0001`;
const MIN = 60_000;
const jtis: string[] = [];
let userId: string | null = null;
let deviceRowId: string | null = null;

function* keysDeep(v: unknown): Generator<string> {
  if (Array.isArray(v)) for (const x of v) yield* keysDeep(x);
  else if (v && typeof v === "object") {
    for (const [k, x] of Object.entries(v)) {
      yield k;
      yield* keysDeep(x);
    }
  }
}

async function main(): Promise<void> {
  try {
    // ── §1 KAPI ────────────────────────────────────────────────────────────
    console.log("\n§1 — kapı ve kayıt");
    check("§1a zincir bulundu (verifyToken ilk halka)", gateStatus(["admin:settings"]) !== null);
    check("§1b ⭐ izinsiz kullanıcı 403", gateStatus([]) === 403, String(gateStatus([])));
    check("§1c ⭐ komşu dar izin (`system:clients`) 403", gateStatus(["system:clients"]) === 403);
    check("§1d dar izin `system:sessions` geçer", gateStatus(["system:sessions"]) === 200);
    check("§1e şemsiye `admin:settings` geçer", gateStatus(["admin:settings"]) === 200);
    const appTs = readFileSync(join(__dirname, "..", "src", "app.ts"), "utf8");
    check("§1f router `/api/sessions` altına bağlı", /app\.use\("\/api\/sessions", sessionRoutes\)/.test(appTs));
    check("§1g izin katalogda", PERMISSION_CATALOG.some((p) => p.code === "system:sessions"));
    const screen = SCREEN_CATALOG.find((s) => s.key === "system/sessions");
    check("§1h ekran manifestoda aynı izinle", !!screen && screen.requires.includes("system:sessions"));

    // ── Fixture ────────────────────────────────────────────────────────────
    const user = await prisma.user.create({
      data: { username: STAMP, fullName: `${STAMP} Kullanıcı`, passwordHash: "x-no-login" },
      select: { id: true },
    });
    userId = user.id;
    const device = await prisma.device.create({
      data: { deviceId: DEVICE_ID, name: `${STAMP} Tablet`, kind: "TABLET" },
      select: { id: true },
    });
    deviceRowId = device.id;
    const now = Date.now();
    const mk = async (d: {
      deviceType: "ELECTRON" | "MOBILE" | "WEB";
      deviceId?: string | null;
      clientVersion?: string | null;
      lastSeenAt?: Date | null;
      revokedAt?: Date | null;
      expiresAt?: Date;
    }) => {
      const jti = randomUUID();
      jtis.push(jti);
      return prisma.session.create({
        data: {
          userId: user.id,
          jti,
          deviceType: d.deviceType,
          deviceId: d.deviceId ?? null,
          clientVersion: d.clientVersion ?? null,
          lastSeenAt: d.lastSeenAt ?? null,
          revokedAt: d.revokedAt ?? null,
          revokeReason: d.revokedAt ? "TEST" : null,
          expiresAt: d.expiresAt ?? new Date(now + 60 * MIN),
        },
        select: { id: true },
      });
    };
    const tablet = await mk({ deviceType: "MOBILE", deviceId: DEVICE_ID, clientVersion: "1.0.16", lastSeenAt: new Date(now - 1 * MIN) });
    const panel = await mk({ deviceType: "ELECTRON", clientVersion: "1.3.16", lastSeenAt: new Date(now - 10 * MIN) });
    const web = await mk({ deviceType: "WEB" });
    const revoked = await mk({ deviceType: "MOBILE", lastSeenAt: new Date(now), revokedAt: new Date(now - MIN) });
    const expired = await mk({ deviceType: "MOBILE", lastSeenAt: new Date(now), expiresAt: new Date(now - MIN) });

    const res = await listActiveSessions({ limit: 500 });
    const all = res.data?.sessions ?? [];
    const mine = all.filter((s) => s.user.id === user.id);
    const ids = mine.map((s) => s.id);

    // ── §2 KAPSAM ──────────────────────────────────────────────────────────
    console.log("\n§2 — yalnız açık oturum");
    check("§2a üç açık oturum listede", [tablet.id, panel.id, web.id].every((id) => ids.includes(id)), `${ids.length}`);
    check("§2b ⭐ iptal edilmiş oturum listede YOK", !ids.includes(revoked.id));
    check("§2c ⭐ süresi dolmuş oturum listede YOK", !ids.includes(expired.id));

    // ── §3 SIRA ────────────────────────────────────────────────────────────
    console.log("\n§3 — son görülme azalan");
    check("§3a ⭐ fixture sırası tablet → panel → web (görülmemiş sonda)",
      JSON.stringify(ids) === JSON.stringify([tablet.id, panel.id, web.id]), ids.join(","));
    let ordered = true;
    for (let i = 1; i < all.length; i++) {
      const a = all[i - 1]!.lastSeenAt;
      const b = all[i]!.lastSeenAt;
      if (a === null && b !== null) ordered = false;
      if (a !== null && b !== null && a < b) ordered = false;
    }
    check("§3b tüm liste son görülme azalan, null'lar sonda", ordered, `${all.length} satır`);

    // ── §4 SIR ─────────────────────────────────────────────────────────────
    console.log("\n§4 — sır sızmıyor");
    const body = JSON.stringify(res);
    const keys = [...new Set(keysDeep(res))];
    const bad = keys.filter((k) => /jti|token|password|hash|pin|secret|totp/i.test(k));
    check("§4a ⭐ yanıtta jti/token/parola alanı yok", bad.length === 0, bad.join(", "));
    check("§4b ⭐ fixture jti'lerinin hiçbiri metinde geçmiyor", jtis.every((j) => !body.includes(j)));
    check("§4c tam cihaz kimliği metinde geçmiyor", !body.includes(DEVICE_ID));
    const t = mine.find((s) => s.id === tablet.id);
    check("§4d cihaz 8 haneli kısaltma + Device adıyla çözülür",
      t?.deviceRef === DEVICE_ID.slice(0, 8) && t?.deviceName === `${STAMP} Tablet`);
    check("§4e sürüm ve tür taşınır", t?.clientVersion === "1.0.16" && t?.deviceType === "MOBILE");
    const w = mine.find((s) => s.id === web.id);
    check("§4f sürümsüz/kimliksiz oturum null kalır (uydurulmaz)", w?.clientVersion === null && w?.deviceRef === null && w?.lastSeenAt === null);
    const expectedKeys = ["clientVersion", "deviceName", "deviceRef", "deviceType", "id", "lastSeenAt", "machineName", "startedAt", "user"];
    check("§4g satır şekli sabit", !!t && JSON.stringify(Object.keys(t).sort()) === JSON.stringify(expectedKeys), t ? Object.keys(t).sort().join(",") : "");

    // ── §5 SINIR ───────────────────────────────────────────────────────────
    console.log("\n§5 — limit");
    const one = await listActiveSessions({ limit: 1 });
    check("§5a limit uygulanır + truncated söylenir", one.data?.sessions.length === 1 && one.data?.truncated === true);
    check("§5b geniş limitte truncated=false (bu DB'de < 500 açık oturum)", res.data?.truncated === false || all.length === 500);
  } finally {
    await prisma.session.deleteMany({ where: { jti: { in: jtis } } });
    if (deviceRowId) await prisma.device.delete({ where: { id: deviceRowId } }).catch(() => undefined);
    // Kullanıcı sert silinmez (audit FK emsali) — pasife alınır.
    if (userId) await prisma.user.update({ where: { id: userId }, data: { isActive: false } }).catch(() => undefined);
    await prisma.$disconnect();
    console.log(`\n=== Sonuç: ${pass} geçti, ${fail} başarısız ===`);
    process.exit(fail > 0 ? 1 : 0);
  }
}

void main();
