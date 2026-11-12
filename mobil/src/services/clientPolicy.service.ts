// =============================================================================
// TeksERP Mobil — istemci sürüm politikası ("bu backend hangi tableti bekliyor")
// =============================================================================
// Deploy sırası pazarlık dışı: **backend ÖNCE** gider. Bu, yeni bir API
// sözleşmesi çıktığında sahada bir süre ESKİ tabletlerin çalışması demektir —
// ve nasıl bozulacakları sözleşmeye bağlıdır: bazen 400 döner (görünür), bazen
// alan SESSİZCE düşer (görünmez, en tehlikelisi).
//
// Tek eksen uygulama sürümüdür (`versionName`): kod yalnız Play'den gelen yeni
// sürümle değişir. Eski tablet Play'in zorunlu (immediate) akışına yönlendirilir.
//
// ⚠️ FAIL-OPEN: politika okunamaz/bozuk/404 ise tablet KİLİTLENMEZ. Bu, bu
// projenin genel fail-closed eğiliminin bilinçli istisnasıdır — "kapalı"
// tarafın bedeli, tek bozuk yanıt yüzünden fabrikanın durmasıdır.
// =============================================================================

import { apiClient } from './api';

export interface IstemciPolitikasi {
  minVersion: string;
  currentVersion: string;
  message?: string;
}

/** Politikayı FABRİKA BACKEND'inden okur (güncelleme kanalından DEĞİL). */
// Politika, backend sözleşmesi hakkındadır; dolayısıyla onu servis eden yer de
// o backend'dir. Kanal (VPS) ile politika AYRI eksenler — ve politika bu
// sayede kendiliğinden müşteriye özeldir: her fabrikanın kendi backend'i var.
export async function politikaOku(): Promise<IstemciPolitikasi | null> {
  try {
    const { data } = await apiClient.get<{ data: IstemciPolitikasi }>('/client-policy/mobil');
    const p = data?.data;
    return p && typeof p.minVersion === 'string' ? p : null;
  } catch {
    // 404 = "bu istemci için kural yok" · ağ hatası = "kural okunamadı".
    // İkisi de fail-open: tablet kilitlenmez.
    return null;
  }
}

/* ------------------------------------------------------------------ *
 * Karar — SAF
 * ------------------------------------------------------------------ */

/** `2.9.10` > `2.9.9` — sözlüksel karşılaştırma YANLIŞ cevap verirdi. */
export function surumKarsilastir(a: string, b: string): number {
  const p = (v: string) => String(v).split('.').map((x) => parseInt(x, 10) || 0);
  const [x, y] = [p(a), p(b)];
  for (let i = 0; i < Math.max(x.length, y.length); i++) {
    const f = (x[i] ?? 0) - (y[i] ?? 0);
    if (f !== 0) return f < 0 ? -1 : 1;
  }
  return 0;
}

export type EskilikSebebi = 'apk' | null;

export interface PolitikaDurumu {
  /** Tablet politikanın altında mı. */
  eski: boolean;
  /** Hangi eksenden düştü — mesajı ve çözümü belirler. */
  sebep: EskilikSebebi;
}

/**
 * Tabletin politikayı karşılayıp karşılamadığına karar verir. Sunucu eski
 * sürümlerin gönderdiği ek alanları (ör. paket tarihi) taşıyabilir; okunmaz.
 */
export function politikaDegerlendir(args: {
  politika: IstemciPolitikasi | null;
  apkSurumu: string;
}): PolitikaDurumu {
  const { politika, apkSurumu } = args;
  // FAIL-OPEN: politika yoksa kilit yok.
  if (!politika) return { eski: false, sebep: null };
  if (surumKarsilastir(apkSurumu, politika.minVersion) < 0) {
    return { eski: true, sebep: 'apk' };
  }
  return { eski: false, sebep: null };
}

/**
 * Kilit KOŞULLUDUR — Electron'dan bilinçli fark.
 *
 * ⚠️ İnterneti kopuk bir tableti kilitlemek, güncellemeyi indiremediği için
 * ÇIKIŞI OLMAYAN bir üretim durmasıdır; üstelik cihaz çevrimdışı yazabiliyor.
 * Bu yüzden kilit yalnız düzeltme GERÇEKTEN kurulabilir durumdaysa kapanır.
 * Aksi halde kalıcı şerit gösterilir: uyarı kaybolmaz ama üretim durmaz.
 *
 * ⚠️ İkinci koşul veri kaybı önlemesi: gönderilmemiş kayıt varken kilitlemek,
 * operatörün elindeki işi kuyrukta bırakır. Yenileme kapısıyla aynı kural.
 */
export function kilitlenmeliMi(args: {
  durum: PolitikaDurumu;
  duzeltmeHazir: boolean;
  bekleyenYazim: number;
}): boolean {
  return args.durum.eski && args.duzeltmeHazir && args.bekleyenYazim === 0;
}
