// =============================================================================
// Bildirim TERCİHİ — kişinin KENDİ atanmış türleri (2.13.0, D2)
// =============================================================================
// Okuma herkese açık (kendi kaydı). Yazma yalnız `bildirim:tercih` ile (route kapısı) ve yalnız ATANMIŞ türde:
// atanmamış türü açamaz (409 BILDIRIM_ATANMAMIS). Tercih izni yoksa atanan tür zorunludur (`required: true`)
// ve alıcı hesabı `mutedByUser`ı yok sayar (`recipients.ts`). `tokenVersion` artmaz.
// =============================================================================

import prisma from "../../lib/prisma";
import { AppError } from "../../utils/app-error";
import { AuditService } from "../audit.service";
import { matchesPermission } from "../../middlewares/rbac.middleware";
import {
  NOTIFICATION_KIND_KEYS,
  NOTIFICATION_PREFERENCE_PERMISSION,
  NOTIFICATION_TOPICS,
  notificationKindDef,
} from "../../constants/notification-catalog";
import { parseNotificationKinds } from "./notification-assignment.service";

export const NOTIFICATION_PREFERENCE_AUDIT_TABLE = "NOTIFICATION_PREFERENCE";

export async function getMyNotificationPreferences(userId: string, permissions: readonly string[]) {
  const canChange = matchesPermission(permissions, NOTIFICATION_PREFERENCE_PERMISSION);
  const rows = await prisma.notificationAssignment.findMany({ where: { userId }, select: { kind: true, mutedByUser: true } });
  const byKind = new Map(rows.map((r) => [r.kind, r.mutedByUser] as const));
  const items = NOTIFICATION_KIND_KEYS.filter((k) => byKind.has(k)).map((k) => {
    const d = notificationKindDef(k);
    // Tercih izni yoksa sessize alma GEÇERSİZDİR — ekran gerçeği göstersin.
    const muted = canChange && byKind.get(k) === true;
    return { kind: k, topic: d.topic, label: d.label, mutedByUser: muted, required: !canChange };
  });
  return {
    success: true,
    data: { canChange, topics: NOTIFICATION_TOPICS.map((t) => ({ key: t.key, label: t.label })), items },
  };
}

export interface PreferenceChange {
  kind: string;
  muted: boolean;
}

/** Kendi tercihini yazar (route `bildirim:tercih` ister). Herhangi bir tür atanmamışsa hiçbiri yazılmaz. */
export async function setMyNotificationPreferences(
  userId: string,
  permissions: readonly string[],
  changes: readonly PreferenceChange[],
) {
  const kinds = parseNotificationKinds(changes.map((c) => c.kind));
  const wanted = new Map(changes.map((c) => [c.kind, c.muted] as const));
  await prisma.$transaction(async (tx) => {
    for (const kind of kinds) {
      // Atomik: atama satırı yoksa count 0 → 409 ve tx geri döner.
      const r = await tx.notificationAssignment.updateMany({ where: { userId, kind }, data: { mutedByUser: wanted.get(kind) === true } });
      if (r.count === 0) {
        throw AppError.conflict(`'${notificationKindDef(kind).label}' bildirimi size atanmamış; açılamaz.`, { code: "BILDIRIM_ATANMAMIS", kind });
      }
    }
  });
  await AuditService.log({
    userId,
    action: "UPDATE",
    tableName: NOTIFICATION_PREFERENCE_AUDIT_TABLE,
    recordId: userId,
    newData: { changes: kinds.map((k) => ({ kind: k, muted: wanted.get(k) === true })) },
  });
  return getMyNotificationPreferences(userId, permissions);
}
