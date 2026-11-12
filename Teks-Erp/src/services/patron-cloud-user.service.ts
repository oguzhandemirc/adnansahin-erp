// =============================================================================
// Patron bulutu TEKNİK KULLANICISI — telefondan gelen kayıtların aktörü (createdById / audit userId)
// =============================================================================
// Kaynak: ana ürün 19aa48a9 `services/patron-cloud.service.ts` (etkinleştirme). Adnan farkı: panel düğmesi yok,
// kullanıcı yazma düğmesi (`patronCloud.inboxEnabled`) ilk açıldığında uzlaştırmada NORMAL kullanıcı servisinden
// audit'li doğar. Giriş yöntemi YOK: kimsenin bilmediği rastgele parola, PIN/kart üretilmez, İZİN VERİLMEZ;
// token üreticisi bu kimliği reddeder (`AuthService.issueToken`), panel kullanıcı listesinde görünmez.
// Mevcut kullanıcı benimsenmez: aynı kullanıcı adı başka hesapta varsa doğmaz ve gelen kutusu çalışmaz.
// =============================================================================
import { randomBytes } from "node:crypto";
import prisma from "../lib/prisma";
import { uyari } from "../lib/logger";
import { AuditService } from "./audit.service";
import { PermissionManagementService } from "./permission-management.service";
import { PATRON_CLOUD_USER_SETTING_KEY } from "../constants/reserved-settings";
import { readPatronCloudUserId } from "./helpers/patron-cloud-user.helper";

/** Panel kuralı: kullanıcı adı yalnız İngilizce harf + rakam. */
export const PATRON_CLOUD_USERNAME = "patronbulutu";
export const PATRON_CLOUD_FULL_NAME = "Patron Bulutu (telefon)";

export { readPatronCloudUserId };

/** İşleyicinin aktörü: kayıtlı VE aktif VE silinmemiş teknik kullanıcı; değilse null (gelen kutusu çekilmez). */
export async function resolveActivePatronCloudUserId(): Promise<string | null> {
  const id = await readPatronCloudUserId();
  if (!id) return null;
  const u = await prisma.user.findUnique({ where: { id }, select: { isActive: true, deletedAt: true } });
  return u && u.isActive && !u.deletedAt ? id : null;
}

export type EnsureResult = { readonly ok: true; readonly userId: string; readonly created: boolean } | { readonly ok: false; readonly reason: string };

/**
 * Kayıtlı teknik kullanıcıyı döndürür; kayıt yoksa doğurur. Kayıtlı ama pasif/silinmişse YENİDEN AKTİFLEŞTİRMEZ
 * (birinin bilinçli kararıdır) — gelen kutusu çalışmaz, log'a yazılır. Fırlatmaz.
 */
export async function ensurePatronCloudUser(): Promise<EnsureResult> {
  try {
    const existingId = await readPatronCloudUserId();
    if (existingId) {
      const u = await prisma.user.findUnique({ where: { id: existingId }, select: { isActive: true, deletedAt: true } });
      if (u && u.isActive && !u.deletedAt) return { ok: true, userId: existingId, created: false };
      return { ok: false, reason: u ? "TEKNIK_KULLANICI_PASIF" : "TEKNIK_KULLANICI_YOK" };
    }
    const clash = await prisma.user.findFirst({ where: { username: { equals: PATRON_CLOUD_USERNAME, mode: "insensitive" } }, select: { id: true } });
    if (clash) {
      uyari("patron-bulut", `'${PATRON_CLOUD_USERNAME}' kullanıcı adı başka bir hesapta — teknik kullanıcı doğmadı, gelen kutusu çalışmaz`);
      return { ok: false, reason: "KULLANICI_ADI_DOLU" };
    }
    const user = await PermissionManagementService.createUser(
      {
        username: PATRON_CLOUD_USERNAME,
        fullName: PATRON_CLOUD_FULL_NAME,
        password: randomBytes(48).toString("base64url"),
        grantOperatorDefaults: false,
        generateMobileCredentials: false,
      },
      undefined,
    );
    await prisma.systemSetting.create({
      data: {
        key: PATRON_CLOUD_USER_SETTING_KEY,
        value: user.id,
        description: "Patron bulutu teknik kullanıcısı (telefondan gelen kayıtların aktörü). Elle DEĞİŞTİRMEYİN.",
      },
    });
    await AuditService.log({ userId: undefined, action: "CREATE", tableName: "system_settings", recordId: PATRON_CLOUD_USER_SETTING_KEY, newData: { value: user.id } });
    return { ok: true, userId: user.id, created: true };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    uyari("patron-bulut", `teknik kullanıcı hazırlanamadı: ${msg.replace(/\s+/g, " ").slice(0, 200)}`);
    return { ok: false, reason: "HATA" };
  }
}
