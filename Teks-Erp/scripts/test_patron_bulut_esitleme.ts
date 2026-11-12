// =============================================================================
// BEKÇİ — PATRON BULUTU EŞİTLEMESİ: katalog · iş kaydı · ayar ↔ tetikleyici · hata yalıtımı (D3a)
// =============================================================================
// ÖLÇTÜĞÜ:
//  §1 Katalog: 13 projeksiyon; her kaynak kolon Prisma modelinde VAR; hiçbir tel/kaynak adı finans
//     sözcüğü taşımaz (fiyat · tutar · bakiye · döviz · price · amount …).
//  §2 KAPALI: ön koşul yokken uzlaştırma "DURDU" — iş kurulmaz, zamanlayıcı yok, tetikleyici 0, SIFIR
//     dış istek (node:http/https.request + fetch sayılır); açılış yolu (`startPatronCloudJobs`) da aynı.
//  §3 Düğme: dört koşul tamken tetikleyiciler açılır (= toplam) ve iş başlar; ayar kapanınca ikisi kapanır;
//     diğer üç koşuldan biri eksikken ayar açık olsa da AÇILMAZ; açılış uzlaştırması (ayar kapalı + açık
//     kalmış tetikleyici) kapatır; canlı `SystemSettingService.set` kancası da aynı uzlaştırmayı koşar.
//  §4 55P03: sahte kilit hatasında sınırlı tekrar; başka kodda tekrar YOK; GERÇEK kilitte (başka bağlantı
//     tetikleyicili tabloyu ROW EXCLUSIVE kilitler) anahtar 55P03'ü tanır ve kilit kalkınca başarır.
//  §5 Hata yalıtımı: bulut erişilemez / 503 / ön koşul fırlatır → tık FIRLATMAZ, ardışık hata artar,
//     sonraki tur katlanır; o sırada aynı süreçteki uygulama `/health` 200 döner. Kabul eden sahte bulut:
//     her paket `PackageSchema`ya uyar, kayıtlarda finans anahtarı yok (fixture kaleminde birim fiyat DOLU),
//     tur sayacı filigranı ilerler.
//
// DB: oturumun `_test` veritabanı (koşucu kapısı). Fixture `TEST-D3A-` damgalı, `finally`de silinir;
// `patronCloud.*` ayarları ve eşitleme filigranları birebir geri alınır; tetikleyiciler kapalı bırakılır.
//
// NEGATİF SONDA (2026-11-12, üçü de kırmızı verdi, geri alındı):
//   · `siparis-kalemi`ne `col("birimFiyat", "unitPrice")` eklendi → §1 finans adı + §5 paket anahtarı ✗
//   · reconcile'da `if (elig.ok)` → `if (true)` (uygunluk kapalıyken iş kurulur) → §2 + §3 ✗
//   · `runCloudSyncTick`te try/catch kaldırıldı → §5 "tık fırlatmaz" ✗
// =============================================================================
import http from "node:http";
import https from "node:https";
import { gunzipSync } from "node:zlib";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { randomUUID } from "node:crypto";
import type { AddressInfo } from "node:net";
import { Client } from "pg";
import { Prisma } from "@prisma/client";
import prisma from "../src/lib/prisma";
import app from "../src/app";
import { RECORD_PROJECTIONS } from "../src/cloud-sync/projections";
import { PackageSchema, type SyncResponse } from "../src/cloud-sync/wire";
import { cloudEligibility, type CloudEligibility, type CloudEligibilityDeps } from "../src/cloud-sync/eligibility";
import type { CloudTransport } from "../src/cloud-sync/cloud-client";
import { generateKeyFile, loadKeyFile } from "../src/lib/cloud-signing/key-file";
import { loadWatermarks, wmKey } from "../src/cloud-sync/watermarks";
import {
  LIVE_TRIGGER_SWITCH,
  LOCK_RETRY_DELAYS_MS,
  pgErrorCode,
  reconcilePatronCloud,
  startPatronCloudJobs,
  switchTriggers,
  type ReconcileDeps,
} from "../src/jobs/patron-cloud.jobs";
import {
  __cloudSyncTimerArmedForTests,
  __configureCloudSyncForTests,
  getCloudSyncStatus,
  isCloudSyncRunning,
  runCloudSyncTick,
  startCloudSync,
  stopCloudSync,
} from "../src/jobs/cloud-sync.job";
import { SETTING_KEYS, SystemSettingService } from "../src/services/system-setting.service";
import { ensureTestAdmin } from "./fixture-test-user";

