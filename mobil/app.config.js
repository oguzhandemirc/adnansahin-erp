// =============================================================================
// TeksERP Mobil — dinamik Expo yapılandırması
// =============================================================================
// `app.json` STATİK gerçekleri taşır (ad, paket adı, izinler) — DİNLENMEDE
// varsayılan kanalın kimliğiyle. Uygulama yalnız Google Play'den güncellenir;
// uzaktan kod güncellemesi (expo-updates) yoktur, bu yüzden burada güncelleme
// adresi de yoktur.
//
// ⚠️ KANAL DERLEMESİ: derleme betikleri `TEKSERP_KANAL=<kod>` koyar; o zaman
// kanalın kimliği (paket adı · görünen ad · görünür etiket) `deploy/kanallar.json`dan
// uygulanır (`scripts/lib/kanal.cjs`). app.json kanal için YAZILMAZ.
// =============================================================================

module.exports = ({ config }) => {
  const kanalKodu = String(process.env.TEKSERP_KANAL ?? '').trim();
  if (!kanalKodu) return config;
  // Tembel yükleme: dinlenmede yapılandırmanın yüklediği modül kümesi değişmesin.
  const { kanalYapilandirmasi } = require('./scripts/lib/kanal.cjs');
  return kanalYapilandirmasi(config, kanalKodu);
};
