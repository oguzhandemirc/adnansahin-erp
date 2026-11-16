// Bu cihaz anlık bildirim alabilir mi? Mağaza paketinde telefonda native push AÇIK (kullanıcı kararı 2026-11-17;
// 2026-10-15'teki "telefonda push yok" kararının yerine). İki kat: `NATIVE_PUSH` ANA ANAHTARDIR (literal; geri dönüş
// tek satırdır) · `NATIVE_PUSH_ETKIN` = ana anahtar ∧ derleme kapısı (`app.config.js` → `extra.nativePush`, yalnız
// bildirimli derlemede) ∧ native modül bağlı (fail-closed). Bildirimsiz derlenen pakette etkin kapı yine kapalıdır.
// Native modüle dokunan kod yalnız etkin kapıyla `require` edilir.
import Constants from "expo-constants";
import { requireOptionalNativeModule } from "expo";

export const NATIVE_PUSH = true;

export function nativePushEnabled(extra: unknown, moduleLinked: boolean): boolean {
  return moduleLinked && typeof extra === "object" && extra !== null && (extra as { nativePush?: unknown }).nativePush === true;
}

function moduleLinked(): boolean {
  try {
    return requireOptionalNativeModule("ExpoPushTokenManager") !== null;
  } catch {
    return false;
  }
}

export const NATIVE_PUSH_ETKIN: boolean = NATIVE_PUSH && nativePushEnabled(Constants.expoConfig?.extra, moduleLinked());

export function pushAvailable(os: string, nativePush: boolean = NATIVE_PUSH_ETKIN): boolean {
  return os === "web" || nativePush;
}

export const NATIVE_PUSH_SOON = "Bu cihazda anlık bildirim yakında geliyor. Şimdilik bildirimleri web sürümünden (tarayıcıdan) alabilirsiniz.";