let pass = 0, fail = 0;
function check(l: string, ok: boolean, x = ""): void {
  if (ok) { pass++; console.log(`  ✓ ${l}${x ? ` — ${x}` : ""}`); }
  else { fail++; console.log(`  ✗ FAIL: ${l}${x ? ` — ${x}` : ""}`); }
}

const FINANCE = /fiyat|tutar|bakiye|maliyet|odeme|doviz|kdv|price|amount|balance|cost|paid|payment|currency|vat|tax/i;
const STAMP = "TEST-D3A-";
const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

// ── Ağ sayacı ───────────────────────────────────────────────────────────────
let netCalls = 0;
const origHttp = http.request;
const origHttps = https.request;
const origFetch = globalThis.fetch;
function armNet(): void {
  netCalls = 0;
  (http as { request: unknown }).request = ((...a: Parameters<typeof http.request>) => { netCalls++; return origHttp(...a); }) as typeof http.request;
  (https as { request: unknown }).request = ((...a: Parameters<typeof https.request>) => { netCalls++; return origHttps(...a); }) as typeof https.request;
  globalThis.fetch = ((...a: Parameters<typeof fetch>) => { netCalls++; return origFetch(...a); }) as typeof fetch;
}
function disarmNet(): void {
  (http as { request: unknown }).request = origHttp;
  (https as { request: unknown }).request = origHttps;
  globalThis.fetch = origFetch;
}

const enabled = (): Promise<number> => LIVE_TRIGGER_SWITCH.enabledCount();
async function totalTriggers(): Promise<number> {
  const r = await prisma.$queryRaw<Array<{ n: number }>>`SELECT total_triggers AS n FROM patron_sync_status()`;
  return Number(r[0]?.n ?? 0);
}
async function waitFor(pred: () => Promise<boolean>, capMs = 8000): Promise<boolean> {
  for (const t0 = Date.now(); Date.now() - t0 < capMs; await sleep(50)) if (await pred()) return true;
  return pred();
}
function jobIdle(): boolean {
  return !isCloudSyncRunning() && !__cloudSyncTimerArmedForTests();
}

