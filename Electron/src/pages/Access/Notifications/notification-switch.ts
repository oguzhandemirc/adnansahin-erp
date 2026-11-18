// Bildirim ana şalteri (`notifications.enabled`) — kartın saf kuralları (bileşen yalnız çizer).
// Yazma ucu backend'de YALNIZ sistem hesabına açıktır (`SUPERADMIN_WRITE_SETTING_KEYS`, supap YOK):
// bu yüzden panel kapısı `isSuperadminGateOpen` DEĞİL, düz `isSystemAccount`tır.
import { isAxiosError } from "axios";

export const NOTIFICATIONS_ENABLED_KEY = "notifications.enabled";

/** Gün sonu özeti varsayılan saati (backend `DEFAULT_NOTIFICATION_DAILY_SUMMARY_MINUTE` aynası). */
export const DEFAULT_DAILY_SUMMARY_TIME = "18:30";

/** "SS:DD" → gün dakikası; geçersizse null. */
export function parseHm(v: string | null | undefined): number | null {
  const m = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(v ?? "");
  return m ? Number(m[1]) * 60 + Number(m[2]) : null;
}

/** Fabrika günü (Europe/Istanbul) içinde şu anki dakika — bilgisayarın saat diliminden bağımsız. */
export function istanbulMinuteOfDay(now: Date): number {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/Istanbul",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(now);
  const h = Number(parts.find((p) => p.type === "hour")?.value ?? 0);
  const min = Number(parts.find((p) => p.type === "minute")?.value ?? 0);
  return h * 60 + min;
}

/** Bugünün gün sonu özeti saati geçti mi? (saat okunamazsa varsayılan 18:30) */
export function isPastDailySummary(now: Date, time: string | null | undefined): boolean {
  const at = parseHm(time) ?? (parseHm(DEFAULT_DAILY_SUMMARY_TIME) as number);
  return istanbulMinuteOfDay(now) >= at;
}

export const ENABLE_TEXT = "Atanmış kişiler yeni olaylar için bildirim almaya başlar.";
export const LATE_SUMMARY_TEXT = "Gün sonu özeti saati geçtiği için bugünün özeti hemen gönderilir.";
export const DISABLE_TEXT = "Yeni bildirim üretilmez; geçmiş silinmez.";
export const LOCKED_NOTE = "Bildirimleri yalnız sistem yöneticisi açıp kapatabilir.";

/** Onay penceresinin metni. */
export function confirmCopy(turnOn: boolean, pastSummary: boolean): { title: string; description: string; confirmLabel: string } {
  if (!turnOn) return { title: "Bildirimler kapatılsın mı?", description: DISABLE_TEXT, confirmLabel: "Bildirimleri kapat" };
  return {
    title: "Bildirimler açılsın mı?",
    description: pastSummary ? `${ENABLE_TEXT}\n\n${LATE_SUMMARY_TEXT}` : ENABLE_TEXT,
    confirmLabel: "Bildirimleri aç",
  };
}

/** Yazma hatasının Türkçe, anlaşılır cümlesi (istek `suppressErrorToast` ile gider; tek toast buradan). */
export function switchErrorMessage(error: unknown): string {
  if (!isAxiosError(error)) return "Bildirim ayarı kaydedilemedi.";
  if (!error.response) return "Sunucuya ulaşılamıyor. Bağlantıyı kontrol edip tekrar deneyin.";
  const { status } = error.response;
  const body = error.response.data as { message?: string; details?: { code?: string } } | undefined;
  const code = body?.details?.code;
  if (code === "SUPERADMIN_ONLY") return `${LOCKED_NOTE} Bu oturum sistem yöneticisi hesabı değil.`;
  if (status === 401) return "Oturum süreniz doldu. Lütfen tekrar giriş yapın.";
  if (status === 403) return "Bu işlem için yetkiniz bulunmuyor.";
  if (status >= 500) return "Sunucu hatası. Bildirim ayarı kaydedilemedi, biraz sonra tekrar deneyin.";
  return body?.message || "Bildirim ayarı kaydedilemedi.";
}
