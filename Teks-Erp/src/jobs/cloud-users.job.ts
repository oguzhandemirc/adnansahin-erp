// =============================================================================
// Patron bulutu KULLANICI LİSTESİ işi — telefona giriş izinli fabrika kullanıcılarını buluta gönderir
// =============================================================================
// Ayrı düğme yok: eşitleme ön koşulu açıkken `patron-cloud.jobs.ts` başlatır, kapanınca durdurur; kapalıyken
// zamanlayıcı kurulmaz ve her tur ÖNCE ön koşulu sorar (kapalı ⇒ ne DB okuması ne dış istek). 30 sn'de bir TAM
// küme + özet kurulur; özet değiştiyse ya da son gönderimden 10 dk geçtiyse gönderilir (izin verildi ≤ 30 sn).
// Eski bulut ucu tanımıyorsa (404) tek satır log + uzun geri çekilme. İşin HİÇBİR hatası dışarı sızmaz.
// Log yalnız SAYI ve kod taşır: kullanıcı adı, parola özeti, küme özeti, hata metni yazılmaz.
// =============================================================================
import { bilgi, uyari } from "../lib/logger";
import { cloudEligibility, type CloudEligibility } from "../cloud-sync/eligibility";
import { cloudContext, cloudPost, egressCloudTransport, type CloudTransport } from "../cloud-sync/cloud-client";
import { collectCloudUsers, type CloudUserSet } from "../cloud-sync/users-export";
import { ENVELOPE_VERSION, SYNC_PATHS, UsersPushRequestSchema, UsersPushResponseSchema } from "../cloud-sync/wire";

export const USERS_TICK_MS = 30 * 1000;
export const USERS_RESEND_MS = 10 * 60 * 1000;
export const USERS_BACKOFF_MAX_MS = 10 * 60 * 1000;
/** Eski bulut (uç yok, 404): yeni bulut kurulana dek seyrek yoklanır. */
export const USERS_OLD_CLOUD_BACKOFF_MS = 60 * 60 * 1000;
const STARTUP_DELAY_MS = 20 * 1000;

export type UsersRunStatus = "KAPALI" | "DEGISMEDI" | "GONDERILDI" | "ESKI_BULUT" | "BASARISIZ" | "MESGUL";
export interface UsersRunResult {
  readonly status: UsersRunStatus;
  readonly reason: string | null;
  readonly sent: number;
}

let started = false;
let running = false;
let timer: NodeJS.Timeout | null = null;
let transport: CloudTransport = egressCloudTransport;
let eligibilityFn: () => Promise<CloudEligibility> = () => cloudEligibility();
let collectFn: () => Promise<CloudUserSet> = collectCloudUsers;
let nowFn: () => number = Date.now;
let failures = 0;
let lastWarn: string | null = null;
let lastSentDigest: string | null = null;
let lastSentAt: number | null = null;

function warnOnce(text: string): void {
  if (text === lastWarn) return;
  lastWarn = text;
  uyari("patron-bulut", text);
}

const result = (status: UsersRunStatus, reason: string | null = null, sent = 0): UsersRunResult => ({ status, reason, sent });

async function push(e: Extract<CloudEligibility, { ok: true }>, set: CloudUserSet, now: number): Promise<UsersRunResult> {
  const body = UsersPushRequestSchema.safeParse({ v: ENVELOPE_VERSION, uretildi: new Date(now).toISOString(), ozet: set.digest, kullanicilar: set.users });
  if (!body.success) return result("BASARISIZ", "GOVDE_GECERSIZ");
  const res = await cloudPost(cloudContext(e, transport), SYNC_PATHS.USERS, body.data, { gzip: false });
  if (!res.ok) return res.status === 404 ? result("ESKI_BULUT", res.code) : result("BASARISIZ", res.code);
  const read = UsersPushResponseSchema.safeParse(res.json);
  const changed = set.digest !== lastSentDigest;
  lastSentDigest = set.digest;
  lastSentAt = now;
  if (changed) {
    const c = read.success ? ` (eklenen ${read.data.eklenen} · güncellenen ${read.data.guncellenen} · kapatılan ${read.data.kapatilan})` : "";
    bilgi("patron-bulut", `kullanıcı listesi gönderildi: ${set.users.length} kullanıcı${c}${set.invalid > 0 ? ` · tele sığmayan ${set.invalid}` : ""}`);
  }
  return result("GONDERILDI", null, set.users.length);
}