async function main(): Promise<void> {
  delete process.env.PATRON_CLOUD_URL;
  delete process.env.PATRON_CLOUD_KEY_FILE;
  const dir = mkdtempSync(path.join(tmpdir(), "tst-patron-esitleme-"));
  const keyPath = path.join(dir, "kurulum.key");
  generateKeyFile(keyPath);
  const key = loadKeyFile(keyPath);
  if (!key.ok) throw new Error("anahtar dosyası kurulamadı");
  const installationId = randomUUID();
  const settingsOn = { systemSetting: { findUnique: () => Promise.resolve({ value: true }) } } as unknown as NonNullable<CloudEligibilityDeps["settings"]>;
  const settingsOff = { systemSetting: { findUnique: () => Promise.resolve({ value: false }) } } as unknown as NonNullable<CloudEligibilityDeps["settings"]>;
  const full: Partial<CloudEligibilityDeps> = { cloudUrl: () => "http://127.0.0.1:9", keyFilePath: () => keyPath, installationId: () => installationId, settings: settingsOn };
  const openElig: Extract<CloudEligibility, { ok: true }> = { ok: true, baseUrl: "http://127.0.0.1:9", installationId, privateKey: key.key.privateKey, intervalMinutes: 5 };
  const depsWith = (o: Partial<CloudEligibilityDeps>): ReconcileDeps => ({
    eligibility: () => cloudEligibility(o),
    switch: LIVE_TRIGGER_SWITCH,
    start: startCloudSync,
    stop: stopCloudSync,
  });

  const settingsBefore = await prisma.systemSetting.findMany({ where: { key: { startsWith: "patronCloud." } } });
  const wmBefore = new Set((await prisma.syncWatermark.findMany({ select: { id: true } })).map((w) => w.id));
  const fx: { customerId?: string; itemId?: string; colorId?: string; orderId?: string; lineId?: string } = {};
  const health = http.createServer(app);
  await new Promise<void>((r) => health.listen(0, "127.0.0.1", () => r()));
  const healthUrl = `http://127.0.0.1:${(health.address() as AddressInfo).port}/health`;

  try {
    await switchTriggers(false);
    // ── §1 Katalog ────────────────────────────────────────────────────────
    console.log("\n§1 katalog: ad kümesi · kaynak kolon · finans alanı yok");
    check("14 kayıt projeksiyonu (M2a: + iade)", RECORD_PROJECTIONS.length === 14, RECORD_PROJECTIONS.map((p) => p.name).join(","));
    const models = Prisma.dmmf.datamodel.models;
    const missing: string[] = [];
    const financeNames: string[] = [];
    let columnCount = 0;
    for (const p of RECORD_PROJECTIONS) {
      const m = models.find((x) => x.name === p.root.model);
      const scalars = new Set((m?.fields ?? []).filter((f) => f.kind === "scalar" || f.kind === "enum").map((f) => f.name));
      for (const c of p.columns) {
        columnCount++;
        if (!scalars.has(c.source)) missing.push(`${p.name}.${c.source}`);
        if (FINANCE.test(c.wire) || FINANCE.test(c.source)) financeNames.push(`${p.name}.${c.wire}←${c.source}`);
      }
      for (const d of p.derived) if (FINANCE.test(d.wire)) financeNames.push(`${p.name}.${d.wire} (türetilmiş)`);
    }
    check("körlük zemini: kolon sayısı > 50", columnCount > 50, `${columnCount}`);
    check("her kaynak kolon Prisma modelinde var", missing.length === 0, missing.join(", "));
    check("⭐ hiçbir tel/kaynak adı finans sözcüğü taşımaz", financeNames.length === 0, financeNames.join(", "));

    // ── §2 KAPALI ─────────────────────────────────────────────────────────
    console.log("\n§2 kapalı: iş yok · zamanlayıcı yok · tetikleyici 0 · sıfır dış istek");
    armNet();
    const r2 = await reconcilePatronCloud("bekçi kapalı", depsWith({}));
    check("adres yok → DURDU", r2 === "DURDU", r2);
    check("iş kurulmadı, zamanlayıcı yok", jobIdle());
    check("tetikleyici 0", (await enabled()) === 0);
    startPatronCloudJobs();
    await sleep(300);
    check("açılış yolu: iş kurulmadı", jobIdle());
    __configureCloudSyncForTests({ reset: true });
    await runCloudSyncTick(Date.now());
    check("kapalıyken tık: tur yok (uygun değil)", getCloudSyncStatus().eligible === false && getCloudSyncStatus().lastOutcome === null);
    check("⭐ sıfır dış istek", netCalls === 0, `istek=${netCalls}`);
    disarmNet();

    // ── §3 Düğme ↔ tetikleyici ↔ iş ───────────────────────────────────────
    console.log("\n§3 ayar ↔ tetikleyici ↔ iş uzlaştırması");
    const total = await totalTriggers();
    check("körlük zemini: tetikleyici envanteri > 0", total > 0, `${total}`);
    const missingOne: Array<[string, Partial<CloudEligibilityDeps>]> = [
      ["adres yok", { ...full, cloudUrl: () => null }],
      ["anahtar yolu yok", { ...full, keyFilePath: () => null }],
      ["kurulum kimliği yok", { ...full, installationId: () => null }],
      ["ayar kapalı", { ...full, settings: settingsOff }],
    ];
    for (const [label, o] of missingOne) {
      const r = await reconcilePatronCloud(`bekçi ${label}`, depsWith(o));
      check(`${label} (diğerleri tam) → tetikleyici AÇILMAZ, iş yok`, r === "DURDU" && (await enabled()) === 0 && jobIdle(), r);
    }
    const rOn = await reconcilePatronCloud("bekçi aç", depsWith(full));
    check("⭐ dördü tam → BASLADI, tetikleyiciler = toplam, iş çalışıyor", rOn === "BASLADI" && (await enabled()) === total && isCloudSyncRunning() && __cloudSyncTimerArmedForTests(), `${rOn} açık=${await enabled()}`);
    const rOff = await reconcilePatronCloud("bekçi kapat", depsWith({ ...full, settings: settingsOff }));
    check("⭐ ayar kapat → DURDU, tetikleyici 0, iş/zamanlayıcı yok", rOff === "DURDU" && (await enabled()) === 0 && jobIdle(), rOff);
    await switchTriggers(true);
    const rBoot = await reconcilePatronCloud("açılış", depsWith({}));
    check("açılış uzlaştırması: ayar/adres yok + açık kalmış tetikleyici → kapatılır", rBoot === "DURDU" && (await enabled()) === 0, `${rBoot}`);
    const admin = await ensureTestAdmin();
    await switchTriggers(true);
    await new SystemSettingService().set(SETTING_KEYS.PATRON_CLOUD_SYNC_ENABLED, true, undefined, admin.id);
    const closed = await waitFor(async () => (await enabled()) === 0);
    check("canlı set() kancası: ayar AÇIK ama adres yok → açık kalmış tetikleyici kapatılır, iş yok", closed && jobIdle(), `açık=${await enabled()}`);

    // ── §4 55P03 ──────────────────────────────────────────────────────────
    console.log("\n§4 kilit (55P03) tekrar yolu");
    const lockErr = Object.assign(new Error("could not obtain lock on relation"), { code: "55P03" });
    const slept: number[] = [];
    const fake = (fails: number, err: Error = lockErr) => {
      let n = 0;
      return { setEnabled: () => (n++ < fails ? Promise.reject(err) : Promise.resolve(3)), enabledCount: () => Promise.resolve(0), sleep: (ms: number) => { slept.push(ms); return Promise.resolve(); } };
    };
    const s2 = await switchTriggers(true, fake(2));
    check("2 kez 55P03 → başarı, 2 tekrar", s2.ok && s2.retries === 2, JSON.stringify(s2));
    slept.length = 0;
    const sAll = await switchTriggers(true, fake(99));
    check("hep 55P03 → takvim kadar tekrar sonra vazgeçer", !sAll.ok && sAll.retries === LOCK_RETRY_DELAYS_MS.length && slept.length === LOCK_RETRY_DELAYS_MS.length, JSON.stringify(sAll));
    const sOther = await switchTriggers(true, fake(99, Object.assign(new Error("boom"), { code: "42501" })));
    check("başka kod → tekrar YOK", !sOther.ok && sOther.retries === 0 && sOther.code === "42501", JSON.stringify(sOther));
    const rFail = await reconcilePatronCloud("bekçi kilit", { ...depsWith(full), switch: fake(99) });
    check("tetikleyici açılamazsa iş BAŞLAMAZ", rFail === "TETIKLEYICI_ACILAMADI" && jobIdle(), rFail);

    const tbl = await prisma.$queryRaw<Array<{ t: string }>>`
      SELECT c.relname AS t FROM pg_trigger tg JOIN pg_class c ON c.oid = tg.tgrelid JOIN pg_proc p ON p.oid = tg.tgfoid
      WHERE NOT tg.tgisinternal AND p.proname LIKE 'sync_mark_%' ORDER BY 1 LIMIT 1`;
    const locker = new Client({ connectionString: process.env.DATABASE_URL });
    await locker.connect();
    try {
      await locker.query("BEGIN");
      await locker.query(`LOCK TABLE "${tbl[0]!.t}" IN ROW EXCLUSIVE MODE`);
      const codes: string[] = [];
      const p = switchTriggers(true, {
        ...LIVE_TRIGGER_SWITCH,
        setEnabled: (e) => LIVE_TRIGGER_SWITCH.setEnabled(e).catch((err: unknown) => { codes.push(pgErrorCode(err) ?? "?"); throw err; }),
      });
      await sleep(250);
      await locker.query("COMMIT");
      const r = await p;
      check("⭐ gerçek kilit: 55P03 tanındı, kilit kalkınca açıldı", r.ok && r.retries > 0 && codes.length > 0 && codes.every((c) => c === "55P03"), `${JSON.stringify(r)} kodlar=${codes.join(",")}`);
    } finally {
      await locker.query("ROLLBACK").catch(() => undefined);
      await locker.end();
      await switchTriggers(false);
    }

    // ── §5 Hata yalıtımı + tel sözleşmesi ─────────────────────────────────
    console.log("\n§5 hata istek yoluna sızmaz · paket sözleşmesi · finans anahtarı yok");
    const cust = await prisma.customer.create({ data: { code: `${STAMP}C1`, name: `${STAMP}Cari` } });
    fx.customerId = cust.id;
    const item = await prisma.item.create({ data: { code: `${STAMP}U1`, name: `${STAMP}Urun`, itemType: "FABRIC" } });
    fx.itemId = item.id;
    const color = await prisma.color.create({ data: { code: `${STAMP}R1`, name: `${STAMP}Renk` } });
    fx.colorId = color.id;
    const order = await prisma.order.create({ data: { orderNumber: `${STAMP}${Date.now()}`, customerId: cust.id } });
    fx.orderId = order.id;
    const line = await prisma.orderLine.create({ data: { orderId: order.id, itemId: item.id, colorId: color.id, quantity: 10, unitPrice: 12.34 } });
    fx.lineId = line.id;

    const rejecting: CloudTransport = () => Promise.reject(new Error("ECONNREFUSED"));
    const s503: CloudTransport = () => Promise.resolve({ status: 503, body: Buffer.from("{}") });
    const cases: Array<[string, Partial<Parameters<typeof __configureCloudSyncForTests>[0]>]> = [
      ["bulut erişilemez", { transport: rejecting, eligibility: async () => openElig }],
      ["bulut 503", { transport: s503, eligibility: async () => openElig }],
      ["ön koşul fırlatır", { eligibility: () => Promise.reject(new Error("bekçi: beklenmeyen")) }],
    ];
    __configureCloudSyncForTests({ reset: true });
    for (const [i, [label, cfg]] of cases.entries()) {
      __configureCloudSyncForTests({ ...cfg, forceDue: true });
      const t0 = Date.now();
      let threw = false;
      const tick = runCloudSyncTick(t0).catch(() => { threw = true; });
      const h = await origFetch(healthUrl).then((r) => r.status).catch(() => 0);
      await tick;
      const st = getCloudSyncStatus();
      check(`⭐ ${label}: tık fırlatmaz, ardışık hata ${i + 1}, sağlık 200`, !threw && st.consecutiveFailures === i + 1 && h === 200, `fırlattı=${threw} hata=${st.consecutiveFailures} sağlık=${h}`);
      // nextDueAt yalnız iş çalışırken raporlanır; katlanma ardışık hata ile ölçülür.
    }

    const bodies: unknown[] = [];
    let schemaErrors = 0;
    const accepting: CloudTransport = (req) => {
      const pkg = JSON.parse(gunzipSync(req.body).toString("utf8")) as unknown;
      bodies.push(pkg);
      const parsed = PackageSchema.safeParse(pkg);
      if (!parsed.success) schemaErrors++;
      const p = parsed.success ? parsed.data : null;
      const resp: SyncResponse = {
        v: 1,
        paketId: p?.paketId ?? randomUUID(),
        kabul: (p?.kayitlar ?? []).map((e) => ({ projeksiyon: e.projeksiyon, filigran: e.filigran.yeni })),
        ret: [], istenen: [], ufukTarihi: {}, sozlesmeUyarisi: null,
      };
      return Promise.resolve({ status: 200, body: Buffer.from(JSON.stringify(resp)) });
    };
    const roundBefore = (await loadWatermarks()).get(wmKey.round)?.tie?.[0] ?? null;
    __configureCloudSyncForTests({ transport: accepting, eligibility: async () => openElig, forceDue: true });
    await runCloudSyncTick(Date.now());
    const st5 = getCloudSyncStatus();
    const roundAfter = (await loadWatermarks()).get(wmKey.round)?.tie?.[0] ?? null;
    check("kabul eden bulut: tur TAMAM, ardışık hata sıfırlandı", st5.lastOutcome?.status === "TAMAM" && st5.consecutiveFailures === 0, `${st5.lastOutcome?.status}/${st5.lastOutcome?.reason}`);
    check("tur sayacı filigranı ilerledi", roundAfter !== null && roundAfter !== roundBefore, `${roundBefore} → ${roundAfter}`);
    check("her paket PackageSchema'ya uyar", bodies.length > 0 && schemaErrors === 0, `paket=${bodies.length} hata=${schemaErrors}`);
    const keys = new Set<string>();
    let lineSeen = false;
    for (const b of bodies) for (const e of (b as { kayitlar: Array<{ projeksiyon: string; yaz: Array<Record<string, unknown>> }> }).kayitlar) {
      for (const row of e.yaz) {
        if (row.id === line.id) lineSeen = true;
        for (const k of Object.keys(row)) keys.add(`${e.projeksiyon}.${k}`);
      }
    }
    check("körlük zemini: fixture kalemi (birim fiyatı dolu) pakette", lineSeen);
    const leaked = [...keys].filter((k) => FINANCE.test(k.split(".").pop()!));
    check("⭐ gönderilen kayıtlarda finans anahtarı yok", leaked.length === 0, leaked.length ? leaked.join(", ") : `${keys.size} farklı anahtar`);
  } finally {
    disarmNet();
    stopCloudSync();
    __configureCloudSyncForTests({ reset: true });
    await switchTriggers(false).catch(() => undefined);
    if (fx.lineId) await prisma.orderLine.delete({ where: { id: fx.lineId } }).catch(() => undefined);
    if (fx.orderId) await prisma.order.delete({ where: { id: fx.orderId } }).catch(() => undefined);
    if (fx.colorId) await prisma.color.delete({ where: { id: fx.colorId } }).catch(() => undefined);
    if (fx.itemId) await prisma.item.delete({ where: { id: fx.itemId } }).catch(() => undefined);
    if (fx.customerId) await prisma.customer.delete({ where: { id: fx.customerId } }).catch(() => undefined);
    // Bu koşumun yazdığı filigranlar ve `patronCloud.*` ayarları birebir geri alınır.
    const wmNow = await prisma.syncWatermark.findMany({ select: { id: true } });
    const wmNew = wmNow.map((w) => w.id).filter((id) => !wmBefore.has(id));
    if (wmNew.length > 0) await prisma.syncWatermark.deleteMany({ where: { id: { in: wmNew } } });
    const settingsNow = await prisma.systemSetting.findMany({ where: { key: { startsWith: "patronCloud." } } });
    for (const s of settingsNow) {
      const prev = settingsBefore.find((b) => b.key === s.key);
      if (!prev) await prisma.systemSetting.delete({ where: { key: s.key } });
      else await prisma.systemSetting.update({ where: { key: s.key }, data: { value: prev.value as Prisma.InputJsonValue } });
    }
    await new Promise<void>((r) => { health.closeAllConnections(); health.close(() => r()); });
    rmSync(dir, { recursive: true, force: true });
  }
}

main()
  .catch((e: unknown) => { fail++; console.log(`  ✗ FAIL: beklenmeyen hata — ${e instanceof Error ? e.stack ?? e.message : String(e)}`); })
  .finally(() => {
    console.log(`\n=== Sonuç: ${pass} geçti, ${fail} başarısız ===\n`);
    process.exit(fail > 0 ? 1 : 0);
  });
