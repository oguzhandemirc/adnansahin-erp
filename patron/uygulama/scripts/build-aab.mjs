#!/usr/bin/env node
// =============================================================================
// PATRON ANDROID — imzalı release paketi (Google Play AAB; duman için APK)
// =============================================================================
//   npm run build:aab          prebuild --clean → ./gradlew bundleRelease → doğrula → ~/.tekserp/patron-android/cikti/
//   npm run build:apk:duman    aynı yol, assembleRelease (emülatörde duman; mağazaya gitmez, dağıtılmaz)
//   …:bildirimli               aynı yollar ANLIK BİLDİRİMLİ (--bildirimli ya da PATRON_NATIVE_PUSH=1): Firebase istemci
//                              dosyası depo DIŞINDAN (~/.tekserp/sirlar/<ciktiOneki>-google-services.json ya da
//                              PATRON_GOOGLE_SERVICES=<yol>) uygulama köküne geçici kopyalanır (.gitignore), çıkışta silinir.
//                              Bayrak yoksa kapılar eski hâliyle AYNEN (bildirim izni/bileşeni = RET).
// İmza: YÜKLEME anahtarı (scripts/lib/android-derleme.cjs; repo dışında, parola Anahtar Zinciri'nden — hiçbir çıktıya
// basılmaz, yalnız Gradle/keytool alt sürecinin ortamına gider; Gradle daemon'da kalmasın diye --no-daemon).
// Bulut adresi derlemeye açıkça gömülür (EXPO_PUBLIC_PATRON_API) ve `.env*` dosyaları okunmaz (EXPO_NO_DOTENV=1).
// Doğrulama: birleşik manifest (paket · sürüm · izinler · bildirim bileşeni: bayraksız YOK / bayrakla ZORUNLU —
// scripts/lib/paket-denetimi.cjs), gömülü yapılandırma (nativePush · EAS proje kimliği), JS paketinde adres,
// imzanın yükleme sertifikası olması. Çıkış: 0 tamam · 1 hata.
// =============================================================================
import { spawnSync } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import derleme from "./lib/android-derleme.cjs";
import { buildTool, dur, jdkBul, sdkBul } from "./lib/android-ortam.mjs";
import denetim from "./lib/paket-denetimi.cjs";
import { kasadanOku } from "../../../scripts/lib/parola-kasasi.mjs";

const { PATRON_API, GORUNEN_AD, CIKTI_ONEKI, IMZA, CIKTI_DIZINI, ORTAM_DOSYA, ORTAM_PAROLA } = derleme;
const UYGULAMA = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const ANDROID = path.join(UYGULAMA, "android");
const APK = process.argv.includes("--apk");
/** Bildirimli derleme bayrağı; kapalıyken (varsayılan) denetim eski ret davranışıyla AYNEN çalışır. */
const BILDIRIMLI = process.argv.includes("--bildirimli") || process.env.PATRON_NATIVE_PUSH === "1";
const GOREV = APK ? "assembleRelease" : "bundleRelease";
const STORE = path.join(IMZA.dizin, IMZA.storeFile);
const KIMLIK = JSON.parse(fs.readFileSync(path.join(UYGULAMA, "kimlik.json"), "utf8"));
const FIREBASE_HEDEF = path.join(UYGULAMA, "google-services.json");
const FIREBASE_KAYNAK = process.env.PATRON_GOOGLE_SERVICES || path.join(os.homedir(), ".tekserp", "sirlar", `${CIKTI_ONEKI}-google-services.json`);

const app = JSON.parse(fs.readFileSync(path.join(UYGULAMA, "app.json"), "utf8")).expo;
const PAKET = app.android.package;
const SURUM = app.version;
const KOD = app.android.versionCode;
const baslik = (t) => console.log(`\n── ${t}`);
const sha256 = (y) => crypto.createHash("sha256").update(fs.readFileSync(y)).digest("hex");

