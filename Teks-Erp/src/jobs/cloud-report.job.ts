// =============================================================================
// Patron bulutu RAPOR İSTEĞİ işi — bekleyen isteği üstlenir, fabrikada hesaplar, sonucu gönderir (D5)
// =============================================================================
// Kaynak: ana ürün 19aa48a9 `claimAndRunReportRequests` (orada eşitleme turuna + zile iliştirili). Adnan farkı:
// zil yok ve eşitleme aralığı dakikalık (varsayılan 5 dk) — uygulama ~2 dk bekler; bu yüzden AYRI iş, aralık
// `patronCloud.reportIntervalSeconds` (20–600 sn, varsayılan 30). Ayrı düğme yok: eşitleme ön koşulu açıkken
// `patron-cloud.jobs.ts` başlatır, kapanınca durdurur; kapalıyken zamanlayıcı kurulmaz, buluta istek gitmez.
// Yük koruması: AYNI ANDA TEK rapor (her `al` tek istek; zaman aşımında bile hesap bitmeden yenisi başlamaz),
// tur başına en çok `REPORTS_PER_TICK`. İşin HİÇBİR hatası dışarı sızmaz — tek satır log, geri çekilme.
// =============================================================================
import { bilgi, uyari } from "../lib/logger";
import { reportEligibility, type ReportEligibility } from "../cloud-sync/eligibility";
import { cloudContext, cloudPost, egressCloudTransport, type CloudTransport } from "../cloud-sync/cloud-client";
import { computeReportResult, REPORT_TIMEOUT_MS, sendReportResult } from "../cloud-sync/report-requests";
import { ENVELOPE_VERSION, ReportClaimResponseSchema, ReportResultRequestSchema, SYNC_PATHS, type ReportResult } from "../cloud-sync/wire";

const STARTUP_DELAY_MS = 25 * 1000;
/** Bir turda en çok bu kadar istek (sırayla, her biri ayrı `al`) — claim süresi taze kalsın. */
export const REPORTS_PER_TICK = 3;
/** Aynı istek bu kadar kez üstlenilip sonucu iletilemediyse yeniden HESAPLANMAZ, RET gönderilir. */
export const MAX_REPORT_ATTEMPTS = 3;
export const REPORT_BACKOFF_MAX_MS = 10 * 60 * 1000;
const ATTEMPT_MAP_MAX = 1000;

export type ReportRunStatus = "KAPALI" | "BASARILI" | "BASARISIZ" | "MESGUL";
export interface ReportRunResult {
  readonly status: ReportRunStatus;
  readonly reason: string | null;
  readonly claimed: number;
  /** Gönderilen sonuçlar (HAZIR | HATA) — gönderimi başarısız olanlar dahil değil. */
  readonly sent: readonly ReportResult[];
  readonly failedSend: number;
}

let started = false;
let running = false;
let timer: NodeJS.Timeout | null = null;
let transport: CloudTransport = egressCloudTransport;
let eligibilityFn: () => Promise<ReportEligibility> = () => reportEligibility();
let timeoutMs = REPORT_TIMEOUT_MS;
let failures = 0;
let lastWarn: string | null = null;
const attempts = new Map<string, number>();

function warnOnce(text: string): void {
  if (text === lastWarn) return;
  lastWarn = text;
  uyari("patron-bulut", text);
}

const empty = (status: ReportRunStatus, reason: string | null = null): ReportRunResult => ({ status, reason, claimed: 0, sent: [], failedSend: 0 });

