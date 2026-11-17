// =============================================================================
// Bildirim ATAMA YÖNETİMİ — kişi + rol şablonu (2.13.0, D2)
// =============================================================================
// Kim hangi türü alır? `bildirim:yonet` sahibinin yazdığı atama (`notification_assignments`) ve
// rol şablonu seti (`permission_template_notifications`). Kurallar:
//   · Veri izni olmayan tür ATANAMAZ (kişide efektif izin, şablonda şablonun izinleri) → 409 BILDIRIM_VERI_IZNI_YOK.
//   · Yalnız-saha (`mobile:*`), teknik (patron bulutu) ve pasif/silinmiş kullanıcı listelenmez, atanamaz.
//   · Atama izin kodu DEĞİLDİR: `tokenVersion` ARTMAZ, oturum düşmez.
//   · Şablon uygulanınca set kişiye KOPYALANIR (izinlerle aynı; canlı bağ yok), veri izni olmayan tür atlanır.
//   · Her yazım `AuditService.log` ile iz bırakır; tablo adları bildirim kancasının türlerine eşlenmez.
// =============================================================================

import prisma from "../../lib/prisma";
import { AppError } from "../../utils/app-error";
import { AuditService } from "../audit.service";
import { AuthService } from "../auth.service";
import { matchesPermission } from "../../middlewares/rbac.middleware";
import { readPatronCloudUserId } from "../helpers/patron-cloud-user.helper";
import { isFieldOnlyAccount } from "./recipients";
import {
  NOTIFICATION_KIND_KEYS,
  NOTIFICATION_PREFERENCE_PERMISSION,
  NOTIFICATION_TOPICS,
  isNotificationKind,
  notificationKindDef,
  type NotificationKind,
} from "../../constants/notification-catalog";

export const NOTIFICATION_ASSIGNMENT_AUDIT_TABLE = "NOTIFICATION_ASSIGNMENT";
export const NOTIFICATION_TEMPLATE_AUDIT_TABLE = "NOTIFICATION_TEMPLATE";

/** Tür satırı: katalog + bu kişi/şablon için durum. `lockedReason` doluysa satır kilitli (veri izni yok). */
export interface NotificationKindRow {
  kind: NotificationKind;
  topic: string;
  label: string;
  dataPermission: string;
  assigned: boolean;
  lockedReason: string | null;
}

/** Veri izni yoksa kilit nedeni (Türkçe), varsa null. */
export function kindLockedReason(kind: NotificationKind, permissions: readonly string[]): string | null {
  const def = notificationKindDef(kind);
  return matchesPermission(permissions, def.dataPermission) ? null : def.missingPermissionText;
}

/** Katalog: konu başlıkları sırasıyla, her başlığın türleri ve gereken veri izni. */
export function notificationCatalog() {
  return {
    success: true,
    data: {
      topics: NOTIFICATION_TOPICS.map((t) => ({
        key: t.key,
        label: t.label,
        kinds: NOTIFICATION_KIND_KEYS.filter((k) => notificationKindDef(k).topic === t.key).map((k) => {
          const d = notificationKindDef(k);
          return { kind: k, label: d.label, dataPermission: d.dataPermission, missingPermissionText: d.missingPermissionText };
        }),
      })),
    },
  };
}

/** İstekten gelen tür listesi: tanınmayan → 400, tekrarlar düşer. */
export function parseNotificationKinds(raw: readonly string[]): NotificationKind[] {
  const unknown = raw.filter((k) => !isNotificationKind(k));
  if (unknown.length) {
    throw AppError.badRequest("Tanınmayan bildirim türü.", { code: "BILDIRIM_TURU_GECERSIZ", kinds: unknown });
  }
  return [...new Set(raw as NotificationKind[])];
}

function assertDataPermissions(kinds: readonly NotificationKind[], permissions: readonly string[], who: string): void {
  const denied = kinds.filter((k) => kindLockedReason(k, permissions) !== null);
  if (denied.length) {
    const reasons = denied.map((k) => notificationKindDef(k).missingPermissionText).join(", ");
    throw AppError.conflict(`${who} bu bildirimleri alamaz: ${reasons}.`, { code: "BILDIRIM_VERI_IZNI_YOK", kinds: denied });
  }
}

function kindRows(assigned: ReadonlySet<string>, permissions: readonly string[]): NotificationKindRow[] {
  return NOTIFICATION_KIND_KEYS.map((k) => {
    const d = notificationKindDef(k);
    return { kind: k, topic: d.topic, label: d.label, dataPermission: d.dataPermission, assigned: assigned.has(k), lockedReason: kindLockedReason(k, permissions) };
  });
}