// (0) Ortam + anahtar
const jdk = jdkBul();
if (!jdk) dur("JDK 17+ bulunamadı", "brew install openjdk@17  ya da  export JAVA_HOME=<yol>");
const sdk = sdkBul();
if (!sdk) dur("Android SDK bulunamadı (~/Library/Android/sdk)", "export ANDROID_HOME=<yol>");
if (app.name !== GORUNEN_AD) dur(`app.json expo.name "${app.name}" ≠ "${GORUNEN_AD}" (scripts/lib/android-derleme.cjs)`);
if (!Number.isInteger(KOD) || KOD < 1 || !/^\d+\.\d+\.\d+$/.test(String(SURUM))) dur("app.json: version X.Y.Z ve android.versionCode ≥ 1 olmalı");
if (!fs.existsSync(STORE)) dur(`Yükleme anahtarı yok: ${STORE}`, "Yedekten geri yükle (keystore-yedek.README.md) ya da ilk kez: node scripts/anahtar-uret.mjs");
for (const [y, beklenen] of [[path.dirname(IMZA.dizin), 0o700], [IMZA.dizin, 0o700], [STORE, 0o600]]) {
  const kip = fs.statSync(y).mode & 0o777;
  if (kip & ~beklenen) dur(`${y} izni ${kip.toString(8)} — en çok ${beklenen.toString(8)} olmalı (chmod ${beklenen.toString(8)})`);
}
const parola = kasadanOku(IMZA.kasa);
if (!parola) dur(`Anahtar Zinciri'nde tekserp/${IMZA.kasa} yok`, `Kaydet: node scripts/parola-kaydet.mjs ${IMZA.kasa} (repo kökünde)`);
const imzaEnv = { [ORTAM_DOSYA]: STORE, [ORTAM_PAROLA]: parola.toString("utf8") };
parola.fill(0);
const javaEnv = { ...process.env, JAVA_HOME: jdk, PATH: `${path.join(jdk, "bin")}${path.delimiter}${process.env.PATH ?? ""}` };
const liste = spawnSync(path.join(jdk, "bin", "keytool"), ["-list", "-v", "-keystore", STORE, "-alias", IMZA.alias, "-storepass:env", ORTAM_PAROLA], { env: { ...javaEnv, ...imzaEnv }, encoding: "utf8" });
if (liste.status !== 0) dur("Yükleme anahtarı açılamadı (Anahtar Zinciri parolası ya da dosya uyuşmuyor)");
const SERTIFIKA = ((liste.stdout.match(/SHA256:\s*([0-9A-F:]+)/) ?? [])[1] ?? "").replace(/:/g, "").toLowerCase();
// (0b) Bildirimli derleme: Firebase istemci dosyası depo dışından; paketi doğrulanır, içerik hiçbir çıktıya basılmaz.
// Bayraksız derlemede elde kalmış bir kopya kapıyı yanlışlıkla açmasın diye ortamdaki PATRON_NATIVE_PUSH da temizlenir.
if (BILDIRIMLI) {
  if (!fs.existsSync(FIREBASE_KAYNAK)) dur(`Bildirimli derleme: Firebase istemci dosyası yok: ${FIREBASE_KAYNAK}`, "PATRON_GOOGLE_SERVICES=<yol> ile verin");
  const icerik = fs.readFileSync(FIREBASE_KAYNAK, "utf8");
  if (!denetim.firebasePaketiVarMi(icerik, PAKET)) dur(`Firebase istemci dosyasında ${PAKET} istemcisi yok (yanlış proje dosyası)`);
  if (fs.existsSync(FIREBASE_HEDEF)) {
    if (fs.readFileSync(FIREBASE_HEDEF, "utf8") !== icerik) dur(`${FIREBASE_HEDEF} depo dışındaki kaynaktan farklı — elle konmuş eski kopyayı kaldırın`);
  } else {
    fs.writeFileSync(FIREBASE_HEDEF, icerik, { mode: 0o600 });
    process.on("exit", () => fs.rmSync(FIREBASE_HEDEF, { force: true }));
  }
}
console.log(`Paket ${PAKET} · sürüm ${SURUM} (versionCode ${KOD}) · ${GOREV} · ${BILDIRIMLI ? "ANLIK BİLDİRİMLİ" : "bildirimsiz"}`);
console.log(`Bulut adresi: ${PATRON_API} · JDK ${jdk} · SDK ${sdk}`);
console.log(`Yükleme sertifikası SHA-256: ${SERTIFIKA}`);

