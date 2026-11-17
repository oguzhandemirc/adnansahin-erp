import { z } from "zod";

/** `PUT /api/bildirim-atamalari/{kullanicilar|sablonlar}/:id` gövdesi — backend `kindsBody` ile aynı sınırlar (tür ≤ 64, ≤ 100). */
export const kindsPayloadSchema = z.object({
  kinds: z.array(z.string().min(1).max(64)).max(100),
});

export type KindsPayload = z.infer<typeof kindsPayloadSchema>;

/** `PUT /api/bildirim-atamalari/gun-sonu-saati` gövdesi — biçim (SS:DD) sunucuda da doğrulanır (400 GECERSIZ_SAAT). */
export const dailySummaryTimePayloadSchema = z.object({
  time: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Saat SS:DD olmalı"),
});
