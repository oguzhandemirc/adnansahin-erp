// Push belirteci EAS proje kimliği ister: kimlik.json → app.config.js → extra.eas.projectId (+ owner, Apple ekip kimliği).
// Gerçek yapılandırma çıktısıyla `registerNative` artık "YAPILANDIRMA_EKSIK" dönmez; belirteç bu proje kimliğiyle istenir.
// NEGATİF SONDA (2026-11-17, geri alındı): withKimlik'ten `extra` satırı silinince 1 ❌ ("⭐ yapılandırma çıktısı…";
// app.json kimliği ayrıca taşıdığından gerçek yapılandırma testi yeşil kalır); geri alındıktan sonra 4/4.
import { readFileSync } from "node:fs";
import path from "node:path";
import { Platform } from "react-native";

let mockExtra: unknown = undefined;
const mockToken = jest.fn(async (_o: { projectId: string }) => ({ data: "ExponentPushToken[sonda]" }));
jest.mock("expo-notifications", () => ({
  AndroidImportance: { HIGH: 4 },
  setNotificationChannelAsync: jest.fn(async () => undefined),
  getPermissionsAsync: jest.fn(async () => ({ granted: true, status: "granted" })),
  requestPermissionsAsync: jest.fn(async () => ({ status: "granted" })),
  getExpoPushTokenAsync: (o: { projectId: string }) => mockToken(o),
}));
jest.mock("expo-device", () => ({ isDevice: true, deviceName: "Sonda" }));
jest.mock("expo-constants", () => ({
  __esModule: true,
  default: {
    get expoConfig() {
      return { extra: mockExtra };
    },
    easConfig: undefined,
  },
}));

const kok = path.join(__dirname, "..");
const KIMLIK = JSON.parse(readFileSync(path.join(kok, "kimlik.json"), "utf8")) as Record<string, string>;
const appJson = (JSON.parse(readFileSync(path.join(kok, "app.json"), "utf8")) as { expo: Record<string, unknown> }).expo;
// eslint-disable-next-line @typescript-eslint/no-require-imports
const appConfig = require("../app.config.js") as (a: { config: Record<string, unknown> }) => Record<string, any>;
const { registerNative } = require("../src/push/register-native") as typeof import("../src/push/register-native");
const api = { deviceRegister: jest.fn(async () => ({ id: "d1" })) } as unknown as import("../src/api/endpoints").Api;

describe("EAS proje kimliği", () => {
  let restore: { restore(): void };
  beforeEach(() => { restore = jest.replaceProperty(Platform, "OS", "ios"); });
  afterEach(() => restore.restore());

  it("⭐ yapılandırma çıktısı kimlik.json'dan projectId + owner + Apple ekip kimliği taşır", () => {
    const out = appConfig({ config: { ...appJson, owner: undefined, extra: undefined, ios: { bundleIdentifier: "x" } } });
    expect(out.extra.eas.projectId).toBe(KIMLIK.easProjeKimligi);
    expect(out.owner).toBe(KIMLIK.expoSahibi);
    expect(out.ios.appleTeamId).toBe(KIMLIK.appleEkipKimligi);
    expect(KIMLIK.easProjeKimligi).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
  });

  it("⭐ gerçek yapılandırmayla belirteç alınır (YAPILANDIRMA_EKSIK değil), istek bu proje kimliğiyle", async () => {
    mockExtra = appConfig({ config: appJson }).extra;
    await expect(registerNative(api)).resolves.toEqual({ kind: "KAYITLI", deviceId: "d1" });
    expect(mockToken).toHaveBeenCalledWith({ projectId: KIMLIK.easProjeKimligi });
    expect(api.deviceRegister).toHaveBeenCalledWith({ platform: "ios", belirtec: "ExponentPushToken[sonda]", ad: "Sonda" });
  });

  it("negatif: proje kimliği yoksa YAPILANDIRMA_EKSIK, belirteç istenmez", async () => {
    mockExtra = {};
    await expect(registerNative(api)).resolves.toEqual(expect.objectContaining({ kind: "YAPILANDIRMA_EKSIK" }));
    expect(mockToken).not.toHaveBeenCalled();
  });

  it("app.json aynı kimliği taşır (bildirimsiz yapılandırma app.json BİREBİR kalır)", () => {
    expect(appJson.owner).toBe(KIMLIK.expoSahibi);
    expect((appJson.extra as { eas: { projectId: string } }).eas.projectId).toBe(KIMLIK.easProjeKimligi);
    expect((appJson.ios as { appleTeamId: string; buildNumber: string }).appleTeamId).toBe(KIMLIK.appleEkipKimligi);
    expect((appJson.ios as { buildNumber: string }).buildNumber).toMatch(/^\d+$/);
  });
});
