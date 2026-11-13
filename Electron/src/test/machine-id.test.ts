import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  buildHwClaim,
  computeHwDigest,
  parseLinuxMachineId,
  parseMacPlatformUuid,
  parseWindowsMachineGuid,
  pickInstallationKey,
  sourceForPlatform,
} from "../../electron/device-identity/machine-id.core";

// =============================================================================
// Makine kimliği (cihaz kimliği, 2026-11-13; ana ürün PR #134). İddia: üç işletim sistemi
// çıktısı doğru ayrışır; boş/bozuk çıktı → kimlik YOK (hw gönderilmez); özet backend
// `test_cihaz_kalici_tanima` §7 vektörüyle BAYT-EŞİT; ham değer dönüşte yok; kaynak kümesi
// backend `HW_SOURCES` ile aynı; IPC zinciri (sözleşme → handler → kayıt → preload) kopuk değil.
// Sonda (ölçüldü 2026-11-13): DOMAIN'e bir karakter eklendi → vektör testi kırmızı;
// `registerMachineIdIpc()` çağrısı silindi → zincir testi kırmızı.
// =============================================================================

const VEKTOR = {
  installationId: "00000000-0000-4000-8000-000000000001",
  kaynak: "ANDROID_ID" as const,
  ham: "9774d56d682e549c",
  ozet: "b1c0721db73f7297afbeadaddff6de68c62f572cc68d36c9a0de087600dea9c7",
};

const WIN_OUT = `\r\nHKEY_LOCAL_MACHINE\\SOFTWARE\\Microsoft\\Cryptography\r\n    MachineGuid    REG_SZ    6F1D2C3B-4A59-4E1F-9C2D-0A1B2C3D4E5F\r\n\r\n`;
const MAC_OUT = `+-o J314sAP  <class IOPlatformExpertDevice, id 0x100000210, registered, matched, active, busy 0 (0 ms), retain 34>
    {
      "IOPlatformSerialNumber" = "C02XXXXX"
      "IOPlatformUUID" = "1A2B3C4D-5E6F-7081-92A3-B4C5D6E7F809"
      "model" = <"MacBookPro18,3">
    }`;

const read = (p: string): string => readFileSync(resolve(process.cwd(), p), "utf8");

describe("ayrıştırıcılar", () => {
  it("Windows MachineGuid (küçük harfe indirger)", () => {
    expect(parseWindowsMachineGuid(WIN_OUT)).toBe("6f1d2c3b-4a59-4e1f-9c2d-0a1b2c3d4e5f");
  });
  it("macOS IOPlatformUUID (seri numarasını almaz)", () => {
    expect(parseMacPlatformUuid(MAC_OUT)).toBe("1A2B3C4D-5E6F-7081-92A3-B4C5D6E7F809");
  });
  it("Linux machine-id", () => {
    expect(parseLinuxMachineId("0123456789abcdef0123456789abcdef\n")).toBe("0123456789abcdef0123456789abcdef");
  });
  it("boş / bozuk / sıfır çıktı → null", () => {
    expect(parseWindowsMachineGuid("")).toBeNull();
    expect(parseWindowsMachineGuid("ERROR: The system was unable to find the specified registry key or value.")).toBeNull();
    expect(parseWindowsMachineGuid("    MachineGuid    REG_SZ    00000000-0000-0000-0000-000000000000")).toBeNull();
    expect(parseMacPlatformUuid("")).toBeNull();
    expect(parseMacPlatformUuid('"IOPlatformUUID" = "kirik"')).toBeNull();
    expect(parseMacPlatformUuid('"IOPlatformUUID" = "FFFFFFFF-FFFF-FFFF-FFFF-FFFFFFFFFFFF"')).toBeNull();
    expect(parseLinuxMachineId("")).toBeNull();
    expect(parseLinuxMachineId("uninitialized\n")).toBeNull();
    expect(parseLinuxMachineId("0".repeat(32))).toBeNull();
  });
  it("platform → kaynak", () => {
    expect(sourceForPlatform("win32")).toBe("WIN_MACHINE_GUID");
    expect(sourceForPlatform("darwin")).toBe("MAC_PLATFORM_UUID");
    expect(sourceForPlatform("linux")).toBe("LINUX_MACHINE_ID");
    expect(sourceForPlatform("aix")).toBeNull();
  });
});

