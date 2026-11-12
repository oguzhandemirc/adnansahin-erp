// =============================================================================
// TeksERP - Oturum (Session) okuma uçları — Sistem → Bağlı Cihazlar
// =============================================================================
// Salt okuma: açık oturumların kullanıcı/cihaz/sürüm listesi. Yazma ucu YOK;
// oturum iptali kendi yollarında (logout · kick · şifre sıfırlama) kalır.
// =============================================================================

import { Router, type NextFunction, type Request, type Response } from "express";
import { z } from "zod";
import { verifyToken } from "../middlewares/auth.middleware";
import { requireAnyPermission } from "../middlewares/rbac.middleware";
import {
  ACTIVE_SESSION_DEFAULT_LIMIT,
  ACTIVE_SESSION_MAX_LIMIT,
  listActiveSessions,
} from "../services/active-session.service";

const router = Router();

// Toplu kapı (BE-30): bu satırdan SONRA tanımlanan her uç kimlik + izin ister.
router.use(verifyToken, requireAnyPermission("admin:settings", "system:sessions"));

const activeQuerySchema = z.object({
  limit: z.coerce
    .number()
    .int()
    .min(1)
    .max(ACTIVE_SESSION_MAX_LIMIT)
    .default(ACTIVE_SESSION_DEFAULT_LIMIT),
});

/**
 * @openapi
 * /api/sessions/active:
 *   get:
 *     tags: [Admin]
 *     summary: Bağlı cihazlar — açık oturumların kullanıcı, cihaz ve uygulama sürümü
 *     description: >
 *       İptal edilmemiş ve süresi dolmamış oturumlar, son görülme azalan
 *       (görülmemiş olanlar sonda). `limit` varsayılan 200, en çok 500;
 *       fazlası varsa `truncated=true`. Yanıtta jti/token alanı yoktur; cihaz
 *       kimliği yalnız ilk 8 hanesiyle (`deviceRef`) döner.
 *     parameters:
 *       - in: query
 *         name: limit
 *         schema: { type: integer, minimum: 1, maximum: 500, default: 200 }
 *     security: [{ bearerAuth: [] }]
 */
router.get(
  "/active",
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { limit } = activeQuerySchema.parse(req.query);
      res.status(200).json(await listActiveSessions({ limit }));
    } catch (error) {
      next(error);
    }
  },
);

export default router;
