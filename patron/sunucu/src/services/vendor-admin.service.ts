// SATICI YÖNETİMİ (CLI — `scripts/tesis.ts`; göç rolüyle, VDS'te konteyner içinden) — tesis kaydı, kurulum kaydı ve
// FABRİKA HESABININ ACİL DURUM ARAÇLARI (üyelik = Electron şifresi, C4). Hesap fabrikanın malıdır: yaratma, ad, izin,
// parola ve kapanış YALNIZ fabrikadan gelir (`POST /v1/kullanicilar`). CLI yalnız uygulamanın malı olan ikinci etkene
// dokunur — bulut kilidi (kilitle/aç), doğrulama kodu kapatma (telefon kaybı kurtarması) — ve kullanıcı listesinin
// damgasını sıfırlar (anahtar kaybı: fabrikanın sonraki gönderimi mühürleri yeniden yazar). Her eylem `satici-cli`
// aktörüyle `account_audit`e düşer (gerekçe + isteğe bağlı talep no); sır, parola özeti ve kullanıcı adı basılmaz.
import { Prisma } from "@prisma/client";
import { normalizeUsername } from "../auth/factory-login";
import { publicKeyFromX } from "../lisans-protokol";
import { recordAudit } from "../lib/audit";
import { CloudError, notFound } from "../lib/errors";
import { listReadyFacilities, withTesis } from "../lib/tenant";
import { rejectLockedAuthorPending } from "./inbox.service";
import { bindInstallationRoute, safeKeyId } from "./installation-directory";
import type { TesisDbRouter } from "../lib/tesis-db";

export const VENDOR_ACTOR = "satici-cli";
export const RETENTION_CHOICES: readonly (number | null)[] = [3, 13, 25, null];

/**
 * Adnan bulutu TEK TESİSLİDİR (tek veritabanı): kayıtlı tesis varsa yalnız AYNI kimlikle yeniden açılır (ad/saklama
 * güncellemesi); başka kimlik 409 `DURUM_CAKISMASI`. Kapı satıcı CLI'sindedir (`tesis.ts tesis-ac`); bekçiler aynı DB'de
 * rastgele tesisleri servis yolundan (`openFacility`) açar.
 */
export async function assertSingleFacility(db: TesisDbRouter, tesisId: string): Promise<void> {
  const others = (await listReadyFacilities(db)).filter((t) => t !== tesisId.toLowerCase());
  if (others.length > 0) throw new CloudError(409, "DURUM_CAKISMASI", `Bu bulut tek tesislidir; kayıtlı tesis ${others[0]} — ikinci tesis açılamaz`);
}

export async function openFacility(db: TesisDbRouter, g: { tesisId: string; name: string; retentionMonths?: number | null }) {
  if (g.retentionMonths !== undefined && !RETENTION_CHOICES.includes(g.retentionMonths)) throw new CloudError(400, "GOVDE_GECERSIZ", "Saklama 3, 13, 25 ay ya da 'tumu' olmalı");
  const row = await withTesis(db, { tesisId: g.tesisId }, (tx) =>
    tx.facility.upsert({
      where: { tesisId: g.tesisId },
      create: { tesisId: g.tesisId, name: g.name, ...(g.retentionMonths === undefined ? {} : { retentionMonths: g.retentionMonths }) },
      update: { name: g.name, status: "AKTIF", ...(g.retentionMonths === undefined ? {} : { retentionMonths: g.retentionMonths }) },
    }),
  );
  await recordAudit(db, { tesisId: g.tesisId, actor: VENDOR_ACTOR, event: "TESIS_KAYDI", entity: "Facility", entityId: g.tesisId, summary: { saklamaAy: row.retentionMonths } });
  return row;
}

export interface InstallationInput {
  readonly tesisId: string;
  readonly installationId: string;
  readonly publicKeyX: string;
  readonly active?: boolean;
}

