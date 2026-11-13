// =============================================================================
// "ŞİMDİ GÜNCELLE" FABRİKA BEKÇİSİ (kullanıcı kararı 2026-11-13). Patron telefondan ister; bulut tesis başına tek işaret
// açar; fabrika işareti KENDİ başlattığı imzalı rapor yoklamasının (`/v1/rapor/al`) yanıtında alır (yeni bağlantı
// yönü yok) ve eşitleme turunu hemen tetikler — son turdan 60 sn geçtiyse.
//  §1 işaret → tur: yoklama yanıtındaki `esitlemeIstegi: true` eşitleme turunu (gerçek iş, sahte bulut) hemen koşturur.
//  §2 60 sn: son turdan 60 sn geçmeden gelen ikinci işaret tur AÇMAZ; 60 sn sonra açar.
//  §3 kapalıyken hiçbir şey: eşitleme işi kurulu değilse tetik KAPALI, tur yok, dış istek yok; ön koşul kapalı rapor
//     turunda yoklama da yok (işaret alınamaz).
//  §4 eski bulut yanıtı: alanlar yoksa (ya da tipi bozuksa) tetik yok ve yoklama aralığı BUGÜNKÜ ayar.
//  §5 uzun yoklama aralığı: beyan eden bulutta kısa aralık, ama iki tur başlangıcı arası ≥ 10 sn.
//  §6 hata yalıtımı: tetik fırlatsa da rapor turu BAŞARILI, istisna sızmaz.
// Negatif sondalar (md5 ile geri alındı; komut kaydı commit mesajında):
//   · rapor işinde `relaySyncNow()` çağrısı kaldırıldı → §1 ✗
//   · `triggerCloudSyncNow` 60 sn kapısı kaldırıldı → §2 ✗
//   · `triggerCloudSyncNow` `!started` kapısı kaldırıldı → §3 ✗
//   · `nextReportDelayMs` uzun yoklama beyanına bakmadan kısa aralık döndü → §4/§5 ✗
//   · `relaySyncNow` try/catch'i kaldırıldı → §6 ✗
// Koşum: npx tsx scripts/run-all-tests.ts patron_bulut_simdi
// =============================================================================
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { randomUUID } from "node:crypto";
import type { CloudHttpRequest, CloudHttpResponse, CloudTransport } from "../src/cloud-sync/cloud-client";
import type { CloudEligibility, ReportEligibility } from "../src/cloud-sync/eligibility";
import { SYNC_NOW_MIN_GAP_MS, SYNC_PATHS } from "../src/cloud-sync/wire";
import { generateKeyFile, loadKeyFile } from "../src/lib/cloud-signing/key-file";
import { __configureCloudReportsForTests, LONG_POLL_GAP_MS, LONG_POLL_MIN_CYCLE_MS, nextReportDelayMs, runCloudReportsOnce } from "../src/jobs/cloud-report.job";
import { __cloudSyncTimerArmedForTests, __configureCloudSyncForTests, getCloudSyncStatus, startCloudSync, stopCloudSync, triggerCloudSyncNow } from "../src/jobs/cloud-sync.job";

let pass = 0, fail = 0;
function check(l: string, ok: boolean, x = ""): void {
  if (ok) { pass++; console.log(`  ✓ ${l}${x ? ` — ${x}` : ""}`); }
  else { fail++; console.log(`  ✗ FAIL: ${l}${x ? ` — ${x}` : ""}`); }
}

const ok = (o: unknown): CloudHttpResponse => ({ status: 200, body: Buffer.from(JSON.stringify(o), "utf8") });
const uyu = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/** Sahte bulut: claim yanıtı sırayla `claims`ten; eşitleme paketi 400 (tur hızlıca biter ama KOŞAR — çağrı sayılır). */
let claims: unknown[] = [];
const calls: string[] = [];
const fakeCloud: CloudTransport = async (req: CloudHttpRequest) => {
  const p = new URL(req.url).pathname;
  calls.push(p);
  if (p === SYNC_PATHS.REPORT_CLAIM) return ok(claims.shift() ?? { v: 1, istekler: [] });
  return { status: 400, body: Buffer.from(JSON.stringify({ success: false, message: "bekçi", details: { code: "GOVDE_GECERSIZ" } })) };
};
const syncCalls = () => calls.filter((c) => c !== SYNC_PATHS.REPORT_CLAIM).length;

