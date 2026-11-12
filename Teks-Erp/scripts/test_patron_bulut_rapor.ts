// =============================================================================
// BEKÇİ — PATRON BULUTU RAPOR İSTEĞİ (D5): fabrika hesaplar, panelle AYNI sayı, finanssız, yük korumalı
// =============================================================================
// ÖLÇTÜĞÜ (servis + prisma + panel HTTP ucu GERÇEK, yalnız bulut ağ katmanı taklit):
//  §1 katalog: buluttan istenebilir küme tam 6 karne; finans raporu ve rapor v2 anahtarı YOK.
//  §2 6 raporun her biri: bulut isteği → iş turu → gönderilen sonuç tel şemasına uyar, HAZIR; sonuçta finans
//     adlı alan YOK; `veri` AYNI parametreyle PANEL ucunun (`/api/reports/...`) `data`sına kanonik olarak EŞİT.
//     Aralık fabrika günü (`YYYY-MM-DD`) olarak gelir, panele `constants/time` sınırlarıyla ISO gider.
//  §3 katalog dışı kod (bilinmeyen · finans · rapor v2) → HATA `RAPOR_BILINMIYOR`; panelde kapalı rapor → `RAPOR_KAPALI`.
//  §4 geçersiz parametre (tanınmayan anahtar · taşan gün · ters aralık · > 366 gün · panel kıyası · kesitte tarih)
//     → HATA `PARAMETRE_GECERSIZ`.
//  §5 süre sınırı: sınır aşılınca HATA `ZAMAN_ASIMI`; o hesap bitmeden ikinci tur MESGUL (aynı anda tek rapor).
//  §6 boyut: 4 MB (gzip) tavanını aşan sonuç veri yerine `SONUC_BUYUK` taşır.
//  §7 kapalıyken iş kaydı yok: ön koşul kapalı uzlaştırma → iş/zamanlayıcı yok, tur KAPALI, SIFIR dış istek;
//     açınca başlar, kapatınca durur.
//  §8 deneme sınırı: sonucu iletilemeyen istek sınırlı kez hesaplanır, sonra hesapsız RET (sonsuz döngü yok).
//  §9 hata yalıtımı: bulut erişilemezken tur fırlatmaz, aynı anda /health ve panel ucu 200.
//
// DB: oturumun `_test` veritabanı (koşucu kapısı). Yazdığı tek kalıcı şey `reports.closedKeys` ayarıdır ve `finally`de
// BİREBİR geri alınır (TD-18a); veri `seed:fixtures`tan okunur, sayım fixture'a bağlı değildir (eşitlik ölçülür).
//
// NEGATİF SONDA (2026-11-12, üçü de kırmızı verdi, geri alındı; 53 kontrol):
//   · sonuca `tutar` alanı eklendi (ayıklamadan SONRA) → §2 "finans alanı yok" ×6 + panel eşitliği ×6 ✗
//   · `sales/shipment-scorecard` sonucunda bir sayı bozuldu (`shippedQty` +1) → §2 panel eşitliği ✗
//   · `patron-cloud.jobs.ts` ön koşul KAPALI dalında rapor işini başlattı → §7 ×2 ✗ (iş kuruldu, zamanlayıcı)
// =============================================================================
import http from "node:http";
import https from "node:https";
import { gunzipSync } from "node:zlib";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { randomBytes, randomUUID } from "node:crypto";
import { Prisma } from "@prisma/client";
import prisma from "../src/lib/prisma";
import app from "../src/app";
import { factoryYmd, resolveRangeEnd, resolveRangeStart } from "../src/constants/time";
import { REMOTE_REPORTS, remoteReportCatalog } from "../src/cloud-sync/remote-reports";
import { boundedReportBody, stripFinanceFields } from "../src/cloud-sync/report-requests";
import { reportEligibility, type ReportEligibility } from "../src/cloud-sync/eligibility";
import type { CloudHttpRequest, CloudHttpResponse, CloudTransport } from "../src/cloud-sync/cloud-client";
import { ReportResultRequestSchema, SYNC_PATHS, type ReportResult } from "../src/cloud-sync/wire";
import { generateKeyFile, loadKeyFile } from "../src/lib/cloud-signing/key-file";
import { reconcilePatronCloud, type ReconcileDeps } from "../src/jobs/patron-cloud.jobs";
import {
  __cloudReportsTimerArmedForTests,
  __configureCloudReportsForTests,
  isCloudReportsRunning,
  MAX_REPORT_ATTEMPTS,
  runCloudReportsOnce,
  startCloudReports,
  stopCloudReports,
} from "../src/jobs/cloud-report.job";
import { SETTING_KEYS } from "../src/services/system-setting.service";
import { ensureTestAdmin } from "./fixture-test-user";

