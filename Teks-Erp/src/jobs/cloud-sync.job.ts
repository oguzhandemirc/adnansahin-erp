// =============================================================================
// Patron bulutu eşitleme işi — backend sürecinin İÇİNDE, yalnız ön koşul açıkken KURULUR.
// =============================================================================
// Kaynak: ana ürün 19aa48a9 `jobs/cloud-sync.job.ts`. Adnan farkı: zil, rapor isteği, anlık
// kayıt, günlük ret defteri ve olay turu (kirli bayrak) YOK; ön koşul async; ardışık hatada
// geri çekilme. Başlatma/durdurma tek yerden (`patron-cloud.jobs.ts`): kapalıyken bu dosyanın
// zamanlayıcısı hiç kurulmaz. İşin HİÇBİR hatası dışarı sızmaz — tek satır log, sonraki tık.
// =============================================================================
import { bilgi, uyari } from "../lib/logger";
import { factoryMinuteOfDay, factoryYmd } from "../constants/time";
import { cloudEligibility, type CloudBlockReason, type CloudEligibility } from "../cloud-sync/eligibility";
import { egressCloudTransport, type CloudTransport } from "../cloud-sync/cloud-client";
import { runSyncRound, type RoundDeps, type RoundOutcome } from "../cloud-sync/sync-round";
import { pruneSyncMarks } from "../cloud-sync/marks-pruning";
import { loadWatermarks, saveWatermarks, wmKey } from "../cloud-sync/watermarks";

const TICK_MS = 60 * 1000;
const STARTUP_DELAY_MS = 30 * 1000;
/** Günlük uzlaştırmanın fabrika saati (gece yedeğinden sonra). */
const RECONCILE_MINUTE_OF_DAY = 3 * 60 + 30;
const RECONCILE_RETRY_MS = 30 * 60 * 1000;
/** Ardışık hatada bekleme: aralık × 2^n, en çok bu kadar. */
export const BACKOFF_MAX_MS = 60 * 60 * 1000;
const BACKOFF_MAX_EXP = 6;

export interface CloudSyncStatus {
  readonly running: boolean;
  readonly eligible: boolean;
  readonly blockReason: CloudBlockReason | null;
  readonly lastRoundAt: number | null;
  readonly lastOutcome: Pick<RoundOutcome, "status" | "reason" | "packets" | "horizon" | "contractWarning"> | null;
  readonly lastReconcileYmd: string | null;
  readonly consecutiveFailures: number;
  readonly nextDueAt: number | null;
  /** Son başarılı anlık hesabının zamanı (hiç yapılmadıysa null). */
  readonly lastSnapshotAt: number | null;
}

let started = false;
let inFlight = false;
let timer: NodeJS.Timeout | null = null;
let transport: CloudTransport = egressCloudTransport;
let eligibilityFn: () => Promise<CloudEligibility> = () => cloudEligibility();
let onPacket: RoundDeps["onPacket"];
let nextDueAt = 0;
let failures = 0;
let lastReconcileAttemptAt = 0;
let forceReconcileOnce = false;
let lastPruneYmd: string | null = null;
/** Son başarılı anlık hesabı (bellekte; yeniden başlatmada ilk tur hepsini hesaplar). */
let lastSnapshotAt = 0;
/** Aynı hata metni art arda yazılmaz (geri çekilmede her tık aynı satırı basmasın). */
let lastWarn: string | null = null;
let status: Omit<CloudSyncStatus, "running" | "consecutiveFailures" | "nextDueAt" | "lastSnapshotAt"> = {
  eligible: false,
  blockReason: null,
  lastRoundAt: null,
  lastOutcome: null,
  lastReconcileYmd: null,
};

export function getCloudSyncStatus(): CloudSyncStatus {
  return { ...status, running: started, consecutiveFailures: failures, nextDueAt: started ? nextDueAt : null, lastSnapshotAt: lastSnapshotAt || null };
}