async function bekle(kosul: () => boolean, ms: number): Promise<boolean> {
  const son = Date.now() + ms;
  while (Date.now() < son) {
    if (kosul()) return true;
    await uyu(50);
  }
  return kosul();
}

async function main(): Promise<void> {
  delete process.env.PATRON_CLOUD_URL;
  delete process.env.PATRON_CLOUD_KEY_FILE;
  const dir = mkdtempSync(path.join(tmpdir(), "tst-patron-simdi-"));
  try {
    const keyPath = path.join(dir, "kurulum.key");
    generateKeyFile(keyPath);
    const key = loadKeyFile(keyPath);
    if (!key.ok) throw new Error("anahtar dosyası kurulamadı");
    const acik: CloudEligibility = { ok: true, baseUrl: "http://127.0.0.1:9", installationId: randomUUID(), privateKey: key.key.privateKey, intervalMinutes: 5 };
    const raporAcik: ReportEligibility = { ...acik, reportIntervalSeconds: 30 };
    __configureCloudSyncForTests({ reset: true });
    __configureCloudSyncForTests({ transport: fakeCloud, eligibility: async () => acik });
    __configureCloudReportsForTests({ reset: true });
    __configureCloudReportsForTests({ transport: fakeCloud, eligibility: async () => raporAcik });

    // ── §1 işaret → tur ──────────────────────────────────────────────────────
    console.log("\n§1 işaret → eşitleme turu hemen");
    startCloudSync();
    const once = syncCalls();
    claims = [{ v: 1, istekler: [], esitlemeIstegi: true, uzunYoklama: true }];
    const r1 = await runCloudReportsOnce();
    check("rapor turu BAŞARILI ve uzun yoklamayı gördü", r1.status === "BASARILI" && r1.longPoll === true, `${r1.status} ${r1.longPoll}`);
    const turOldu = await bekle(() => getCloudSyncStatus().lastRoundAt !== null && syncCalls() > once, 30_000);
    check("işaret eşitleme turunu (30 sn açılış beklemesi olmadan) koşturdu: tur kaydı + buluta paket", turOldu, `paket çağrısı ${syncCalls() - once}`);
    await bekle(() => !getCloudSyncStatus().running || getCloudSyncStatus().lastRoundAt !== null, 1_000);

    // ── §2 60 sn kapısı ──────────────────────────────────────────────────────
    console.log("\n§2 son turdan 60 sn geçmeden ikinci işaret tur açmaz");
    await bekle(() => __cloudSyncTimerArmedForTests(), 5_000);
    const last = getCloudSyncStatus().lastRoundAt ?? 0;
    const sonra = syncCalls();
    claims = [{ v: 1, istekler: [], esitlemeIstegi: true, uzunYoklama: true }];
    await runCloudReportsOnce();
    await uyu(1_500);
    check("ikinci işaret (hemen) → tur YOK, buluta paket yok", syncCalls() === sonra, `${syncCalls() - sonra}`);
    check("tetik 59 sn sonra YAKIN_ZAMANDA", triggerCloudSyncNow(last + SYNC_NOW_MIN_GAP_MS - 1_000) === "YAKIN_ZAMANDA");
    const t2 = triggerCloudSyncNow(Math.max(Date.now(), last + SYNC_NOW_MIN_GAP_MS + 1_000));
    const tur2 = await bekle(() => syncCalls() > sonra, 30_000);
    check("60 sn dolunca tetik TETIKLENDI ve tur koşar", t2 === "TETIKLENDI" && tur2, `${t2}`);
    await uyu(300);
    check("art arda ikinci tetik (aynı an) YAKIN_ZAMANDA — bulut ele geçse de yük ≤ 1/dk", triggerCloudSyncNow(Math.max(Date.now(), last + SYNC_NOW_MIN_GAP_MS + 2_000)) === "YAKIN_ZAMANDA");

    // ── §3 kapalıyken hiçbir şey ─────────────────────────────────────────────
    console.log("\n§3 kapatma düğmesi kapalı: hiçbir şey");
    stopCloudSync();
    await uyu(300);
    const kapali0 = calls.length;
    claims = [{ v: 1, istekler: [], esitlemeIstegi: true, uzunYoklama: true }];
    await runCloudReportsOnce();
    await uyu(1_000);
    check("eşitleme işi kurulu değilken işaret tur AÇMAZ (yalnız yoklamanın kendisi)", calls.length === kapali0 + 1 && calls.at(-1) === SYNC_PATHS.REPORT_CLAIM, calls.slice(kapali0).join(","));
    check("tetik KAPALI döner, zamanlayıcı kurulmaz", triggerCloudSyncNow(Date.now() + 10 * SYNC_NOW_MIN_GAP_MS) === "KAPALI" && !__cloudSyncTimerArmedForTests());
    let tetik = 0;
    __configureCloudReportsForTests({ eligibility: async () => ({ ok: false, reason: "AYAR_KAPALI" }), onSyncNow: () => { tetik++; } });
    const kapali1 = calls.length;
    const r3 = await runCloudReportsOnce();
    check("ön koşul kapalı rapor turu: KAPALI, SIFIR dış istek, tetik yok", r3.status === "KAPALI" && calls.length === kapali1 && tetik === 0);

    // ── §4 eski bulut yanıtı ─────────────────────────────────────────────────
    console.log("\n§4 eski bulut: bugünkü davranış");
    __configureCloudReportsForTests({ eligibility: async () => raporAcik });
    claims = [{ v: 1, istekler: [] }];
    const r4 = await runCloudReportsOnce();
    check("alan yok → tetik yok, uzun yoklama yok", r4.status === "BASARILI" && tetik === 0 && r4.longPoll === false);
    check("eski bulutta aralık = ayar (30 sn)", nextReportDelayMs(r4, 30_000, 40) === 30_000, `${nextReportDelayMs(r4, 30_000, 40)}`);
    claims = [{ v: 1, istekler: [], esitlemeIstegi: "evet", uzunYoklama: 1 }];
    const r4b = await runCloudReportsOnce();
    check("tipi bozuk alan GEVŞEK okunur: tur BAŞARILI, tetik yok, aralık bugünkü", r4b.status === "BASARILI" && tetik === 0 && r4b.longPoll === false);
    claims = [{ v: 1, istekler: [], esitlemeIstegi: true }];
    await runCloudReportsOnce();
    check("yeni alan → tetik TAM bir kez", tetik === 1, `${tetik}`);

    // ── §5 uzun yoklama aralığı ──────────────────────────────────────────────
    console.log("\n§5 uzun yoklama aralığı");
    const uzun = { status: "BASARILI" as const, longPoll: true };
    check(`bulut 20 sn bekletip döndüyse sonraki yoklama ${LONG_POLL_GAP_MS} ms sonra`, nextReportDelayMs(uzun, 30_000, 20_000) === LONG_POLL_GAP_MS);
    check(`bulut beklemeden döndüyse tur başlangıçları arası ≥ ${LONG_POLL_MIN_CYCLE_MS} ms`, nextReportDelayMs(uzun, 30_000, 40) === LONG_POLL_MIN_CYCLE_MS - 40);
    check("başarısız turda kısa aralık YOK (geri çekilmeye ayar aralığı verilir)", nextReportDelayMs({ status: "BASARISIZ", longPoll: true }, 30_000, 40) === 30_000);

    // ── §6 hata yalıtımı ─────────────────────────────────────────────────────
    console.log("\n§6 tetik hatası rapor turunu durdurmaz");
    __configureCloudReportsForTests({ onSyncNow: () => { throw new Error("tetik patladı"); } });
    claims = [{ v: 1, istekler: [], esitlemeIstegi: true, uzunYoklama: true }];
    let sizdi = false;
    const r6 = await runCloudReportsOnce().catch(() => { sizdi = true; return null; });
    check("tetik fırlatsa da tur BAŞARILI, istisna sızmaz", !sizdi && r6?.status === "BASARILI", `${r6?.status}`);
  } finally {
    stopCloudSync();
    __configureCloudSyncForTests({ reset: true });
    __configureCloudReportsForTests({ reset: true });
    rmSync(dir, { recursive: true, force: true });
  }
}

main()
  .catch((e: unknown) => { fail++; console.log(`  ✗ FAIL: beklenmeyen hata — ${e instanceof Error ? e.stack ?? e.message : String(e)}`); })
  .finally(() => {
    console.log(`\n=== Sonuç: ${pass} geçti, ${fail} başarısız ===\n`);
    process.exit(fail > 0 ? 1 : 0);
  });
