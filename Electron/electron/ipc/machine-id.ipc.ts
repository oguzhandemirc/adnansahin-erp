// Cihaz kimliği köprüsü (`device-identity:*`, 2026-11-13; ana ürün PR #134'ten elle taşındı):
// makine özeti + yerel kimliğin üç durumlu okunuşu. Ham donanım kimliği yalnız bu süreçte,
// bellekte yaşar; log'a ve renderer'a gitmez.
import { execFile } from "node:child_process";
import { readFile } from "node:fs/promises";
import { ipcMain } from "electron";
import log from "electron-log/main.js";
import type { DeviceIdentityDescription, HwSource, LocalIdRead, LocalIdSlot } from "../../shared/ipc-contract.js";
import {
  buildHwClaim,
  parseLinuxMachineId,
  parseMacPlatformUuid,
  parseWindowsMachineGuid,
  pickInstallationKey,
  sourceForPlatform,
} from "../device-identity/machine-id.core.js";
import { inspectSecureValue, writeSecureValue } from "./secure-store.ipc.js";
import { readPinnedInstallationId } from "./discovery.ipc.js";

/** Renderer'ın `src/lib/deviceId.ts`i ile AYNI anahtarlar (secure-store). */
export const LOCAL_ID_KEYS: Record<LocalIdSlot, string> = {
  primary: "config.deviceId",
  fallback: "config.deviceId.fallback",
};

function keyOf(slot: unknown): string {
  if (slot !== "primary" && slot !== "fallback") throw new Error("Geçersiz kimlik yuvası");
  return LOCAL_ID_KEYS[slot];
}

function run(file: string, args: readonly string[]): Promise<string> {
  return new Promise((resolve, reject) => {
    // Kabuk YOK, sabit argümanlar; çıktı küçük.
    execFile(file, args, { timeout: 5000, windowsHide: true, maxBuffer: 1024 * 1024 }, (err, stdout) => {
      if (err) reject(err);
      else resolve(String(stdout));
    });
  });
}

async function readRaw(kaynak: HwSource): Promise<string | null> {
  if (kaynak === "WIN_MACHINE_GUID") {
    const root = process.env.SystemRoot ?? "C:\\Windows";
    const out = await run(`${root}\\System32\\reg.exe`, ["query", "HKLM\\SOFTWARE\\Microsoft\\Cryptography", "/v", "MachineGuid", "/reg:64"]);
    return parseWindowsMachineGuid(out);
  }
  if (kaynak === "MAC_PLATFORM_UUID") {
    return parseMacPlatformUuid(await run("/usr/sbin/ioreg", ["-rd1", "-c", "IOPlatformExpertDevice"]));
  }
  for (const p of ["/etc/machine-id", "/var/lib/dbus/machine-id"]) {
    try {
      const v = parseLinuxMachineId(await readFile(p, "utf8"));
      if (v) return v;
    } catch {
      /* sıradaki yol */
    }
  }
  return null;
}

let rawCache: Promise<{ kaynak: HwSource; ham: string } | null> | null = null;

function readMachineId(): Promise<{ kaynak: HwSource; ham: string } | null> {
  rawCache ??= (async () => {
    const kaynak = sourceForPlatform(process.platform);
    if (!kaynak) return null;
    try {
      const ham = await readRaw(kaynak);
      return ham ? { kaynak, ham } : null;
    } catch (e) {
      // Ham değer değil yalnız hata türü günlüğe (sır hijyeni).
      log.warn("[cihaz] makine kimliği okunamadı", { kaynak, hata: (e as NodeJS.ErrnoException)?.code ?? "?" });
      return null;
    }
  })();
  return rawCache;
}

function inspectSlot(slot: unknown): LocalIdRead {
  try {
    return inspectSecureValue(keyOf(slot));
  } catch {
    return { status: "UNREADABLE" };
  }
}

export function registerMachineIdIpc(): void {
  ipcMain.handle("device-identity:describe", async (_e, installationId: unknown): Promise<DeviceIdentityDescription> => {
    const raw = await readMachineId();
    const key = pickInstallationKey(readPinnedInstallationId(), installationId);
    return { hw: buildHwClaim(key, raw), needsKey: raw !== null && key === null };
  });
  // "Yok" ile "okunamadı" ayrımı: okunamayan kimlik renderer'da ÜSTÜNE YAZILMAZ.
  ipcMain.handle("device-identity:read-local-id", (_e, slot: unknown): LocalIdRead => inspectSlot(slot));
  // Yalnız gerçekten YOKSA (ya da bizim yazamayacağımız kısa bir değerse) yazılır;
  // arada okunamaz hâle geldiyse yazma reddedilir.
  ipcMain.handle("device-identity:create-local-id", (_e, slot: unknown, value: unknown): boolean => {
    const key = keyOf(slot);
    if (typeof value !== "string" || value.length < 8 || value.length > 64) throw new Error("Geçersiz cihaz kimliği");
    const now = inspectSlot(slot);
    const writable = now.status === "ABSENT" || (now.status === "OK" && now.value.length < 8);
    if (!writable) return false;
    writeSecureValue(key, value);
    return true;
  });
}
