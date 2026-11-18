// iOS UIScene yaşam döngüsü KÖPRÜSÜ (2026-11-19). Expo SDK 54 / RN 0.81 prebuild'i pencereyi AppDelegate'te
// `UIWindow(frame:)` ile kurar; iOS 27 SDK (Xcode 27) ile derlenen ve UIScene'i benimsemeyen uygulamayı iOS 27 açılışta
// sonlandırır (çökme tepesi `_UIApplicationEvaluateRuntimeIssueForNoSceneLifecycleAdoption`, Apple TN3187). Bu eklenti:
//   (1) Info.plist'e tek sahneli `UIApplicationSceneManifest` yazar (temsilci `$(PRODUCT_MODULE_NAME).SceneDelegate`);
//   (2) AppDelegate.swift'te açılış seçeneklerini saklar, pencere kurulumunu kaldırır ve dosya sonuna `SceneDelegate`
//       ekler (ayrı dosya yok → pbxproj düzenlenmez); RN'i sahne bağlanınca o sahnenin penceresinde başlatır, URL /
//       evrensel bağlantı / ön-arka plan olaylarını AppDelegate'e (Expo abonelerine) iletir;
//   (3) Podfile post_install'da her pod hedefinin IPHONEOS_DEPLOYMENT_TARGET'ını en az uygulamanınkine çeker
//       (Xcode 27, pod hedefinde < 15.0'ı HATA sayar: RNSVG 12.4, RNCAsyncStorage 13.4).
// FAIL-CLOSED: beklenen kalıp bulunamazsa hata fırlatır. İdempotent. Expo SDK 58'e geçince (şablon UIScene'i kendi
// benimser) bu eklenti SİLİNİR.
const { withInfoPlist, withAppDelegate, withPodfile } = require("@expo/config-plugins");

const AD = "withSahneYasamDongusu";
const ISARET = "// TeksERP Patron: plugins/withSahneYasamDongusu.js";
const POD_ISARET = "# TeksERP Patron: plugins/withSahneYasamDongusu.js";

const SAHNE_MANIFESTI = Object.freeze({
  UIApplicationSupportsMultipleScenes: false,
  UISceneConfigurations: {
    UIWindowSceneSessionRoleApplication: [
      { UISceneConfigurationName: "Default Configuration", UISceneDelegateClassName: "$(PRODUCT_MODULE_NAME).SceneDelegate" },
    ],
  },
});

/** Info.plist nesnesine sahne manifestini yazar (var olanın üstüne; sabit içerik → idempotent). */
function infoPlistDuzenle(plist) {
  return { ...plist, UIApplicationSceneManifest: JSON.parse(JSON.stringify(SAHNE_MANIFESTI)) };
}

const FABRIKA_OZELLIGI = /^([ \t]*)var reactNativeFactory: RCTReactNativeFactory\?\n/m;
const BAGLA = /^([ \t]*)bindReactNativeFactory\(factory\)\n/m;
const PENCERE_BLOGU =
  /\n#if os\(iOS\) \|\| os\(tvOS\)\n[ \t]*window = UIWindow\(frame: UIScreen\.main\.bounds\)\n[ \t]*factory\.startReactNative\(\s*withModuleName: "main",\s*in: window,\s*launchOptions: launchOptions\)\n#endif\n/;

const SAHNE_TEMSILCISI = `
${ISARET}
// iOS 27 / TN3187: pencere sahneye bağlanınca kurulur ve RN o pencerede başlar. AppDelegate'in açılış seçenekleri
// soğuk açılış URL'siyle birleştirilir; URL, evrensel bağlantı ve ön/arka plan olayları AppDelegate'e (Expo abonelerine)
// iletilir. Bildirim yanıtı UNUserNotificationCenter temsilcisinden gelir, sahneden etkilenmez.
class SceneDelegate: UIResponder, UIWindowSceneDelegate {
  var window: UIWindow?

  func scene(
    _ scene: UIScene,
    willConnectTo session: UISceneSession,
    options connectionOptions: UIScene.ConnectionOptions
  ) {
    guard let windowScene = scene as? UIWindowScene,
          let app = UIApplication.shared.delegate as? AppDelegate,
          let factory = app.reactNativeFactory else { return }
    let window = UIWindow(windowScene: windowScene)
    self.window = window
    app.window = window
    var launch = app.launchOptions ?? [:]
    if let url = connectionOptions.urlContexts.first?.url {
      launch[.url] = url
    }
    factory.startReactNative(withModuleName: "main", in: window, launchOptions: launch)
    if let activity = connectionOptions.userActivities.first {
      _ = app.application(UIApplication.shared, continue: activity, restorationHandler: { _ in })
    }
  }

  func scene(_ scene: UIScene, openURLContexts URLContexts: Set<UIOpenURLContext>) {
    guard let app = UIApplication.shared.delegate as? AppDelegate else { return }
    for context in URLContexts {
      _ = app.application(UIApplication.shared, open: context.url, options: [:])
    }
  }

  func scene(_ scene: UIScene, continue userActivity: NSUserActivity) {
    guard let app = UIApplication.shared.delegate as? AppDelegate else { return }
    _ = app.application(UIApplication.shared, continue: userActivity, restorationHandler: { _ in })
  }

  func sceneDidBecomeActive(_ scene: UIScene) {
    (UIApplication.shared.delegate as? AppDelegate)?.applicationDidBecomeActive(UIApplication.shared)
  }

  func sceneWillResignActive(_ scene: UIScene) {
    (UIApplication.shared.delegate as? AppDelegate)?.applicationWillResignActive(UIApplication.shared)
  }

  func sceneWillEnterForeground(_ scene: UIScene) {
    (UIApplication.shared.delegate as? AppDelegate)?.applicationWillEnterForeground(UIApplication.shared)
  }

  func sceneDidEnterBackground(_ scene: UIScene) {
    (UIApplication.shared.delegate as? AppDelegate)?.applicationDidEnterBackground(UIApplication.shared)
  }
}
`;

