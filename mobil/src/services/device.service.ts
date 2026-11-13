import { apiClient } from './api';
import { getPinnedInstallationId } from '../store/baseUrlStore';
import { parseIdentityPayload, DISCOVERY_IDENTITY_PATH } from '../lib/discovery';
import { getHardwareDigest } from '../utils/hardwareId';

export type DeviceAssignmentStatus = 'PENDING' | 'APPROVED' | 'INACTIVE' | 'UNKNOWN';

export interface DeviceAssignment {
  /**
   * Cihaz onayı ZORUNLU mu? Kararı sunucu taşır (2026-09-04) — onay ekranı
   * koşulu `pairingRequired && status !== 'APPROVED'` (bkz.
   * `navigation/pairingGate.ts`). Alanı taşımayan ESKİ backend'de undefined
   * gelir; o durumda `/devices/pairing-required` ucu taban olur.
   */
  pairingRequired?: boolean;
  status: DeviceAssignmentStatus;
  machineId: string | null;
  machineCode: string | null;
  machineName: string | null;
  stationId: string | null;
  stationName: string | null;
}

/**
 * Özetin anahtarı: sabitlenmiş kurulum kimliği; kaldır-kur sonrası (sabitleme silinmiş)
 * announce edilen sunucunun kendi kimliği. Bulunamazsa null → `hw` gönderilmez.
 * Kaynak: ana ürün PR #163 (D2), elle taşındı.
 */
async function resolveInstallationId(): Promise<string | null> {
  const pinned = await getPinnedInstallationId().catch(() => null);
  if (pinned && pinned.trim()) return pinned.trim();
  try {
    const r = await apiClient.get(DISCOVERY_IDENTITY_PATH.replace(/^\/api/, ''), { timeout: 4000 });
    return parseIdentityPayload(r.data?.data ?? r.data)?.installationId ?? null;
  } catch {
    return null;
  }
}

/**
 * announce gövdesi: `hw` yalnız okunabildiyse eklenir. Eski backend bilinmeyen `hw`yi atar
 * (şema katı değil); yeni backend `device.autoReattachKnownHardware` KAPALIYKEN yok sayar.
 * Özet hesaplanamazsa gövde bugünküyle aynıdır.
 */
export async function buildAnnounceBody(input: { deviceId: string; name?: string }) {
  const hw = getHardwareDigest(await resolveInstallationId());
  return { ...input, ...(hw ? { hw } : {}) };
}

export const deviceService = {
  /**
   * Tablet boot'ta kendini bildirir. Bilinmiyorsa backend PENDING kaydı açar
   * (admin onaylar+atar). Mevcut atama durumunu döner.
   */
  announce: async (input: { deviceId: string; name?: string }): Promise<DeviceAssignment> =>
    apiClient
      .post<{ success: boolean; data: DeviceAssignment }>('/devices/announce', await buildAnnounceBody(input))
      .then((r) => r.data.data),

  /** Atama durumunu poll'la (x-device-id header interceptor'dan eklenir). */
  getStatus: (): Promise<DeviceAssignment> =>
    apiClient
      .get<{ success: boolean; data: DeviceAssignment }>('/devices/status')
      .then((r) => r.data.data),

  /**
   * Login öncesi public gate: cihaz onayı/ataması zorunlu mu? false (default) ise
   * pasif — uygulama "atama bekleniyor" ekranını atlayıp doğrudan Login'e geçer.
   * Hata/erişimsizlikte false (pasif varsayım — operatör en azından Login'e ulaşır).
   */
  getAssignmentRequired: (): Promise<boolean> =>
    apiClient
      .get<{ success: boolean; data: { required: boolean } }>('/devices/pairing-required')
      .then((r) => r.data?.data?.required ?? false)
      .catch(() => false),
};
