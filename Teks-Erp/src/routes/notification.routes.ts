// =============================================================================
// TeksERP - Bildirim kutusu uçları (2.13.0, D1) — /api/bildirimler
// =============================================================================
// Oturumlu kullanıcının KENDİ teslimleri: liste + okunmamış sayısı · tek teslimi okundu · tümünü okundu.
// D2: tür kataloğu (konu başlıklı) · kişinin KENDİ tercihi (yazma yalnız `bildirim:tercih`).
// İzin kodu YOK: kutu kişinin kendisidir; kimin ne alacağına atama + veri izni ÜRETİMDE karar verir.
// İnce handler: Zod parse → servis → res.json. Prisma import edilmez.
// =============================================================================

import { Router, type NextFunction, type Request, type Response } from "express";
import { z } from "zod";
import { verifyToken } from "../middlewares/auth.middleware";
import { AppError } from "../utils/app-error";
import {
  listMyNotifications,
  markAllNotificationsRead,
  markNotificationRead,
  NOTIFICATION_LIST_MAX_LIMIT,
} from "../services/notifications/notification-inbox.service";
import { requirePermission } from "../middlewares/rbac.middleware";
import { notificationCatalog } from "../services/notifications/notification-assignment.service";
import {
  getMyNotificationPreferences,
  setMyNotificationPreferences,
} from "../services/notifications/notification-preference.service";

const router = Router();

// Toplu kapı: bu satırdan SONRA tanımlanan her uç kimlik ister.
router.use(verifyToken);

const listQuerySchema = z.object({
  cursor: z.string().min(1).max(200).optional(),
  limit: z.coerce.number().int().min(1).max(NOTIFICATION_LIST_MAX_LIMIT).optional(),
  unreadOnly: z.enum(["true", "false"]).optional().transform((v) => v === "true"),
});
const idParamSchema = z.object({ id: z.uuid({ message: "Geçersiz bildirim kimliği." }) });

function actor(req: Request): string {
  const id = req.user?.userId;
  if (!id) throw AppError.unauthorized();
  return id;
}

/**
 * @openapi
 * /api/bildirimler:
 *   get:
 *     tags: [Bildirim]
 *     summary: Kendi bildirimlerim (yeniden eskiye) + okunmamış sayısı
 *     description: >
 *       Oturumlu kullanıcının teslimleri. `data.items[]` (id = teslim kimliği, kind, topic, entityId,
 *       authorName, title, body, route, createdAt, readAt), `data.unreadCount`, `data.enabled` (üretim
 *       şalteri), `data.nextCursor`/`hasMore`/`limit`. `unreadOnly=true` yalnız okunmamışlar.
 *     parameters:
 *       - in: query
 *         name: cursor
 *         schema: { type: string }
 *       - in: query
 *         name: limit
 *         schema: { type: integer, minimum: 1, maximum: 100, default: 30 }
 *       - in: query
 *         name: unreadOnly
 *         schema: { type: string, enum: ["true", "false"] }
 *     security: [{ bearerAuth: [] }]
 */
router.get("/", async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const q = listQuerySchema.parse(req.query);
    res.status(200).json(await listMyNotifications(q, actor(req)));
  } catch (error) {
    next(error);
  }
});

/**
 * @openapi
 * /api/bildirimler/tumu/okundu:
 *   post:
 *     tags: [Bildirim]
 *     summary: Bütün bildirimlerimi okundu işaretle
 *     description: Kişinin okunmamış teslimlerinin hepsi; `data.updated` kaç satırın değiştiğini söyler.
 *     security: [{ bearerAuth: [] }]
 */
router.post("/tumu/okundu", async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    res.status(200).json(await markAllNotificationsRead(actor(req)));
  } catch (error) {
    next(error);
  }
});

/**
 * @openapi
 * /api/bildirimler/{id}/okundu:
 *   post:
 *     tags: [Bildirim]
 *     summary: Tek bildirimi okundu işaretle (idempotent)
 *     description: >
 *       Zaten okunmuşsa yine 200. Başkasının ya da olmayan teslim 404 (`details.code` = `BILDIRIM_YOK`).
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string, format: uuid }
 *     security: [{ bearerAuth: [] }]
 */
router.post("/:id/okundu", async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { id } = idParamSchema.parse(req.params);
    res.status(200).json(await markNotificationRead(id, actor(req)));
  } catch (error) {
    next(error);
  }
});

const preferenceBody = z.object({
  items: z
    .array(z.object({ kind: z.string().min(1).max(64), muted: z.boolean() }))
    .min(1, { message: "En az bir tercih gönderilmeli." })
    .max(100),
});

function actorPermissions(req: Request): string[] {
  return req.user?.permissions ?? [];
}

/**
 * @openapi
 * /api/bildirimler/katalog:
 *   get:
 *     tags: [Bildirim]
 *     summary: Bildirim türü kataloğu (konu başlıklı)
 *     description: >
 *       `data.topics[]` (key, label, kinds[] — kind, label, dataPermission, missingPermissionText). Sıra = ekran sırası;
 *       türü olmayan başlık da döner (istemci boş başlığı çizmez).
 *     security: [{ bearerAuth: [] }]
 */
router.get("/katalog", (_req: Request, res: Response): void => {
  res.status(200).json(notificationCatalog());
});

/**
 * @openapi
 * /api/bildirimler/tercihler:
 *   get:
 *     tags: [Bildirim]
 *     summary: Kendi bildirim tercihlerim (yalnız atanmış türler)
 *     description: >
 *       `data.canChange` (`bildirim:tercih` var mı), `data.topics[]` (key, label), `data.items[]` (kind, topic, label,
 *       mutedByUser, required — tercih izni yoksa true: tür zorunlu).
 *     security: [{ bearerAuth: [] }]
 *   put:
 *     tags: [Bildirim]
 *     summary: Kendi bildirim tercihimi değiştir
 *     description: >
 *       İzin `bildirim:tercih` (yoksa 403). Gövde `{ items: [{ kind, muted }] }`. Atanmamış tür 409 BILDIRIM_ATANMAMIS
 *       (hiçbiri yazılmaz); tanınmayan tür 400 BILDIRIM_TURU_GECERSIZ. Yanıt GET ile aynı.
 *     security: [{ bearerAuth: [] }]
 */
router.get("/tercihler", async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    res.status(200).json(await getMyNotificationPreferences(actor(req), actorPermissions(req)));
  } catch (error) {
    next(error);
  }
});

router.put(
  "/tercihler",
  // Literal (statik çözüm); `NOTIFICATION_PREFERENCE_PERMISSION` ile aynı değer.
  requirePermission("bildirim:tercih"),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { items } = preferenceBody.parse(req.body);
      res.status(200).json(await setMyNotificationPreferences(actor(req), actorPermissions(req), items));
    } catch (error) {
      next(error);
    }
  },
);

export default router;
