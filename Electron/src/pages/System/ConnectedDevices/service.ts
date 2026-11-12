import apiClient from "@/services/apiClient";

/** Backend sözleşmesi — `GET /api/sessions/active` (Teks-Erp session.routes.ts). */
export type SessionDeviceType = "ELECTRON" | "MOBILE" | "WEB";

export interface ActiveSession {
  id: string;
  user: { id: string; username: string; fullName: string | null; isSystemAccount: boolean };
  deviceType: SessionDeviceType;
  /** Cihaz kimliğinin ilk 8 hanesi; panel `x-device-id` göndermediği için çoğunlukla null. */
  deviceRef: string | null;
  /** Yöneticinin Cihazlar ekranında verdiği ad. */
  deviceName: string | null;
  machineName: string | null;
  /** null = istemci sürüm bildirmedi (ölçülemedi), "eski" demek DEĞİL. */
  clientVersion: string | null;
  lastSeenAt: string | null;
  startedAt: string;
}

export interface ActiveSessionList {
  /** Sunucu saati — "N dk önce" buna göre hesaplanır. */
  now: string;
  limit: number;
  truncated: boolean;
  sessions: ActiveSession[];
}

/** Açık oturumlar — saf veri erişimi (React'e bağlı değil). */
export async function fetchActiveSessions(): Promise<ActiveSessionList> {
  const res = await apiClient.get<{ success: boolean; data: ActiveSessionList }>(
    "/api/sessions/active",
  );
  return res.data.data;
}
