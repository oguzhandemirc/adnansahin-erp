/**
 * Bağlı Cihazlar ekranının saf yardımcıları (React'ten bağımsız, birim test
 * edilir): sürüm özeti, "güncel değil" kararı ve cihaz etiketi.
 */
import { compareVersions } from "@/lib/version-compare";
import type { ActiveSession, SessionDeviceType } from "./service";

export const DEVICE_TYPE_LABELS: Record<SessionDeviceType, string> = {
  ELECTRON: "Panel",
  MOBILE: "Tablet",
  WEB: "Web",
};

const TYPE_ORDER: SessionDeviceType[] = ["ELECTRON", "MOBILE", "WEB"];

/** Tanınmayan tür uydurulmaz, olduğu gibi basılır. */
export function deviceTypeLabel(t: string): string {
  return DEVICE_TYPE_LABELS[t as SessionDeviceType] ?? t;
}

/** Tür başına listede görülen EN YÜKSEK sürüm — "güncel" bunun adıdır. */
export function latestVersionByType(sessions: ActiveSession[]): Map<SessionDeviceType, string> {
  const out = new Map<SessionDeviceType, string>();
  for (const s of sessions) {
    if (!s.clientVersion) continue;
    const cur = out.get(s.deviceType);
    if (!cur || compareVersions(s.clientVersion, cur) > 0) out.set(s.deviceType, s.clientVersion);
  }
  return out;
}

/**
 * Aynı türün en yüksek sürümünden GERİDE mi. Sürümü bilinmeyen oturum
 * işaretlenmez: "ölçülemedi" ile "eski" aynı şey değildir.
 */
export function isBehindLatest(
  s: ActiveSession,
  latest: Map<SessionDeviceType, string>,
): boolean {
  const top = latest.get(s.deviceType);
  if (!s.clientVersion || !top) return false;
  return compareVersions(s.clientVersion, top) < 0;
}

export interface VersionBucket {
  key: string;
  label: string;
  count: number;
  behind: boolean;
}

/** "Panel 1.3.16: 3 · Tablet 1.0.16: 2" şeridi — tür sırası sabit, sürüm azalan, bilinmeyen sonda. */
export function versionSummary(sessions: ActiveSession[]): VersionBucket[] {
  const latest = latestVersionByType(sessions);
  const counts = new Map<string, { type: SessionDeviceType; version: string | null; count: number }>();
  for (const s of sessions) {
    const key = `${s.deviceType}|${s.clientVersion ?? ""}`;
    const cur = counts.get(key);
    if (cur) cur.count++;
    else counts.set(key, { type: s.deviceType, version: s.clientVersion, count: 1 });
  }
  return [...counts.entries()]
    .sort(([, a], [, b]) => {
      const t = TYPE_ORDER.indexOf(a.type) - TYPE_ORDER.indexOf(b.type);
      if (t !== 0) return t;
      if (a.version === null) return 1;
      if (b.version === null) return -1;
      return compareVersions(b.version, a.version);
    })
    .map(([key, b]) => {
      const top = latest.get(b.type);
      return {
        key,
        label: `${deviceTypeLabel(b.type)} ${b.version ?? "(sürüm bilinmiyor)"}`,
        count: b.count,
        behind: !!b.version && !!top && compareVersions(b.version, top) < 0,
      };
    });
}

/** Satırın cihaz etiketi: yöneticinin verdiği ad > kimlik kısaltması > "—". */
export function deviceLabel(s: ActiveSession): string {
  if (s.deviceName) return s.deviceName;
  if (s.deviceRef) return `Tanımsız (${s.deviceRef})`;
  return "—";
}
