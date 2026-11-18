#!/usr/bin/env node
// =============================================================================
// PATRON iOS — yerel derleme İSKELETİ (Xcode; EAS bulut derlemesi KULLANILMAZ)
// =============================================================================
//   npm run ios:prebuild                 prebuild --clean (+ pod install) → yapılandırma doğrulaması. İmza/ağ yok.
//   npm run ios:prebuild:bildirimli      aynısı ANLIK BİLDİRİMLİ (Firebase istemci dosyası build-aab ile aynı düzende
//                                        depo dışından geçici kopyalanır; iOS push'u APNs'tir, dosya yalnız ortak
//                                        derleme kapısını açar). aps-environment=production doğrulanır.
//   … --arsiv                            + xcodebuild archive + exportArchive (App Store Connect .ipa) →
//                                        ~/.tekserp/patron-ios/cikti/. İMZA İSTER: Xcode'da Apple hesabı (ekip
//                                        kimliği kimlik.json `appleEkipKimligi`) + Apple Distribution sertifikası;
//                                        profil -allowProvisioningUpdates ile otomatik. YÜKLEME bu betikte YOKTUR
//                                        (kullanıcı adımı; sonda yazdırılan Transporter/altool yönergesi).
// iOS 27 KÖPRÜSÜ (2026-11-19): plugins/withSahneYasamDongusu.js UIScene'i benimsetir (Xcode 27 / iOS 27 SDK ile derlenen,
// UIScene'siz uygulama açılışta sonlandırılır — Apple TN3187; App Store Nisan 2027'den itibaren iOS 27 SDK ister) ve pod
// dağıtım hedeflerini ≥ 15.1 yapar. Expo SDK 58'e geçince eklenti, testi ve aşağıdaki iki sahne denetimi SİLİNİR.
// `ios/` prebuild çıktısıdır, git dışıdır (.gitignore `/ios`, Android `/android` ile aynı düzen); her derleme temiz üretilir.
// Bulut adresi derlemeye açıkça gömülür (EXPO_PUBLIC_PATRON_API), `.env*` okunmaz. Çıkış: 0 tamam · 1 hata.
// =============================================================================
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import derleme from "./lib/android-derleme.cjs";
import denetim from "./lib/paket-denetimi.cjs";

const { PATRON_API, CIKTI_ONEKI } = derleme;
const UYGULAMA = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const IOS = path.join(UYGULAMA, "ios");
const ARSIV = process.argv.includes("--arsiv");
const BILDIRIMLI = process.argv.includes("--bildirimli") || process.env.PATRON_NATIVE_PUSH === "1";
const KIMLIK = JSON.parse(fs.readFileSync(path.join(UYGULAMA, "kimlik.json"), "utf8"));
const app = JSON.parse(fs.readFileSync(path.join(UYGULAMA, "app.json"), "utf8")).expo;
const FIREBASE_HEDEF = path.join(UYGULAMA, "google-services.json");
const FIREBASE_KAYNAK = process.env.PATRON_GOOGLE_SERVICES || path.join(os.homedir(), ".tekserp", "sirlar", `${CIKTI_ONEKI}-google-services.json`);
const CIKTI_DIZINI = path.join(os.homedir(), ".tekserp", "patron-ios", "cikti");

function dur(mesaj, ...ek) {
  console.error(`\n✗ ${mesaj}`);
  for (const s of ek) console.error(`  · ${s}`);
  process.exit(1);
}
const baslik = (t) => console.log(`\n── ${t}`);
const calistir = (komut, argv, secenek) => spawnSync(komut, argv, { stdio: "inherit", ...secenek });

// (0) Ortam
if (process.platform !== "darwin") dur("iOS derlemesi yalnız macOS'ta");
const xc = spawnSync("xcodebuild", ["-version"], { encoding: "utf8" });
if (xc.status !== 0) dur("Xcode yok (xcodebuild)", "App Store'dan Xcode kurun, sonra: sudo xcode-select -s /Applications/Xcode.app");
if (spawnSync("pod", ["--version"], { encoding: "utf8" }).status !== 0) dur("CocoaPods yok", "brew install cocoapods");
if (!/^\d+$/.test(String(app.ios?.buildNumber ?? ""))) dur("app.json ios.buildNumber tam sayı dizgesi olmalı");
if (app.ios?.bundleIdentifier !== KIMLIK.uygulamaKimligi) dur(`app.json ios.bundleIdentifier ≠ kimlik.json (${KIMLIK.uygulamaKimligi})`);
console.log(`${xc.stdout.split("\n")[0]} · bundle ${KIMLIK.uygulamaKimligi} · sürüm ${app.version} (${app.ios.buildNumber}) · ${BILDIRIMLI ? "ANLIK BİLDİRİMLİ" : "bildirimsiz"}${ARSIV ? " · ARŞİV" : ""}`);

