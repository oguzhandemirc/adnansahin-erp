// =============================================================================
// Patron bulutu GELEN KUTUSU işi — telefondan yazılan kayıtları çeker, işler, sonucu bildirir (D4)
// =============================================================================
// Kaynak: ana ürün 19aa48a9 `jobs/cloud-inbox.job.ts`. Adnan farkları: zil ve lisans kipi yok; imzalı istek
// `cloud-client.ts`ten; aralık ayardan (`patronCloud.inboxIntervalSeconds`, 20–600 sn — ana üründeki asgari 60 sn
// sabiti bu ayarın alt sınırına bağlandı); bulut hesap listesi çekilmez; belirsiz hatalı mesaj SINIRLI tekrar edilir
// (`MAX_UNCERTAIN_ATTEMPTS`), sonra makbuzlu "fabrikada işlenemedi" reddi yazılır. Başlatma/durdurma tek yerden
// (`patron-cloud.jobs.ts`): yazma ayarı kapalıyken bu dosyanın zamanlayıcısı kurulmaz, buluta istek gitmez.
// İşin HİÇBİR hatası dışarı sızmaz — tek satır log, geri çekilme.
// =============================================================================
import { z } from "zod";
import { bilgi, uyari } from "../lib/logger";
import { inboxEligibility, type InboxBlockReason, type InboxEligibility } from "../cloud-sync/eligibility";
import { cloudContext, cloudPost, egressCloudTransport, type CloudTransport } from "../cloud-sync/cloud-client";
import { INBOX_PULL_MAX } from "../cloud-sync/inbox-wire";
import { ENVELOPE_VERSION, InboxResultResponseSchema, SYNC_PATHS, type InboxOutcome } from "../cloud-sync/wire";
import { InboxRejection, processInboxMessage, rejectInboxMessage, UNPROCESSABLE_MESSAGE, type ClaimedMessage } from "../services/patron-inbox/inbox.service";
import { resolveActivePatronCloudUserId } from "../services/patron-cloud-user.service";

const STARTUP_DELAY_MS = 20 * 1000;
/** Belirsiz hatayla (DB/beklenmeyen) düşen mesaj bu kadar denemeden sonra makbuzlu retle kapanır. */
export const MAX_UNCERTAIN_ATTEMPTS = 3;
/** Ardışık tur hatasında bekleme tavanı. */
export const INBOX_BACKOFF_MAX_MS = 10 * 60 * 1000;
const ATTEMPT_MAP_MAX = 1000;

/** Bulut yanıtı GEVŞEK okunur: tanınmayan türdeki kayıt bütün turu düşürmesin, makbuzlu retle cevaplansın. */
const LooseClaimResponseSchema = z.object({ v: z.literal(ENVELOPE_VERSION), kayitlar: z.array(z.unknown()).max(200) });
const LooseMessageSchema = z.object({
  mesajId: z.uuid(),
  tur: z.string().min(1).max(40),
  govde: z.unknown(),
  hesapId: z.uuid(),
  hesapAdi: z.string().trim().min(1).max(200),
  olusturulma: z.string(),
});

export type InboxRunStatus = "KAPALI" | "TEKNIK_KULLANICI_YOK" | "BASARILI" | "BASARISIZ" | "MESGUL";
export interface InboxRunResult {
  readonly status: InboxRunStatus;
  readonly reason: InboxBlockReason | string | null;
  readonly pulled: number;
  readonly outcomes: readonly InboxOutcome[];
  readonly uncertain: number;
}

let started = false;
/** Test kancası kurulduysa tur, iş başlatılmamış olsa da kayıt arasında durmaz. */
let testMode = false;
let running = false;
let timer: NodeJS.Timeout | null = null;
let transport: CloudTransport = egressCloudTransport;
let eligibilityFn: () => Promise<InboxEligibility> = () => inboxEligibility();
let actorFn: () => Promise<string | null> = () => resolveActivePatronCloudUserId();
let failures = 0;
let lastWarn: string | null = null;
const attempts = new Map<string, number>();

function warnOnce(text: string): void {
  if (text === lastWarn) return;
  lastWarn = text;
  uyari("patron-bulut", text);
}

function empty(status: InboxRunStatus, reason: string | null = null): InboxRunResult {
  return { status, reason, pulled: 0, outcomes: [], uncertain: 0 };
}

/** Belirsiz sonuç sayacı; tavana varınca makbuzlu ret. Sayaç süreç belleğindedir (yeniden başlatma yeni 3 hak verir). */
async function onUncertain(m: ClaimedMessage, actor: string): Promise<InboxOutcome | null> {
  const n = (attempts.get(m.mesajId) ?? 0) + 1;
  if (n < MAX_UNCERTAIN_ATTEMPTS) {
    if (attempts.size >= ATTEMPT_MAP_MAX) attempts.delete(attempts.keys().next().value as string);
    attempts.set(m.mesajId, n);
    return null;
  }
  const o = await rejectInboxMessage(m, new InboxRejection("IS_KURALI", UNPROCESSABLE_MESSAGE), actor).catch(() => null);
  if (o) {
    attempts.delete(m.mesajId);
    uyari("patron-bulut", `gelen kutusu: ${m.mesajId} ${MAX_UNCERTAIN_ATTEMPTS} denemede işlenemedi — makbuzlu ret yazıldı`);
  }
  return o;
}

/**
 * Tek tur: ön koşul (eşitleme ∧ yazma ayarı) → teknik kullanıcı → `al` (bulut claim eder) → kayıtları SERİ işle (bir
 * kaydın hatası diğerlerini durdurmaz) → kesin sonuçları `sonuc` ile bildir. Asla fırlatmaz.
 */
