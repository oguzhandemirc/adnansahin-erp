// =============================================================================
// Bildirim kutusu — oturumlu kullanıcının KENDİ teslimleri (2.13.0, D1)
// =============================================================================
// Liste (cursor, yeniden eskiye) + okunmamış sayısı · tek teslimi okundu işaretle · tümünü okundu işaretle.
// Okundu geçişi atomik claim'dir (`updateMany WHERE {id, userId, readAt: null}`) ve idempotenttir: zaten
// okunmuş teslim 200 döner, başkasının ya da olmayan teslim 404 `BILDIRIM_YOK` (varlık sızdırılmaz).
// Okundu işareti kişinin kendi kutusudur; denetim satırı yazılmaz (`AUDIT_EXEMPT_MODELS` KULLANICI_TERCIHI beyanı).
// =============================================================================

import type { Prisma } from "@prisma/client";
import prisma from "../../lib/prisma";
import { AppError } from "../../utils/app-error";
import type { ApiResponse } from "../../types/api.types";
import { buildNextCursor, cursorWhere, decodeCursor } from "../../utils/cursor";
import { NOTIFICATION_KINDS, isNotificationKind } from "../../constants/notification-catalog";
import { notificationsEnabled } from "./notification-switch";

export const NOTIFICATION_LIST_DEFAULT_LIMIT = 30;
export const NOTIFICATION_LIST_MAX_LIMIT = 100;
export const NOTIFICATION_NOT_FOUND_CODE = "BILDIRIM_YOK";

const DELIVERY_SELECT = {
  id: true,
  readAt: true,
  createdAt: true,
  event: { select: { id: true, kind: true, entityId: true, authorName: true, title: true, body: true, route: true, createdAt: true } },
} satisfies Prisma.NotificationDeliverySelect;

export interface NotificationDto {
  /** Teslim kimliği (okundu uçları bunu alır). */
  readonly id: string;
  readonly eventId: string;
  readonly kind: string;
  /** Konu başlığı anahtarı (`siparisler` · `uretim` · `sevkiyat` …); katalog dışı türde null. */
  readonly topic: string | null;
  readonly entityId: string;
  readonly authorName: string;
  readonly title: string;
  readonly body: string;
  /** Telefon uygulaması rotası; panel rotayı `kind` + `entityId`den kurar. */
  readonly route: string | null;
  readonly createdAt: Date;
  readonly readAt: Date | null;
}

export interface NotificationListDto {
  readonly items: NotificationDto[];
  readonly unreadCount: number;
  /** Üretim şalteri (`notifications.enabled`); kapalıyken liste yalnız geçmişi gösterir. */
  readonly enabled: boolean;
  readonly nextCursor: string | null;
  readonly hasMore: boolean;
  readonly limit: number;
}

type DeliveryRow = Prisma.NotificationDeliveryGetPayload<{ select: typeof DELIVERY_SELECT }>;

function toDto(r: DeliveryRow): NotificationDto {
  const kind = r.event.kind;
  return {
    id: r.id,
    eventId: r.event.id,
    kind,
    topic: isNotificationKind(kind) ? NOTIFICATION_KINDS[kind].topic : null,
    entityId: r.event.entityId,
    authorName: r.event.authorName,
    title: r.event.title,
    body: r.event.body,
    route: r.event.route,
    createdAt: r.createdAt,
    readAt: r.readAt,
  };
}

export async function listMyNotifications(
  input: { cursor?: string; limit?: number; unreadOnly?: boolean },
  userId: string,
): Promise<ApiResponse<NotificationListDto>> {
  const limit = Math.min(NOTIFICATION_LIST_MAX_LIMIT, Math.max(1, input.limit ?? NOTIFICATION_LIST_DEFAULT_LIMIT));
  const where: Prisma.NotificationDeliveryWhereInput = { userId, ...(input.unreadOnly ? { readAt: null } : {}) };
  const cur = decodeCursor(input.cursor);
  if (input.cursor && !cur) throw AppError.badRequest("Geçersiz sayfa imleci.", { code: "CURSOR_INVALID" });
  const rows = await prisma.notificationDelivery.findMany({
    where: cur ? { AND: [where, cursorWhere(cur)] } : where,
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: limit + 1,
    select: DELIVERY_SELECT,
  });
  const unreadCount = await prisma.notificationDelivery.count({ where: { userId, readAt: null } });
  const enabled = await notificationsEnabled();
  const hasMore = rows.length > limit;
  const page = hasMore ? rows.slice(0, limit) : rows;
  return {
    success: true,
    data: {
      items: page.map(toDto),
      unreadCount,
      enabled,
      nextCursor: hasMore ? buildNextCursor(page[page.length - 1]) : null,
      hasMore,
      limit,
    },
  };
}

/** Tek teslimi okundu işaretle — idempotent; başkasının/olmayan teslim 404. */
export async function markNotificationRead(
  deliveryId: string,
  userId: string,
): Promise<ApiResponse<{ id: string; readAt: Date; unreadCount: number }>> {
  const now = new Date();
  const claim = await prisma.notificationDelivery.updateMany({ where: { id: deliveryId, userId, readAt: null }, data: { readAt: now } });
  const row = await prisma.notificationDelivery.findFirst({ where: { id: deliveryId, userId }, select: { id: true, readAt: true } });
  if (!row || !row.readAt) {
    throw AppError.notFound("Bildirim bulunamadı.", { code: NOTIFICATION_NOT_FOUND_CODE });
  }
  const unreadCount = await prisma.notificationDelivery.count({ where: { userId, readAt: null } });
  return { success: true, data: { id: row.id, readAt: row.readAt, unreadCount }, message: claim.count === 1 ? "Okundu işaretlendi." : "Zaten okunmuştu." };
}

/** Kişinin okunmamış bütün teslimlerini okundu işaretle. */
export async function markAllNotificationsRead(userId: string): Promise<ApiResponse<{ updated: number; unreadCount: number }>> {
  const r = await prisma.notificationDelivery.updateMany({ where: { userId, readAt: null }, data: { readAt: new Date() } });
  return { success: true, data: { updated: r.count, unreadCount: 0 } };
}