export function isCloudSyncRunning(): boolean {
  return started;
}

function warnOnce(text: string): void {
  if (text === lastWarn) return;
  lastWarn = text;
  uyari("patron-bulut", text);
}

/** Hata/başarı → sonraki tur zamanı. Ardışık hata aralığı katlar (tavan 60 dk). */
function settle(ok: boolean, nowMs: number, intervalMs: number, more: boolean): void {
  if (ok) {
    if (failures > 0) bilgi("patron-bulut", `eşitleme toparlandı (${failures} ardışık hatadan sonra)`);
    failures = 0;
    lastWarn = null;
    // Tavana takılan kaynak varsa bir sonraki tık beklemeden devam eder.
    nextDueAt = more ? nowMs : nowMs + intervalMs;
    return;
  }
  failures++;
  nextDueAt = nowMs + Math.min(BACKOFF_MAX_MS, intervalMs * 2 ** Math.min(failures, BACKOFF_MAX_EXP));
}

function describe(o: RoundOutcome): string {
  const parts = [o.reason ?? ""];
  if (o.rejected.length > 0) parts.push(`ret: ${o.rejected.map((r) => `${r.projection}/${r.code}`).join(", ")}`);
  if (o.unaccepted.length > 0) parts.push(`onaysız: ${o.unaccepted.join(", ")}`);
  return parts.filter(Boolean).join(" · ") || "neden yok";
}

function remember(o: RoundOutcome, at: number): void {
  status = { ...status, lastRoundAt: at, lastOutcome: { status: o.status, reason: o.reason, packets: o.packets, horizon: o.horizon, contractWarning: o.contractWarning } };
  if (o.status === "HATA" || o.status === "KISMI") warnOnce(`eşitleme turu ${o.status} (${describe(o)}) — sonraki turda tekrar`);
  if (o.contractWarning) warnOnce(`bulut sözleşme uyarısı: ${o.contractWarning.slice(0, 200)}`);
}

/** Günde bir: eski eşitleme işaretleri budanır (onaylanmış en eski filigrandan önceki işaretler). */
async function dailyPrune(nowMs: number): Promise<void> {
  const ymd = factoryYmd(new Date(nowMs));
  if (lastPruneYmd === ymd) return;
  const n = await pruneSyncMarks(nowMs);
  lastPruneYmd = ymd;
  if (n > 0) bilgi("patron-bulut", `${n} eski eşitleme işareti budandı`);
}

async function tickBody(nowMs: number): Promise<void> {
  const elig = await eligibilityFn();
  status = { ...status, eligible: elig.ok, blockReason: elig.ok ? null : elig.reason };
  if (!elig.ok) return;
  const intervalMs = elig.intervalMinutes * 60_000;
  await dailyPrune(nowMs);
  const deps: RoundDeps = { transport, nowMs: () => nowMs, eligibility: async () => elig, onPacket };
  if (nowMs >= nextDueAt) {
    // Anlıklar aralık başına EN ÇOK bir kez hesaplanır (devam turları — `more` — yeniden hesaplamaz).
    const snapshots = nowMs - lastSnapshotAt >= intervalMs;
    const o = await runSyncRound({ kind: "ARTIMLI", snapshots }, deps);
    remember(o, nowMs);
    if (snapshots && o.status !== "HATA") lastSnapshotAt = nowMs;
    if (o.snapshotRun && o.snapshotRun.errors.length > 0) {
      warnOnce(`anlık kurulamadı: ${o.snapshotRun.errors.map((e) => `${e.name} (${e.message})`).join(", ").slice(0, 300)}`);
    }
    settle(o.status !== "HATA", nowMs, intervalMs, o.more);
    if (o.status === "HATA") return;
  }
  // Günlük uzlaştırma: fabrika saatiyle 03:30'dan sonra günde bir; başarısız deneme 30 dk'da bir.
  const now = new Date(nowMs);
  const ymd = factoryYmd(now);
  const reconcileTime = forceReconcileOnce || nowMs >= factoryMinuteOfDay(now, RECONCILE_MINUTE_OF_DAY).getTime();
  if (!reconcileTime || nowMs - lastReconcileAttemptAt < RECONCILE_RETRY_MS) return;
  forceReconcileOnce = false;
  const stored = await loadWatermarks();
  if (stored.get(wmKey.reconcile)?.digest === ymd) return;
  lastReconcileAttemptAt = nowMs;
  const o = await runSyncRound({ kind: "UZLASTIRMA" }, deps);
  remember(o, nowMs);
  if (o.status === "TAMAM" || o.status === "KISMI") {
    await saveWatermarks([{ source: wmKey.reconcile, digest: ymd, at: now }]);
    status = { ...status, lastReconcileYmd: ymd };
  }
}

