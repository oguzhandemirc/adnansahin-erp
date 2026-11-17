// =============================================================================
// Patron bulutu BİLDİRİM KÖPRÜSÜ işi (2.13.0, D4) — fabrikanın teslimleri buluta, okundular iki yönde
// =============================================================================
// Ayrı düğme yok: eşitleme ön koşulu açıkken `patron-cloud.jobs.ts` başlatır, kapanınca durdurur; kapalıyken
// zamanlayıcı kurulmaz. Her tur ÖNCE eşitleme ön koşulunu, sonra `notifications.enabled` şalterini sorar — ikisinden
// biri kapalıysa ne DB okuması ne dış istek. Tetik: yeni teslim doğunca `nudgeCloudNotify()` (kısa gecikmeyle, yazma
// yolunu beklemez) + 30 sn'lik süpürme (telefonda okunanlar da bu turla döner). Eski bulut (uç yok, 404) hata değildir:
// tek satır log + 60 dk geri çekilme; diğer hatalar artan geri çekilme. İşin HİÇBİR hatası dışarı sızmaz; log yalnız
// SAYI ve kod taşır (başlık, metin, kişi adı yazılmaz).
// =============================================================================
import { bilgi, uyari } from "../lib/logger";
import { cloudEligibility, type CloudEligibility } from "../cloud-sync/eligibility";
import { cloudContext, cloudPost, egressCloudTransport, type CloudTransport } from "../cloud-sync/cloud-client";
import {
  ENVELOPE_VERSION,
  NOTIFICATION_PUSH_MAX,
  NOTIFICATION_READS_MAX,
  NotificationsPushRequestSchema,
  NotificationsPushResponseSchema,
  SYNC_PATHS,
} from "../cloud-sync/wire";
import { notificationsEnabled } from "../services/notifications/notification-switch";
import { applyBridgeResult, collectBridgeBatch, type BridgeBatch } from "../services/notifications/cloud-bridge.service";
import { MirrorState, applyCloudPreferenceRequests } from "../services/notifications/cloud-mirror.service";

export const NOTIFY_TICK_MS = 30 * 1000;
export const NOTIFY_BACKOFF_MAX_MS = 10 * 60 * 1000;
export const NOTIFY_OLD_CLOUD_BACKOFF_MS = 60 * 60 * 1000;
/** Dürtme gecikmesi: aynı anda doğan teslimler (bir sevkte birkaç alıcı) tek istekte gitsin. */
export const NOTIFY_NUDGE_DELAY_MS = 1000;
/** Bir turda en çok bu kadar dolu parti (birikmiş kuyruk turlara yayılır). */
const MAX_BATCHES_PER_RUN = 5;
const STARTUP_DELAY_MS = 25 * 1000;

export type NotifyRunStatus = "KAPALI" | "GONDERILDI" | "ESKI_BULUT" | "BASARISIZ" | "MESGUL";
export interface NotifyRunResult {
  readonly status: NotifyRunStatus;
  readonly reason: string | null;
  readonly sent: number;
  readonly requests: number;
}

let started = false;
let running = false;
let timer: NodeJS.Timeout | null = null;
let backingOff = false;
let pendingNudge = false;
let transport: CloudTransport = egressCloudTransport;
let eligibilityFn: () => Promise<CloudEligibility> = () => cloudEligibility();
let enabledFn: () => Promise<boolean> = notificationsEnabled;
let nowFn: () => number = Date.now;
let failures = 0;
/** D5 atama aynası + tercih teyidi (süreç içi; iş durunca sıfırlanır). */
let mirror = new MirrorState();
let lastWarn: string | null = null;

function warnOnce(text: string): void {
  if (text === lastWarn) return;
  lastWarn = text;
  uyari("patron-bulut", text);
}

const result = (status: NotifyRunStatus, reason: string | null = null, sent = 0, requests = 0): NotifyRunResult => ({ status, reason, sent, requests });
const full = (b: BridgeBatch): boolean => b.teslimler.length >= NOTIFICATION_PUSH_MAX || b.okunanlar.length >= NOTIFICATION_READS_MAX;