if (BILDIRIMLI) {
  if (!fs.existsSync(FIREBASE_KAYNAK)) dur(`Bildirimli derleme: Firebase istemci dosyası yok: ${FIREBASE_KAYNAK}`, "PATRON_GOOGLE_SERVICES=<yol> ile verin");
  const icerik = fs.readFileSync(FIREBASE_KAYNAK, "utf8");
  if (!denetim.firebasePaketiVarMi(icerik, KIMLIK.uygulamaKimligi)) dur(`Firebase istemci dosyasında ${KIMLIK.uygulamaKimligi} istemcisi yok`);
  if (fs.existsSync(FIREBASE_HEDEF)) {
    if (fs.readFileSync(FIREBASE_HEDEF, "utf8") !== icerik) dur(`${FIREBASE_HEDEF} depo dışındaki kaynaktan farklı — elle konmuş eski kopyayı kaldırın`);
  } else {
    fs.writeFileSync(FIREBASE_HEDEF, icerik, { mode: 0o600 });
    process.on("exit", () => fs.rmSync(FIREBASE_HEDEF, { force: true }));
  }
}

const metroTmp = fs.mkdtempSync(path.join(os.tmpdir(), "adnansahin-ios-derleme-"));
process.on("exit", () => fs.rmSync(metroTmp, { recursive: true, force: true }));
const derlemeEnv = { ...process.env, PATRON_NATIVE_PUSH: BILDIRIMLI ? "1" : "0", TMPDIR: metroTmp, EXPO_PUBLIC_PATRON_API: PATRON_API, EXPO_NO_DOTENV: "1", EXPO_NO_TELEMETRY: "1", CI: "1", NODE_ENV: "production" };

// (1) Prebuild (+ pod install)
baslik("(1) expo prebuild --platform ios --clean");
if (calistir("npx", ["expo", "prebuild", "--platform", "ios", "--clean"], { cwd: UYGULAMA, env: derlemeEnv }).status !== 0) dur("prebuild başarısız");