/** Swift AppDelegate metnini sahne tabanlı açılışa çevirir. Kalıp yoksa hata; ikinci uygulamada değişmez. */
function appDelegateDuzenle(icerik) {
  if (icerik.includes(ISARET)) {
    if (!icerik.includes("class SceneDelegate") || PENCERE_BLOGU.test(icerik)) throw new Error(`${AD}: AppDelegate yarım düzenlenmiş (işaret var, kalıp tutarsız)`);
    return icerik;
  }
  if (/class SceneDelegate\b/.test(icerik)) throw new Error(`${AD}: AppDelegate'te başka bir SceneDelegate zaten var`);
  for (const [ad, kalip] of [["reactNativeFactory özelliği", FABRIKA_OZELLIGI], ["bindReactNativeFactory(factory)", BAGLA], ["UIWindow(frame:) + startReactNative bloğu", PENCERE_BLOGU]]) {
    if (!kalip.test(icerik)) throw new Error(`${AD}: AppDelegate.swift'te beklenen kalıp yok: ${ad} (Expo şablonu değişti mi?)`);
  }
  let yeni = icerik.replace(FABRIKA_OZELLIGI, (m, g) => `${m}${g}var launchOptions: [UIApplication.LaunchOptionsKey: Any]?\n`);
  yeni = yeni.replace(BAGLA, (m, g) => `${m}${g}self.launchOptions = launchOptions\n${g}${ISARET}: pencere ve RN başlatma SceneDelegate'te\n`);
  yeni = yeni.replace(PENCERE_BLOGU, "");
  return `${yeni.replace(/\n*$/, "\n")}${SAHNE_TEMSILCISI}`;
}

const POST_INSTALL = /^([ \t]*)post_install do \|installer\|\n/m;
const POD_BLOGU = `    ${POD_ISARET}
    # Xcode 27: pod hedefi IPHONEOS_DEPLOYMENT_TARGET < 15.0 HATA → en az uygulamanınki.
    patron_hedef = podfile_properties['ios.deploymentTarget'] || '15.1'
    installer.pods_project.targets.each do |patron_t|
      patron_t.build_configurations.each do |patron_bc|
        patron_v = patron_bc.build_settings['IPHONEOS_DEPLOYMENT_TARGET']
        if patron_v.nil? || Gem::Version.new(patron_v) < Gem::Version.new(patron_hedef)
          patron_bc.build_settings['IPHONEOS_DEPLOYMENT_TARGET'] = patron_hedef
        end
      end
    end
`;

/** Podfile post_install bloğunun BAŞINA (mevcut çağrılara dokunmadan) dağıtım hedefi düzeltmesini ekler. */
function podfileDuzenle(icerik) {
  if (icerik.includes(POD_ISARET)) return icerik;
  if (!POST_INSTALL.test(icerik)) throw new Error(`${AD}: Podfile'da post_install bloğu yok`);
  if (!icerik.includes("podfile_properties")) throw new Error(`${AD}: Podfile'da podfile_properties yok`);
  return icerik.replace(POST_INSTALL, (m) => `${m}${POD_BLOGU}`);
}

function withSahneYasamDongusu(config) {
  config = withInfoPlist(config, (c) => {
    c.modResults = infoPlistDuzenle(c.modResults);
    return c;
  });
  config = withAppDelegate(config, (c) => {
    if (c.modResults.language !== "swift") throw new Error(`${AD}: AppDelegate Swift değil (${c.modResults.language})`);
    c.modResults.contents = appDelegateDuzenle(c.modResults.contents);
    return c;
  });
  config = withPodfile(config, (c) => {
    c.modResults.contents = podfileDuzenle(c.modResults.contents);
    return c;
  });
  return config;
}

module.exports = withSahneYasamDongusu;
module.exports.infoPlistDuzenle = infoPlistDuzenle;
module.exports.appDelegateDuzenle = appDelegateDuzenle;
module.exports.podfileDuzenle = podfileDuzenle;
module.exports.SAHNE_MANIFESTI = SAHNE_MANIFESTI;