/** Atanabilir kişi: var, silinmemiş, aktif, teknik değil, yalnız-saha değil. Değilse 404/409. */
async function loadAssignableUser(userId: string) {
  const user = await prisma.user.findFirst({
    where: { id: userId, deletedAt: null },
    select: { id: true, username: true, fullName: true, isActive: true },
  });
  if (!user) throw AppError.notFound("Kullanıcı bulunamadı");
  const permissions = await AuthService.getEffectivePermissions(userId);
  const technical = (await readPatronCloudUserId()) === userId;
  if (technical || !user.isActive || isFieldOnlyAccount(permissions)) {
    throw AppError.conflict("Bu kullanıcıya bildirim atanamaz (pasif, teknik ya da yalnız saha hesabı).", { code: "BILDIRIM_KULLANICI_UYGUN_DEGIL" });
  }
  return { user, permissions };
}

/** Sol liste: bildirim atanabilen kişiler (pasif, silinmiş, teknik ve yalnız-saha hesap yok). */
export async function listNotificationUsers() {
  const technicalId = await readPatronCloudUserId();
  const users = await prisma.user.findMany({
    where: { deletedAt: null, isActive: true, ...(technicalId ? { NOT: { id: technicalId } } : {}) },
    select: { id: true, username: true, fullName: true, isSystemAccount: true, _count: { select: { notificationAssignments: true } } },
    orderBy: { username: "asc" },
  });
  const items = [];
  for (const u of users) {
    const permissions = await AuthService.getEffectivePermissions(u.id);
    if (isFieldOnlyAccount(permissions)) continue;
    items.push({
      id: u.id,
      username: u.username,
      fullName: u.fullName,
      isSystemAccount: u.isSystemAccount,
      assignedCount: u._count.notificationAssignments,
      canChangePreference: matchesPermission(permissions, NOTIFICATION_PREFERENCE_PERMISSION),
    });
  }
  return { success: true, data: { items } };
}

export async function getUserNotificationAssignments(userId: string) {
  const { user, permissions } = await loadAssignableUser(userId);
  const rows = await prisma.notificationAssignment.findMany({ where: { userId }, select: { kind: true, mutedByUser: true } });
  const muted = new Set(rows.filter((r) => r.mutedByUser).map((r) => r.kind));
  return {
    success: true,
    data: {
      user,
      canChangePreference: matchesPermission(permissions, NOTIFICATION_PREFERENCE_PERMISSION),
      kinds: kindRows(new Set(rows.map((r) => r.kind)), permissions).map((r) => ({ ...r, mutedByUser: muted.has(r.kind) })),
    },
  };
}

/**
 * Kişinin atanmış türlerini HEDEF kümeye eşitler. Veri izni olmayan tür → 409 (hiçbir şey yazılmaz).
 * Kalan atamaların `mutedByUser`ı korunur. `tokenVersion` artmaz.
 */
export async function setUserNotificationAssignments(userId: string, rawKinds: readonly string[], actorUserId: string | undefined) {
  const kinds = parseNotificationKinds(rawKinds);
  const { permissions } = await loadAssignableUser(userId);
  assertDataPermissions(kinds, permissions, "Kişi");
  const before = await replaceUserKinds(userId, kinds);
  await AuditService.log({
    userId: actorUserId,
    action: "UPDATE",
    tableName: NOTIFICATION_ASSIGNMENT_AUDIT_TABLE,
    recordId: userId,
    oldData: { kinds: before },
    newData: { kinds },
  });
  return getUserNotificationAssignments(userId);
}

/** Kişinin atama kümesini hedefe eşitler (seri tx; `notIn: []` yok). Önceki kümeyi döner. */
async function replaceUserKinds(userId: string, kinds: readonly NotificationKind[]): Promise<string[]> {
  return prisma.$transaction(async (tx) => {
    const existing = await tx.notificationAssignment.findMany({ where: { userId }, select: { id: true, kind: true } });
    const target = new Set<string>(kinds);
    const toRemove = existing.filter((e) => !target.has(e.kind)).map((e) => e.id);
    const have = new Set(existing.map((e) => e.kind));
    const toAdd = kinds.filter((k) => !have.has(k));
    if (toRemove.length) await tx.notificationAssignment.deleteMany({ where: { id: { in: toRemove } } });
    if (toAdd.length) await tx.notificationAssignment.createMany({ data: toAdd.map((kind) => ({ userId, kind })), skipDuplicates: true });
    return existing.map((e) => e.kind).sort();
  });
}

// ---------------------------------------------------------------------------
// Rol şablonu
// ---------------------------------------------------------------------------

