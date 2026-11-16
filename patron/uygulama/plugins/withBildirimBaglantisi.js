// Android'de bildirim modülünün BAĞLANMASI derleme kapısına bağlıdır (2026-11-17). Eskiden `package.json`
// `expo.autolinking.android.exclude` sabit dışlardı; o liste yalnız paket dosyasından okunur ve derleme anında geri
// açılamaz. Kutup ters çevrildi: dışlama artık prebuild'in yazdığı `settings.gradle`'dadır ve YALNIZ bildirimsiz
// derlemede (extra.nativePush !== true) yazılır → bildirimsiz pakette Firebase/bildirim bileşeni yok, bildirimli pakette
// expo-notifications bağlanır. iOS'a dokunmaz.
// TEK ÖĞE ZORUNLU (ölçüldü 2026-11-17, expo-modules-autolinking 3.0.27): Gradle eklentisi listeyi tek argümana birleştirir
// (`--exclude "a b"`) ve CLI bunu tek paket adı sanar → iki öğeli liste HİÇBİR şeyi dışlamaz. Bu yüzden eski
// package.json listesindeki `expo-application` (izin/bileşen eklemez; Play yükleme kaynağı izni app.json'da engelli)
// artık iki kipte de bağlanır.
const { withSettingsGradle } = require("@expo/config-plugins");

const DISLANAN = Object.freeze(["expo-notifications"]);
if (DISLANAN.length !== 1) throw new Error("withBildirimBaglantisi: Gradle dışlaması yalnız TEK paketle çalışır (bkz. üst not)");
const ISARET = "// TeksERP Patron: plugins/withBildirimBaglantisi.js";
const CAGRI = "expoAutolinking.useExpoModules()";

/** settings.gradle içeriğine dışlama satırını (bir kez) ekler; bildirimli derlemede varsa söker. */
function settingsDuzenle(icerik, bildirimli) {
  const satirlar = icerik.split("\n");
  const temiz = [];
  for (let i = 0; i < satirlar.length; i++) {
    if (satirlar[i] === ISARET) {
      i++; // işaretin altındaki dışlama satırı da gider
      continue;
    }
    temiz.push(satirlar[i]);
  }
  const govde = temiz.join("\n");
  if (bildirimli) return govde;
  if (!govde.includes(CAGRI)) throw new Error(`withBildirimBaglantisi: settings.gradle'da ${CAGRI} yok — dışlama yazılamadı (fail-closed)`);
  const satir = `${ISARET}\nexpoAutolinking.exclude = [${DISLANAN.map((d) => `"${d}"`).join(", ")}]`;
  return govde.replace(CAGRI, `${satir}\n${CAGRI}`);
}

function withBildirimBaglantisi(config) {
  return withSettingsGradle(config, (c) => {
    if (c.modResults.language !== "groovy") throw new Error("withBildirimBaglantisi: settings.gradle groovy değil");
    const bildirimli = c.extra?.nativePush === true;
    c.modResults.contents = settingsDuzenle(c.modResults.contents, bildirimli);
    return c;
  });
}

module.exports = withBildirimBaglantisi;
module.exports.settingsDuzenle = settingsDuzenle;
module.exports.DISLANAN = DISLANAN;
