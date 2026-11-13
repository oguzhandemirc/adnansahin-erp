// =============================================================================
// Donanım özeti (cihaz kimliği, 2026-11-13) — YALNIZ TANIMA, kimlik doğrulama değil.
// Kaldır-kur yerel kimliği (SecureStore UUID) siler; ANDROID_ID aynı imzayla kurulan
// pakette kalır. Backend `device.autoReattachKnownHardware` AÇIKKEN yeni yerel kimlikle
// gelen bilinen donanımı aynı kayda bağlar; KAPALIYKEN (varsayılan) özeti yok sayar.
// Ham değer cihazdan ÇIKMAZ: kurulum kimliğiyle tuzlanmış HMAC gönderilir (iki fabrika
// aynı tableti ilişkilendiremez). Biçim backend `computeHwDigest` ile BAYT-EŞİT.
// Kaynak: ana ürün PR #163 (D2) `mobil/src/utils/hardwareId.ts`, elle taşındı.
// =============================================================================

import { Platform } from 'react-native';
import * as Application from 'expo-application';
import { hmacSha256Hex, utf8Bytes } from '../lib/hmac-sha256';

export const HW_DIGEST_DOMAIN = 'tekserp/cihaz-donanim/v1';
export type HwSource = 'ANDROID_ID';

export interface HwClaim {
  v: 1;
  kaynak: HwSource;
  ozet: string;
}

/** Saf: HMAC-SHA256(anahtar = installationId, domain\nkaynak\nham) küçük harf hex. */
export function computeHwDigest(installationId: string, kaynak: HwSource, ham: string): string {
  return hmacSha256Hex(utf8Bytes(installationId), `${HW_DIGEST_DOMAIN}\n${kaynak}\n${ham}`);
}

/** Ham ANDROID_ID — yalnız bu dosyada okunur; okunamazsa null (özet gönderilmez). */
function readAndroidId(): string | null {
  if (Platform.OS !== 'android') return null;
  try {
    const v = Application.getAndroidId();
    return typeof v === 'string' && v.trim() ? v.trim() : null;
  } catch {
    return null;
  }
}

/**
 * Announce'a eklenecek `hw`. Kurulum kimliği yoksa null: anahtarsız özet başka fabrikayla
 * ilişkilendirilebilir olurdu. Dönüşte yalnız özet bulunur, ham değer bulunmaz.
 */
export function getHardwareDigest(installationId: string | null | undefined): HwClaim | null {
  const iid = (installationId ?? '').trim();
  if (!iid) return null;
  const ham = readAndroidId();
  if (!ham) return null;
  return { v: 1, kaynak: 'ANDROID_ID', ozet: computeHwDigest(iid, 'ANDROID_ID', ham) };
}