/** Tek tur: ön koşul → şalter → (parti → istek → damga)×n. Asla fırlatmaz. */
export async function runCloudNotifyOnce(): Promise<NotifyRunResult> {
  if (running) return result("MESGUL");
  running = true;
  let sent = 0;
  let requests = 0;
  try {
    const e = await eligibilityFn();
    if (!e.ok) return result("KAPALI", e.reason);
    if (!(await enabledFn())) return result("KAPALI", "BILDIRIM_KAPALI");
    const ctx = cloudContext(e, transport);
    for (let i = 0; i < MAX_BATCHES_PER_RUN; i++) {
      const now = nowFn();
      const batch = await collectBridgeBatch(now);
      const extra = await mirror.collect(now);
      const body = NotificationsPushRequestSchema.safeParse({ v: ENVELOPE_VERSION, teslimler: batch.teslimler, okunanlar: batch.okunanlar, ...extra });
      if (!body.success) return result("BASARISIZ", "GOVDE_GECERSIZ", sent, requests);
      const res = await cloudPost(ctx, SYNC_PATHS.NOTIFICATIONS, body.data, { gzip: false, nowMs: nowFn });
      requests++;
      if (!res.ok) return res.status === 404 ? result("ESKI_BULUT", res.code, sent, requests) : result("BASARISIZ", res.code, sent, requests);
      const read = NotificationsPushResponseSchema.safeParse(res.json);
      const applied = await applyBridgeResult(batch, read.success ? read.data.okunanlar : [], now);
      mirror.sent(extra, read.success && read.data.ayna);
      const prefs = read.success && read.data.tercihler.length > 0 ? await applyCloudPreferenceRequests(read.data.tercihler) : null;
      if (prefs) {
        mirror.processed(prefs.ids, prefs.users);
        bilgi("patron-bulut", `bildirim tercihi (telefon): ${prefs.ids.length} istek · ${prefs.applied} uygulandı · ${prefs.ignored} yok sayıldı`);
      }
      sent += applied.sent;
      if (applied.sent + applied.readsReported + applied.readFromCloud > 0) {
        const c = read.success ? ` (alınan ${read.data.alinan} · bağlı ${read.data.bagli} · atlanan ${read.data.atlanan})` : "";
        bilgi("patron-bulut", `bildirim köprüsü: ${applied.sent} teslim${c} · ${applied.readsReported} okundu bildirildi · ${applied.readFromCloud} okundu buluttan`);
      }
      // Tercih işlendiyse teyit + gerçek ayna aynı turda döner (telefon bekleyeni uzun görmesin).
      if (!full(batch) && !prefs) break;
    }
    return result("GONDERILDI", null, sent, requests);
  } catch (err) {
    warnOnce(`bildirim köprüsü turu hata verdi (${err instanceof Error ? err.name : "bilinmeyen"})`);
    return result("BASARISIZ", "PROGRAM_HATASI", sent, requests);
  } finally {
    running = false;
  }
}

/** Bir tur + sonraki gecikme (ms). Fırlatmaz. */
export async function tickCloudNotify(): Promise<number> {
  const r = await runCloudNotifyOnce();
  backingOff = false;
  if (r.status === "ESKI_BULUT") {
    backingOff = true;
    warnOnce("bulut bildirim köprüsü ucunu tanımıyor (eski bulut) — 60 dk geri çekiliyor");
    return NOTIFY_OLD_CLOUD_BACKOFF_MS;
  }
  if (r.status === "BASARISIZ") {
    failures++;
    backingOff = true;
    warnOnce(`bildirim köprüsü gönderemedi (${r.reason ?? "neden yok"}) — ${failures}. ardışık hata, geri çekiliyor`);
    return Math.min(NOTIFY_BACKOFF_MAX_MS, NOTIFY_TICK_MS * 2 ** Math.min(failures, 6));
  }
  if (r.status === "GONDERILDI") {
    if (failures > 0) bilgi("patron-bulut", `bildirim köprüsü toparlandı (${failures} ardışık hatadan sonra)`);
    failures = 0;
    lastWarn = null;
  }
  return NOTIFY_TICK_MS;
}

function schedule(delayMs: number): void {
  if (!started) return;
  if (timer) clearTimeout(timer);
  timer = setTimeout(() => {
    timer = null;
    void tickCloudNotify()
      .catch(() => NOTIFY_BACKOFF_MAX_MS)
      .then((next) => {
        const nudged = pendingNudge && !backingOff;
        pendingNudge = false;
        schedule(nudged ? NOTIFY_NUDGE_DELAY_MS : next);
      });
  }, delayMs);
  timer.unref();
}

/**
 * Yeni teslim doğdu (üretici çağırır, beklemez). İş kurulu değilse (ön koşul kapalı) HİÇBİR şey yapmaz; geri
 * çekilmedeyken (eski bulut / hata) takvimi bozmaz — teslim süpürmede gider.
 */
export function nudgeCloudNotify(): void {
  if (!started || backingOff) return;
  if (running) {
    pendingNudge = true; // tur bitince kısa gecikmeyle bir tur daha
    return;
  }
  schedule(NOTIFY_NUDGE_DELAY_MS);
}

/** Yalnız `patron-cloud.jobs.ts` çağırır (eşitleme ön koşulu açıkken). İkinci çağrı etkisiz. */
export function startCloudNotify(): void {
  if (started) return;
  started = true;
  failures = 0;
  backingOff = false;
  lastWarn = null;
  schedule(STARTUP_DELAY_MS);
  bilgi("patron-bulut", "bildirim köprüsü işi başladı");
}

export function stopCloudNotify(): void {
  if (!started) return;
  started = false;
  if (timer) clearTimeout(timer);
  timer = null;
  mirror = new MirrorState();
  bilgi("patron-bulut", "bildirim köprüsü işi durdu");
}

export function isCloudNotifyRunning(): boolean {
  return started;
}

/** Test kancası: taşıma/ön koşul/şalter/saat enjeksiyonu; `reset` canlı bağımlılıklara döner. */
export function __configureCloudNotifyForTests(p: {
  transport?: CloudTransport;
  eligibility?: () => Promise<CloudEligibility>;
  enabled?: () => Promise<boolean>;
  now?: () => number;
  reset?: boolean;
}): void {
  if (p.reset) {
    transport = egressCloudTransport;
    eligibilityFn = () => cloudEligibility();
    enabledFn = notificationsEnabled;
    nowFn = Date.now;
    failures = 0;
    backingOff = false;
    lastWarn = null;
    mirror = new MirrorState();
  }
  if (p.transport) transport = p.transport;
  if (p.eligibility) eligibilityFn = p.eligibility;
  if (p.enabled) enabledFn = p.enabled;
  if (p.now) nowFn = p.now;
}

/** Test kancası: zamanlayıcı kurulu mu (ön koşul kapalıyken hiç kurulmamalı). */
export function __cloudNotifyTimerArmedForTests(): boolean {
  return timer !== null;
}
