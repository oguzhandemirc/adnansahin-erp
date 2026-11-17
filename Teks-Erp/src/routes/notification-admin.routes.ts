// =============================================================================
// TeksERP - Bildirim ATAMA yönetimi (2.13.0, D2) — /api/bildirim-atamalari
// =============================================================================
// Kişiye ve rol şablonuna hangi bildirim türlerinin atandığı. Toplu kapı: `verifyToken` + `bildirim:yonet`.
// Atama izin kodu değildir: yazım `tokenVersion` artırmaz. İnce handler: Zod parse → servis → res.json.
// =============================================================================

import { Router, type NextFunction, type Request, type Response } from "express";
import { z } from "zod";
import { verifyToken } from "../middlewares/auth.middleware";
import { requirePermission } from "../middlewares/rbac.middleware";
import {
  getTemplateNotificationAssignments,
  getUserNotificationAssignments,
  listNotificationTemplates,
  listNotificationUsers,
  setTemplateNotificationAssignments,
  setUserNotificationAssignments,
} from "../services/notifications/notification-assignment.service";
import { getDailySummaryTime, setDailySummaryTime } from "../services/notifications/daily-summary-time.service";

const router = Router();

// Toplu kapı: bu satırdan SONRA tanımlanan her uç kimlik + `bildirim:yonet` ister.
// Kod literal (statik çözüm, test_permission_catalog); `NOTIFICATION_MANAGE_PERMISSION` ile aynı değer.
router.use(verifyToken, requirePermission("bildirim:yonet"));

const userParam = z.object({ userId: z.uuid({ message: "Geçersiz kullanıcı kimliği." }) });
const templateParam = z.object({ templateId: z.uuid({ message: "Geçersiz şablon kimliği." }) });
const kindsBody = z.object({
  kinds: z.array(z.string().min(1).max(64), { message: "Bildirim türleri liste olmalı." }).max(100),
});

/**
 * @openapi
 * /api/bildirim-atamalari/kullanicilar:
 *   get:
 *     tags: [Bildirim]
 *     summary: Bildirim atanabilen kişiler
 *     description: >
 *       Aktif, silinmemiş, teknik ve yalnız-saha olmayan kullanıcılar. `data.items[]` (id, username, fullName,
 *       isSystemAccount, assignedCount, canChangePreference). İzin `bildirim:yonet`.
 *     security: [{ bearerAuth: [] }]
 */
router.get("/kullanicilar", async (_req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    res.status(200).json(await listNotificationUsers());
  } catch (error) {
    next(error);
  }
});

/**
 * @openapi
 * /api/bildirim-atamalari/kullanicilar/{userId}:
 *   get:
 *     tags: [Bildirim]
 *     summary: Kişinin bildirim atamaları
 *     description: >
 *       `data.user`, `data.canChangePreference`, `data.kinds[]` (kind, topic, label, dataPermission, assigned,
 *       mutedByUser, lockedReason — doluysa veri izni yok, atanamaz). Atanamayan kişi 409 BILDIRIM_KULLANICI_UYGUN_DEGIL.
 *     parameters:
 *       - in: path
 *         name: userId
 *         required: true
 *         schema: { type: string, format: uuid }
 *     security: [{ bearerAuth: [] }]
 *   put:
 *     tags: [Bildirim]
 *     summary: Kişinin bildirim atamalarını hedef kümeye eşitle
 *     description: >
 *       Gövde `{ kinds: string[] }`. Tanınmayan tür 400 BILDIRIM_TURU_GECERSIZ; veri izni olmayan tür 409
 *       BILDIRIM_VERI_IZNI_YOK (hiçbir şey yazılmaz). Oturum düşmez. Yanıt GET ile aynı.
 *     parameters:
 *       - in: path
 *         name: userId
 *         required: true
 *         schema: { type: string, format: uuid }
 *     security: [{ bearerAuth: [] }]
 */
