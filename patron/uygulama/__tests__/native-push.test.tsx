// Telefonda native push ana anahtarı AÇIK (kullanıcı kararı 2026-11-17; 2026-10-15 "yok" kararının yerine), ama etkin
// kapı derleme kapısına da bağlıdır: bildirimsiz derlenen pakette (extra.nativePush yok / native modül bağlı değil)
// telefon izin istemez, native bildirim modülünü yüklemez, kayıt denemez; web push yolu aynen sürer. Native modülü
// yükleyen her kod yalnız `*-native.ts` dosyalarındadır ve yalnız etkin kapıyla `require` edilir.
import { act, render, renderHook, screen } from "@testing-library/react-native";
import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { Platform } from "react-native";

const loaded = { notifications: 0, registerNative: 0, tapsNative: 0 };
const mockRegisterNative = jest.fn();
const mockListen = jest.fn(() => () => undefined);
jest.mock("expo-notifications", () => {
  loaded.notifications++;
  return { setNotificationHandler: jest.fn() };
});
jest.mock("../src/push/register-native", () => {
  loaded.registerNative++;
  return { registerNative: mockRegisterNative };
});
jest.mock("../src/push/taps-native", () => {
  loaded.tapsNative++;
  return { listenNativeTaps: mockListen };
});
jest.mock("../src/state/session", () => ({ useSession: () => ({ api: { deviceList: jest.fn(), deviceRemove: jest.fn(), notificationTest: jest.fn() }, facilityId: "t1", switchFacility: jest.fn() }) }));
jest.mock("../src/state/useRemote", () => ({ useRemote: () => ({ data: [], reload: jest.fn() }) }));
jest.mock("expo-router", () => ({ useRouter: () => ({ push: jest.fn(), replace: jest.fn() }) }));

const { registerThisDevice } = require("../src/push/register") as typeof import("../src/push/register");
const { NATIVE_PUSH, NATIVE_PUSH_SOON, pushAvailable } = require("../src/push/support") as typeof import("../src/push/support");
const { useNotificationTaps } = require("../src/push/taps") as typeof import("../src/push/taps");
const { NotificationDevices } = require("../src/ui/NotificationDevices") as typeof import("../src/ui/NotificationDevices");

const api = { deviceRegister: jest.fn() } as unknown as import("../src/api/endpoints").Api;

describe("bildirimsiz derlemede telefonda native push kapalı", () => {
  it("⭐ ana anahtar açık (2026-11-17); derleme kapısı yokken etkin kapı kapalı; web her zaman açık", () => {
    expect(NATIVE_PUSH).toBe(true);
    expect(pushAvailable("android")).toBe(false);
    expect(pushAvailable("ios")).toBe(false);
    expect(pushAvailable("web")).toBe(true);
    expect(pushAvailable("android", true)).toBe(true);
  });

  it("⭐ telefonda kayıt izin istemez, ağa gitmez, native modülü yüklemez", async () => {
    expect(Platform.OS).not.toBe("web");
    await expect(registerThisDevice(api, "vapid")).resolves.toEqual({ kind: "DESTEKLENMIYOR", message: NATIVE_PUSH_SOON });
    expect(api.deviceRegister).not.toHaveBeenCalled();
    expect(loaded).toEqual({ notifications: 0, registerNative: 0, tapsNative: 0 });
  });

  it("⭐ oturum hazırken telefonda dokunma dinleyicisi kurulmaz", () => {
    renderHook(() => useNotificationTaps(true));
    expect(loaded.tapsNative).toBe(0);
    expect(mockListen).not.toHaveBeenCalled();
    expect(loaded.notifications).toBe(0);
  });

  it("kapı açılınca native kayıt yolu kullanılır (sonraki sürüm)", async () => {
    mockRegisterNative.mockResolvedValue({ kind: "KAYITLI", deviceId: "d1" });
    await expect(registerThisDevice(api, null, true)).resolves.toEqual({ kind: "KAYITLI", deviceId: "d1" });
    expect(mockRegisterNative).toHaveBeenCalledWith(api);
  });

  it("web'de kayıt web yolundan gider (kapıdan etkilenmez)", async () => {
    const restore = jest.replaceProperty(Platform, "OS", "web");
    try {
      // Test ortamında service worker yok: web yolunun kendi iletisi döner (telefon iletisi değil).
      const r = await registerThisDevice(api, "vapid");
      expect(r).toEqual({ kind: "DESTEKLENMIYOR", message: expect.stringContaining("Bu tarayıcı bildirim desteklemiyor") });
      expect(mockRegisterNative).not.toHaveBeenCalled();
    } finally {
      restore.restore();
    }
  });
});

