// İKİ ADIMLI DOĞRULAMA (TOTP) — İSTEĞE BAĞLI, kimliğin kendi seçimi. Aç: parola → sır (YALNIZ yanıtta) → ilk kodla ONAY;
// onaysız açık sayılmaz. Kapat: parola + güncel kod. Telefon kaybında tek yol satıcı CLI'si (`tesis.ts dogrulama-kapat`).
// Her adım denetime yazılır; sır ve kod denetime/günlüğe girmez.
import type { Identity } from "@prisma/client";
import { accountActor, recordAudit } from "../lib/audit";
import { CloudError, stateConflict } from "../lib/errors";
import { withCentral } from "../lib/tenant";
import type { CloudContext } from "../services/context";
import type { TwoFactorSetup, TwoFactorStatus } from "../wire/api";
import { totpStepClaim, twoFactorOn, verifyOwnFactors, wrongFactors, type SessionContext } from "./session.service";
import { generateTotpSecret, otpauthUri, verifyTotp } from "./totp";

const sessionGone = (): CloudError => new CloudError(401, "OTURUM_YOK", "Oturum geçersiz");
const alreadyOn = (): CloudError => stateConflict("İki adımlı doğrulama zaten açık");

const statusOf = (i: Pick<Identity, "totpEnabledAt" | "totpSecretSealed" | "totpLastStep">): TwoFactorStatus =>
  twoFactorOn(i) ? { acik: true, acilis: i.totpEnabledAt!.toISOString() } : { acik: false, acilis: null };

async function ownIdentity(ctx: CloudContext, s: SessionContext): Promise<Identity> {
  const id = s.identityId;
  const identity = id ? await withCentral(ctx.app, {}, (tx) => tx.identity.findUnique({ where: { id } })) : null;
  if (!identity || identity.status !== "AKTIF") throw sessionGone();
  return identity;
}

const audit = (ctx: CloudContext, s: SessionContext, event: string) =>
  recordAudit(ctx.app, { tesisId: s.tesisId, actor: accountActor(s.accountId), event, entity: "Account", entityId: s.accountId });

export async function twoFactorStatus(ctx: CloudContext, s: SessionContext): Promise<TwoFactorStatus> {
  return statusOf(await ownIdentity(ctx, s));
}

/** Kurulumu başlatır (parola): yeni sır onay bekler; tekrar başlatma önceki onaysız sırrı değiştirir. */
export async function beginTwoFactor(ctx: CloudContext, s: SessionContext, g: { password: string; ip: string | null }): Promise<TwoFactorSetup> {
  if (twoFactorOn(await ownIdentity(ctx, s))) throw alreadyOn();
  const { identity } = await verifyOwnFactors(ctx, s, { password: g.password, ip: g.ip });
  const secret = generateTotpSecret();
  const r = await withCentral(ctx.app, {}, (tx) =>
    tx.identity.updateMany({ where: { id: identity.id, status: "AKTIF", totpEnabledAt: null }, data: { totpSecretSealed: ctx.secrets.seal(secret, identity.id), totpLastStep: null } }),
  );
  if (r.count === 0) throw alreadyOn();
  await audit(ctx, s, "DOGRULAMA_KURULUMU_BASLADI");
  return { totpSirri: secret, otpauth: otpauthUri(s.email, secret) };
}

/** İlk kodla onay: doğrulanınca AÇIK olur (atomik claim — onaylanan sır, kurulum sırasında değişmediyse). */
export async function confirmTwoFactor(ctx: CloudContext, s: SessionContext, g: { totp: string }): Promise<TwoFactorStatus> {
  const identity = await ownIdentity(ctx, s);
  if (twoFactorOn(identity)) throw alreadyOn();
  if (!identity.totpSecretSealed) throw stateConflict("Önce iki adımlı doğrulama kurulumunu başlatın");
  const nowMs = ctx.now();
  const secret = ctx.secrets.open(identity.totpSecretSealed, identity.id);
  const totp = secret ? verifyTotp(secret, g.totp, { atMs: nowMs, lastUsedStep: null }) : null;
  if (!totp?.ok) throw new CloudError(400, "GIRIS_BASARISIZ", "Doğrulama kodu hatalı; uygulamadaki güncel kodu girin");
  const enabledAt = new Date(nowMs);
  const r = await withCentral(ctx.app, {}, (tx) =>
    tx.identity.updateMany({
      where: { id: identity.id, status: "AKTIF", totpEnabledAt: null, totpSecretSealed: identity.totpSecretSealed },
      data: { totpLastStep: totp.step, totpEnabledAt: enabledAt },
    }),
  );
  if (r.count === 0) throw stateConflict("Kurulum bu arada değişti; yeniden başlatın");
  await audit(ctx, s, "DOGRULAMA_ACILDI");
  return { acik: true, acilis: enabledAt.toISOString() };
}

/** Kapatma: parola + güncel kod (adım iddiası atomik — aynı kod ikinci kez geçmez). */
export async function disableTwoFactor(ctx: CloudContext, s: SessionContext, g: { password: string; totp?: string | undefined; ip: string | null }): Promise<TwoFactorStatus> {
  if (!twoFactorOn(await ownIdentity(ctx, s))) throw stateConflict("İki adımlı doğrulama zaten kapalı");
  const { identity, step } = await verifyOwnFactors(ctx, s, { password: g.password, totp: g.totp, ip: g.ip });
  if (step === null) throw stateConflict("İki adımlı doğrulama zaten kapalı");
  const claim = totpStepClaim(identity.id, step);
  const r = await withCentral(ctx.app, {}, (tx) => tx.identity.updateMany({ where: claim.where, data: { totpSecretSealed: null, totpLastStep: null, totpEnabledAt: null } }));
  if (r.count === 0) throw wrongFactors();
  await audit(ctx, s, "DOGRULAMA_KAPANDI");
  return { acik: false, acilis: null };
}
