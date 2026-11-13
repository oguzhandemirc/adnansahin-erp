import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { LocalIdRead, LocalIdSlot } from "@shared/ipc-contract";

// =============================================================================
// Kimlik ezme düzeltmesi (2026-11-13; ana ürün PR #134 + Adnan yedek yuva uyarlaması).
// İddia: asıl kimlik "okunamadı"ysa ÜSTÜNE YAZILMAZ; yalnız gerçekten "yok"ken üretilip yazılır.
// Asıl okunamazken yedek yuva okunur / bir kez yazılır → bayrak kapalıyken her açılış yeni
// satır açmaz. Sonda (ölçüldü 2026-11-13): UNREADABLE dalında asıl yuvaya yazma eklendi → kırmızı.
// =============================================================================

vi.mock("@/lib/secure-store", () => ({ secureStore: { get: vi.fn(), set: vi.fn(), delete: vi.fn() } }));

const { getOrCreateDeviceId, deviceIdState, resetDeviceIdForTest } = await import("./deviceId");
const { secureStore } = await import("@/lib/secure-store");

type Reads = Partial<Record<LocalIdSlot, LocalIdRead | Error>>;

function bridge(reads: Reads) {
  const api = {
    describe: vi.fn(),
    readLocalId: vi.fn((slot: LocalIdSlot) => {
      const r = reads[slot] ?? { status: "ABSENT" };
      return r instanceof Error ? Promise.reject(r) : Promise.resolve(r);
    }),
    createLocalId: vi.fn((_slot: LocalIdSlot, _value: string) => Promise.resolve(true)),
  };
  (window as unknown as { api: unknown }).api = { deviceIdentity: api };
  return api;
}

const primaryWrites = (api: ReturnType<typeof bridge>) => api.createLocalId.mock.calls.filter((c) => c[0] === "primary");

beforeEach(() => resetDeviceIdForTest());
afterEach(() => {
  delete (window as unknown as { api?: unknown }).api;
  vi.clearAllMocks();
});

describe("masaüstü köprüsü", () => {
  it("kayıtlı kimlik aynen döner, yazma yok", async () => {
    const api = bridge({ primary: { status: "OK", value: "kalici-kimlik-1234" } });
    expect(await getOrCreateDeviceId()).toBe("kalici-kimlik-1234");
    expect(api.createLocalId).not.toHaveBeenCalled();
    expect(deviceIdState()).toBe("stored");
  });

  it("gerçekten YOK → bir kez üretilip asıla yazılır, sonra önbellekten", async () => {
    const api = bridge({ primary: { status: "ABSENT" } });
    const id = await getOrCreateDeviceId();
    expect(api.createLocalId).toHaveBeenCalledTimes(1);
    expect(api.createLocalId).toHaveBeenCalledWith("primary", id);
    expect(deviceIdState()).toBe("created");
    expect(await getOrCreateDeviceId()).toBe(id);
    expect(api.readLocalId).toHaveBeenCalledTimes(1);
  });

  it("kısa bozuk değer (<8) yok sayılır → asıla yazılır", async () => {
    const api = bridge({ primary: { status: "OK", value: "abc" } });
    const id = await getOrCreateDeviceId();
    expect(api.createLocalId).toHaveBeenCalledWith("primary", id);
  });

  it("⭐ asıl OKUNAMADI → asıla yazma YOK; yedek yuva bir kez yazılır", async () => {
    const api = bridge({ primary: { status: "UNREADABLE" }, fallback: { status: "ABSENT" } });
    const id = await getOrCreateDeviceId();
    expect(primaryWrites(api)).toHaveLength(0);
    expect(api.createLocalId).toHaveBeenCalledWith("fallback", id);
    expect(secureStore.set).not.toHaveBeenCalled();
    expect(deviceIdState()).toBe("fallback");
  });

  it("⭐ asıl okunamazken yedek varsa o kullanılır (açılışlar arası aynı kimlik → yeni satır yok)", async () => {
    const api = bridge({ primary: { status: "UNREADABLE" }, fallback: { status: "OK", value: "yedek-kimlik-5678" } });
    expect(await getOrCreateDeviceId()).toBe("yedek-kimlik-5678");
    expect(api.createLocalId).not.toHaveBeenCalled();
    expect(deviceIdState()).toBe("fallback");
  });

  it("⭐ köprü istisna atarsa okunamadı sayılır → asıla yazma yok", async () => {
    const api = bridge({ primary: new Error("ipc düştü"), fallback: new Error("ipc düştü") });
    const id = await getOrCreateDeviceId();
    expect(id.length).toBeGreaterThanOrEqual(8);
    expect(api.createLocalId).not.toHaveBeenCalled();
    expect(secureStore.set).not.toHaveBeenCalled();
    expect(deviceIdState()).toBe("ephemeral");
  });

  it("asıl ve yedek okunamaz → hiç yazma yok, oturum geçici kimlikle", async () => {
    const api = bridge({ primary: { status: "UNREADABLE" }, fallback: { status: "UNREADABLE" } });
    await getOrCreateDeviceId();
    expect(api.createLocalId).not.toHaveBeenCalled();
    expect(deviceIdState()).toBe("ephemeral");
  });

  it("ana süreç yazmayı reddederse (arada okunamaz oldu) kimlik geçici kalır", async () => {
    const api = bridge({ primary: { status: "ABSENT" } });
    api.createLocalId.mockResolvedValueOnce(false);
    await getOrCreateDeviceId();
    expect(deviceIdState()).toBe("ephemeral");
  });
});

describe("köprüsüz (web)", () => {
  it("get istisna atarsa asıla yazma yok; null ise yazılır", async () => {
    vi.mocked(secureStore.get).mockRejectedValue(new Error("x"));
    await getOrCreateDeviceId();
    expect(secureStore.set).not.toHaveBeenCalledWith("config.deviceId", expect.anything());

    resetDeviceIdForTest();
    vi.mocked(secureStore.get).mockReset();
    vi.mocked(secureStore.set).mockReset();
    vi.mocked(secureStore.get).mockResolvedValueOnce(null);
    const id = await getOrCreateDeviceId();
    expect(secureStore.set).toHaveBeenCalledWith("config.deviceId", id);
  });
});