/**
 * Tek koşum — zamanlayıcı ve bekçi aynı fonksiyonu çağırır. Asla fırlatmaz: hata tek satır
 * log + geri çekilme olur (fabrikanın istek yolu bu işi beklemez, hatasını da görmez).
 */
export async function runCloudSyncTick(nowMs: number = Date.now()): Promise<void> {
  if (inFlight) return;
  inFlight = true;
  try {
    await tickBody(nowMs);
  } catch (err) {
    const msg = err instanceof Error ? `${err.name}: ${err.message}` : String(err);
    settle(false, nowMs, 5 * 60_000, false);
    warnOnce(`eşitleme turu hata verdi (${msg.replace(/\s+/g, " ").slice(0, 240)}) — ${failures}. ardışık hata, geri çekiliyor`);
  } finally {
    inFlight = false;
  }
}

function schedule(delayMs: number): void {
  if (!started) return;
  if (timer) clearTimeout(timer);
  timer = setTimeout(() => {
    timer = null;
    void runCloudSyncTick().finally(() => schedule(TICK_MS));
  }, delayMs);
  timer.unref();
}

/** Yalnız `patron-cloud.jobs.ts` çağırır (ön koşul + tetikleyiciler açıkken). İkinci çağrı etkisiz. */
export function startCloudSync(): void {
  if (started) return;
  started = true;
  failures = 0;
  nextDueAt = 0;
  lastWarn = null;
  schedule(STARTUP_DELAY_MS);
  bilgi("patron-bulut", "eşitleme işi başladı");
}

export function stopCloudSync(): void {
  if (!started) return;
  started = false;
  if (timer) clearTimeout(timer);
  timer = null;
  bilgi("patron-bulut", "eşitleme işi durdu");
}

/** Test/ölçüm kancası: zamanlayıcıyı beklemeden tur; taşıma/ön koşul/paket gözlemcisi enjekte edilir. */
export function __configureCloudSyncForTests(p: {
  transport?: CloudTransport;
  eligibility?: () => Promise<CloudEligibility>;
  onPacket?: RoundDeps["onPacket"];
  forceDue?: boolean;
  forceReconcile?: boolean;
  reset?: boolean;
}): void {
  if (p.reset) {
    transport = egressCloudTransport;
    eligibilityFn = () => cloudEligibility();
    onPacket = undefined;
    failures = 0;
    nextDueAt = 0;
    lastPruneYmd = null;
    lastSnapshotAt = 0;
    lastReconcileAttemptAt = 0;
    lastWarn = null;
  }
  if (p.transport) transport = p.transport;
  if (p.eligibility) eligibilityFn = p.eligibility;
  if (p.onPacket) onPacket = p.onPacket;
  if (p.forceDue) nextDueAt = 0;
  if (p.forceReconcile) {
    forceReconcileOnce = true;
    lastReconcileAttemptAt = 0;
  }
}

/** Test kancası: zamanlayıcı kurulu mu (kapalıyken hiç kurulmamalı). */
export function __cloudSyncTimerArmedForTests(): boolean {
  return timer !== null;
}