let pass = 0, fail = 0;
function check(l: string, ok: boolean, x = ""): void {
  if (ok) { pass++; console.log(`  ✓ ${l}${x ? ` — ${x}` : ""}`); }
  else { fail++; console.log(`  ✗ FAIL: ${l}${x ? ` — ${x}` : ""}`); }
}

/** Bağımsız finans adı süzgeci (üretim kodundaki listeden AYRI — ayıklama kaldırılırsa bu yakalar). */
const FINANCE = /fiyat|tutar|bakiye|maliyet|odeme|doviz|kdv|price|amount|balance|cost|paid|payment|currency|vat|tax|kur$/i;
const PANEL_PATH: Readonly<Record<string, string>> = {
  "sales/order-intake": "/api/reports/sales/order-intake",
  "sales/shipment-scorecard": "/api/reports/sales/shipment-scorecard",
  "customer/scorecard": "/api/reports/customer/scorecard",
  "quality/scorecard": "/api/reports/quality/scorecard",
  "subcontract/scorecard": "/api/reports/subcontract/scorecard",
  "inventory/scorecard": "/api/reports/inventory/scorecard",
};

function canonical(v: unknown): string {
  if (Array.isArray(v)) return `[${v.map(canonical).join(",")}]`;
  if (v !== null && typeof v === "object") {
    return `{${Object.entries(v).filter(([, x]) => x !== undefined).sort(([a], [b]) => a.localeCompare(b)).map(([k, x]) => `${k}:${canonical(x)}`).join(",")}}`;
  }
  return JSON.stringify(v ?? null);
}
function keysOf(v: unknown, out: Set<string> = new Set()): Set<string> {
  if (Array.isArray(v)) v.forEach((x) => keysOf(x, out));
  else if (v !== null && typeof v === "object") for (const [k, x] of Object.entries(v)) { out.add(k); keysOf(x, out); }
  return out;
}
/** İlk farklı yol (teşhis için). */
function firstDiff(a: unknown, b: unknown, at = ""): string {
  if (canonical(a) === canonical(b)) return "";
  if (a !== null && b !== null && typeof a === "object" && typeof b === "object" && !Array.isArray(a) && !Array.isArray(b)) {
    const ka = new Map(Object.entries(a));
    const kb = new Map(Object.entries(b));
    for (const k of new Set([...ka.keys(), ...kb.keys()])) {
      const d = firstDiff(ka.get(k), kb.get(k), `${at}.${k}`);
      if (d) return d;
    }
  }
  if (Array.isArray(a) && Array.isArray(b) && a.length === b.length) {
    for (let i = 0; i < a.length; i++) {
      const d = firstDiff(a[i], b[i], `${at}[${i}]`);
      if (d) return d;
    }
  }
  return `${at}: ${canonical(a).slice(0, 80)} ≠ ${canonical(b).slice(0, 80)}`;
}

