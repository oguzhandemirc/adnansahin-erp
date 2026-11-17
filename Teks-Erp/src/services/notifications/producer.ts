// =============================================================================
// Bildirim ÜRETİCİSİ (2.13.0, D1) — olay defteri + kişi başına teslim
// =============================================================================
// Kanca (`audit-hook.ts`) buraya tembel yükle gelir. Akış: şalter → varlık olguları (durum tablosu) →
// yazar (çağrı argümanı / varlık künyesi; teknik kullanıcı ise gelen kutusu makbuzundaki bulut hesabı =
// fabrika kullanıcısı) → yazar adı DONDURULUR → alıcılar → olay + teslimler TEK tx'te.
// Aynı (tür, varlık) ikinci kez gelirse UNIQUE sedi yeni olay doğurmaz (`skipDuplicates`, P2002 yok).
// =============================================================================

import prisma from "../../lib/prisma";
import { readPatronCloudUserId } from "../helpers/patron-cloud-user.helper";
import {
  notificationKindDef,
  type NotificationFacts,
  type NotificationKind,
} from "../../constants/notification-catalog";
import { NOTIFICATION_FACT_LOADERS } from "./kind-sources";
import { resolveNotificationRecipients } from "./recipients";
import { invalidateNotificationSwitch, isSwitchSettingWrite, notificationsEnabled } from "./notification-switch";
import type { AuditHookCall } from "./audit-hook";

/** Yazar çözülemezse metindeki ad. */
export const UNKNOWN_AUTHOR_NAME = "Sistem";

export interface ProducedNotification {
  readonly eventId: string;
  readonly authorUserId: string | null;
  readonly recipients: readonly string[];
}

let faultForTests: (() => void | Promise<void>) | null = null;
/** Bekçi sondası: üreticinin içinde hata fırlatır ya da bekler (fabrika yazması ne düşmeli ne gecikmeli). */
export function __setNotificationFaultForTests(fn: (() => void | Promise<void>) | null): void {
  faultForTests = fn;
}

/** Kancanın gövdesi. Fırlatabilir — çağıran (`audit-hook`) yutar ve loglar. */
export async function onAuditCall(call: AuditHookCall, kind: NotificationKind | null): Promise<void> {
  if (isSwitchSettingWrite(call.tableName, call.recordId)) {
    invalidateNotificationSwitch();
    return;
  }
  if (!kind) return;
  if (!(await notificationsEnabled())) return;
  await produceNotification(kind, call.recordId, call.userId ?? null);
}

interface ResolvedAuthor {
  readonly userId: string | null;
  readonly name: string;
}

async function resolveAuthor(kind: NotificationKind, facts: NotificationFacts, entityId: string, callUserId: string | null): Promise<ResolvedAuthor> {
  const def = notificationKindDef(kind);
  let userId = def.author === "record" ? (facts.createdById ?? callUserId) : callUserId;
  let fallbackName: string | null = null;
  const technicalUserId = userId ? await readPatronCloudUserId() : null;
  if (userId && technicalUserId && userId === technicalUserId) {
    // Telefon yolu: aktör teknik kullanıcıdır; gerçek yazar makbuzdaki bulut hesabıdır (= fabrika users.id).
    const receipt = await prisma.cloudInboxReceipt.findFirst({
      where: { entityId, outcome: "ISLENDI" },
      select: { cloudAccountId: true, cloudAccountName: true },
    });
    userId = receipt?.cloudAccountId ?? null;
    fallbackName = receipt?.cloudAccountName ?? null;
  }
  if (!userId) return { userId: null, name: fallbackName ?? UNKNOWN_AUTHOR_NAME };
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { id: true, fullName: true } });
  if (!user) return { userId: null, name: fallbackName ?? UNKNOWN_AUTHOR_NAME };
  return { userId: user.id, name: user.fullName };
}

const clip = (s: string, n: number): string => (s.length > n ? `${s.slice(0, n - 1)}…` : s);

/**
 * (tür, varlık) için olay + teslimleri doğurur. Varlık yoksa ya da olay zaten varsa null.
 * Şalteri SORMAZ — kanca sorar; doğrudan çağıran (bekçi, ileride tarama) kendi kararını verir.
 */
export async function produceNotification(kind: NotificationKind, entityId: string, callUserId: string | null): Promise<ProducedNotification | null> {
  if (faultForTests) await faultForTests();
  const existing = await prisma.notificationEvent.findUnique({ where: { kind_entityId: { kind, entityId } }, select: { id: true } });
  if (existing) return null;
  const facts = await NOTIFICATION_FACT_LOADERS[kind](entityId);
  if (!facts) return null;
  const author = await resolveAuthor(kind, facts, entityId, callUserId);
  const def = notificationKindDef(kind);
  const text = def.text(facts, author.name);
  const recipients = await resolveNotificationRecipients(kind, author.userId);
  const produced = await prisma.$transaction(async (tx): Promise<ProducedNotification | null> => {
    const created = await tx.notificationEvent.createMany({
      data: [{
        kind,
        entityId,
        authorUserId: author.userId,
        authorName: clip(author.name, 100),
        title: clip(text.title, 200),
        body: clip(text.body, 500),
        route: def.appRoute(entityId),
      }],
      skipDuplicates: true,
    });
    if (created.count === 0) return null;
    const event = await tx.notificationEvent.findUniqueOrThrow({ where: { kind_entityId: { kind, entityId } }, select: { id: true } });
    if (recipients.length > 0) {
      await tx.notificationDelivery.createMany({
        data: recipients.map((userId) => ({ userId, eventId: event.id })),
        skipDuplicates: true,
      });
    }
    return { eventId: event.id, authorUserId: author.userId, recipients };
  });
  // Ayrı denetim satırı YOK: olay, ebeveyn eylemin (sipariş/iş emri/sevk CREATE) denetim çağrısından doğar
  // (`AUDIT_EXEMPT_MODELS` EBEVEYN_EYLEMDE beyanı).
  return produced;
}
