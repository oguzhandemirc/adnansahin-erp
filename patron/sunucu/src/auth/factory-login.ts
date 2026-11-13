// FABRİKA HESABI GİRİŞİ (üyelik = Electron şifresi, C3) — kullanıcı adı + FABRİKA parolası (+ açıksa TOTP). Hesap
// fabrikanın malıdır (`POST /v1/kullanicilar`): bcrypt özeti SecretBox mührüyle saklıdır, burada açılır ve `bcryptjs`
// ile karşılaştırılır. Kurallar:
//   · TEK ret: bilinmeyen ad · PASİF · bulut kilidi · geçici kilit · kaynak kilidi · yanlış parola · yanlış kod → AYNI
//     401 `GIRIS_BASARISIZ`; parola uygun olmayan dalda da SAHTE bcrypt karşılaştırması koşar ve yanıt ≥ 500 ms tabana
//     bekletilir. `DOGRULAMA_KODU_GEREKLI` YALNIZ doğru paroladan sonra (yanlış parolada doğrulama durumu sızmaz).
//   · Kaba kuvvet: kaynak kilidi (hesap + adres, bellekte; `login-throttle.ts`) + hesap başına KÜRESEL tavan
//     (`account_factors`: 24 sa pencerede `GIRIS_HESAP_TAVANI` başarısız → `GIRIS_HESAP_KILIT_DK` geçici kilit, güvenlik
//     olayı `GIRIS_KILIT` + denetim `HESAP_GECICI_KILIT` kapsam HESAP). Kilit yalnız YENİ girişi durdurur; açık oturum sürer.
//   · Bayatlık: fabrikanın son kullanıcı kümesi (`sync_state.kullanici_son_esitleme`) `FABRIKA_BAYATLIK_GUN`den eskiyse
//     yeni giriş 503 `FABRIKA_BAGLANTISI_YOK` — parola denetlenmeden (tesis geneli durum; hesabın varlığını söylemez).
//   · Oturum açıldığı `kimlik_surumu`nu taşır; `resolveSession` farklıysa 401 (fabrikada parola değişti/hesap kapandı).
import bcrypt from "bcryptjs";
import type { Account, AccountFactor } from "@prisma/client";
import { accountActor, recordAudit } from "../lib/audit";
import { CloudError } from "../lib/errors";
import { securityEvent } from "../lib/security-events";
import { listReadyFacilities, withLookup, withTesis } from "../lib/tenant";
import type { CloudContext } from "../services/context";
import { loginThrottleFor } from "./login-throttle";
import { codeRequired, contextOf, factoryFacilityChoices, failAfterFloor, ipSummary, newToken, type OpenedSession } from "./session.service";
import { verifyTotp } from "./totp";

/** Fabrika kullanıcı adı (DB CHECK `accounts_kullanici_adi_bicimi` ile aynı; giriş büyük-küçük duyarsız). */
const USERNAME = /^[a-z0-9._-]{1,50}$/;
export const FAILURE_WINDOW_MS = 24 * 3_600_000;
/** Sahte karşılaştırmanın maliyeti fabrikanınkiyle aynı (bcryptjs maliyet 10). */
const DUMMY_COST = 10;

export type FactoryAccount = Account & { factors: AccountFactor | null };

export function normalizeUsername(raw: string): string | null {
  const v = raw.normalize("NFC").trim().toLowerCase();
  return USERNAME.test(v) ? v : null;
}

let dummyHash: Promise<string> | null = null;

/** bcrypt doğrulaması; özet yoksa (uygun olmayan hesap) eşit maliyette sahte karşılaştırma koşar ve `false` döner. */
export async function bcryptVerify(password: string, hash: string | null): Promise<boolean> {
  if (hash === null) {
    dummyHash ??= bcrypt.hash("bos-fabrika-kullanicisi-degil", DUMMY_COST);
    await bcrypt.compare(password, await dummyHash);
    return false;
  }
  try {
    return await bcrypt.compare(password, hash);
  } catch {
    return false;
  }
}

/** Doğrulama kodu AÇIK mı (fabrika hesabı; tek kaynak): onaylı kurulum. Onay bekleyen sır açık SAYILMAZ. */
export const factorOn = (f: Pick<AccountFactor, "totpEnabledAt" | "totpSecretSealed" | "totpLastStep"> | null): f is AccountFactor & { totpSecretSealed: string } =>
  f !== null && f.totpEnabledAt !== null && f.totpSecretSealed !== null && f.totpLastStep !== null;

