// =============================================================================
// TeksERP - Bildirim kutusu uçları (2.13.0, D1) — /api/bildirimler
// =============================================================================
// Oturumlu kullanıcının KENDİ teslimleri: liste + okunmamış sayısı · tek teslimi okundu · tümünü okundu.
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

export default router;
