// =============================================================================
// Cihaz kimliği — kalıcı donanım özeti ile yeniden kurulumu tanıma (2026-11-13)
// =============================================================================
// Kaynak (ana ürün, elle taşındı, sadeleşmiş): PR #116 (D1:
// device-identity.helper + device-rebind.service `rebindDeviceTx`/`learnHwDigest`) ve
// PR #673 (`autoRebindRule`, `device.autoReattachKnownHardware`).
// ALINMAYANLAR: bağlama defteri, yeniden bağlama talepleri, `mergedIntoId`, cihaz kanıtı
// (Adnan şemasında yok; uygun olmayan hedefte bugünkü doğuş yoluna düşülür).
//
// `devices.id` = fiziksel cihaz; `devices.deviceId` = ETKİN kurulum anahtarı (localId).
// Yeniden bağlama satırın `deviceId`'sini yeni kuruluma çevirir → ad, makine ataması,
// donanım bağları, çalışma oturumu geçmişi aynı satırda devam eder.
//
// ⚠️ Bu dosyadaki her yol YALNIZ `device.autoReattachKnownHardware` AÇIKKEN çağrılır;
// karar `DeviceService.announce`tadır (kapalıyken `hw` hiç okunmaz — bugünkü davranış).
// =============================================================================

import { createHmac } from "node:crypto";
import { Prisma } from "@prisma/client";
import prisma from "../../lib/prisma";
import { AppError } from "../../utils/app-error";
import { AuditService } from "../audit.service";

/** İstemcinin okuyabildiği kararlı donanım kimliği kaynakları (mobil/Electron ile bayt-eşit). */
export const HW_SOURCES = ["ANDROID_ID", "WIN_MACHINE_GUID", "MAC_PLATFORM_UUID", "LINUX_MACHINE_ID"] as const;
export type HwSource = (typeof HW_SOURCES)[number];
export const HW_DIGEST_RE = /^[0-9a-f]{64}$/;
const HW_DIGEST_DOMAIN = "tekserp/cihaz-donanim/v1";

/** İstemcinin gönderdiği donanım özeti. Kimlik DOĞRULAMAZ, yalnız tanır. */
export interface HwClaim {
  v: 1;
  kaynak: HwSource;
  ozet: string;
}

/**
 * Sözleşmenin backend ikizi: `ozet = HMAC-SHA256(installationId, domain\nkaynak\nham)`, küçük hex.
 * Sunucu özeti hesaplamaz (ham değer cihazdan çıkmaz); test vektörünün tek kaynağıdır.
 */
export function computeHwDigest(installationId: string, kaynak: HwSource, ham: string): string {
  return createHmac("sha256", installationId).update(`${HW_DIGEST_DOMAIN}\n${kaynak}\n${ham}`, "utf8").digest("hex");
}

/**
 * Otomatik bağlanabilir hedef — TEK yüklem. Pasif ya da onayı geri alınmış (PENDING)
 * kayıt public `announce` ile ASLA dirilmez (yönetici kararı geri alınmaz).
 */
export function isReattachTarget(t: { isActive: boolean; status: string }): boolean {
  return t.isActive && t.status === "APPROVED";
}

export type HwMatch = { id: string; deviceId: string; name: string; isActive: boolean; status: string };

/** Donanım özetiyle kayıt (UNIQUE gereği en çok bir). */
export function findDeviceByHw(hwDigest: string): Promise<HwMatch | null> {
  return prisma.device.findUnique({
    where: { hwDigest },
    select: { id: true, deviceId: true, name: true, isActive: true, status: true },
  });
}

/**
 * Yeniden bağlama (atomik claim): etkin anahtar hâlâ `target.deviceId` ve satır hâlâ uygun
 * (aktif + onaylı + aynı özet) iken `newLocalId`ye geçer. 0 satır → eşzamanlı ikiz aynı
 * anahtarı zaten bağladıysa idempotent `true`; değilse 409.
 */
export async function reattachKnownHardware(target: HwMatch, newLocalId: string, hw: HwClaim): Promise<void> {
  const r = await prisma.device.updateMany({
    where: { id: target.id, deviceId: target.deviceId, hwDigest: hw.ozet, isActive: true, status: "APPROVED" },
    data: { deviceId: newLocalId, lastSeenAt: new Date() },
  });
  if (r.count === 0) {
    const now = await prisma.device.findUnique({ where: { id: target.id }, select: { deviceId: true } });
    if (now?.deviceId === newLocalId) return;
    throw AppError.conflict("Cihaz kaydı eşzamanlı değişti. Tekrar deneyin.", { code: "DEVICE_REBIND_CONFLICT" });
  }
  await AuditService.log({
    userId: undefined,
    action: "UPDATE",
    tableName: "devices",
    recordId: target.id,
    oldData: { deviceId: target.deviceId },
    newData: {
      event: "DEVICE_REBOUND_AUTO",
      deviceId: newLocalId,
      hwSource: hw.kaynak,
      reason: "device.autoReattachKnownHardware=true",
    },
  }).catch(() => undefined);
}

/**
 * Bilinen cihazın donanım özetini ÖĞREN (yalnız boşsa). Başka satır aynı özeti taşıyorsa
 * yazılmaz (UNIQUE yarışı P2002 de aynı sonuca düşer). Fırlatmaz: tanıma bir kolaylıktır,
 * cihazın açılışını düşüremez.
 */
export async function learnHwDigest(device: { id: string; deviceId: string }, hw: HwClaim): Promise<boolean> {
  try {
    const other = await findDeviceByHw(hw.ozet);
    if (other) return false;
    const r = await prisma.device.updateMany({
      where: { id: device.id, hwDigest: null },
      data: { hwDigest: hw.ozet, hwSource: hw.kaynak },
    });
    if (r.count !== 1) return false;
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") return false;
    throw e;
  }
  await AuditService.log({
    userId: undefined,
    action: "UPDATE",
    tableName: "devices",
    recordId: device.id,
    newData: { event: "DEVICE_HW_LEARNED", deviceId: device.deviceId, hwSource: hw.kaynak },
  }).catch(() => undefined);
  return true;
}