/** Hesabın mühürlü parola özetini açar; açılamıyorsa (anahtar değişmiş) null + günlük satırı (özet yazılmaz). */
export function openPasswordHash(ctx: CloudContext, a: Pick<Account, "id" | "passwordSealed">): string | null {
  if (!a.passwordSealed) return null;
  const hash = ctx.secrets.open(a.passwordSealed, a.id, "parola");
  if (hash === null) console.error(`[patron] hesap ${a.id}: parola özeti mührü açılamadı (sır anahtarı değişmiş olabilir — fabrikadan küme yeniden istenmeli)`);
  return hash;
}

/** Ad → hesap (ön-kiracı tek anahtarlı arama, sonra tesis kapsamında etkenlerle). PASİF olmayan tek satır; yoksa null. */
async function findFactoryAccount(ctx: CloudContext, username: string): Promise<FactoryAccount | null> {
  const hits = await withLookup(ctx.app, { kind: "kullanici", value: username }, (tx) =>
    tx.account.findMany({ where: { kullaniciAdi: username, status: { not: "PASIF" } }, select: { id: true, tesisId: true }, take: 2 }),
  );
  const hit = hits?.length === 1 ? hits[0] : undefined;
  if (!hit) return null;
  return withTesis(ctx.app, { tesisId: hit.tesisId }, (tx) => tx.account.findUnique({ where: { id: hit.id }, include: { factors: true } }));
}

/** Hesabın oturumundan taze okuma (hassas işlem kapısı). */
export async function loadFactoryAccount(ctx: CloudContext, tesisId: string, accountId: string): Promise<FactoryAccount | null> {
  return withTesis(ctx.app, { tesisId }, (tx) => tx.account.findUnique({ where: { id: accountId }, include: { factors: true } }));
}

/** Bayatlık denetiminin tesisi: hesap bulunduysa onunki; yoksa TEK tesis (Adnan). Çok tesisli DB'de (yalnız bekçi) null. */
async function stalenessScope(ctx: CloudContext, account: FactoryAccount | null): Promise<string | null> {
  if (account) return account.tesisId;
  const all = await listReadyFacilities(ctx.app);
  return all.length === 1 ? all[0]! : null;
}

/** Fabrika kullanıcı kümesi tavandan taze mi (`facilities.kullanici_son_esitleme`; NULL ⇒ bayat). */
export async function factoryFresh(ctx: CloudContext, tesisId: string, nowMs: number): Promise<boolean> {
  const st = await withTesis(ctx.app, { tesisId }, (tx) => tx.facility.findUnique({ where: { tesisId }, select: { usersPushedAt: true } }));
  return st?.usersPushedAt != null && nowMs - st.usersPushedAt.getTime() <= ctx.config.FABRIKA_BAYATLIK_GUN * 86_400_000;
}

const factoryOffline = (): CloudError =>
  new CloudError(503, "FABRIKA_BAGLANTISI_YOK", "Fabrikayla bağlantı uzun süredir yok; yeni giriş şu an yapılamıyor. Açık oturumunuz sürer.");

/**
 * Hesap başına küresel sayaç (atomik, tek ifade): pencere bittiyse 1'den başlar. Tavana varınca geçici kilit — iddia
 * `updateMany WHERE sayaç ≥ tavan` (eşzamanlı iki deneme kilidi iki kez yazmaz). Kilit kurulduysa bitişini döner.
 */
