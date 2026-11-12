// =============================================================================
// TeksERP Mobil — Android 16 büyük ekran yön kilidi muafiyeti
// =============================================================================
// targetSdk 36 ile Android 16, en kısa kenarı ≥ 600dp ekranlarda (tablet) uygulamanın
// yön kilidini YOK SAYAR; `useLandscapeLock` tablette etkisiz kalır ve yatay için
// çizilen ekranlar dikeye döner. Bu özellik bugünkü davranışı (tablette yatay kilit)
// korur; Android yalnız targetSdk 36 için tanır — targetSdk 37'de yatay kilit
// olmadan ekranlar dikeyde de çalışmak zorundadır.
// =============================================================================

const { withAndroidManifest } = require('@expo/config-plugins');

const OZELLIK = 'android.window.PROPERTY_COMPAT_ALLOW_RESTRICTED_RESIZABILITY';

module.exports = function withRestrictedResizabilityOptOut(config) {
  return withAndroidManifest(config, (cfg) => {
    const uygulama = cfg.modResults.manifest.application?.[0];
    if (!uygulama) {
      throw new Error('AndroidManifest <application> bulunamadı — yön kilidi muafiyeti yazılamadı.');
    }
    const ozellikler = (uygulama.property ??= []);
    // İdempotent: prebuild mevcut android/ üzerinde yeniden koşabilir.
    if (!ozellikler.some((o) => o.$?.['android:name'] === OZELLIK)) {
      ozellikler.push({ $: { 'android:name': OZELLIK, 'android:value': 'true' } });
    }
    return cfg;
  });
};
