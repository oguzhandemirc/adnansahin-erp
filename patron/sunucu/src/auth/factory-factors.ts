// FABRİKA HESABININ İKİ ADIMLI DOĞRULAMASI (C3; C4'ten beri tek doğrulama yolu) — etken `account_factors`ta (uygulamanın malı; eşitleme rolü erişemez): İSTEĞE BAĞLI; aç = parola → sır (YALNIZ yanıtta)
// → ilk kodla ONAY (onaysız açık sayılmaz); kapat = parola + güncel kod (adım iddiası atomik, aynı kod iki kez geçmez).
// Parola FABRİKANIN parolasıdır (bcrypt, mühürlü özet). Yanlış parola/kod girişle aynı sayaçlara yazılır (kaynak +
// hesap tavanı) ve 400 `GIRIS_BASARISIZ`; kilitliyken doğru üçlü de geçmez. Sır ve kod denetime/günlüğe girmez.
import { Prisma } from "@prisma/client";
import { accountActor, recordAudit } from "../lib/audit";
import { CloudError, stateConflict } from "../lib/errors";
import { withTesis } from "../lib/tenant";
import type { CloudContext } from "../services/context";
import type { TwoFactorSetup, TwoFactorStatus } from "../wire/api";
import { bcryptVerify, blockedReason, checkFactorCode, factorOn, loadFactoryAccount, openPasswordHash, registerFactoryFailure, type FactoryAccount } from "./factory-login";
import { codeRequired, wrongFactors, type SessionContext } from "./session.service";
import { generateTotpSecret, otpauthUri, verifyTotp } from "./totp";

const sessionGone = (): CloudError => new CloudError(401, "OTURUM_YOK", "Oturum geçersiz");
const alreadyOn = (): CloudError => stateConflict("İki adımlı doğrulama zaten açık");

async function ownAccount(ctx: CloudContext, s: SessionContext): Promise<FactoryAccount> {
  const a = await loadFactoryAccount(ctx, s.tesisId, s.accountId);
  if (!a || a.status !== "AKTIF") throw sessionGone();
  return a;
}

const audit = (ctx: CloudContext, s: SessionContext, event: string) =>
  recordAudit(ctx.app, { tesisId: s.tesisId, actor: accountActor(s.accountId), event, entity: "Account", entityId: s.accountId });

export async function factoryTwoFactorStatus(ctx: CloudContext, s: SessionContext): Promise<TwoFactorStatus> {
  const a = await ownAccount(ctx, s);
  return factorOn(a.factors) ? { acik: true, acilis: a.factors.totpEnabledAt!.toISOString() } : { acik: false, acilis: null };
}

/**
 * Hassas işlem kapısı (fabrika hesabı): parola doğru, açıksa güncel kod da doğru, hesap/kaynak kilitli değil. Açık
 * hesapta kod eksikse (parola doğruyken) 400 `DOGRULAMA_KODU_GEREKLI`, sayaçsız. Adım iddiası ÇAĞIRANDA atomiktir.
 */
export async function verifyFactoryFactors(ctx: CloudContext, s: SessionContext, g: { password: string; totp?: string | undefined; ip: string | null }) {
  const nowMs = ctx.now();
  const a = await ownAccount(ctx, s);
  const blocked = blockedReason(ctx, a, { nowMs, ip: g.ip });
  const passwordOk = await bcryptVerify(g.password, blocked === null ? openPasswordHash(ctx, a) : null);
  const code = blocked === null && passwordOk ? checkFactorCode(ctx, a, g.totp, nowMs) : ({ ok: false } as const);
  if (code === "KOD_GEREKLI") throw codeRequired(400);
  if (!code.ok) {
    if (blocked === null) await registerFactoryFailure(ctx, a, { nowMs, ip: g.ip });
    throw wrongFactors();
  }
  return { account: a, step: code.step, nowMs };
}