async function loadTemplate(templateId: string) {
  const t = await prisma.permissionTemplate.findUnique({
    where: { id: templateId },
    select: { id: true, name: true, isActive: true, permissions: { select: { permission: { select: { code: true } } } } },
  });
  if (!t) throw AppError.notFound("Şablon bulunamadı");
  return { template: { id: t.id, name: t.name, isActive: t.isActive }, permissions: t.permissions.map((p) => p.permission.code) };
}

export async function listNotificationTemplates() {
  const rows = await prisma.permissionTemplate.findMany({
    select: { id: true, name: true, isActive: true, _count: { select: { notificationKinds: true } } },
    orderBy: { name: "asc" },
  });
  return { success: true, data: { items: rows.map((r) => ({ id: r.id, name: r.name, isActive: r.isActive, assignedCount: r._count.notificationKinds })) } };
}

export async function getTemplateNotificationAssignments(templateId: string) {
  const { template, permissions } = await loadTemplate(templateId);
  const rows = await prisma.permissionTemplateNotification.findMany({ where: { templateId }, select: { kind: true } });
  return { success: true, data: { template, kinds: kindRows(new Set(rows.map((r) => r.kind)), permissions) } };
}

/** Şablonun türlerini hedefe eşitler. Mevcut kişiler ETKİLENMEZ (kopya, canlı bağ yok). */
export async function setTemplateNotificationAssignments(templateId: string, rawKinds: readonly string[], actorUserId: string | undefined) {
  const kinds = parseNotificationKinds(rawKinds);
  const { permissions } = await loadTemplate(templateId);
  assertDataPermissions(kinds, permissions, "Şablon");
  const before = await prisma.$transaction(async (tx) => {
    const existing = await tx.permissionTemplateNotification.findMany({ where: { templateId }, select: { id: true, kind: true } });
    const target = new Set<string>(kinds);
    const toRemove = existing.filter((e) => !target.has(e.kind)).map((e) => e.id);
    const have = new Set(existing.map((e) => e.kind));
    const toAdd = kinds.filter((k) => !have.has(k));
    if (toRemove.length) await tx.permissionTemplateNotification.deleteMany({ where: { id: { in: toRemove } } });
    if (toAdd.length) await tx.permissionTemplateNotification.createMany({ data: toAdd.map((kind) => ({ templateId, kind })), skipDuplicates: true });
    return existing.map((e) => e.kind).sort();
  });
  await AuditService.log({
    userId: actorUserId,
    action: "UPDATE",
    tableName: NOTIFICATION_TEMPLATE_AUDIT_TABLE,
    recordId: templateId,
    oldData: { kinds: before },
    newData: { kinds },
  });
  return getTemplateNotificationAssignments(templateId);
}

/**
 * Şablon kişiye uygulanırken bildirim setini KOPYALAR (`PermissionManagementService.applyTemplate` çağırır,
 * izinler yazıldıktan SONRA — veri izni kişinin YENİ efektif izinlerinden okunur). `replace` = kişinin seti şablonun
 * seti olur; `merge` = eksikler eklenir. Veri izni olmayan tür atlanır. Kişi atanabilir değilse (yalnız saha, teknik,
 * pasif) hiçbir şey yazılmaz. `tokenVersion` artmaz.
 */
export async function copyTemplateNotificationsToUser(
  templateId: string,
  userId: string,
  mode: "merge" | "replace",
  actorUserId: string | undefined,
): Promise<{ copied: NotificationKind[]; skipped: NotificationKind[] }> {
  let permissions: string[];
  try {
    ({ permissions } = await loadAssignableUser(userId));
  } catch (error) {
    // Atanamayan kişi (yalnız saha · teknik · pasif): izin kopyası yine geçerli, bildirim seti yazılmaz.
    if (error instanceof AppError) return { copied: [], skipped: [] };
    throw error;
  }
  const rows = await prisma.permissionTemplateNotification.findMany({ where: { templateId }, select: { kind: true } });
  const templateKinds = rows.map((r) => r.kind).filter(isNotificationKind);
  const copied = templateKinds.filter((k) => kindLockedReason(k, permissions) === null);
  const skipped = templateKinds.filter((k) => kindLockedReason(k, permissions) !== null);
  if (mode === "replace") {
    await replaceUserKinds(userId, copied);
  } else if (copied.length) {
    await prisma.notificationAssignment.createMany({ data: copied.map((kind) => ({ userId, kind })), skipDuplicates: true });
  }
  if (copied.length || skipped.length || mode === "replace") {
    await AuditService.log({
      userId: actorUserId,
      action: "UPDATE",
      tableName: NOTIFICATION_ASSIGNMENT_AUDIT_TABLE,
      recordId: userId,
      newData: { appliedTemplateId: templateId, mode, kinds: copied, skippedKinds: skipped },
    });
  }
  return { copied, skipped };
}
