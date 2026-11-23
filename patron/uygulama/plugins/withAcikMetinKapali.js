// Release paketinde düz metin (http://) trafiği KAPALI (mağaza uygunluğu, 2026-11-23). Bir kütüphane manifesti
// `android:usesCleartextTraffic="true"` getiriyordu ve release birleşik manifestine geçiyordu (ölçüldü). Ana manifeste
// `false` + `tools:replace` yazılır; Expo şablonunun debug/debugOptimized manifestleri kendi `true` + `tools:replace`
// değerleriyle ana manifesti ezer → geliştirme (Metro http) davranışı değişmez. Bulut adresi zaten https.
const { withAndroidManifest } = require("@expo/config-plugins");

const OZNITELIK = "android:usesCleartextTraffic";

/** Ana manifest nesnesine (xml2js biçimi) uygular; saf ve idempotent. */
function manifestDuzenle(manifest) {
  const kok = manifest.manifest;
  if (!kok?.application?.[0]) throw new Error("withAcikMetinKapali: AndroidManifest'te <application> yok");
  kok.$ = { ...(kok.$ ?? {}), "xmlns:tools": "http://schemas.android.com/tools" };
  const uyg = kok.application[0];
  uyg.$ = uyg.$ ?? {};
  uyg.$[OZNITELIK] = "false";
  const degistir = new Set(String(uyg.$["tools:replace"] ?? "").split(",").map((s) => s.trim()).filter(Boolean));
  degistir.add(OZNITELIK);
  uyg.$["tools:replace"] = [...degistir].join(",");
  return manifest;
}

const withAcikMetinKapali = (config) =>
  withAndroidManifest(config, (c) => {
    c.modResults = manifestDuzenle(c.modResults);
    return c;
  });

module.exports = withAcikMetinKapali;
module.exports.manifestDuzenle = manifestDuzenle;
