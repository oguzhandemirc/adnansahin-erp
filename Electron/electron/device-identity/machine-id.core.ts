// =============================================================================
// Makine kimliği — SAF çekirdek (cihaz kimliği, 2026-11-13; ana ürün PR #134'ten elle taşındı).
// Ham donanım kimliği ana süreçten ÇIKMAZ: renderer'a ve sunucuya yalnız kuruluma
// özgü HMAC özeti gider. Ayrıştırıcılar saf → üç işletim sistemi sahte çıktıyla sınanır.
// Özet backend `device-identity.helper.ts > computeHwDigest` ve mobil `hardwareId.ts` ile BAYT-EŞİT.
// =============================================================================
import { createHmac } from "node:crypto";
import type { HwClaim, HwSource } from "../../shared/ipc-contract.js";

const DOMAIN = "tekserp/cihaz-donanim/v1";

/** Sıfır/boş kalıplar klon ya da sanal makinede görülür — kimlik sayılmaz. */
function plausible(raw: string): boolean {
  const hex = raw.replace(/[^0-9a-f]/gi, "");
  return hex.length >= 16 && !/^0+$/.test(hex) && !/^f+$/i.test(hex);
}

/** `reg query HKLM\SOFTWARE\Microsoft\Cryptography /v MachineGuid` çıktısı. */
export function parseWindowsMachineGuid(stdout: string): string | null {
  const m = /^\s*MachineGuid\s+REG_SZ\s+([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\s*$/im.exec(stdout);
  const v = m?.[1]?.toLowerCase() ?? null;
  return v && plausible(v) ? v : null;
}

/** `ioreg -rd1 -c IOPlatformExpertDevice` çıktısı (seri numarası alınmaz). */
export function parseMacPlatformUuid(stdout: string): string | null {
  const m = /"IOPlatformUUID"\s*=\s*"([0-9A-F]{8}-[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{12})"/i.exec(stdout);
  const v = m?.[1]?.toUpperCase() ?? null;
  return v && plausible(v) ? v : null;
}

/** `/etc/machine-id` içeriği (32 küçük hex). */
export function parseLinuxMachineId(content: string): string | null {
  const v = content.trim().toLowerCase();
  return /^[0-9a-f]{32}$/.test(v) && plausible(v) ? v : null;
}

export function computeHwDigest(installationId: string, kaynak: HwSource, ham: string): string {
  return createHmac("sha256", installationId).update(`${DOMAIN}\n${kaynak}\n${ham}`, "utf8").digest("hex");
}

/** Ham + kurulum anahtarı → sunucuya gidecek iddia. Anahtar ya da ham yoksa `null` (hw gönderilmez). */
export function buildHwClaim(installationId: string | null, read: { kaynak: HwSource; ham: string } | null): HwClaim | null {
  if (!installationId || !read) return null;
  return { v: 1, kaynak: read.kaynak, ozet: computeHwDigest(installationId, read.kaynak, read.ham) };
}

/** Özet anahtarı: önce sabitlenmiş kurulum kimliği; yoksa çağıranın verdiği (biçim süzgecinden geçerse). */
export function pickInstallationKey(pinned: string | null, given: unknown): string | null {
  if (pinned && pinned.trim()) return pinned.trim();
  if (typeof given !== "string") return null;
  const v = given.trim();
  return v.length >= 8 && v.length <= 128 ? v : null;
}

/** İşletim sistemi → okunacak kaynak (desteklenmeyen platformda `null`). */
export function sourceForPlatform(platform: NodeJS.Platform): HwSource | null {
  if (platform === "win32") return "WIN_MACHINE_GUID";
  if (platform === "darwin") return "MAC_PLATFORM_UUID";
  if (platform === "linux") return "LINUX_MACHINE_ID";
  return null;
}
