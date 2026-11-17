// =============================================================================
// AuditService.log → bildirim kancası (2.13.0, D1) — kullanıcı onayı 2026-11-17
// =============================================================================
// Denetim satırı OKUNMAZ: kanca yalnız çağrının canlı argümanlarını (eylem · tablo · kayıt · userId) görür;
// tür/metin durum tablosundan yeniden okunur (`producer.ts`). Fabrikanın yazmasını ASLA durdurmaz ve
// geciktirmez: senkron süzgeç + beklenmeyen (fire-and-forget) iş; her hata yutulur ve loglanır.
// Statik import yalnız saf katalog — `audit.service` ile yükleme döngüsü kurulmasın diye üretici tembel yüklenir.
// =============================================================================

import { notificationKindForAudit } from "../../constants/notification-catalog";

export interface AuditHookCall {
  readonly userId: string | undefined;
  readonly action: string;
  readonly tableName: string;
  readonly recordId: string;
}

const pending = new Set<Promise<void>>();

/** Kancanın tek girişi. Asla fırlatmaz, asla beklenmez. Türsüz çağrıda sıfır iş (bugünkü davranış). */
export function notifyAuditCall(call: AuditHookCall): void {
  try {
    const kind = notificationKindForAudit(call.action, call.tableName);
    if (!kind && call.tableName !== "SYSTEM_SETTING") return;
    const p: Promise<void> = import("./producer")
      .then((m) => m.onAuditCall(call, kind))
      .catch(async (err: unknown) => {
        try {
          const { hata } = await import("../../lib/logger");
          hata("bildirim", "Bildirim kancası hatası (yutuldu)", err);
        } catch {
          // log da düşerse yapacak bir şey yok — fabrikanın yazması etkilenmez.
        }
      })
      .finally(() => {
        pending.delete(p);
      });
    pending.add(p);
  } catch {
    // Senkron süzgeç fırlatmaz; yine de kanca hiçbir koşulda çağıranı bozmasın.
  }
}

/** Bekçi/kapanış için: kuyruktaki bildirim işleri bitene kadar bekler (istek yolu bunu ÇAĞIRMAZ). */
export async function flushNotificationHook(): Promise<void> {
  while (pending.size > 0) await Promise.allSettled([...pending]);
}