export async function runCloudInboxOnce(): Promise<InboxRunResult> {
  if (running) return empty("MESGUL");
  running = true;
  try {
    const e = await eligibilityFn();
    if (!e.ok) return empty("KAPALI", e.reason);
    const actor = await actorFn();
    if (!actor) return empty("TEKNIK_KULLANICI_YOK");
    const ctx = cloudContext(e, transport);
    const pull = await cloudPost(ctx, SYNC_PATHS.INBOX_CLAIM, { v: ENVELOPE_VERSION, enFazla: INBOX_PULL_MAX }, { gzip: false });
    if (!pull.ok) return { ...empty("BASARISIZ", pull.code) };
    const env = LooseClaimResponseSchema.safeParse(pull.json);
    if (!env.success) return empty("BASARISIZ", "YANIT_GECERSIZ");
    const messages: ClaimedMessage[] = [];
    for (const raw of env.data.kayitlar) {
      const m = LooseMessageSchema.safeParse(raw);
      if (m.success) messages.push(m.data);
      else warnOnce("gelen kutusu: kimliği okunamayan kayıt atlandı (sözleşme dışı)");
    }
    messages.sort((a, b) => Date.parse(a.olusturulma) - Date.parse(b.olusturulma) || a.mesajId.localeCompare(b.mesajId));
    const outcomes: InboxOutcome[] = [];
    let uncertain = 0;
    for (const m of messages) {
      if (!started && !testMode) break;
      let o: InboxOutcome | null = null;
      try {
        o = await processInboxMessage(m, actor);
      } catch {
        o = null;
      }
      if (!o) o = await onUncertain(m, actor);
      else attempts.delete(m.mesajId);
      if (o) outcomes.push(o);
      else uncertain++;
    }
    if (outcomes.length > 0) {
      const res = await cloudPost(ctx, SYNC_PATHS.INBOX_RESULT, { v: ENVELOPE_VERSION, sonuclar: outcomes }, { gzip: false });
      // Bildirim kaybolursa zarar yok: claim süresi dolunca bulut yeniden verir, makbuz aynı sonucu döndürür.
      if (!res.ok) return { status: "BASARISIZ", reason: res.code, pulled: messages.length, outcomes, uncertain };
      const ack = InboxResultResponseSchema.safeParse(res.json);
      if (ack.success && ack.data.ret.length > 0) warnOnce(`gelen kutusu: bulut ${ack.data.ret.length} sonucu kabul etmedi (${ack.data.ret.map((r) => r.kod).join(", ")})`);
    }
    if (messages.length > 0) bilgi("patron-bulut", `gelen kutusu: ${messages.length} kayıt · ${outcomes.length} kesin sonuç · ${uncertain} belirsiz`);
    return { status: "BASARILI", reason: null, pulled: messages.length, outcomes, uncertain };
  } catch (err) {
    const msg = err instanceof Error ? `${err.name}: ${err.message}` : String(err);
    warnOnce(`gelen kutusu turu hata verdi (${msg.replace(/\s+/g, " ").slice(0, 240)})`);
    return empty("BASARISIZ", "PROGRAM_HATASI");
  } finally {
    running = false;
  }
}

async function tick(): Promise<number> {
  const r = await runCloudInboxOnce();
  const e = await eligibilityFn().catch(() => null);
  const intervalMs = e && e.ok ? e.inboxIntervalSeconds * 1000 : 5 * 60 * 1000;
  if (r.status === "BASARISIZ") {
    failures++;
    warnOnce(`gelen kutusu turu başarısız (${r.reason ?? "neden yok"}) — ${failures}. ardışık hata, geri çekiliyor`);
    return Math.min(INBOX_BACKOFF_MAX_MS, intervalMs * 2 ** Math.min(failures, 6));
  }
  if (failures > 0 && r.status === "BASARILI") bilgi("patron-bulut", `gelen kutusu toparlandı (${failures} ardışık hatadan sonra)`);
  if (r.status === "BASARILI") {
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

/** Yalnız `patron-cloud.jobs.ts` çağırır (eşitleme ∧ yazma ayarı ∧ teknik kullanıcı hazırken). İkinci çağrı etkisiz. */
export function startCloudInbox(): void {
  if (started) return;
  started = true;
  failures = 0;
  lastWarn = null;
  schedule(STARTUP_DELAY_MS);
  bilgi("patron-bulut", "gelen kutusu işi başladı (telefondan yazma AÇIK)");
}

export function stopCloudInbox(): void {
  if (!started) return;
  started = false;
  if (timer) clearTimeout(timer);
  timer = null;
  bilgi("patron-bulut", "gelen kutusu işi durdu");
}

export function isCloudInboxRunning(): boolean {
  return started;
}

/** Test kancası: taşıma/ön koşul/aktör enjeksiyonu; `reset` canlı bağımlılıklara döner. */
export function __configureCloudInboxForTests(p: {
  transport?: CloudTransport;
  eligibility?: () => Promise<InboxEligibility>;
  actor?: () => Promise<string | null>;
  reset?: boolean;
}): void {
  testMode = true;
  if (p.reset) {
    transport = egressCloudTransport;
    eligibilityFn = () => inboxEligibility();
    actorFn = () => resolveActivePatronCloudUserId();
    failures = 0;
    lastWarn = null;
    attempts.clear();
  }
  if (p.transport) transport = p.transport;
  if (p.eligibility) eligibilityFn = p.eligibility;
  if (p.actor) actorFn = p.actor;
}

/** Test kancası: zamanlayıcı kurulu mu (yazma kapalıyken hiç kurulmamalı). */
export function __cloudInboxTimerArmedForTests(): boolean {
  return timer !== null;
}