export async function registerInstallation(db: TesisDbRouter, g: InstallationInput) {
  if (!publicKeyFromX(g.publicKeyX)) throw new CloudError(400, "GOVDE_GECERSIZ", "Kurulum açık anahtarı biçimsiz (Ed25519 x, base64url)");
  const fields = {
    publicKeyX: g.publicKeyX,
    keyId: safeKeyId(g.publicKeyX),
    active: g.active ?? true,
  };
  if (!(await bindInstallationRoute(db, g.installationId, g.tesisId))) throw new CloudError(409, "KURULUM_BASKA_TESISTE", "Bu kurulum başka bir tesise kayıtlı; kurulum tesis değiştiremez");
  const row = await withTesis(db, { tesisId: g.tesisId }, (tx) =>
    tx.installation.upsert({ where: { installationId: g.installationId }, create: { tesisId: g.tesisId, installationId: g.installationId, ...fields }, update: fields }),
  );
  await recordAudit(db, {
    tesisId: g.tesisId,
    actor: VENDOR_ACTOR,
    event: "KURULUM_KAYDI",
    entity: "Installation",
    entityId: g.installationId,
    summary: { aktif: fields.active },
  });
  return row;
}

// ---------------------------------------------------------------- fabrika hesabının acil durum araçları (C4)

/** CLI gerekçesi (denetime yazılır): gerekçe 10–500 karakter; talep no isteğe bağlı 3–60. */
export interface VendorReason {
  readonly gerekce: string;
  readonly talep?: string;
}

/** CLI bayrakları → gerekçe. `required` ise `--gerekce` zorunlu; verilmediyse undefined. */
export function reasonFromArgs(a: Readonly<Record<string, string | undefined>>, required: boolean): VendorReason | undefined {
  const gerekce = (a.gerekce ?? "").trim();
  const talep = (a.talep ?? "").trim();
  if (!gerekce) {
    if (required) throw new CloudError(400, "GOVDE_GECERSIZ", "--gerekce=\"…\" (10–500 karakter) zorunlu — denetime yazılır");
    if (talep) throw new CloudError(400, "GOVDE_GECERSIZ", "--talep yalnız --gerekce ile verilir");
    return undefined;
  }
  if (gerekce.length < 10 || gerekce.length > 500) throw new CloudError(400, "GOVDE_GECERSIZ", "--gerekce 10–500 karakter olmalı");
  if (talep && (talep.length < 3 || talep.length > 60)) throw new CloudError(400, "GOVDE_GECERSIZ", "--talep 3–60 karakter olmalı");
  return { gerekce, ...(talep ? { talep } : {}) };
}

const reasonSummary = (r: VendorReason | undefined) => (r ? { gerekce: r.gerekce, ...(r.talep ? { talep: r.talep } : {}) } : {});

/** Kullanıcı adı → AÇIK (PASİF olmayan) fabrika hesabının kimliği; yoksa 404 (ad çıktıya/hataya basılmaz). */
async function openAccountId(db: TesisDbRouter, tesisId: string, rawUsername: string): Promise<string> {
  const username = normalizeUsername(rawUsername);
  if (!username) throw new CloudError(400, "GOVDE_GECERSIZ", "--kullanici biçimsiz (harf, rakam, . _ -; en çok 50)");
  const row = await withTesis(db, { tesisId }, (tx) => tx.account.findFirst({ where: { tesisId, kullaniciAdi: username, status: { not: "PASIF" } }, select: { id: true } }));
  if (!row) throw notFound("Açık fabrika hesabı");
  return row.id;
}

export interface VendorAccountResult {
  readonly accountId: string;
  readonly changed: boolean;
  readonly sessions?: number;
  /** Kilitte ret makbuzuyla kapanan, fabrikaya hiç verilmemiş mesaj sayısı. */
  readonly messages?: number;
}

/**
 * Bulut kilidi (acil durum; fabrika kapalıyken de çalışır): kilitle → yeni giriş 401, açık oturumlar KAPANIR (kilit
 * açılınca eski oturum dirilmez) ve hesabın fabrikaya henüz verilmemiş mesajları ret makbuzuyla kapanır; aç → bulut kilidi + geçici kaba kuvvet kilidi ve sayaç sıfırlanır. Atomik claim;
 * zaten o durumdaysa değişiklik yok (denetim yazılmaz).
 */
