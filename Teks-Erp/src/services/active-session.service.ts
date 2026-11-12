// =============================================================================
// TeksERP — Bağlı Cihazlar: açık oturumların okunabilir listesi
// =============================================================================
// "Hangi kullanıcı hangi cihazda hangi uygulama sürümüyle oturum açık tutuyor"
// sorusunu `Session` satırlarından cevaplar. Bağlı İstemciler ekranından farkı:
// kaynak süreç belleği değil oturum tablosudur, sunucu yeniden başlasa da kalır.
// Salt okuma; jti/token hiçbir koşulda projeksiyona girmez (bekçi:
// `test_active_sessions`).
// =============================================================================

import { ClientType, Prisma } from "@prisma/client";
import prisma from "../lib/prisma";
import type { ApiResponse } from "../types/api.types";
import { ACTOR_SELECT } from "./helpers/system-account.helper";

export const ACTIVE_SESSION_DEFAULT_LIMIT = 200;
export const ACTIVE_SESSION_MAX_LIMIT = 500;

/** Cihaz kimliği bir eşleşme anahtarıdır (cihaz onay kapısı) — tamamı dışarı verilmez. */
const DEVICE_REF_LENGTH = 8;

const ACTIVE_SESSION_SELECT = {
  id: true,
  deviceType: true,
  deviceId: true,
  clientVersion: true,
  lastSeenAt: true,
  createdAt: true,
  user: { select: ACTOR_SELECT },
} satisfies Prisma.SessionSelect;

export interface ActiveSessionDto {
  id: string;
  user: { id: string; username: string; fullName: string | null; isSystemAccount: boolean };
  deviceType: ClientType;
  /** Cihaz kimliğinin ilk 8 hanesi; panel `x-device-id` göndermediği için çoğunlukla null. */
  deviceRef: string | null;
  /** Yöneticinin Cihazlar ekranında verdiği ad (`Device.name`). */
  deviceName: string | null;
  /** Cihazın bağlı olduğu makine/istasyon adı. */
  machineName: string | null;
  /** null = istemci sürüm bildirmedi (ölçülemedi), "eski" demek DEĞİL. */
  clientVersion: string | null;
  lastSeenAt: string | null;
  startedAt: string;
}

export interface ActiveSessionList {
  /** Sunucu saati — "N dk önce" istemci saatine göre değil buna göre hesaplanır. */
  now: string;
  limit: number;
  /** true = sınırdan fazla açık oturum var, liste kesildi. */
  truncated: boolean;
  sessions: ActiveSessionDto[];
}

/** Açık oturumlar (iptal edilmemiş + süresi dolmamış), son görülme azalan. */
export async function listActiveSessions(
  input: { limit?: number } = {},
): Promise<ApiResponse<ActiveSessionList>> {
  const limit = Math.min(input.limit ?? ACTIVE_SESSION_DEFAULT_LIMIT, ACTIVE_SESSION_MAX_LIMIT);
  const now = new Date();
  const rows = await prisma.session.findMany({
    where: { revokedAt: null, expiresAt: { gt: now } },
    orderBy: [
      { lastSeenAt: { sort: "desc", nulls: "last" } },
      { createdAt: "desc" },
      { id: "asc" },
    ],
    take: limit + 1,
    select: ACTIVE_SESSION_SELECT,
  });
  const truncated = rows.length > limit;
  const page = truncated ? rows.slice(0, limit) : rows;

  const deviceIds = [...new Set(page.map((r) => r.deviceId).filter((v): v is string => !!v))];
  const devices =
    deviceIds.length > 0
      ? await prisma.device.findMany({
          where: { deviceId: { in: deviceIds } },
          select: { deviceId: true, name: true, machine: { select: { name: true } } },
        })
      : [];
  const deviceById = new Map(devices.map((d) => [d.deviceId, d]));

  return {
    success: true,
    data: {
      now: now.toISOString(),
      limit,
      truncated,
      sessions: page.map((r) => {
        const d = r.deviceId ? deviceById.get(r.deviceId) : undefined;
        return {
          id: r.id,
          user: r.user,
          deviceType: r.deviceType,
          deviceRef: r.deviceId ? r.deviceId.slice(0, DEVICE_REF_LENGTH) : null,
          deviceName: d?.name ?? null,
          machineName: d?.machine?.name ?? null,
          clientVersion: r.clientVersion,
          lastSeenAt: r.lastSeenAt ? r.lastSeenAt.toISOString() : null,
          startedAt: r.createdAt.toISOString(),
        };
      }),
    },
  };
}