async function countAccountFailure(ctx: CloudContext, a: Pick<Account, "id" | "tesisId">, nowMs: number): Promise<Date | null> {
  const now = new Date(nowMs);
  const windowFloor = new Date(nowMs - FAILURE_WINDOW_MS);
  const until = new Date(nowMs + ctx.config.GIRIS_HESAP_KILIT_DK * 60_000);
  return withTesis(ctx.app, { tesisId: a.tesisId }, async (tx) => {
    const rows = await tx.$queryRaw<{ basarisiz_sayisi: number }[]>`
      INSERT INTO account_factors (account_id, tesis_id, basarisiz_sayisi, basarisiz_pencere, updated_at)
      VALUES (${a.id}::uuid, ${a.tesisId}::uuid, 1, ${now}, ${now})
      ON CONFLICT (account_id) DO UPDATE SET
        basarisiz_sayisi = CASE WHEN account_factors.basarisiz_pencere IS NULL OR account_factors.basarisiz_pencere <= ${windowFloor} THEN 1 ELSE account_factors.basarisiz_sayisi + 1 END,
        basarisiz_pencere = CASE WHEN account_factors.basarisiz_pencere IS NULL OR account_factors.basarisiz_pencere <= ${windowFloor} THEN ${now} ELSE account_factors.basarisiz_pencere END,
        updated_at = ${now}
      RETURNING basarisiz_sayisi`;
    if ((rows[0]?.basarisiz_sayisi ?? 0) < ctx.config.GIRIS_HESAP_TAVANI) return null;
    const claim = await tx.accountFactor.updateMany({
      where: { accountId: a.id, failureCount: { gte: ctx.config.GIRIS_HESAP_TAVANI } },
      data: { tempLockUntil: until, failureCount: 0, failureWindowStart: null },
    });
    return claim.count === 1 ? until : null;
  });
}

/** Başarısız deneme: kaynak sayacı + hesap tavanı + ayak izi (sır/özet yazılmaz). Giriş ve hassas işlem kapısı ortak. */
export async function registerFactoryFailure(ctx: CloudContext, a: Pick<Account, "id" | "tesisId">, g: { nowMs: number; ip: string | null }): Promise<void> {
  const sourceLock = loginThrottleFor(ctx).registerFailure(a.id, g.ip, g.nowMs);
  const accountLock = await countAccountFailure(ctx, a, g.nowMs);
  const base = { tesisId: a.tesisId, actor: "giris", entity: "Account", entityId: a.id } as const;
  await recordAudit(ctx.app, { ...base, event: "GIRIS_BASARISIZ", summary: ipSummary(g.ip) });
  if (sourceLock) await recordAudit(ctx.app, { ...base, event: "HESAP_GECICI_KILIT", summary: { bitis: sourceLock.toISOString(), kapsam: "KAYNAK", ...ipSummary(g.ip) } });
  if (accountLock) {
    securityEvent("GIRIS_KILIT", "HESAP_TAVANI");
    await recordAudit(ctx.app, { ...base, event: "HESAP_GECICI_KILIT", summary: { bitis: accountLock.toISOString(), kapsam: "HESAP", tavan: ctx.config.GIRIS_HESAP_TAVANI } });
  }
}

/** Yeni girişi kapatan hesap durumu (yanıt hep aynı 401; neden yalnız denetimde). null ⇒ uygun. */
export function blockedReason(ctx: CloudContext, a: FactoryAccount, g: { nowMs: number; ip: string | null }): string | null {
  if (a.status !== "AKTIF" || !a.passwordSealed) return "HESAP_KAPALI";
  if (a.factors?.cloudLock) return "BULUT_KILIDI";
  if (a.factors?.tempLockUntil && a.factors.tempLockUntil.getTime() > g.nowMs) return "HESAP_GECICI_KILITLI";
  if (loginThrottleFor(ctx).isLocked(a.id, g.ip, g.nowMs)) return "KAYNAK_KILITLI";
  return null;
}

/** İkinci adım iddiası (fabrika hesabı; tesis kapsamında atomik). Kapalıyken hesabın hâlâ kapalı olduğunu ister. */
export const factorStepClaim = (accountId: string, step: number | null) =>
  step === null
    ? { where: { accountId, totpEnabledAt: { not: null } }, off: true as const }
    : { where: { accountId, totpEnabledAt: { not: null }, OR: [{ totpLastStep: null }, { totpLastStep: { lt: step } }] }, data: { totpLastStep: step }, off: false as const };

/** Kod doğrulaması (açık hesapta). Sır açılamıyorsa 500 (CLI ile kapatılmalı). */
export function checkFactorCode(ctx: CloudContext, a: FactoryAccount, code: string | undefined, nowMs: number): { ok: true; step: number | null } | { ok: false } | "KOD_GEREKLI" {
  if (!factorOn(a.factors)) return { ok: true, step: null };
  if (!code) return "KOD_GEREKLI";
  const secret = ctx.secrets.open(a.factors.totpSecretSealed, a.id);
  if (secret === null) {
    console.error(`[patron] hesap ${a.id}: TOTP sırrı çözülemedi (sır anahtarı değişmiş olabilir — doğrulama CLI ile kapatılmalı)`);
    throw new CloudError(500, "SUNUCU_HATASI", "Doğrulama kodu denetlenemedi; tesis yöneticinize başvurun");
  }
  const r = verifyTotp(secret, code, { atMs: nowMs, lastUsedStep: a.factors.totpLastStep });
  return r.ok ? { ok: true, step: r.step } : { ok: false };
}

