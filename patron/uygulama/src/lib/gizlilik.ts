// Gizlilik politikası ve hesap silme bağlantıları (2026-11-18): adres bulut kökeninden türetilir (`apiBaseUrl()` +
// `/gizlilik` · `/hesap-silme`; sayfaları bulut sunar, `patron/sunucu/src/http/legal/`). Alan adı koda yazılmaz; adres
// yoksa (bulutsuz derleme) bağlantı çizilmez. Tarayıcıda açılır; açılamazsa hata yutulur (bağlantı yardımcıdır).
import { Linking } from "react-native";
import { apiBaseUrl } from "./config";

export const GIZLILIK_YOLU = "/gizlilik";
export const HESAP_SILME_YOLU = "/hesap-silme";

export function gizlilikAdresi(kok: string | null = apiBaseUrl()): string | null {
  return kok ? `${kok}${GIZLILIK_YOLU}` : null;
}

export function hesapSilmeAdresi(kok: string | null = apiBaseUrl()): string | null {
  return kok ? `${kok}${HESAP_SILME_YOLU}` : null;
}

export function gizlilikAc(adres: string | null = gizlilikAdresi()): void {
  if (adres) void Linking.openURL(adres).catch(() => undefined);
}
