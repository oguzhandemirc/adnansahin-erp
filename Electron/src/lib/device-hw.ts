/**
 * Masaüstü announce'unun donanım özeti (`hw`) — 2026-11-13, ana ürün PR #134'ten elle taşındı.
 *
 * Özeti ana süreç hesaplar (ham makine kimliği renderer'a gelmez). Anahtar sabitlenmiş kurulum
 * kimliğidir; sabitleme yoksa (ilk girişten önce ya da güvenli depo okunamazken) bağlanılan
 * sunucunun kimliği `discovery.probe` ile alınır — mobildeki `resolveInstallationId` ile aynı sıra.
 *
 * Herhangi bir adım düşerse `null` → `hw` GÖNDERİLMEZ, announce gövdesi bugünküyle aynıdır.
 * Backend `device.autoReattachKnownHardware` KAPALIYKEN (varsayılan) `hw` yok sayılır; eski
 * backend (2.11.7) bilinmeyen alanı Zod strip ile atar.
 */
import type { HwClaim } from "@shared/ipc-contract";
import { getActiveApiBaseUrl } from "@/lib/api-config";

export async function resolveHwClaim(): Promise<HwClaim | null> {
  const api = typeof window !== "undefined" ? window.api : undefined;
  const bridge = api?.deviceIdentity;
  if (!bridge) return null;
  try {
    const first = await bridge.describe(null);
    if (first.hw || !first.needsKey) return first.hw;
    const found = await api?.discovery?.probe(getActiveApiBaseUrl());
    const installationId = found?.identity?.installationId ?? null;
    if (!installationId) return null;
    return (await bridge.describe(installationId)).hw;
  } catch {
    return null;
  }
}

/** Announce gövdesi: `hw` yalnız varsa eklenir; yoksa gövde bugünküyle BAYT-EŞİT. */
export function buildAnnounceBody(
  base: { deviceId: string; name: string; kind: "DESKTOP" },
  hw: HwClaim | null,
): { deviceId: string; name: string; kind: "DESKTOP"; hw?: HwClaim } {
  return hw ? { ...base, hw } : { ...base };
}