// (1) Prebuild — android/ git dışıdır; her derleme temiz üretilir (sürüm kimliği app.json'dan, elde kalan klasörden değil).
// Metro dönüşüm önbelleği EXPO_PUBLIC_* değerini anahtarına katmaz: ortak $TMPDIR/metro-cache eski bulut adresini
// pakete gömdü (ölçüldü 2026-10-16). Her derleme kendi boş TMPDIR'iyle — ortak önbelleğe dokunmadan, çıkışta silinir.
const metroTmp = fs.mkdtempSync(path.join(os.tmpdir(), "tekserp-yonetim-derleme-"));
process.on("exit", () => fs.rmSync(metroTmp, { recursive: true, force: true }));
const derlemeEnv = { ...javaEnv, PATRON_NATIVE_PUSH: BILDIRIMLI ? "1" : "0", TMPDIR: metroTmp, ANDROID_HOME: sdk, ANDROID_SDK_ROOT: sdk, EXPO_PUBLIC_PATRON_API: PATRON_API, EXPO_NO_DOTENV: "1", EXPO_NO_TELEMETRY: "1", CI: "1", NODE_ENV: "production" };
baslik("(1/3) expo prebuild --platform android --clean");
const pb = spawnSync("npx", ["expo", "prebuild", "--platform", "android", "--clean", "--no-install"], { cwd: UYGULAMA, stdio: "inherit", env: derlemeEnv });
if (pb.status !== 0) dur("prebuild başarısız");

// (2) Gradle — parola yalnız bu alt sürecin ortamında.
baslik(`(2/3) ./gradlew --no-daemon ${GOREV}`);
const gr = spawnSync(path.join(ANDROID, "gradlew"), ["--no-daemon", GOREV], { cwd: ANDROID, stdio: "inherit", env: { ...derlemeEnv, ...imzaEnv } });
delete imzaEnv[ORTAM_PAROLA];
if (gr.status !== 0) dur(`Gradle ${GOREV} başarısız (exit ${gr.status})`);

// (3) Doğrulama
baslik("(3/3) Doğrulama");
const cikti = APK ? path.join(ANDROID, "app/build/outputs/apk/release/app-release.apk") : path.join(ANDROID, "app/build/outputs/bundle/release/app-release.aab");
if (!fs.existsSync(cikti)) dur(`Çıktı yok: ${cikti}`);
const sorunlar = [];

const manifestYolu = path.join(ANDROID, "app/build/intermediates/merged_manifests/release/processReleaseManifest/AndroidManifest.xml");
const manifestAday = fs.existsSync(manifestYolu) ? manifestYolu : bul(path.join(ANDROID, "app/build/intermediates"), (y) => /merged_manifests?\/release\/.*AndroidManifest\.xml$/.test(y));
if (!manifestAday) sorunlar.push("birleşik manifest bulunamadı");
let izinler = [];
let bildirimBilesenleri = [];
if (manifestAday) {
  const m = fs.readFileSync(manifestAday, "utf8");
  // İzin/bileşen kapısı tek kaynakta (scripts/lib/paket-denetimi.cjs): bayraksız eski ret AYNEN, bayrakla bildirim kümesi kabul.
  const d = denetim.manifestDenetle(m, { paket: PAKET, kod: KOD, surum: SURUM, bildirimli: BILDIRIMLI });
  sorunlar.push(...d.sorunlar);
  izinler = d.izinler;
  bildirimBilesenleri = d.bildirimBilesenleri;
  // Mağaza uygunluğu (plugins/withAcikMetinKapali.js): release'te düz metin trafiği kapalı, paket hata ayıklanamaz.
  const uygEtiket = m.match(/<application\b[^>]*>/)?.[0] ?? "";
  if (!/android:usesCleartextTraffic="false"/.test(uygEtiket)) sorunlar.push("release manifestinde usesCleartextTraffic=false yok");
  if (/android:debuggable="true"/.test(uygEtiket)) sorunlar.push("release manifesti debuggable=true");
  // Görünen ad: uygulama etiketi @string/app_name → prebuild'in yazdığı strings.xml (kaynak app.json expo.name).
  const etiketRef = m.match(/<application\b[^>]*android:label="([^"]+)"/)?.[1];
  const strings = path.join(ANDROID, "app/src/main/res/values/strings.xml");
  const adDegeri = fs.existsSync(strings) ? fs.readFileSync(strings, "utf8").match(/<string name="app_name">([^<]*)<\/string>/)?.[1] : undefined;
  if (etiketRef !== "@string/app_name" || adDegeri !== GORUNEN_AD) sorunlar.push(`uygulama etiketi ${etiketRef ?? "YOK"} = "${adDegeri ?? "?"}" ≠ "${GORUNEN_AD}"`);
}