/** Tek tur: ön koşul → (≤ `REPORTS_PER_TICK` kez) tek istek `al` → hesapla → `sonuc`. Asla fırlatmaz. */
export async function runCloudReportsOnce(): Promise<ReportRunResult> {
  if (running) return empty("MESGUL");
  running = true;
  try {
    const e = await eligibilityFn();
    if (!e.ok) return empty("KAPALI", e.reason);
    const ctx = cloudContext(e, transport);
    const sent: ReportResult[] = [];
    let claimed = 0;
    let failedSend = 0;
    for (let i = 0; i < REPORTS_PER_TICK; i++) {
      const res = await cloudPost(ctx, SYNC_PATHS.REPORT_CLAIM, { v: ENVELOPE_VERSION, enFazla: 1 }, { gzip: false });
      if (!res.ok) return { status: "BASARISIZ", reason: res.code, claimed, sent, failedSend };
      const env = ReportClaimResponseSchema.safeParse(res.json);
      if (!env.success) return { status: "BASARISIZ", reason: "YANIT_GECERSIZ", claimed, sent, failedSend };
      const req = env.data.istekler[0];
      if (!req) break;
      claimed++;
      const n = (attempts.get(req.istekId) ?? 0) + 1;
      let result: ReportResult;
      if (n > MAX_REPORT_ATTEMPTS) {
        result = ReportResultRequestSchema.parse({
          v: 1, istekId: req.istekId, raporAnahtari: req.raporAnahtari.slice(0, 80) || "?", parametreler: req.parametreler, donem: null,
          durum: "HATA", veri: null, hataKodu: "ZAMAN_ASIMI", hesaplandi: new Date().toISOString(), kaynakUfuk: new Date().toISOString(),
        });
        warnOnce(`rapor isteği ${req.istekId}: ${MAX_REPORT_ATTEMPTS} denemede iletilemedi — yeniden hesaplanmadan RET gönderiliyor`);
      } else {
        const c = await computeReportResult({ istekId: req.istekId, key: req.raporAnahtari, params: req.parametreler, nowMs: Date.now(), timeoutMs });
        result = c.result;
        if (c.result.hataKodu === "ZAMAN_ASIMI") uyari("patron-bulut", `rapor ${req.raporAnahtari} ${timeoutMs} ms sınırını aştı — RET (hesabın bitmesi bekleniyor)`);
        if (c.droppedFinance.length > 0) warnOnce(`rapor ${req.raporAnahtari}: ${c.droppedFinance.length} finans alanı sonuçtan çıkarıldı`);
        // Aynı anda tek rapor: zaman aşımında da DB'deki hesap bitmeden sıradaki istek başlamaz.
        await c.settled;
      }
      const s = await sendReportResult(ctx, result);
      if (s.ok) {
        attempts.delete(req.istekId);
        sent.push(result);
      } else {
        failedSend++;
        if (attempts.size >= ATTEMPT_MAP_MAX) {
          const oldest = attempts.keys().next().value;
          if (oldest !== undefined) attempts.delete(oldest);
        }
        attempts.set(req.istekId, n);
        // Sonuç kaybolursa claim süresi dolunca bulut isteği yeniden verir; sayaç sonsuz döngüyü keser.
        return { status: "BASARISIZ", reason: s.code, claimed, sent, failedSend };
      }
    }
    if (claimed > 0) bilgi("patron-bulut", `rapor isteği: ${claimed} üstlenildi · ${sent.length} sonuç gönderildi`);
    return { status: "BASARILI", reason: null, claimed, sent, failedSend };
  } catch (err) {
    const msg = err instanceof Error ? `${err.name}: ${err.message}` : String(err);
    warnOnce(`rapor isteği turu hata verdi (${msg.replace(/\s+/g, " ").slice(0, 240)})`);
    return empty("BASARISIZ", "PROGRAM_HATASI");
  } finally {
    running = false;
  }
}

async function tick(): Promise<number> {
  const r = await runCloudReportsOnce();
  const e = await eligibilityFn().catch(() => null);
  const intervalMs = e && e.ok ? e.reportIntervalSeconds * 1000 : 5 * 60 * 1000;
  if (r.status === "BASARISIZ") {
    failures++;
    warnOnce(`rapor isteği turu başarısız (${r.reason ?? "neden yok"}) — ${failures}. ardışık hata, geri çekiliyor`);
    return Math.min(REPORT_BACKOFF_MAX_MS, intervalMs * 2 ** Math.min(failures, 6));
  }
  if (r.status === "BASARILI") {
    if (failures > 0) bilgi("patron-bulut", `rapor isteği toparlandı (${failures} ardışık hatadan sonra)`);
    failures = 0;
    lastWarn = null;
  }
  return intervalMs;
}

function schedule(delayMs: number): void {
  if (!started) return;
  if (timer) clearTimeout(timer);
  timer = setTimeout(() => {
    timer = null;
    void tick()
      .catch(() => 5 * 60 * 1000)
      .then((next) => schedule(next));
  }, delayMs);
  timer.unref();
}

/** Yalnız `patron-cloud.jobs.ts` çağırır (eşitleme ön koşulu açıkken). İkinci çağrı etkisiz. */
export function startCloudReports(): void {
  if (started) return;
  started = true;
  failures = 0;
  lastWarn = null;
  schedule(STARTUP_DELAY_MS);
  bilgi("patron-bulut", "rapor isteği işi başladı");
}

export function stopCloudReports(): void {
  if (!started) return;
  started = false;
  if (timer) clearTimeout(timer);
  timer = null;
  bilgi("patron-bulut", "rapor isteği işi durdu");
}

export function isCloudReportsRunning(): boolean {
  return started;
}

/** Test kancası: taşıma/ön koşul/süre sınırı enjeksiyonu; `reset` canlı bağımlılıklara döner. */
export function __configureCloudReportsForTests(p: {
  transport?: CloudTransport;
  eligibility?: () => Promise<ReportEligibility>;
  timeoutMs?: number;
  reset?: boolean;
}): void {
  if (p.reset) {
    transport = egressCloudTransport;
    eligibilityFn = () => reportEligibility();
    timeoutMs = REPORT_TIMEOUT_MS;
    failures = 0;
    lastWarn = null;
    attempts.clear();
  }
  if (p.transport) transport = p.transport;
  if (p.eligibility) eligibilityFn = p.eligibility;
  if (p.timeoutMs !== undefined) timeoutMs = p.timeoutMs;
}

/** Test kancası: zamanlayıcı kurulu mu (ön koşul kapalıyken hiç kurulmamalı). */
export function __cloudReportsTimerArmedForTests(): boolean {
  return timer !== null;
}
