// =============================================================================
// AuditService.log → bildirim kancası (2.13.0, D1 + D6a) — kullanıcı onayı 2026-11-17
// =============================================================================
// Denetim satırı OKUNMAZ: kanca yalnız çağrının canlı argümanlarını (eylem · tablo · kayıt · userId ve `newData`nın
// katalogda adı geçen üst düzey etiketleri — `NOTIFICATION_TAG_FIELDS`) görür; tür/metin durum tablosundan yeniden
// okunur (`producer.ts`). Fabrikanın yazmasını ASLA durdurmaz ve geciktirmez: senkron süzgeç + beklenmeyen
// (fire-and-forget) iş; her hata yutulur ve loglanır.
// Toplu işlem (mal kabul fişi iptali, içe aktarım geri alma) kendi alt çağrılarını `withNotificationsSuppressed`
// içinde yapar: belge başına değil top/satır başına yağmur doğmasın.
// Statik import yalnız saf katalog — `audit.service` ile yükleme döngüsü kurulmasın diye üretici tembel yüklenir.
// =============================================================================

import { AsyncLocalStorage } from "node:async_hooks";
import { NOTIFICATION_TAG_FIELDS, notificationMatchesForAudit, type NotificationAuditMatch } from "../../constants/notification-catalog";

export interface AuditHookCall {
  readonly userId: string | undefined;
  readonly action: string;
  readonly tableName: string;
  readonly recordId: string;
  /** `newData`nın etiket alanları (string; boolean "true"/"false"). */
  readonly tags?: Readonly<Record<string, string>>;
}

const pending = new Set<Promise<void>>();
const suppressed = new AsyncLocalStorage<true>();

/** Bu blok içindeki denetim çağrıları bildirim doğurmaz (toplu işlem; belge düzeyi olay yoksa hiç). */
export function withNotificationsSuppressed<T>(fn: () => Promise<T>): Promise<T> {
  return suppressed.run(true, fn);
}

/** `newData`dan yalnız katalogda adı geçen üst düzey skaler alanlar. Asla fırlatmaz. */
export function auditCallTags(newData: Record<string, unknown> | null | undefined): Record<string, string> {
  const out: Record<string, string> = {};
  try {
    if (!newData || typeof newData !== "object") return out;
    for (const f of NOTIFICATION_TAG_FIELDS) {
      const v = newData[f];
      if (typeof v === "string") out[f] = v;
      else if (typeof v === "boolean") out[f] = v ? "true" : "false";
    }
  } catch {
    // Etiket okunamazsa kanca etiketsiz süzer (yalnız etiketsiz kaynaklar eşleşir).
  }
  return out;
}

/** Kancanın tek girişi. Asla fırlatmaz, asla beklenmez. Türsüz çağrıda sıfır iş (bugünkü davranış). */
export function notifyAuditCall(call: AuditHookCall): void {
  try {
    const isSetting = call.tableName === "SYSTEM_SETTING";
    const matches: NotificationAuditMatch[] = isSetting ? [] : notificationMatchesForAudit(call);
    if (matches.length === 0 && !isSetting) return;
    if (!isSetting && suppressed.getStore()) return;
    const p: Promise<void> = import("./producer")
      .then((m) => m.onAuditCall(call, matches))
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