const js = zipGirdisi(cikti, APK ? "assets/index.android.bundle" : "base/assets/index.android.bundle");
if (!js) sorunlar.push("JS paketi (index.android.bundle) okunamadı");
else {
  if (!js.includes(Buffer.from(PATRON_API))) sorunlar.push(`JS paketinde bulut adresi (${PATRON_API}) yok`);
  // RN'in kendi "localhost:8081" geliştirme dizgesi kütüphanededir; aranan bizim geliştirme/CI adreslerimiz.
  for (const yasak of ["patron.ornek.invalid", "localhost:4620", "127.0.0.1:4620"]) if (js.includes(Buffer.from(yasak))) sorunlar.push(`JS paketinde geliştirme adresi: ${yasak}`);
}

// Gömülü Expo yapılandırması: bildirim kapısı kiple tutarlı + EAS proje kimliği (push belirteci bunsuz alınamaz).
const gomulu = zipGirdisi(cikti, APK ? "assets/app.config" : "base/assets/app.config");
if (!gomulu) sorunlar.push("gömülü app.config okunamadı");
else sorunlar.push(...denetim.gomuluYapilandirmaDenetle(gomulu.toString("utf8"), { bildirimli: BILDIRIMLI, projeKimligi: KIMLIK.easProjeKimligi }));
// Bildirimli: google-services eklentisi Firebase uygulama kimliğini kaynaklara yazmış olmalı (değer basılmaz).
if (BILDIRIMLI) {
  const gs = bul(path.join(ANDROID, "app/build/generated/res"), (y) => /GoogleServices\/values\/values\.xml$/i.test(y) || /google-services.*values\.xml$/i.test(y));
  if (!gs || !/name="google_app_id"/.test(fs.readFileSync(gs, "utf8"))) sorunlar.push("Firebase kaynakları (google_app_id) üretilmemiş");
}

const imza = spawnSync(path.join(jdk, "bin", "keytool"), ["-printcert", "-jarfile", cikti], { env: javaEnv, encoding: "utf8" });
const imzaIzi = ((imza.stdout.match(/SHA256:\s*([0-9A-F:]+)/) ?? [])[1] ?? "").replace(/:/g, "").toLowerCase();
if (APK) {
  const apksigner = buildTool(sdk, "apksigner");
  const v = apksigner ? spawnSync(apksigner, ["verify", "--print-certs", cikti], { env: javaEnv, encoding: "utf8" }) : null;
  const iz = (v?.stdout.match(/certificate SHA-256 digest:\s*([0-9a-f]+)/) ?? [])[1] ?? "";
  if (!v || v.status !== 0 || iz !== SERTIFIKA) sorunlar.push(`APK imzası yükleme sertifikası değil (${iz || "doğrulanamadı"})`);
} else if (imzaIzi !== SERTIFIKA) sorunlar.push(`AAB imzası yükleme sertifikası değil (${imzaIzi || "imzasız"})`);

if (sorunlar.length) dur("DOĞRULAMA KIRMIZI — paket kopyalanmadı", ...sorunlar);

fs.mkdirSync(CIKTI_DIZINI, { recursive: true, mode: 0o700 });
const ad = `${CIKTI_ONEKI}-${SURUM}-vc${KOD}${BILDIRIMLI ? ".bildirimli" : ""}.${APK ? "duman.apk" : "aab"}`;
const hedef = path.join(CIKTI_DIZINI, ad);
fs.copyFileSync(cikti, hedef);
const ozet = sha256(hedef);
fs.writeFileSync(`${hedef}.sha256`, `${ozet}  ${ad}\n`);
console.log(`✓ ${hedef}`);
console.log(`  SHA-256 ${ozet} · ${(fs.statSync(hedef).size / 1048576).toFixed(1)} MB`);
console.log(`  izinler: ${izinler.join(", ") || "(yok)"}`);
console.log(`  bildirim bileşenleri: ${bildirimBilesenleri.join(", ") || "(yok)"}`);
console.log(`  imza: yükleme sertifikası ${SERTIFIKA.slice(0, 16)}…`);

function bul(kok, yuklem) {
  if (!fs.existsSync(kok)) return null;
  for (const g of fs.readdirSync(kok, { withFileTypes: true })) {
    const y = path.join(kok, g.name);
    if (g.isDirectory()) {
      const r = bul(y, yuklem);
      if (r) return r;
    } else if (yuklem(y)) return y;
  }
  return null;
}

/** ZIP içinden tek girdi (unzip -p); yoksa null. */
function zipGirdisi(zip, girdi) {
  const r = spawnSync("unzip", ["-p", zip, girdi], { maxBuffer: 256 * 1024 * 1024 });
  return r.status === 0 && r.stdout.length > 0 ? r.stdout : null;
}