/** Tek tur: ön koşul → küme + özet → (değiştiyse ya da süre dolduysa) gönder. Asla fırlatmaz. */
export async function runCloudUsersOnce(): Promise<UsersRunResult> {
  if (running) return result("MESGUL");
  running = true;
  try {
    const e = await eligibilityFn();
    if (!e.ok) return result("KAPALI", e.reason);
    const set = await collectFn();
    const now = nowFn();
    const due = set.digest !== lastSentDigest || lastSentAt === null || now - lastSentAt >= USERS_RESEND_MS;
    if (!due) return result("DEGISMEDI");
    return await push(e, set, now);
  } catch (err) {
    warnOnce(`kullanıcı listesi turu hata verdi (${err instanceof Error ? err.name : "bilinmeyen"})`);
    return result("BASARISIZ", "PROGRAM_HATASI");
  } finally {
    running = false;
  }
}

/** Bir tur + sonraki gecikme (ms). Fırlatmaz. */
export async function tickCloudUsers(): Promise<number> {
  const r = await runCloudUsersOnce();
  if (r.status === "ESKI_BULUT") {
    warnOnce("bulut kullanıcı listesi ucunu tanımıyor (eski bulut) — 60 dk geri çekiliyor");
    return USERS_OLD_CLOUD_BACKOFF_MS;
  }
  if (r.status === "BASARISIZ") {
    failures++;
    warnOnce(`kullanıcı listesi gönderilemedi (${r.reason ?? "neden yok"}) — ${failures}. ardışık hata, geri çekiliyor`);
    return Math.min(USERS_BACKOFF_MAX_MS, USERS_TICK_MS * 2 ** Math.min(failures, 6));
  }
  if (r.status === "GONDERILDI" || r.status === "DEGISMEDI") {
    if (failures > 0) bilgi("patron-bulut", `kullanıcı listesi toparlandı (${failures} ardışık hatadan sonra)`);
    failures = 0;
    lastWarn = null;
  }
  return USERS_TICK_MS;
}

function schedule(delayMs: number): void {
  if (!started) return;
  if (timer) clearTimeout(timer);
  timer = setTimeout(() => {
    timer = null;
    void tickCloudUsers()
      .catch(() => USERS_BACKOFF_MAX_MS)
      .then((next) => schedule(next));
  }, delayMs);
  timer.unref();
}

/** Yalnız `patron-cloud.jobs.ts` çağırır (eşitleme ön koşulu açıkken). İkinci çağrı etkisiz. */
export function startCloudUsers(): void {
  if (started) return;
  started = true;
  failures = 0;
  lastWarn = null;
  schedule(STARTUP_DELAY_MS);
  bilgi("patron-bulut", "kullanıcı listesi işi başladı");
}

export function stopCloudUsers(): void {
  if (!started) return;
  started = false;
  if (timer) clearTimeout(timer);
  timer = null;
  bilgi("patron-bulut", "kullanıcı listesi işi durdu");
}

export function isCloudUsersRunning(): boolean {
  return started;
}

/** Test kancası: taşıma/ön koşul/küme/saat enjeksiyonu; `reset` canlı bağımlılıklara ve boş belleğe döner. */
export function __configureCloudUsersForTests(p: {
  transport?: CloudTransport;
  eligibility?: () => Promise<CloudEligibility>;
  collect?: () => Promise<CloudUserSet>;
  now?: () => number;
  reset?: boolean;
}): void {
  if (p.reset) {
    transport = egressCloudTransport;
    eligibilityFn = () => cloudEligibility();
    collectFn = collectCloudUsers;
    nowFn = Date.now;
    failures = 0;
    lastWarn = null;
    lastSentDigest = null;
    lastSentAt = null;
  }
  if (p.transport) transport = p.transport;
  if (p.eligibility) eligibilityFn = p.eligibility;
  if (p.collect) collectFn = p.collect;
  if (p.now) nowFn = p.now;
}

/** Test kancası: zamanlayıcı kurulu mu (ön koşul kapalıyken hiç kurulmamalı). */
export function __cloudUsersTimerArmedForTests(): boolean {
  return timer !== null;
}