/** Kurulumu başlatır (parola): yeni sır onay bekler; tekrar başlatma önceki onaysız sırrı değiştirir. */
export async function beginFactoryTwoFactor(ctx: CloudContext, s: SessionContext, g: { password: string; ip: string | null }): Promise<TwoFactorSetup> {
  if (factorOn((await ownAccount(ctx, s)).factors)) throw alreadyOn();
  const { account } = await verifyFactoryFactors(ctx, s, { password: g.password, ip: g.ip });
  const secret = generateTotpSecret();
  const sealed = ctx.secrets.seal(secret, account.id);
  const now = new Date(ctx.now());
  const n = await withTesis(ctx.app, { tesisId: s.tesisId }, (tx) =>
    tx.$executeRaw(Prisma.sql`
      INSERT INTO account_factors (account_id, tesis_id, totp_secret_sealed, totp_last_step, updated_at)
      VALUES (${account.id}::uuid, ${s.tesisId}::uuid, ${sealed}, NULL, ${now})
      ON CONFLICT (account_id) DO UPDATE SET totp_secret_sealed = EXCLUDED.totp_secret_sealed, totp_last_step = NULL, updated_at = EXCLUDED.updated_at
      WHERE account_factors.totp_enabled_at IS NULL`),
  );
  if (n === 0) throw alreadyOn();
  await audit(ctx, s, "DOGRULAMA_KURULUMU_BASLADI");
  return { totpSirri: secret, otpauth: otpauthUri(account.kullaniciAdi, secret) };
}

/** İlk kodla onay: doğrulanınca AÇIK olur (atomik claim — onaylanan sır kurulum sırasında değişmediyse). */
export async function confirmFactoryTwoFactor(ctx: CloudContext, s: SessionContext, g: { totp: string }): Promise<TwoFactorStatus> {
  const a = await ownAccount(ctx, s);
  if (factorOn(a.factors)) throw alreadyOn();
  const sealed = a.factors?.totpSecretSealed;
  if (!sealed) throw stateConflict("Önce iki adımlı doğrulama kurulumunu başlatın");
  const nowMs = ctx.now();
  const secret = ctx.secrets.open(sealed, a.id);
  const totp = secret ? verifyTotp(secret, g.totp, { atMs: nowMs, lastUsedStep: null }) : null;
  if (!totp?.ok) throw new CloudError(400, "GIRIS_BASARISIZ", "Doğrulama kodu hatalı; uygulamadaki güncel kodu girin");
  const enabledAt = new Date(nowMs);
  const r = await withTesis(ctx.app, { tesisId: s.tesisId }, (tx) =>
    tx.accountFactor.updateMany({ where: { accountId: a.id, totpEnabledAt: null, totpSecretSealed: sealed }, data: { totpLastStep: totp.step, totpEnabledAt: enabledAt } }),
  );
  if (r.count === 0) throw stateConflict("Kurulum bu arada değişti; yeniden başlatın");
  await audit(ctx, s, "DOGRULAMA_ACILDI");
  return { acik: true, acilis: enabledAt.toISOString() };
}

/** Kapatma: parola + güncel kod (adım iddiası atomik — aynı kod ikinci kez geçmez). */
export async function disableFactoryTwoFactor(ctx: CloudContext, s: SessionContext, g: { password: string; totp?: string | undefined; ip: string | null }): Promise<TwoFactorStatus> {
  if (!factorOn((await ownAccount(ctx, s)).factors)) throw stateConflict("İki adımlı doğrulama zaten kapalı");
  const { account, step } = await verifyFactoryFactors(ctx, s, g);
  if (step === null) throw stateConflict("İki adımlı doğrulama zaten kapalı");
  const r = await withTesis(ctx.app, { tesisId: s.tesisId }, (tx) =>
    tx.accountFactor.updateMany({
      where: { accountId: account.id, totpEnabledAt: { not: null }, OR: [{ totpLastStep: null }, { totpLastStep: { lt: step } }] },
      data: { totpSecretSealed: null, totpLastStep: null, totpEnabledAt: null },
    }),
  );
  if (r.count === 0) throw wrongFactors();
  await audit(ctx, s, "DOGRULAMA_KAPANDI");
  return { acik: false, acilis: null };
}
