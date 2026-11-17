// =============================================================================
// Bildirim şalteri — süreç içi önbellek (2.13.0, D1)
// =============================================================================
// `notifications.enabled` kayıtsızken KAPALI. Kanca her sipariş/iş emri/sevk yaratımında şaltere bakar;
// her seferinde DB'ye sormamak için değer süreçte tutulur ve ayar yazıldığında düşürülür. Ayarın tek
// kullanıcı yazarı `SystemSettingService.set`tir ve o yol `AuditService.log({ tableName: "SYSTEM_SETTING",
// recordId: <anahtar> })` çağırır — kanca bu ÇAĞRI argümanını görünce önbelleği düşürür (satır okunmaz).
// Backend tek süreçtir; ikinci bir süreç önbelleği yoktur.
// =============================================================================

import { readNotificationsEnabled, SETTING_KEYS } from "../system-setting.service";

let cached: boolean | null = null;

/** Şalter açık mı? Süreç ömründe ilk çağrıda tek okuma, sonra önbellek. */
export async function notificationsEnabled(): Promise<boolean> {
  if (cached !== null) return cached;
  const v = await readNotificationsEnabled();
  cached = v;
  return v;
}

/** Ayar yazımı görüldü (ya da test) — sonraki çağrı yeniden okur. */
export function invalidateNotificationSwitch(): void {
  cached = null;
}

/** Bu denetim çağrısı şalter anahtarının yazımı mı? */
export function isSwitchSettingWrite(tableName: string, recordId: string): boolean {
  return tableName === "SYSTEM_SETTING" && recordId === SETTING_KEYS.NOTIFICATIONS_ENABLED;
}