export interface FactoryLoginInput {
  readonly username: string;
  readonly password: string;
  readonly totp?: string | undefined;
  readonly client: "mobil" | "web" | null;
  readonly ip: string | null;
}

/**
 * Oturum (tesis kapsamında tek tx): hesap hâlâ AKTİF ∧ aynı `kimlik_surumu` (atomik claim — doğrulama ile açılış
 * arasında fabrika parolayı değiştirdiyse açılmaz) ∧ (kodlu girişte) TOTP adımı ileri.
 */
async function openFactorySession(ctx: CloudContext, a: FactoryAccount, g: { step: number | null; client: string | null; nowMs: number; expiresAt: Date }) {
  const { token, digest } = newToken(a.tesisId);
  const opened = await withTesis(ctx.app, { tesisId: a.tesisId }, async (tx) => {
    const claim = await tx.account.updateMany({ where: { id: a.id, status: "AKTIF", identityVersion: a.identityVersion }, data: { lastLoginAt: new Date(g.nowMs) } });
    if (claim.count === 0) return null;
    const c = factorStepClaim(a.id, g.step);
    if (c.off ? (await tx.accountFactor.count({ where: c.where })) > 0 : (await tx.accountFactor.updateMany({ where: c.where, data: c.data })).count === 0) return null;
    const session = await tx.session.create({
      data: { tesisId: a.tesisId, accountId: a.id, tokenHash: digest, client: g.client, lastUsedAt: new Date(g.nowMs), expiresAt: g.expiresAt, identityVersion: a.identityVersion },
    });
    return { session, account: await tx.account.findUniqueOrThrow({ where: { id: a.id } }) };
  });
  return opened === null ? null : { token, session: contextOf(opened.account, opened.session.id, g.expiresAt) };
}

export async function loginFactoryAccount(ctx: CloudContext, g: FactoryLoginInput): Promise<OpenedSession> {
  const startedMs = Date.now();
  const nowMs = ctx.now();
  const username = normalizeUsername(g.username);
  const account = username ? await findFactoryAccount(ctx, username) : null;
  const scope = await stalenessScope(ctx, account);
  if (scope !== null && !(await factoryFresh(ctx, scope, nowMs))) throw factoryOffline();
  const blocked = account ? blockedReason(ctx, account, { nowMs, ip: g.ip }) : "BILINMIYOR";
  // Uygun olmayan dalda da eşit iş: sahte bcrypt karşılaştırması (özet null).
  const passwordOk = await bcryptVerify(g.password, account && blocked === null ? openPasswordHash(ctx, account) : null);
  if (!account || blocked !== null) {
    if (account) await recordAudit(ctx.app, { tesisId: account.tesisId, actor: "giris", event: "GIRIS_REDDEDILDI", entity: "Account", entityId: account.id, summary: { sebep: blocked, ...ipSummary(g.ip) } });
    return failAfterFloor(startedMs);
  }
  const code = passwordOk ? checkFactorCode(ctx, account, g.totp, nowMs) : ({ ok: false } as const);
  if (code === "KOD_GEREKLI") throw codeRequired(401);
  const expiresAt = new Date(nowMs + ctx.config.OTURUM_AZAMI_GUN * 86_400_000);
  const opened = code.ok ? await openFactorySession(ctx, account, { step: code.step, client: g.client, nowMs, expiresAt }) : null;
  if (!opened) {
    await registerFactoryFailure(ctx, account, { nowMs, ip: g.ip });
    return failAfterFloor(startedMs);
  }
  loginThrottleFor(ctx).clear(account.id, g.ip);
  await recordAudit(ctx.app, { tesisId: account.tesisId, actor: accountActor(account.id), event: "GIRIS", entity: "Account", entityId: account.id, summary: { oturumId: opened.session.sessionId, istemci: g.client, ...ipSummary(g.ip) } });
  return { ...opened, expiresAt, facilities: await factoryFacilityChoices(ctx, account.tesisId) };
}
