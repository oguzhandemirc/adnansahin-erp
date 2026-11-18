// iOS UIScene köprüsü (plugins/withSahneYasamDongusu.js, 2026-11-19): iOS 27 SDK ile derlenen ve UIScene'i benimsemeyen
// uygulama açılışta sonlandırılır (TN3187). Fikstürler Expo SDK 54 prebuild çıktısının birebir kopyasıdır
// (__tests__/fixtures/*.expo54*). Expo SDK 58'e geçince eklenti ve bu test silinir.
// NEGATİF SONDA (2026-11-19, geri alındı): appDelegateDuzenle'de PENCERE_BLOGU sökümü kapatılınca
// "UIWindow(frame:) kalkar" ❌; işaret denetimi kaldırılınca "iki kez uygulanınca tek kopya" ❌.
import { readFileSync } from "node:fs";
import path from "node:path";

// eslint-disable-next-line @typescript-eslint/no-require-imports
const e = require("../plugins/withSahneYasamDongusu.js") as {
  infoPlistDuzenle: (p: Record<string, unknown>) => Record<string, unknown>;
  appDelegateDuzenle: (s: string) => string;
  podfileDuzenle: (s: string) => string;
};
const fik = (ad: string) => readFileSync(path.join(__dirname, "fixtures", ad), "utf8");
const APP_DELEGATE = fik("AppDelegate.expo54.swift");
const PODFILE = fik("Podfile.expo54");
const say = (s: string, alt: string) => s.split(alt).length - 1;

describe("Info.plist sahne manifesti", () => {
  it("boş plist'e tek sahneli manifest yazılır", () => {
    const p = e.infoPlistDuzenle({});
    expect(p.UIApplicationSceneManifest).toEqual({
      UIApplicationSupportsMultipleScenes: false,
      UISceneConfigurations: {
        UIWindowSceneSessionRoleApplication: [
          { UISceneConfigurationName: "Default Configuration", UISceneDelegateClassName: "$(PRODUCT_MODULE_NAME).SceneDelegate" },
        ],
      },
    });
  });
  it("var olan anahtarlar korunur, iki kez uygulama aynı sonucu verir", () => {
    const bir = e.infoPlistDuzenle({ CFBundleName: "x" });
    expect(bir.CFBundleName).toBe("x");
    expect(e.infoPlistDuzenle(bir)).toEqual(bir);
  });
});

describe("AppDelegate.swift → SceneDelegate", () => {
  const yeni = e.appDelegateDuzenle(APP_DELEGATE);
  it("⭐ UIWindow(frame:) ve AppDelegate'teki startReactNative kalkar", () => {
    expect(APP_DELEGATE).toContain("UIWindow(frame: UIScreen.main.bounds)");
    expect(yeni).not.toContain("UIWindow(frame:");
    expect(say(yeni, "factory.startReactNative(")).toBe(1); // yalnız SceneDelegate'teki
    expect(yeni.indexOf("factory.startReactNative(")).toBeGreaterThan(yeni.indexOf("class SceneDelegate"));
  });
  it("fabrika kurulumu ve bindReactNativeFactory kalır; açılış seçenekleri saklanır", () => {
    expect(yeni).toContain("bindReactNativeFactory(factory)");
    expect(yeni).toContain("reactNativeFactory = factory");
    expect(yeni).toContain("var launchOptions: [UIApplication.LaunchOptionsKey: Any]?");
    expect(yeni).toContain("self.launchOptions = launchOptions");
    expect(yeni).toContain("return super.application(application, didFinishLaunchingWithOptions: launchOptions)");
  });
  it("⭐ SceneDelegate dosya sonuna eklenir ve sahne penceresinde RN'i başlatır", () => {
    expect(yeni).toMatch(/class SceneDelegate: UIResponder, UIWindowSceneDelegate \{/);
    expect(yeni).toContain("UIWindow(windowScene: windowScene)");
    expect(yeni).toContain("openURLContexts");
    expect(yeni).toContain("continue userActivity: NSUserActivity");
    expect(yeni.trimEnd().endsWith("}")).toBe(true);
  });
  it("⭐ iki kez uygulanınca tek kopya", () => {
    const iki = e.appDelegateDuzenle(yeni);
    expect(iki).toBe(yeni);
    expect(say(iki, "class SceneDelegate")).toBe(1);
    expect(say(iki, "var launchOptions:")).toBe(1);
  });
  it("⭐ kalıp yoksa hata fırlatır (sessiz geçmez)", () => {
    expect(() => e.appDelegateDuzenle(APP_DELEGATE.replace("UIWindow(frame: UIScreen.main.bounds)", "UIWindow()"))).toThrow(/beklenen kalıp yok/);
    expect(() => e.appDelegateDuzenle(APP_DELEGATE.replace("bindReactNativeFactory(factory)", ""))).toThrow(/bindReactNativeFactory/);
    expect(() => e.appDelegateDuzenle("")).toThrow(/beklenen kalıp yok/);
  });
});

describe("Podfile pod dağıtım hedefi", () => {
  const yeni = e.podfileDuzenle(PODFILE);
  it("post_install'a eklenir, react_native_post_install korunur", () => {
    expect(yeni).toContain("patron_bc.build_settings['IPHONEOS_DEPLOYMENT_TARGET'] = patron_hedef");
    expect(yeni).toContain("react_native_post_install(");
    expect(yeni.indexOf("patron_hedef =")).toBeGreaterThan(yeni.indexOf("post_install do |installer|"));
  });
  it("iki kez uygulanınca tek kopya; post_install yoksa hata", () => {
    expect(e.podfileDuzenle(yeni)).toBe(yeni);
    expect(() => e.podfileDuzenle("platform :ios, '15.1'\n")).toThrow(/post_install/);
  });
});