export async function setCloudLock(db: TesisDbRouter, g: { tesisId: string; username: string; lock: boolean; reason?: VendorReason }, nowMs: number = Date.now()): Promise<VendorAccountResult> {
  const accountId = await openAccountId(db, g.tesisId, g.username);
  const now = new Date(nowMs);
  const out = await withTesis(db, { tesisId: g.tesisId }, async (tx) => {
    if (g.lock) {
      const n = await tx.$executeRaw(Prisma.sql`
        INSERT INTO account_factors (account_id, tesis_id, bulut_kilidi, updated_at) VALUES (${accountId}::uuid, ${g.tesisId}::uuid, true, ${now})
        ON CONFLICT (account_id) DO UPDATE SET bulut_kilidi = true, updated_at = EXCLUDED.updated_at WHERE account_factors.bulut_kilidi = false`);
      const closed = await tx.session.updateMany({ where: { tesisId: g.tesisId, accountId, closedAt: null }, data: { closedAt: now, closeReason: "SIFIRLAMA" } });
      // Kilitli hesabın fabrikaya henüz verilmemiş mesajı verilmez (ret makbuzuyla kapanır; tekrar kilitte de süpürülür).
      const rejected = await rejectLockedAuthorPending(tx, g.tesisId, accountId, now);
      return { changed: n > 0, sessions: closed.count, messages: rejected.length };
    }
    const r = await tx.accountFactor.updateMany({
      where: { accountId, OR: [{ cloudLock: true }, { tempLockUntil: { not: null } }, { failureCount: { gt: 0 } }] },
      data: { cloudLock: false, tempLockUntil: null, failureCount: 0, failureWindowStart: null },
    });
    return { changed: r.count > 0, sessions: 0, messages: 0 };
  });
  if (out.changed || out.sessions > 0 || out.messages > 0) {
    await recordAudit(db, {
      tesisId: g.tesisId,
      actor: VENDOR_ACTOR,
      event: g.lock ? "HESAP_BULUT_KILIDI" : "HESAP_BULUT_KILIDI_KALKTI",
      entity: "Account",
      entityId: accountId,
      summary: { ...reasonSummary(g.reason), ...(g.lock ? { oturum: out.sessions, mesaj: out.messages } : {}) },
    });
  }
  return { accountId, ...out };
}

/**
 * Doğrulama kodunu (TOTP) kapatma — telefonunu kaybeden kişinin TEK kurtarma yolu (uygulamada yok). Sır silinir;
 * parola (fabrikanın) ve oturumlar kalır. Gerekçe ZORUNLU. Zaten kapalıysa değişiklik yok.
 */
export async function disableAccountTwoFactor(db: TesisDbRouter, g: { tesisId: string; username: string; reason: VendorReason }, nowMs: number = Date.now()): Promise<VendorAccountResult> {
  const accountId = await openAccountId(db, g.tesisId, g.username);
  const r = await withTesis(db, { tesisId: g.tesisId }, (tx) =>
    tx.accountFactor.updateMany({
      where: { accountId, OR: [{ totpEnabledAt: { not: null } }, { totpSecretSealed: { not: null } }] },
      data: { totpSecretSealed: null, totpLastStep: null, totpEnabledAt: null, updatedAt: new Date(nowMs) },
    }),
  );
  if (r.count > 0) {
    await recordAudit(db, { tesisId: g.tesisId, actor: VENDOR_ACTOR, event: "DOGRULAMA_KAPATILDI", entity: "Account", entityId: accountId, summary: reasonSummary(g.reason) });
  }
  return { accountId, changed: r.count > 0 };
}

/**
 * Kullanıcı listesini yeniden iste (anahtar kaybı / şüpheli liste): bayatlık damgası sıfırlanır ⇒ fabrikanın bir sonraki
 * gönderimine (≤ 10 dk; fabrika bağlantıyı kendi başlatır) dek YENİ giriş 503 `FABRIKA_BAGLANTISI_YOK`, açık oturum
 * sürer. Gönderim mühürleri geçerli anahtarla yeniden yazar (açılamayan mühür "parola değişti" sayılır). Döner: AKTİF
 * hesap sayısı.
 */
export async function requestUserResend(db: TesisDbRouter, g: { tesisId: string; reason?: VendorReason }): Promise<{ accounts: number; changed: boolean }> {
  const out = await withTesis(db, { tesisId: g.tesisId }, async (tx) => ({
    changed: (await tx.facility.updateMany({ where: { tesisId: g.tesisId, usersPushedAt: { not: null } }, data: { usersPushedAt: null } })).count > 0,
    accounts: await tx.account.count({ where: { tesisId: g.tesisId, status: "AKTIF" } }),
  }));
  await recordAudit(db, { tesisId: g.tesisId, actor: VENDOR_ACTOR, event: "KULLANICI_LISTESI_ISTENDI", entity: "Facility", entityId: g.tesisId, summary: { ...reasonSummary(g.reason), aktifHesap: out.accounts } });
  return out;
}
