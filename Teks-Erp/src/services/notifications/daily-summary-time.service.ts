// =============================================================================
// GÜN SONU ÖZETİ SAATİ — panelin oku/yaz adımı (2.13.0, D6b)
// =============================================================================
// Anahtar `notifications.dailySummaryTime` ("SS:DD", fabrika günü; varsayılan 18:30). Okuyucu tek kaynak
// `readNotificationDailySummaryMinute` (iş bunu okur); burası yalnız panel sayfasının uçlarıdır (`/api/bildirim-atamalari/
// gun-sonu-saati`, izin `bildirim:yonet`). Yazım ayar servisinin TEK yazma boğazından geçer (audit + önbellek tazeleme).
// Biçim SUNUCUDA doğrulanır: geçersiz saat 400 — okuyucunun "geçersiz → varsayılan" davranışı sessiz kayba dönmesin.
// =============================================================================

import { AppError } from "../../utils/app-error";
import {
  DEFAULT_NOTIFICATION_DAILY_SUMMARY_MINUTE,
  SETTING_KEYS,
  parseDailySummaryTime,
  readNotificationDailySummaryMinute,
  systemSettingService,
} from "../system-setting.service";

export interface DailySummaryTimeView {
  /** Etkin saat ("SS:DD"). */
  readonly time: string;
  /** Varsayılan saat ("SS:DD"). */
  readonly defaultTime: string;
}

/** Gün dakikası → "SS:DD". */
export function formatDayMinute(min: number): string {
  return `${String(Math.floor(min / 60)).padStart(2, "0")}:${String(min % 60).padStart(2, "0")}`;
}

async function view(): Promise<DailySummaryTimeView> {
  return { time: formatDayMinute(await readNotificationDailySummaryMinute()), defaultTime: formatDayMinute(DEFAULT_NOTIFICATION_DAILY_SUMMARY_MINUTE) };
}

export async function setDailySummaryTime(time: string, userId: string | undefined): Promise<{ success: true; data: DailySummaryTimeView }> {
  const min = parseDailySummaryTime(time);
  if (min === null) throw AppError.badRequest("Saat SS:DD biçiminde olmalı (ör. 18:30).", { code: "GECERSIZ_SAAT" });
  await systemSettingService.set(SETTING_KEYS.NOTIFICATIONS_DAILY_SUMMARY_TIME, formatDayMinute(min), "Gün sonu özeti bildirim saati", userId);
  return { success: true, data: await view() };
}

export async function getDailySummaryTime(): Promise<{ success: true; data: DailySummaryTimeView }> {
  return { success: true, data: await view() };
}
