// =============================================================================
// Test: patron bulutu şalterlerini YALNIZ süperadmin değiştirir (denetim 2026-11-13, O1)
// Çalıştır: npx tsx scripts/run-all-tests.ts test_patron_cloud_switch_superadmin
// =============================================================================
// Bulgu: `patronCloud.syncEnabled` / `patronCloud.inboxEnabled` ham ayar ucundan
// (`PUT /api/admin/settings/:key`) `admin:settings` taşıyan her yöneticiye açıktı;
// "önce okuma, ≥ 1 hafta izle, sonra yazma" kararı tek istekle atlanabiliyordu.
//
// Kilitlenen sözleşme:
//   §1 küme = { syncEnabled, inboxEnabled } ve `SETTING_KEYS` değerleriyle birebir.
//   §2 zincir (süreç içi, son handler KOŞMAZ → global ayar yazılmaz):
//      `admin:settings` / `*` izinli ama sistem hesabı olmayan → 403 SUPERADMIN_ONLY
//      (ayar şifresinden ÖNCE, şifre denemesi yakmaz); sistem hesabı → kapıyı geçer;
//      başka bir anahtar (`backupHour`) bu kapıya takılmaz (kontrol).
//   §3 statik: kapı `requireSettingsPassword`tan önce, izin kapısından sonra.
//
// Negatif sondalar (BİR KEZLİK, md5 ile geri alındı; sayılar commit mesajında):
//   W1 kapı halkası `next()`e indirildi — kırmızı.
//   W2 kümeden `patronCloud.inboxEnabled` çıkarıldı — kırmızı.
// =============================================================================
import type { NextFunction, Request, Response } from "express";
import prisma, { pool } from "../src/lib/prisma";
import adminRouter from "../src/routes/admin.routes";
import { AppError } from "../src/utils/app-error";
import { SUPERADMIN_WRITE_SETTING_KEYS } from "../src/constants/reserved-settings";
import { SETTING_KEYS } from "../src/services/system-setting.service";

let pass = 0;
let fail = 0;
function check(label: string, ok: boolean, extra = ""): void {
  if (ok) { pass++; console.log(`✅ ${label}${extra ? " — " + extra : ""}`); }
  else { fail++; console.log(`❌ ${label}${extra ? " — " + extra : ""}`); }
}

type Layer = { handle: (req: Request, res: Response, next: NextFunction) => unknown; name: string };
type RouteLayer = { route?: { path: string; methods: Record<string, boolean>; stack: Layer[] } };

function chain(): Layer[] {
  const stack = (adminRouter as unknown as { stack: RouteLayer[] }).stack;
  return stack.find((l) => l.route?.path === "/settings/:key" && l.route.methods.put)?.route?.stack ?? [];
}

/** Tek halka: next(err?) → {advanced, err}; yanıt gönderilirse advanced=false. */
function runLayer(layer: Layer, req: Request): Promise<{ advanced: boolean; err: unknown }> {
  return new Promise((resolve) => {
    let done = false;
    const finish = (advanced: boolean, err: unknown) => { if (!done) { done = true; resolve({ advanced, err }); } };
    const res = {
      status() { return res; },
      json() { finish(false, null); return res; },
      setHeader() { return res; },
    } as unknown as Response;
    const t = setTimeout(() => finish(false, "timeout"), 5000);
    t.unref?.();
    try {
      const r = layer.handle(req, res, ((e?: unknown) => { clearTimeout(t); finish(true, e); }) as NextFunction);
      if (r && typeof (r as Promise<unknown>).catch === "function") (r as Promise<unknown>).catch((e) => finish(false, e));
    } catch (e) {
      finish(false, e);
    }
  });
}

/** verifyToken'ı atla (kimlik simüle), son handler'ı KOŞMA; ilk hatada dur. */
async function walk(key: string, opts: { permissions: string[]; isSystemAccount: boolean }): Promise<{ reachedHandler: boolean; code?: string; status?: number }> {
  const layers = chain();
  const req = {
    user: { userId: "00000000-0000-4000-8000-0000000000aa", permissions: opts.permissions },
    isSystemAccount: opts.isSystemAccount,
    params: { key },
    body: { value: "true" },
    headers: {},
    query: {},
    ip: "198.51.100.77",
    method: "PUT",
    baseUrl: "/api/admin",
    path: `/settings/${key}`,
    originalUrl: `/api/admin/settings/${key}`,
  } as unknown as Request;
  for (const layer of layers.slice(1, -1)) {
    const { advanced, err } = await runLayer(layer, req);
    if (err) {
      const ae = err instanceof AppError ? err : null;
      return { reachedHandler: false, status: ae?.statusCode, code: (ae?.details as { code?: string } | undefined)?.code };
    }
    if (!advanced) return { reachedHandler: false };
  }
  return { reachedHandler: true };
}

async function main(): Promise<void> {
  console.log("§1 küme");
  check("küme tam iki anahtar", SUPERADMIN_WRITE_SETTING_KEYS.size === 2, [...SUPERADMIN_WRITE_SETTING_KEYS].join(","));
  check("syncEnabled = SETTING_KEYS.PATRON_CLOUD_SYNC_ENABLED", SUPERADMIN_WRITE_SETTING_KEYS.has(SETTING_KEYS.PATRON_CLOUD_SYNC_ENABLED));
  check("inboxEnabled = SETTING_KEYS.PATRON_CLOUD_INBOX_ENABLED", SUPERADMIN_WRITE_SETTING_KEYS.has(SETTING_KEYS.PATRON_CLOUD_INBOX_ENABLED));

  console.log("\n§2 zincir");
  const layers = chain();
  check("körlük zemini: PUT /settings/:key zinciri bulundu (≥ 4 halka, ilki verifyToken)", layers.length >= 4 && layers[0]?.name === "verifyToken", `${layers.length}`);
  for (const key of [SETTING_KEYS.PATRON_CLOUD_SYNC_ENABLED, SETTING_KEYS.PATRON_CLOUD_INBOX_ENABLED]) {
    for (const perms of [["admin:settings"], ["admin:*"], ["*"]]) {
      const r = await walk(key, { permissions: perms, isSystemAccount: false });
      check(`⭐ ${key}: ${perms.join(",")} (süperadmin değil) → 403 SUPERADMIN_ONLY`, r.status === 403 && r.code === "SUPERADMIN_ONLY", JSON.stringify(r));
    }
    const sa = await walk(key, { permissions: ["*"], isSystemAccount: true });
    check(`${key}: süperadmin kapıları geçer (handler'a ulaşır)`, sa.reachedHandler, JSON.stringify(sa));
  }
  const control = await walk("backupHour", { permissions: ["admin:settings"], isSystemAccount: false });
  check("kontrol: başka anahtar SUPERADMIN_ONLY'ye takılmaz", control.code !== "SUPERADMIN_ONLY", JSON.stringify(control));

  console.log("\n§3 statik sıra");
  const names = layers.map((l) => l.name);
  const pwAt = names.indexOf("requireSettingsPassword");
  const src = layers.map((l) => String(l.handle));
  const gateAt = src.findIndex((s) => s.includes("SUPERADMIN_WRITE_SETTING_KEYS"));
  const permAt = src.findIndex((s) => s.includes("requirePermissionForEachKey"));
  check("kapı izin kapısından SONRA, ayar şifresinden ÖNCE", permAt !== -1 && gateAt > permAt && pwAt > gateAt, `izin=${permAt} kapı=${gateAt} şifre=${pwAt}`);

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
