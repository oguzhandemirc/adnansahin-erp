// =============================================================================
// Bildirim ALICI HESABI — tek helper (2.13.0, D1)
// =============================================================================
// Alıcı = ataması var ∧ aktif (silinmemiş) ∧ türün veri izni var ∧ yazar değil ∧ teknik kullanıcı değil ∧
//         yalnız-saha (`mobile:*`) hesabı değil ∧ (kişide `bildirim:tercih` varsa) kapatmamış.
// Tercih izni yoksa `mutedByUser` YOK SAYILIR (atanan tür zorunludur). İzin, panel kapılarıyla aynı
// `getEffectivePermissions` + `matchesPermission` ikilisinden okunur; ikinci bir izin tanımı yazılmaz.
// =============================================================================

import prisma from "../../lib/prisma";
import { AuthService } from "../auth.service";
import { matchesPermission } from "../../middlewares/rbac.middleware";
import { readPatronCloudUserId } from "../helpers/patron-cloud-user.helper";
import {
  NOTIFICATION_PREFERENCE_PERMISSION,
  notificationKindDef,
  type NotificationKind,
} from "../../constants/notification-catalog";

/** Yalnız saha hesabı mı (masaüstü giriş kapısıyla aynı ölçüt: mobil-olmayan izni yok)? */
export function isFieldOnlyAccount(permissions: readonly string[]): boolean {
  return !permissions.some((p) => !p.startsWith("mobile:"));
}

/** Bu kişi, bu türü, bu izin kümesi ve tercihle alır mı? Saf karar — DB'siz bekçi de çağırır. */
export function receivesNotification(
  kind: NotificationKind,
  permissions: readonly string[],
  mutedByUser: boolean,
): boolean {
  if (isFieldOnlyAccount(permissions)) return false;
  if (!matchesPermission(permissions, notificationKindDef(kind).dataPermission)) return false;
  if (mutedByUser && matchesPermission(permissions, NOTIFICATION_PREFERENCE_PERMISSION)) return false;
  return true;
}

/** Türün alıcıları (kullanıcı kimlikleri, sıralı). Yazar ve teknik kullanıcı hiçbir koşulda alıcı olmaz. */
export async function resolveNotificationRecipients(
  kind: NotificationKind,
  authorUserId: string | null,
): Promise<string[]> {
  const technicalUserId = await readPatronCloudUserId();
  const rows = await prisma.notificationAssignment.findMany({
    where: { kind, user: { isActive: true, deletedAt: null } },
    select: { userId: true, mutedByUser: true },
    orderBy: { userId: "asc" },
  });
  const out: string[] = [];
  for (const r of rows) {
    if (r.userId === authorUserId || r.userId === technicalUserId) continue;
    const permissions = await AuthService.getEffectivePermissions(r.userId);
    if (receivesNotification(kind, permissions, r.mutedByUser)) out.push(r.userId);
  }
  return out;
}
