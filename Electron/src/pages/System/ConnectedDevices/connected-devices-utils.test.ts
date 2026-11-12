import { describe, expect, it } from "vitest";
import {
  deviceLabel,
  deviceTypeLabel,
  isBehindLatest,
  latestVersionByType,
  versionSummary,
} from "./connected-devices-utils";
import type { ActiveSession, SessionDeviceType } from "./service";

let n = 0;
function s(deviceType: SessionDeviceType, clientVersion: string | null, extra: Partial<ActiveSession> = {}): ActiveSession {
  n++;
  return {
    id: `s${n}`,
    user: { id: `u${n}`, username: `k${n}`, fullName: null, isSystemAccount: false },
    deviceType,
    deviceRef: null,
    deviceName: null,
    machineName: null,
    clientVersion,
    lastSeenAt: null,
    startedAt: "2026-11-13T08:00:00.000Z",
    ...extra,
  };
}

describe("Bağlı Cihazlar — sürüm özeti", () => {
  const list = [
    s("MOBILE", "1.0.14"),
    s("ELECTRON", "1.3.16"),
    s("MOBILE", "1.0.16"),
    s("MOBILE", "1.0.14"),
    s("MOBILE", null),
    s("ELECTRON", "1.3.9"),
  ];

  it("en yüksek sürüm sayısal kıyasla bulunur (1.3.16 > 1.3.9)", () => {
    const latest = latestVersionByType(list);
    expect(latest.get("ELECTRON")).toBe("1.3.16");
    expect(latest.get("MOBILE")).toBe("1.0.16");
    expect(latest.has("WEB")).toBe(false);
  });

  it("şerit: tür sırası Panel → Tablet, sürüm azalan, bilinmeyen sonda, geride olan işaretli", () => {
    expect(versionSummary(list).map((b) => [b.label, b.count, b.behind])).toEqual([
      ["Panel 1.3.16", 1, false],
      ["Panel 1.3.9", 1, true],
      ["Tablet 1.0.16", 1, false],
      ["Tablet 1.0.14", 2, true],
      ["Tablet (sürüm bilinmiyor)", 1, false],
    ]);
  });

  it("sürümü bilinmeyen oturum 'geride' sayılmaz (ölçülemedi ≠ eski)", () => {
    const latest = latestVersionByType(list);
    expect(isBehindLatest(s("MOBILE", null), latest)).toBe(false);
    expect(isBehindLatest(s("MOBILE", "1.0.14"), latest)).toBe(true);
    expect(isBehindLatest(s("MOBILE", "1.0.16"), latest)).toBe(false);
    expect(isBehindLatest(s("WEB", "1.0.0"), latest)).toBe(false);
  });
});

describe("Bağlı Cihazlar — etiketler", () => {
  it("cihaz adı > kimlik kısaltması > tire", () => {
    expect(deviceLabel(s("MOBILE", null, { deviceName: "Tambur-1", deviceRef: "abcd1234" }))).toBe("Tambur-1");
    expect(deviceLabel(s("MOBILE", null, { deviceRef: "abcd1234" }))).toBe("Tanımsız (abcd1234)");
    expect(deviceLabel(s("ELECTRON", null))).toBe("—");
  });

  it("tanınmayan tür uydurulmaz", () => {
    expect(deviceTypeLabel("MOBILE")).toBe("Tablet");
    expect(deviceTypeLabel("ROBOT")).toBe("ROBOT");
  });
});
