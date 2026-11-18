// Gizlilik politikası bağlantısı (2026-11-18): adres bulut kökeninden türetilir (`apiBaseUrl()` + `/gizlilik`; sayfayı bulut
// sunar, `patron/sunucu/src/http/legal/`). Alan adı koda yazılmaz; adres yoksa (bulutsuz derleme) bağlantı çizilmez.
// Tarayıcıda açılır; açılamazsa hata yutulur (bağlantı yardımcıdır, akışı durdurmaz).
import { Linking } from "react-native";
import { apiBaseUrl } from "./config";

export const GIZLILIK_YOLU = "/gizlilik";

export function gizlilikAdresi(kok: string | null = apiBaseUrl()): string | null {
  return kok ? `${kok}${GIZLILIK_YOLU}` : null;
}

export function gizlilikAc(adres: string | null = gizlilikAdresi()): void {
  if (adres) void Linking.openURL(adres).catch(() => undefined);
}
