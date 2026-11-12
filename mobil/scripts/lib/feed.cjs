// =============================================================================
// TeksERP Mobil — eski OTA multipart sınırlayıcısı (KALINTI)
// =============================================================================
// Tablet artık yalnız Google Play'den güncellenir; uygulama bu dosyayı okumaz.
// Backend'in OTA servis ucu ve bekçisi (`Teks-Erp/scripts/test_mobile_update.ts`
// §9–§10) sınırlayıcıyı ve `manifest.mjs`i hâlâ ölçer — o uç kalkınca silinir.
// =============================================================================

/** Multipart gövdenin SABİT sınırlayıcısı (nginx `Content-Type` başlığıyla aynı). */
const MULTIPART_BOUNDARY = 'tekserpota';

module.exports = { MULTIPART_BOUNDARY };