describe("özet sözleşmesi", () => {
  it("⭐ backend test vektörüyle bayt-eşit", () => {
    expect(computeHwDigest(VEKTOR.installationId, VEKTOR.kaynak, VEKTOR.ham)).toBe(VEKTOR.ozet);
  });
  it("vektör backend bekçisindeki sabitle aynı (iki yerde ayrı ayrı değişemez)", () => {
    expect(read("../Teks-Erp/scripts/test_cihaz_kalici_tanima.ts")).toContain(VEKTOR.ozet);
  });
  it("iddia yalnız {v, kaynak, ozet}; ham değer dönüşte YOK", () => {
    const ham = "6f1d2c3b-4a59-4e1f-9c2d-0a1b2c3d4e5f";
    const claim = buildHwClaim(VEKTOR.installationId, { kaynak: "WIN_MACHINE_GUID", ham });
    expect(claim).not.toBeNull();
    expect(Object.keys(claim ?? {}).sort()).toEqual(["kaynak", "ozet", "v"]);
    expect(JSON.stringify(claim)).not.toContain(ham);
    expect(claim?.ozet).toMatch(/^[0-9a-f]{64}$/);
  });
  it("kurulum anahtarı ya da ham yoksa iddia yok (hw gönderilmez)", () => {
    expect(buildHwClaim(null, { kaynak: "LINUX_MACHINE_ID", ham: "x" })).toBeNull();
    expect(buildHwClaim(VEKTOR.installationId, null)).toBeNull();
  });
  it("anahtar: sabitlenmiş önce; yoksa verilen (biçim süzgeçli)", () => {
    expect(pickInstallationKey("sabit-kimlik-1", "verilen-kimlik-2")).toBe("sabit-kimlik-1");
    expect(pickInstallationKey(null, " verilen-kimlik-2 ")).toBe("verilen-kimlik-2");
    expect(pickInstallationKey("  ", "verilen-kimlik-2")).toBe("verilen-kimlik-2");
    expect(pickInstallationKey(null, "kisa")).toBeNull();
    expect(pickInstallationKey(null, 42)).toBeNull();
    expect(pickInstallationKey(null, "x".repeat(129))).toBeNull();
  });
  it("kaynak kümesi backend HW_SOURCES ile aynı", () => {
    const backend = /HW_SOURCES\s*=\s*\[([^\]]+)\]/.exec(read("../Teks-Erp/src/services/helpers/device-identity.helper.ts"));
    const shared = /export type HwSource\s*=([^;]+);/.exec(read("shared/ipc-contract.ts"));
    const names = (s: string | undefined) => [...(s ?? "").matchAll(/"([A-Z_]+)"/g)].map((m) => m[1]).sort();
    expect(names(backend?.[1]).length).toBeGreaterThan(0);
    expect(names(shared?.[1])).toEqual(names(backend?.[1]));
  });
});

describe("IPC zinciri: device-identity", () => {
  it("preload kanalları = ana süreç handler'ları, kayıt çağrılıyor", () => {
    const preload = read("electron/preload.ts");
    const handler = read("electron/ipc/machine-id.ipc.ts");
    const registry = read("electron/ipc/index.ts");
    const pre = [...preload.matchAll(/invoke\("(device-identity:[a-z-]+)"/g)].map((m) => m[1]).sort();
    const main = [...handler.matchAll(/ipcMain\.handle\("(device-identity:[a-z-]+)"/g)].map((m) => m[1]).sort();
    expect(pre.length).toBe(3); // körlük zemini
    expect(main).toEqual(pre);
    expect(registry).toMatch(/^\s*registerMachineIdIpc\(\);/m);
  });
  it("yuva anahtarları renderer ile ana süreçte aynı", () => {
    const keys = (src: string) => [...src.matchAll(/(primary|fallback):\s*"([^"]+)"/g)].map((m) => `${m[1]}=${m[2]}`).sort();
    const main = keys(read("electron/ipc/machine-id.ipc.ts"));
    expect(main.length).toBe(2);
    expect(keys(read("src/lib/deviceId.ts"))).toEqual(main);
  });
});
