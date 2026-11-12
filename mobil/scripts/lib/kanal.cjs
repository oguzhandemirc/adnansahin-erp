// =============================================================================
// TeksERP Mobil — TABLET DERLEMESİNİN KANAL KİMLİĞİ (deploy/kanallar.json)
// =============================================================================
// Kanal kimliği (paket adı · görünen ad · görünür etiket) DERLEME ANINDA enjekte
// edilir: derleme betikleri `TEKSERP_KANAL` ortam değişkenini koyar, `app.config.js`
// onu görünce kimliği kayıt defterinden uygular. `app.json` DİNLENME (varsayilan
// kanal) kimliğini taşır ve bir kanal için YAZILMAZ.
//
// ⚠️ CommonJS BİLİNÇLİ: `app.config.js` Expo tarafından `require` edilir. Kayıt
// defterinin TAM doğrulaması `scripts/lib/kanallar.mjs` `kanalCoz`dadır; derleme
// betikleri onu ÖNCE çağırır. Burada yalnız okuma + kapalı küme (bilinmeyen kod =
// hata) + kimliğin uygulanması/ölçülmesi yaşar. Tablet yalnız Google Play'den
// dağıtılır: yapılandırmada `updates`/`runtimeVersion` bulunmaz ve bu ÖLÇÜLÜR.
// =============================================================================

const fs = require('node:fs');
const path = require('node:path');

/** Derleme betiklerinin çocuk süreçlere (prebuild · gradle · export · config) geçirdiği ad. */
const KANAL_ORTAM = 'TEKSERP_KANAL';
const KAYIT_YOLU = path.join(__dirname, '..', '..', '..', 'deploy', 'kanallar.json');

/** Kayıt defterinden bir kanal — okunamazsa ya da kod kayıtlı değilse HATA (fail-closed). */
function kanalKaydiOku(kod, kayitYolu = KAYIT_YOLU) {
  let kayit;
  try {
    kayit = JSON.parse(fs.readFileSync(kayitYolu, 'utf8'));
  } catch (e) {
    throw new Error(`${KANAL_ORTAM}="${kod}" ama kanal kayıt defteri okunamadı (${kayitYolu}): ${e.message}`);
  }
  const kanallar = kayit && typeof kayit.kanallar === 'object' && kayit.kanallar ? kayit.kanallar : {};
  if (!Object.prototype.hasOwnProperty.call(kanallar, kod)) {
    throw new Error(
      `BİLİNMEYEN KANAL ${KANAL_ORTAM}="${kod}" — kayıtlı kanallar: ${Object.keys(kanallar).join(', ') || '(yok)'}`,
    );
  }
  return kanallar[kod];
}

/**
 * Kanalın eski OTA imza materyali — yalnız backend'in OTA ucu bekçisi okur
 * (`Teks-Erp/scripts/test_mobile_update.ts` §10); o uç kalkınca silinir.
 */
function otaImzaYollari() {
  return { sertifika: 'keystore/ota-certs/certificate.pem', anahtar: 'keystore/ota-keys/private-key.pem' };
}

/** Expo yapılandırmasına kanalın kimliğini uygular (saf fonksiyon; anahtar sırası korunur). */
function kanalYapilandirmasi(config, kod, kanal = kanalKaydiOku(kod)) {
  const t = kanal.tablet;
  const sonuc = {
    ...config,
    name: t.gorunenAd,
    android: { ...(config.android ?? {}), package: t.androidPaket },
    // iOS derlemesi yok; kimlik çifti ayrışmasın diye Android paket adının aynası.
    ios: { ...(config.ios ?? {}), bundleIdentifier: t.androidPaket },
  };
  // Görünür etiket GÖSTERİMDİR, davranış değil; üretim kanalında null → alan hiç doğmaz.
  if (kanal.gorunurEtiket) sonuc.extra = { ...(config.extra ?? {}), gorunurEtiket: kanal.gorunurEtiket };
  return sonuc;
}

/**
 * Değerlendirilmiş bir Expo yapılandırması (app.config.js çıktısı · `expo config` ·
 * APK'daki `assets/app.config`) bu kanalın mı ve OTA'sız mı? Boş dizi = evet.
 */
function tabletYapilandirmaFarki(kanal, cfg) {
  const f = [];
  const fark = (neresi, gercek, beklenen) => {
    if (gercek !== beklenen) f.push(`${neresi} = "${gercek ?? '(yok)'}" — kanal "${beklenen ?? '(yok)'}" bekliyor`);
  };
  const t = kanal.tablet;
  fark('name', cfg?.name, t.gorunenAd);
  fark('android.package', cfg?.android?.package, t.androidPaket);
  fark('extra.gorunurEtiket', cfg?.extra?.gorunurEtiket ?? null, kanal.gorunurEtiket ?? null);
  // Tablet yalnız Play'den güncellenir: uzaktan kod güncellemesi yapılandırması doğamaz.
  if (cfg?.updates !== undefined) f.push('updates bloğu var — tablet yalnız Google Play\'den güncellenir (OTA yok)');
  if (cfg?.runtimeVersion !== undefined) f.push(`runtimeVersion "${cfg.runtimeVersion}" var — OTA yok, alan doğamaz`);
  return f;
}

module.exports = {
  KANAL_ORTAM,
  KAYIT_YOLU,
  kanalKaydiOku,
  kanalYapilandirmasi,
  otaImzaYollari,
  tabletYapilandirmaFarki,
};
