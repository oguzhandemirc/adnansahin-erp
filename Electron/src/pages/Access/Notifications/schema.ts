import { z } from "zod";

/** `PUT /api/bildirim-atamalari/{kullanicilar|sablonlar}/:id` gövdesi — backend `kindsBody` ile aynı sınırlar (tür ≤ 64, ≤ 100). */
export const kindsPayloadSchema = z.object({
  kinds: z.array(z.string().min(1).max(64)).max(100),
});

export type KindsPayload = z.infer<typeof kindsPayloadSchema>;