router.get("/kullanicilar/:userId", async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { userId } = userParam.parse(req.params);
    res.status(200).json(await getUserNotificationAssignments(userId));
  } catch (error) {
    next(error);
  }
});

router.put("/kullanicilar/:userId", async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { userId } = userParam.parse(req.params);
    const { kinds } = kindsBody.parse(req.body);
    res.status(200).json(await setUserNotificationAssignments(userId, kinds, req.user?.userId));
  } catch (error) {
    next(error);
  }
});

/**
 * @openapi
 * /api/bildirim-atamalari/sablonlar:
 *   get:
 *     tags: [Bildirim]
 *     summary: Rol şablonları ve bildirim seti sayısı
 *     description: "`data.items[]` (id, name, isActive, assignedCount). İzin `bildirim:yonet`."
 *     security: [{ bearerAuth: [] }]
 */
router.get("/sablonlar", async (_req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    res.status(200).json(await listNotificationTemplates());
  } catch (error) {
    next(error);
  }
});

/**
 * @openapi
 * /api/bildirim-atamalari/sablonlar/{templateId}:
 *   get:
 *     tags: [Bildirim]
 *     summary: Rol şablonunun bildirim seti
 *     description: >
 *       `data.template` (id, name, isActive), `data.kinds[]` (kind, topic, label, dataPermission, assigned,
 *       lockedReason — şablonun izinlerinde veri izni yoksa dolu).
 *     parameters:
 *       - in: path
 *         name: templateId
 *         required: true
 *         schema: { type: string, format: uuid }
 *     security: [{ bearerAuth: [] }]
 *   put:
 *     tags: [Bildirim]
 *     summary: Şablonun bildirim setini hedef kümeye eşitle
 *     description: >
 *       Gövde `{ kinds: string[] }`. Mevcut kişiler ETKİLENMEZ; set yalnız şablon kişiye uygulanırken kopyalanır.
 *       Veri izni olmayan tür 409 BILDIRIM_VERI_IZNI_YOK.
 *     parameters:
 *       - in: path
 *         name: templateId
 *         required: true
 *         schema: { type: string, format: uuid }
 *     security: [{ bearerAuth: [] }]
 */
router.get("/sablonlar/:templateId", async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { templateId } = templateParam.parse(req.params);
    res.status(200).json(await getTemplateNotificationAssignments(templateId));
  } catch (error) {
    next(error);
  }
});

router.put("/sablonlar/:templateId", async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { templateId } = templateParam.parse(req.params);
    const { kinds } = kindsBody.parse(req.body);
    res.status(200).json(await setTemplateNotificationAssignments(templateId, kinds, req.user?.userId));
  } catch (error) {
    next(error);
  }
});

// Biçim (SS:DD) serviste doğrulanır (tek yer); burada yalnız tip.
const timeBody = z.object({ time: z.string({ message: "Saat gerekli." }).max(10) });

/**
 * @openapi
 * /api/bildirim-atamalari/gun-sonu-saati:
 *   get:
 *     tags: [Bildirim]
 *     summary: Gün sonu özeti bildiriminin saati
 *     description: "`data.time` (etkin, SS:DD) · `data.defaultTime` (18:30). İzin `bildirim:yonet`."
 *     security: [{ bearerAuth: [] }]
 *   put:
 *     tags: [Bildirim]
 *     summary: Gün sonu özeti saatini değiştir
 *     description: "Gövde `{ time: \"SS:DD\" }`; biçim dışı 400 GECERSIZ_SAAT. Fabrika günü (İstanbul). İzin `bildirim:yonet`."
 *     security: [{ bearerAuth: [] }]
 */
router.get("/gun-sonu-saati", async (_req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    res.status(200).json(await getDailySummaryTime());
  } catch (error) {
    next(error);
  }
});

router.put("/gun-sonu-saati", async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { time } = timeBody.parse(req.body);
    res.status(200).json(await setDailySummaryTime(time, req.user?.userId));
  } catch (error) {
    next(error);
  }
});

export default router;
