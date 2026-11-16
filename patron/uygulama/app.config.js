// Telefon push (bildirim v2 F5) DERLEME KAPISI. Varsayılan: app.json BİREBİR (bildirimsiz paket — izin engeli, Firebase
// yok, expo-notifications Android'de bağlanmaz: plugins/withBildirimBaglantisi.js). Kapı yalnız `PATRON_NATIVE_PUSH=1` ∧
// `google-services.json` (repoya GİRMEZ, .gitignore; derleme betiği depo dışından kopyalar) varken açılır; dosya yoksa tek
// satır uyarı ve app.json aynen (fail-closed). Bildirimli derleme: `npm run build:aab:bildirimli` (scripts/build-aab.mjs).
// KİMLİK tek kaynaktan (`kimlik.json`): görünen ad, paket/bundle kimliği, şema, slug, Expo sahibi + EAS proje kimliği
// (push belirteci için) ve Apple ekip kimliği app.json'un üstüne yazılır; app.json aynı değerleri taşır (build-aab onu
// okur) ve sapma `__tests__/kimlik.test.ts`te kırmızıdır.
const fs = require("node:fs");
const path = require("node:path");
const KIMLIK = require("./kimlik.json");

/** Kimlik alanlarını yapılandırmaya uygular (aynı değerdeyse anahtar sırası ve içerik değişmez). */
function withKimlik(config, kimlik = KIMLIK) {
  const extra = config.extra ?? {};
  return {
    ...config,
    name: kimlik.gorunenAd,
    slug: kimlik.slug,
    owner: kimlik.expoSahibi,
    scheme: kimlik.sema,
    ios: { ...(config.ios ?? {}), bundleIdentifier: kimlik.uygulamaKimligi, appleTeamId: kimlik.appleEkipKimligi },
    android: { ...(config.android ?? {}), package: kimlik.uygulamaKimligi },
    extra: { ...extra, eas: { ...(extra.eas ?? {}), projectId: kimlik.easProjeKimligi } },
  };
}

/** Bildirimli derlemede expo-notifications eklentisi: Android küçük simge + vurgu rengi, iOS mağaza APNs ortamı. */
function bildirimEklentisi(kimlik = KIMLIK) {
  return ["expo-notifications", { icon: "./assets/adaptive-icon-monochrome.png", color: kimlik.markaRengi, mode: "production" }];
}

/** Kapı açıkken engelden çıkan izinler: bildirim gösterme (Android 13+ çalışma zamanı istemi) + FCM alımı. */
const NATIVE_PUSH_IZINLERI = ["android.permission.POST_NOTIFICATIONS", "com.google.android.c2dm.permission.RECEIVE", "android.permission.WAKE_LOCK"];
const FIREBASE_DOSYASI = "google-services.json";
/**
 * Bildirimli kipte de ENGELLİ kalan başlatıcı rozet izinleri: expo-notifications'ın rozet kütüphanesi (ShortcutBadger)
 * üretici başlatıcılarına 20 izin ekler (ölçüldü 2026-11-17, birleşik manifest). Uygulama rozet kullanmaz
 * (`taps-native.ts` shouldSetBadge:false) → en az yetki; izinsiz rozet çağrısı kütüphanede sessizce düşer.
 */
const ROZET_IZINLERI = Object.freeze([
  "com.android.launcher.permission.READ_SETTINGS",
  "com.android.launcher.permission.WRITE_SETTINGS",
  "com.android.launcher.permission.INSTALL_SHORTCUT",
  "com.android.launcher.permission.UNINSTALL_SHORTCUT",
  "com.sec.android.provider.badge.permission.READ",
  "com.sec.android.provider.badge.permission.WRITE",
  "com.htc.launcher.permission.READ_SETTINGS",
  "com.htc.launcher.permission.UPDATE_SHORTCUT",
  "com.sonyericsson.home.permission.BROADCAST_BADGE",
  "com.sonymobile.home.permission.PROVIDER_INSERT_BADGE",
  "com.anddoes.launcher.permission.UPDATE_COUNT",
  "com.majeur.launcher.permission.UPDATE_BADGE",
  "com.huawei.android.launcher.permission.CHANGE_BADGE",
  "com.huawei.android.launcher.permission.READ_SETTINGS",
  "com.huawei.android.launcher.permission.WRITE_SETTINGS",
  "android.permission.READ_APP_BADGE",
  "com.oppo.launcher.permission.READ_SETTINGS",
  "com.oppo.launcher.permission.WRITE_SETTINGS",
  "me.everything.badger.permission.BADGE_COUNT_READ",
  "me.everything.badger.permission.BADGE_COUNT_WRITE",
]);

function withNativePush(config, { env = process.env, root = __dirname, warn = console.warn } = {}) {
  if (env.PATRON_NATIVE_PUSH !== "1") return config;
  const dosya = path.join(root, FIREBASE_DOSYASI);
  if (!fs.existsSync(dosya)) {
    warn(`PATRON_NATIVE_PUSH=1 ama ${FIREBASE_DOSYASI} yok — telefon push KAPALI derleniyor`);
    return config;
  }
  const android = config.android ?? {};
  return {
    ...config,
    android: {
      ...android,
      googleServicesFile: `./${FIREBASE_DOSYASI}`,
      blockedPermissions: [...(android.blockedPermissions ?? []).filter((p) => !NATIVE_PUSH_IZINLERI.includes(p)), ...ROZET_IZINLERI],
    },
    plugins: [...(config.plugins ?? []), bildirimEklentisi()],
    extra: { ...(config.extra ?? {}), nativePush: true },
  };
}

module.exports = ({ config }) => withNativePush(withKimlik(config));
module.exports.withKimlik = withKimlik;
module.exports.bildirimEklentisi = bildirimEklentisi;
module.exports.FIREBASE_DOSYASI = FIREBASE_DOSYASI;
module.exports.withNativePush = withNativePush;
module.exports.NATIVE_PUSH_IZINLERI = NATIVE_PUSH_IZINLERI;
module.exports.ROZET_IZINLERI = ROZET_IZINLERI;