// (2) Yapılandırma doğrulaması (imzasız; ölçülebilen her şey)
baslik("(2) Doğrulama");
const calisma = fs.readdirSync(IOS).find((a) => a.endsWith(".xcworkspace"));
if (!calisma) dur("ios/*.xcworkspace yok (pod install çalışmadı mı?)");
const ad = calisma.replace(/\.xcworkspace$/, "");
const sorunlar = [];
const plistOku = (dosya, anahtar) => {
  const r = spawnSync("/usr/libexec/PlistBuddy", ["-c", `Print :${anahtar}`, dosya], { encoding: "utf8" });
  return r.status === 0 ? r.stdout.trim() : undefined;
};
const infoPlist = path.join(IOS, ad, "Info.plist");
const surum = plistOku(infoPlist, "CFBundleShortVersionString");
const yapi = plistOku(infoPlist, "CFBundleVersion");
if (surum !== app.version && surum !== "$(MARKETING_VERSION)") sorunlar.push(`CFBundleShortVersionString ${surum} ≠ ${app.version}`);
if (yapi !== String(app.ios.buildNumber) && yapi !== "$(CURRENT_PROJECT_VERSION)") sorunlar.push(`CFBundleVersion ${yapi} ≠ ${app.ios.buildNumber}`);
if (plistOku(infoPlist, "ITSAppUsesNonExemptEncryption") !== "false") sorunlar.push("ITSAppUsesNonExemptEncryption=false yok (her yüklemede şifreleme sorusu çıkar)");
// iOS 27 SDK: UIScene benimsenmezse uygulama açılışta sonlandırılır (TN3187) → plugins/withSahneYasamDongusu.js
if (plistOku(infoPlist, "UIApplicationSceneManifest:UISceneConfigurations:UIWindowSceneSessionRoleApplication:0:UISceneDelegateClassName") !== "$(PRODUCT_MODULE_NAME).SceneDelegate") sorunlar.push("Info.plist UIApplicationSceneManifest (SceneDelegate) yok — iOS 27'de açılışta sonlandırılır");
const appDelegateYolu = path.join(IOS, ad, "AppDelegate.swift");
const appDelegate = fs.existsSync(appDelegateYolu) ? fs.readFileSync(appDelegateYolu, "utf8") : "";
if (!/class SceneDelegate\b/.test(appDelegate)) sorunlar.push("AppDelegate.swift'te SceneDelegate yok");
if (appDelegate.includes("UIWindow(frame:")) sorunlar.push("AppDelegate.swift hâlâ UIWindow(frame:) ile pencere kuruyor");
const pbx = fs.readFileSync(path.join(IOS, `${ad}.xcodeproj`, "project.pbxproj"), "utf8");
if (!pbx.includes(`PRODUCT_BUNDLE_IDENTIFIER = ${KIMLIK.uygulamaKimligi};`)) sorunlar.push("pbxproj bundle kimliği uyuşmuyor");
if (!pbx.includes(`DEVELOPMENT_TEAM = ${KIMLIK.appleEkipKimligi};`)) sorunlar.push("pbxproj DEVELOPMENT_TEAM (Apple ekip kimliği) yok");
const yetki = path.join(IOS, ad, `${ad}.entitlements`);
const aps = fs.existsSync(yetki) ? plistOku(yetki, "aps-environment") : undefined;
if (BILDIRIMLI && aps !== "production") sorunlar.push(`aps-environment ${aps ?? "YOK"} ≠ production`);
if (!BILDIRIMLI && aps) sorunlar.push(`bildirimsiz derlemede aps-environment=${aps}`);
if (sorunlar.length) dur("DOĞRULAMA KIRMIZI", ...sorunlar);
console.log(`✓ ${calisma} · şema ${ad} · aps-environment ${aps ?? "(yok)"} · ekip ${KIMLIK.appleEkipKimligi}`);
if (!ARSIV) {
  console.log("Arşiv istenmedi (--arsiv): imza/yükleme adımı çalıştırılmadı.");
  process.exit(0);
}

// (3) Arşiv + dışa aktarma — İMZA GEREKİR (kullanıcının Xcode'daki Apple hesabı). Yükleme YOK.
fs.mkdirSync(CIKTI_DIZINI, { recursive: true, mode: 0o700 });
const etiket = `${CIKTI_ONEKI}-${app.version}-b${app.ios.buildNumber}${BILDIRIMLI ? ".bildirimli" : ""}`;
const arsivYolu = path.join(CIKTI_DIZINI, `${etiket}.xcarchive`);
baslik("(3) xcodebuild archive");
const ar = calistir("xcodebuild", ["-workspace", path.join(IOS, calisma), "-scheme", ad, "-configuration", "Release", "-destination", "generic/platform=iOS", "-archivePath", arsivYolu, "-allowProvisioningUpdates", "archive"], { cwd: IOS, env: derlemeEnv });
if (ar.status !== 0) dur("archive başarısız", "Xcode → Settings → Accounts: ekip hesabı ekli mi; Apple Distribution sertifikası var mı");
const secenekler = path.join(metroTmp, "ExportOptions.plist");
fs.writeFileSync(secenekler, `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
  <key>method</key><string>app-store-connect</string>
  <key>destination</key><string>export</string>
  <key>teamID</key><string>${KIMLIK.appleEkipKimligi}</string>
  <key>signingStyle</key><string>automatic</string>
  <key>uploadSymbols</key><true/>
</dict></plist>
`);
baslik("(4) xcodebuild -exportArchive");
const disari = path.join(CIKTI_DIZINI, etiket);
const ex = calistir("xcodebuild", ["-exportArchive", "-archivePath", arsivYolu, "-exportPath", disari, "-exportOptionsPlist", secenekler, "-allowProvisioningUpdates"], { env: derlemeEnv });
if (ex.status !== 0) dur("exportArchive başarısız");
const ipa = fs.readdirSync(disari).find((a) => a.endsWith(".ipa"));
if (!ipa) dur(`.ipa üretilmedi: ${disari}`);
console.log(`✓ ${path.join(disari, ipa)}`);
console.log(`Yükleme (kullanıcı adımı, bu betik YAPMAZ): Transporter uygulamasıyla .ipa'yı App Store Connect'e (uygulama ${KIMLIK.appStoreUygulamaKimligi}) gönderin.`);