// ── taklit bulut: istek kuyruğu + gelen sonuçlar ──────────────────────────────
interface QueuedRequest { istekId: string; raporAnahtari: string; parametreler: Record<string, unknown> }
const queue: QueuedRequest[] = [];
const results: ReportResult[] = [];
let failResults = false;
const ok = (o: unknown): CloudHttpResponse => ({ status: 200, body: Buffer.from(JSON.stringify(o), "utf8") });
const fakeCloud: CloudTransport = async (req: CloudHttpRequest) => {
  const p = new URL(req.url).pathname;
  if (p === SYNC_PATHS.REPORT_CLAIM) {
    const next = queue.shift();
    return ok({ v: 1, istekler: next ? [{ ...next, olusturulma: new Date().toISOString() }] : [] });
  }
  if (p === SYNC_PATHS.REPORT_RESULT) {
    if (failResults) return { status: 503, body: Buffer.from("{}") };
    const raw = req.headers["content-encoding"] === "gzip" ? gunzipSync(req.body) : req.body;
    const parsed = ReportResultRequestSchema.safeParse(JSON.parse(raw.toString("utf8")));
    if (parsed.success) results.push(parsed.data);
    return ok({ v: 1, kabul: parsed.success, durum: parsed.success ? parsed.data.durum : "?" });
  }
  return { status: 404, body: Buffer.from("{}") };
};
async function ask(raporAnahtari: string, parametreler: Record<string, unknown>): Promise<ReportResult | null> {
  const istekId = randomUUID();
  queue.push({ istekId, raporAnahtari, parametreler });
  const before = results.length;
  await runCloudReportsOnce();
  return results.slice(before).find((r) => r.istekId === istekId) ?? null;
}

// ── ağ sayacı (§7) ───────────────────────────────────────────────────────────
let netCalls = 0;
const origHttp = http.request;
const origHttps = https.request;
const origFetch = globalThis.fetch;
function armNet(): void {
  netCalls = 0;
  Object.assign(http, { request: (...a: Parameters<typeof http.request>) => { netCalls++; return origHttp(...a); } });
  Object.assign(https, { request: (...a: Parameters<typeof https.request>) => { netCalls++; return origHttps(...a); } });
  globalThis.fetch = (...a: Parameters<typeof fetch>) => { netCalls++; return origFetch(...a); };
}
function disarmNet(): void {
  Object.assign(http, { request: origHttp });
  Object.assign(https, { request: origHttps });
  globalThis.fetch = origFetch;
}