describe("bildirim ekranı — bu cihaz", () => {
  it("⭐ telefonda kayıt düğmesi yok, 'yakında' notu var; uyarı/hata bandı yok", () => {
    render(<NotificationDevices vapidKey={null} />);
    expect(screen.queryByTestId("cihaz-kaydet")).toBeNull();
    expect(screen.getByTestId("cihaz-yakinda")).toBeTruthy();
    expect(screen.queryByTestId("cihaz-sonuc")).toBeNull();
    expect(screen.queryByText(/yukarıdaki düğmeye/)).toBeNull();
  });

  it("push olan ortamda (web) düğme çizilir", async () => {
    render(<NotificationDevices vapidKey="x" pushHere os="web" permission="SORULMADI" />);
    await act(async () => undefined);
    expect(screen.getByTestId("cihaz-kaydet")).toBeTruthy();
    expect(screen.queryByTestId("cihaz-yakinda")).toBeNull();
  });
});

describe("derleme yapılandırması", () => {
  const kok = path.join(__dirname, "..");
  const pkg = JSON.parse(readFileSync(path.join(kok, "package.json"), "utf8")) as { expo?: { autolinking?: unknown } };
  const app = JSON.parse(readFileSync(path.join(kok, "app.json"), "utf8")) as { expo: { plugins: unknown[] } };

  it("⭐ bildirimsiz derlemede expo-notifications Android'de bağlanmaz (dışlama eklentide) ve eklentisi prebuild'e girmez", () => {
    // Dışlama package.json'da DEĞİL (oradan derleme anında geri açılamaz): bağlantı eklentisi bildirimsiz kipte yazar.
    expect(pkg.expo?.autolinking).toBeUndefined();
    const adlar = app.expo.plugins.map((p) => (Array.isArray(p) ? p[0] : p));
    expect(adlar).toContain("./plugins/withBildirimBaglantisi.js");
    expect(adlar).not.toContain("expo-notifications");
    const { DISLANAN } = require("../plugins/withBildirimBaglantisi.js") as { DISLANAN: string[] };
    // Tek öğe: Gradle eklentisi listeyi tek argümana birleştirir, iki öğe hiçbir şeyi dışlamaz (ölçüldü 2026-11-17).
    expect(DISLANAN).toEqual(["expo-notifications"]);
  });

  it("⭐ expo-notifications yalnız *-native.ts dosyalarında içe alınır", () => {
    const dosyalar: string[] = [];
    const gez = (d: string) => {
      for (const ad of readdirSync(d)) {
        const y = path.join(d, ad);
        if (statSync(y).isDirectory()) gez(y);
        else if (/\.tsx?$/.test(ad)) dosyalar.push(y);
      }
    };
    gez(path.join(kok, "src"));
    gez(path.join(kok, "app"));
    const ihlal = dosyalar.filter((y) => /(?:\bfrom\s*|\bimport\s*\(?\s*|\brequire\(\s*)["']expo-notifications["']/.test(readFileSync(y, "utf8")) && !/-native\.ts$/.test(y));
    expect(ihlal.map((y) => path.relative(kok, y))).toEqual([]);
    expect(dosyalar.some((y) => /-native\.ts$/.test(y))).toBe(true);
  });
});
