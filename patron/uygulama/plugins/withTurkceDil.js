// iOS Türkçe dil tanımı (2026-11-23). Paket yalnız `en` taşıyınca Türkiye bölgeli iPhone'da uygulama dili `en_TR` olur;
// expo-speech-recognition "Sesle söyle" düğmesine `SFSpeechRecognizer()` (varsayılan dil) ile karar verir → `en_TR`
// "kullanılamaz" → düğme görünmez (simülatörde ölçüldü; tanımanın kendisi tr-TR ile yapılır). Paket içine `tr.lproj`
// konunca düğme göründü. Info.plist anahtarları (CFBundleDevelopmentRegion=tr, CFBundleLocalizations=[tr]) app.json
// `ios.infoPlist`te; bu eklenti Xcode projesini tamamlar:
//   (1) proje `developmentRegion` = tr, `knownRegions` ⊇ {tr, Base} (var olanlar korunur);
//   (2) `<ad>/Supporting/tr.lproj/InfoPlist.strings` kaynağı (Expo'nun kendi iOS locales yardımcısıyla; içerik yalnız
//       görünen ad = app.json `name`, yani görünür değişiklik yok). Expo'nun `locales` alanı kullanılmaz: o Android'e de
//       `values-b+tr` yazar; bu eklenti yalnız iOS'a dokunur. İzin metinleri değişmez. İdempotent.
const { withXcodeProject, IOSConfig } = require("@expo/config-plugins");

const DIL = "tr";

/** PBXProject nesnesine geliştirme bölgesi + bilinen bölgeler yazar; saf ve idempotent. */
function bolgeDuzenle(proje) {
  if (!proje || typeof proje !== "object") throw new Error("withTurkceDil: Xcode projesinde PBXProject yok");
  const bilinen = Array.isArray(proje.knownRegions) ? proje.knownRegions.map((b) => String(b).replace(/^"|"$/g, "")) : [];
  for (const b of [DIL, "Base"]) if (!bilinen.includes(b)) bilinen.push(b);
  proje.developmentRegion = DIL;
  proje.knownRegions = bilinen;
  return proje;
}

/** tr.lproj/InfoPlist.strings içeriği (Expo locales biçimi): yalnız görünen ad. */
function dilMetinleri(config) {
  const ad = String(config.name ?? "").replace(/["\\]/g, "");
  if (!ad) throw new Error("withTurkceDil: uygulama adı (name) yok");
  return { CFBundleDisplayName: ad };
}

const withTurkceDil = (config) =>
  withXcodeProject(config, async (c) => {
    bolgeDuzenle(c.modResults.getFirstProject()?.firstProject);
    c.modResults = await IOSConfig.Locales.setLocalesAsync(
      { ...c, locales: { [DIL]: dilMetinleri(c) } },
      { projectRoot: c.modRequest.projectRoot, project: c.modResults },
    );
    return c;
  });

module.exports = withTurkceDil;
module.exports.bolgeDuzenle = bolgeDuzenle;
module.exports.dilMetinleri = dilMetinleri;
module.exports.DIL = DIL;