async function main(): Promise<void> {
  delete process.env.PATRON_CLOUD_URL;
  delete process.env.PATRON_CLOUD_KEY_FILE;
  const dir = mkdtempSync(path.join(tmpdir(), "tst-patron-rapor-"));
  const keyPath = path.join(dir, "kurulum.key");
  generateKeyFile(keyPath);
  const key = loadKeyFile(keyPath);
  if (!key.ok) throw new Error("anahtar dosyası kurulamadı");
  const open: ReportEligibility = { ok: true, baseUrl: "http://127.0.0.1:9", installationId: randomUUID(), privateKey: key.key.privateKey, intervalMinutes: 5, reportIntervalSeconds: 30 };
  const closedBefore = await prisma.systemSetting.findUnique({ where: { key: SETTING_KEYS.REPORTS_CLOSED_KEYS } });
  const server = http.createServer(app);
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", () => r()));
  const addr = server.address();
  const base = `http://127.0.0.1:${addr !== null && typeof addr === "object" ? addr.port : 0}`;

  try {
    const admin = await ensureTestAdmin();
    const login = await fetch(`${base}/api/auth/login`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ username: admin.username, password: admin.password }) });
    const lj: unknown = await login.json();
    const token = lj !== null && typeof lj === "object" && "data" in lj && lj.data !== null && typeof lj.data === "object" && "token" in lj.data ? String(lj.data.token) : "";
    if (!token) throw new Error("test yöneticisi giriş yapamadı");
    const panel = async (p: string): Promise<{ status: number; data: unknown }> => {
      const r = await fetch(`${base}${p}`, { headers: { Authorization: `Bearer ${token}` } });
      const j: unknown = await r.json();
      return { status: r.status, data: j !== null && typeof j === "object" && "data" in j ? j.data : null };
    };
    __configureCloudReportsForTests({ reset: true });
    __configureCloudReportsForTests({ transport: fakeCloud, eligibility: async () => open });

    // ── §1 katalog ───────────────────────────────────────────────────────────
    console.log("\n§1 katalog: tam 6 karne, finans/rapor v2 yok");
    const keys = REMOTE_REPORTS.map((r) => r.key).sort();
    check("istenebilir küme = 6 karne", canonical(keys) === canonical(Object.keys(PANEL_PATH).sort()), keys.join(","));
    check("finans raporu yok", !keys.some((k) => k.startsWith("finance/")));
    const cat = await remoteReportCatalog();
    const dropped: string[] = [];
    const stripped = stripFinanceFields({ qty: 5, tutar: 9, satirlar: [{ m: 1, birimFiyat: 2, currency: "USD" }] }, dropped);
    check("ayıklama finans adlı anahtarı (iç içe) düşürür, sayıya dokunmaz", canonical(stripped) === canonical({ qty: 5, satirlar: [{ m: 1 }] }) && dropped.length === 3, dropped.join(","));
    const plain = { summary: { shippedQty: 12.5, otifRatio: 0.9 }, rows: [{ customerName: "A", qty: 3 }] };
    check("finanssız sonuçta ayıklama hiçbir şey düşürmez", canonical(stripFinanceFields(plain)) === canonical(plain));
    check("`rapor-katalogu` anlığı aynı 6 anahtarı taşır", canonical(cat.map((c) => c.anahtar).sort()) === canonical(keys), `${cat.length}`);

    // ── §2 6 rapor: sözleşme · finanssız · panel eşitliği ────────────────────
    console.log("\n§2 her rapor: istek → sonuç sözleşmede, finans alanı yok, panel ucuyla EŞİT");
    const today = factoryYmd(new Date());
    const from = factoryYmd(new Date(Date.now() - 200 * 86_400_000));
    for (const spec of REMOTE_REPORTS) {
      const params: Record<string, unknown> = spec.runner.kind === "RANGE" ? { dateFrom: from, dateTo: today } : {};
      const res = await ask(spec.key, params);
      check(`${spec.key}: sonuç gönderildi, tel şemasına uyar, HAZIR`, res !== null && res.durum === "HAZIR" && res.hataKodu === null && res.donem === null, res ? `${res.durum}/${res.hataKodu ?? "-"}` : "sonuç yok");
      const fin = [...keysOf(res?.veri)].filter((k) => FINANCE.test(k));
      check(`${spec.key}: sonuçta finans alanı yok`, res !== null && fin.length === 0, fin.join(","));
      const q = spec.runner.kind === "RANGE" ? `?dateFrom=${encodeURIComponent(resolveRangeStart(from).toISOString())}&dateTo=${encodeURIComponent(resolveRangeEnd(today).toISOString())}` : "";
      const pr = await panel(`${PANEL_PATH[spec.key] ?? "/yok"}${q}`);
      const veri = res?.veri ?? null;
      check(`⭐ ${spec.key}: panel ↔ telefon AYNI sayılar (kanonik eşit)`, pr.status === 200 && veri !== null && canonical(pr.data) === canonical(veri), pr.status === 200 ? firstDiff(pr.data, veri) || `${keysOf(veri).size} anahtar` : `panel ${pr.status}`);
    }

    // ── §3 katalog dışı / kapalı ────────────────────────────────────────────
    console.log("\n§3 katalog dışı kod → RAPOR_BILINMIYOR; panelde kapalı → RAPOR_KAPALI");
    for (const k of ["sales/yok-boyle", "finance/aging", "finance/cheque-due", "sales/siparis-talep", "audit/log"]) {
      const r = await ask(k, {});
      check(`${k} → HATA RAPOR_BILINMIYOR`, r?.durum === "HATA" && r.hataKodu === "RAPOR_BILINMIYOR" && r.veri === null, r ? `${r.durum}/${r.hataKodu ?? "-"}` : "sonuç yok");
    }
    await prisma.systemSetting.upsert({ where: { key: SETTING_KEYS.REPORTS_CLOSED_KEYS }, create: { key: SETTING_KEYS.REPORTS_CLOSED_KEYS, value: ["inventory/scorecard"] }, update: { value: ["inventory/scorecard"] } });
    const rk = await ask("inventory/scorecard", {});
    check("panelde kapalı rapor → HATA RAPOR_KAPALI", rk?.hataKodu === "RAPOR_KAPALI", rk?.hataKodu ?? "sonuç yok");
    check("kapalı rapor `rapor-katalogu`nda yok", !(await remoteReportCatalog()).some((c) => c.anahtar === "inventory/scorecard"));
    await prisma.systemSetting.update({ where: { key: SETTING_KEYS.REPORTS_CLOSED_KEYS }, data: { value: "bozuk" } });
    const ro = await ask("sales/order-intake", { dateFrom: from, dateTo: today });
    check("kapalı liste okunamıyor → fail-closed RAPOR_KAPALI", ro?.hataKodu === "RAPOR_KAPALI", ro?.hataKodu ?? "sonuç yok");
    if (closedBefore) await prisma.systemSetting.update({ where: { key: SETTING_KEYS.REPORTS_CLOSED_KEYS }, data: { value: closedBefore.value ?? Prisma.JsonNull } });
    else await prisma.systemSetting.deleteMany({ where: { key: SETTING_KEYS.REPORTS_CLOSED_KEYS } });

    // ── §4 geçersiz parametre ───────────────────────────────────────────────
    console.log("\n§4 geçersiz parametre → PARAMETRE_GECERSIZ");
    const bad: Array<[string, string, Record<string, unknown>]> = [
      ["tanınmayan anahtar", "sales/order-intake", { dateFrom: from, musteri: "x" }],
      ["taşan gün", "sales/order-intake", { dateFrom: "2026-13-45", dateTo: today }],
      ["ters aralık", "quality/scorecard", { dateFrom: today, dateTo: from }],
      ["366 günden uzun", "customer/scorecard", { dateFrom: "2024-01-01", dateTo: today }],
      ["panel kıyası (compare)", "sales/shipment-scorecard", { dateFrom: from, dateTo: today, compare: "prev" }],
      ["kesit raporda tarih", "inventory/scorecard", { dateFrom: from }],
      ["tarih sayı", "subcontract/scorecard", { dateFrom: 20260101 }],
    ];
    for (const [ad, k, p] of bad) {
      const r = await ask(k, p);
      check(`${ad} → HATA PARAMETRE_GECERSIZ`, r?.durum === "HATA" && r.hataKodu === "PARAMETRE_GECERSIZ", r ? `${r.durum}/${r.hataKodu ?? "-"}` : "sonuç yok");
    }
    const iso = await ask("sales/order-intake", { dateFrom: resolveRangeStart(from).toISOString(), dateTo: resolveRangeEnd(today).toISOString() });
    check("ISO an aynen kabul edilir (HAZIR)", iso?.durum === "HAZIR");
    const dflt = await ask("sales/order-intake", {});
    check("parametresiz aralıklı rapor panel varsayılanıyla HAZIR (son 30 gün)", dflt?.durum === "HAZIR");

    // ── §5 süre sınırı + tek rapor ──────────────────────────────────────────
    console.log("\n§5 süre sınırı: ZAMAN_ASIMI; hesap bitmeden ikinci tur MESGUL");
    __configureCloudReportsForTests({ timeoutMs: 0 });
    const tid = randomUUID();
    queue.push({ istekId: tid, raporAnahtari: "subcontract/scorecard", parametreler: { dateFrom: from, dateTo: today } });
    const before5 = results.length;
    const t1 = runCloudReportsOnce();
    const t2 = await runCloudReportsOnce();
    await t1;
    const r5 = results.slice(before5).find((r) => r.istekId === tid);
    check("⭐ sınır aşıldı → HATA ZAMAN_ASIMI (veri yok)", r5?.durum === "HATA" && r5.hataKodu === "ZAMAN_ASIMI" && r5.veri === null, r5 ? `${r5.durum}/${r5.hataKodu ?? "-"}` : "sonuç yok");
    check("aynı anda ikinci tur MESGUL (tek rapor)", t2.status === "MESGUL", t2.status);
    __configureCloudReportsForTests({ timeoutMs: 60_000 });

    // ── §6 boyut ────────────────────────────────────────────────────────────
    console.log("\n§6 boyut: 4 MB gzip tavanı aşılırsa SONUC_BUYUK");
    // Rastgele (sıkışmayan) ~6 MB metin: gzip sonrası da tavanı aşar.
    const noise = Array.from({ length: 60 }, () => randomBytes(75_000).toString("base64"));
    const big = ReportResultRequestSchema.parse({ v: 1, istekId: randomUUID(), raporAnahtari: "sales/order-intake", parametreler: {}, donem: null, durum: "HAZIR", veri: { satirlar: noise }, hataKodu: null, hesaplandi: new Date().toISOString(), kaynakUfuk: new Date().toISOString() });
    const bb = boundedReportBody(big);
    check("büyük sonuç → HATA SONUC_BUYUK, veri yok", bb.body.durum === "HATA" && bb.body.hataKodu === "SONUC_BUYUK" && bb.body.veri === null, `${bb.gzipBytes} B gzip`);
    const small = boundedReportBody({ ...big, veri: { satirlar: noise.slice(0, 10) } });
    check("küçük sonuç aynen gider", small.body.durum === "HAZIR", `${small.gzipBytes} B gzip`);

    // ── §7 kapalıyken iş kaydı yok ──────────────────────────────────────────
    console.log("\n§7 ön koşul kapalı: iş yok · zamanlayıcı yok · sıfır dış istek; açınca başlar, kapatınca durur");
    stopCloudReports();
    const noop = { start: () => undefined, stop: () => undefined };
    const reportDeps = { start: startCloudReports, stop: stopCloudReports };
    const offDeps: ReconcileDeps = {
      eligibility: async () => ({ ok: false, reason: "AYAR_KAPALI" }),
      switch: { setEnabled: async () => 0, enabledCount: async () => 0, sleep: async () => undefined },
      start: noop.start, stop: noop.stop,
      inbox: { eligibility: async () => ({ ok: false, reason: "AYAR_KAPALI" }), ensureUser: async () => ({ ok: false, reason: "AYAR_KAPALI" }), start: noop.start, stop: noop.stop },
      reports: reportDeps,
    };
    armNet();
    const rc0 = await reconcilePatronCloud("bekçi kapalı", offDeps);
    __configureCloudReportsForTests({ reset: true });
    const live = await runCloudReportsOnce();
    disarmNet();
    check("⭐ kapalı uzlaştırma: rapor işi KURULMADI, zamanlayıcı yok", rc0 === "DURDU" && !isCloudReportsRunning() && !__cloudReportsTimerArmedForTests(), rc0);
    check("⭐ kapalıyken (canlı ön koşul: adres yok) tur KAPALI · sıfır dış istek", live.status === "KAPALI" && live.reason === "BULUT_ADRESI_YOK" && netCalls === 0, `${live.status}/${live.reason ?? "-"} istek=${netCalls}`);
    const le = await reportEligibility({ cloudUrl: () => null });
    check("ön koşul: adres yokken rapor uygunluğu kapalı", !le.ok);
    const onDeps: ReconcileDeps = { ...offDeps, eligibility: async () => open };
    const rc1 = await reconcilePatronCloud("bekçi açık", onDeps);
    check("açık uzlaştırma: rapor işi başladı, zamanlayıcı kurulu", rc1 === "BASLADI" && isCloudReportsRunning() && __cloudReportsTimerArmedForTests(), rc1);
    await reconcilePatronCloud("bekçi kapandı", offDeps);
    check("kapatınca iş durdu, zamanlayıcı yok", !isCloudReportsRunning() && !__cloudReportsTimerArmedForTests());

    // ── §8 deneme sınırı ────────────────────────────────────────────────────
    console.log("\n§8 iletilemeyen istek sınırlı denenir, sonra hesapsız RET");
    __configureCloudReportsForTests({ transport: fakeCloud, eligibility: async () => open });
    const sid = randomUUID();
    failResults = true;
    const tries: string[] = [];
    for (let i = 0; i < MAX_REPORT_ATTEMPTS; i++) {
      queue.push({ istekId: sid, raporAnahtari: "inventory/scorecard", parametreler: {} });
      tries.push((await runCloudReportsOnce()).status);
    }
    failResults = false;
    queue.push({ istekId: sid, raporAnahtari: "inventory/scorecard", parametreler: {} });
    const before8 = results.length;
    await runCloudReportsOnce();
    const r8 = results.slice(before8).find((r) => r.istekId === sid);
    check(`${MAX_REPORT_ATTEMPTS} başarısız iletimde tur fırlatmadı (BASARISIZ)`, tries.every((s) => s === "BASARISIZ"), tries.join(","));
    check("⭐ sınırdan sonra hesaplanmadan RET (HATA, veri yok)", r8?.durum === "HATA" && r8.veri === null, r8 ? `${r8.durum}/${r8.hataKodu ?? "-"}` : "sonuç yok");

    // ── §9 hata yalıtımı ────────────────────────────────────────────────────
    console.log("\n§9 iş hatası istek yolunu etkilemez");
    __configureCloudReportsForTests({ transport: () => Promise.reject(new Error("ECONNREFUSED")) });
    const [j9, h9, a9] = await Promise.all([runCloudReportsOnce(), fetch(`${base}/health`), panel("/api/reports/inventory/scorecard")]);
    check("⭐ bulut erişilemez: tur fırlatmaz (BASARISIZ) · aynı anda /health ve panel 200", j9.status === "BASARISIZ" && h9.status === 200 && a9.status === 200, `${j9.status}/${j9.reason ?? "-"} · ${h9.status} · ${a9.status}`);
    __configureCloudReportsForTests({ eligibility: async () => { throw new Error("ön koşul patladı"); } });
    const j9b = await runCloudReportsOnce();
    check("ön koşul fırlatsa da tur fırlatmaz", j9b.status === "BASARISIZ" && j9b.reason === "PROGRAM_HATASI", `${j9b.status}/${j9b.reason ?? "-"}`);
  } finally {
    disarmNet();
    stopCloudReports();
    __configureCloudReportsForTests({ reset: true });
    if (closedBefore) await prisma.systemSetting.update({ where: { key: SETTING_KEYS.REPORTS_CLOSED_KEYS }, data: { value: closedBefore.value ?? Prisma.JsonNull } }).catch(() => undefined);
    else await prisma.systemSetting.deleteMany({ where: { key: SETTING_KEYS.REPORTS_CLOSED_KEYS } });
    await new Promise<void>((r) => { server.closeAllConnections(); server.close(() => r()); });
    rmSync(dir, { recursive: true, force: true });
  }
}

main()
  .catch((e: unknown) => { fail++; console.log(`  ✗ FAIL: beklenmeyen hata — ${e instanceof Error ? e.stack ?? e.message : String(e)}`); })
  .finally(() => {
    console.log(`\n=== Sonuç: ${pass} geçti, ${fail} başarısız ===\n`);
    process.exit(fail > 0 ? 1 : 0);
  });
