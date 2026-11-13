import { afterEach, describe, expect, it, vi } from "vitest";
import type { DeviceIdentityDescription, HwClaim } from "@shared/ipc-contract";

// =============================================================================
// Masaüstü announce donanım özeti (2026-11-13). İddia: özet yoksa gövde BUGÜNKÜYLE
// bayt-eşit (eski davranış, backend bayrağı kapalıyken fark yok); anahtar eksikse bağlanılan
// sunucunun kimliği probe ile alınır; her hata `null`a düşer (announce hiç düşmez).
// Sonda (ölçüldü 2026-11-13): buildAnnounceBody `hw: null`ı da eklerse ilk test kırmızı.
// =============================================================================

vi.mock("@/lib/api-config", () => ({ getActiveApiBaseUrl: () => "http://10.0.0.5:4000" }));

const { buildAnnounceBody, resolveHwClaim } = await import("./device-hw");

const CLAIM: HwClaim = { v: 1, kaynak: "WIN_MACHINE_GUID", ozet: "a".repeat(64) };
const BASE = { deviceId: "kalici-kimlik-1234", name: "Masaüstü (win32)", kind: "DESKTOP" as const };

function install(describeImpl: (id?: string | null) => Promise<DeviceIdentityDescription>, probeId: string | null = "kurulum-kimligi-1") {
  const describeFn = vi.fn(describeImpl);
  const probe = vi.fn(() => Promise.resolve(probeId ? { identity: { installationId: probeId } } : null));
  (window as unknown as { api: unknown }).api = { deviceIdentity: { describe: describeFn }, discovery: { probe } };
  return { describeFn, probe };
}

afterEach(() => {
  delete (window as unknown as { api?: unknown }).api;
});

describe("buildAnnounceBody", () => {
  it("⭐ hw yok → gövde bugünkü biçimle birebir (anahtar bile yok)", () => {
    const body = buildAnnounceBody(BASE, null);
    expect(body).toEqual({ deviceId: "kalici-kimlik-1234", name: "Masaüstü (win32)", kind: "DESKTOP" });
    expect(Object.keys(body)).not.toContain("hw");
  });
  it("hw var → yalnız {v,kaynak,ozet} eklenir", () => {
    expect(buildAnnounceBody(BASE, CLAIM)).toEqual({ ...BASE, hw: CLAIM });
  });
});

describe("resolveHwClaim", () => {
  it("köprü yok (web) → null", async () => {
    expect(await resolveHwClaim()).toBeNull();
  });
  it("sabitlenmiş anahtarla özet → probe ÇAĞRILMAZ", async () => {
    const { probe } = install(() => Promise.resolve({ hw: CLAIM, needsKey: false }));
    expect(await resolveHwClaim()).toEqual(CLAIM);
    expect(probe).not.toHaveBeenCalled();
  });
  it("makine kimliği okunamadı (needsKey false) → probe yok, null", async () => {
    const { probe } = install(() => Promise.resolve({ hw: null, needsKey: false }));
    expect(await resolveHwClaim()).toBeNull();
    expect(probe).not.toHaveBeenCalled();
  });
  it("anahtar yok → sunucu kimliği probe ile alınıp ikinci describe'a verilir", async () => {
    const { describeFn, probe } = install((id) => Promise.resolve(id ? { hw: CLAIM, needsKey: false } : { hw: null, needsKey: true }));
    expect(await resolveHwClaim()).toEqual(CLAIM);
    expect(probe).toHaveBeenCalledWith("http://10.0.0.5:4000");
    expect(describeFn).toHaveBeenLastCalledWith("kurulum-kimligi-1");
  });
  it("sunucu kimliksiz (eski backend) → null", async () => {
    install(() => Promise.resolve({ hw: null, needsKey: true }), null);
    expect(await resolveHwClaim()).toBeNull();
  });
  it("köprü istisna atarsa null (announce düşmez)", async () => {
    install(() => Promise.reject(new Error("ipc")));
    expect(await resolveHwClaim()).toBeNull();
  });
});
