// Patron Android paketinin birleşik manifest denetimi — TEK KAYNAK (scripts/build-aab.mjs + __tests__/paket-denetimi.test.ts).
// İki kip (2026-11-17):
//   · bildirimsiz (varsayılan): eski kapı AYNEN — yalnız temel izinler; Firebase/bildirim/c2dm bileşeni pakette RET.
//   · bildirimli (--bildirimli / PATRON_NATIVE_PUSH=1): temel izinler + bildirim izinleri KABUL; Firebase + Expo
//     bildirim bileşenleri KABUL ve ZORUNLU (yoksa paket sessizce bildirimsiz çıkmış demektir → RET). Liste dışı izin yine RET.
"use strict";

/**
 * Sesle sipariş girişi (2026-11-17, `expo-speech-recognition` eklentisi): mikrofon. Ses telefonun kendi tanıma hizmetiyle
 * işlenir, kaydedilmez. Her pakette İZİNLİ ve ZORUNLU (yoksa eklenti uygulanmamış, mikrofon düğmesi hep hata verir).
 */
const SES_IZNI = "android.permission.RECORD_AUDIO";

/** Bildirimden bağımsız tek izin kümesi. AndroidX'in imza izni paket adını taşır: literal yazılmaz, paketten türer. */
function temelIzinler(paket) {
  return ["android.permission.INTERNET", `${paket}.DYNAMIC_RECEIVER_NOT_EXPORTED_PERMISSION`, SES_IZNI];
}

/** Bildirimli pakette ek izinler: bildirim gösterme (Android 13+ istemi), FCM alımı, FCM'in uyandırma kilidi, ağ durumu. */
const BILDIRIM_IZINLERI = Object.freeze([
  "android.permission.POST_NOTIFICATIONS",
  "com.google.android.c2dm.permission.RECEIVE",
  "android.permission.WAKE_LOCK",
  "android.permission.ACCESS_NETWORK_STATE",
]);

/** Bildirim/Firebase bileşeni tanıyıcısı (bildirimsiz kipte bunlardan biri pakette = RET). */
const BILDIRIM_BILESENI = /firebase|expo\.modules\.notifications|c2dm/i;

/** Bildirimli pakette BULUNMASI ZORUNLU bileşenler: FCM mesaj servisi (Expo) + FCM belirteç alıcısı. */
const ZORUNLU_BILDIRIM_BILESENLERI = Object.freeze([
  "expo.modules.notifications.service.ExpoFirebaseMessagingService",
  "com.google.firebase.iid.FirebaseInstanceIdReceiver",
]);

function izinliIzinler(paket, bildirimli) {
  return bildirimli ? [...temelIzinler(paket), ...BILDIRIM_IZINLERI] : temelIzinler(paket);
}

/** Birleşik manifest metnini denetler. Dönüş: { sorunlar, izinler, bildirimBilesenleri }. */
function manifestDenetle(m, { paket, kod, surum, bildirimli = false }) {
  const sorunlar = [];
  const etiket = m.match(/<manifest[^>]*>/)?.[0] ?? "";
  const nitelik = (ad) => etiket.match(new RegExp(`${ad}="([^"]+)"`))?.[1];
  if (nitelik("package") !== paket) sorunlar.push(`paket ${nitelik("package")} ≠ ${paket}`);
  if (nitelik("android:versionCode") !== String(kod)) sorunlar.push(`versionCode ${nitelik("android:versionCode")} ≠ ${kod}`);
  if (nitelik("android:versionName") !== surum) sorunlar.push(`versionName ${nitelik("android:versionName")} ≠ ${surum}`);

  const izinler = [];
  for (const [, ad] of m.matchAll(/<uses-permission(?:-sdk-23)?\s[^>]*android:name="([^"]+)"/g)) izinler.push(ad);
  const izinli = izinliIzinler(paket, bildirimli);
  const fazla = izinler.filter((i) => !izinli.includes(i));
  if (fazla.length) sorunlar.push(`izinli olmayan izin: ${fazla.join(", ")}`);
  if (!izinler.includes(SES_IZNI)) sorunlar.push(`ses izni yok (${SES_IZNI}; expo-speech-recognition eklentisi uygulanmamış)`);

  const bildirimBilesenleri = [...m.matchAll(/<(?:service|receiver|provider|activity)\b[^>]*?android:name="([^"]+)"/g)]
    .map((x) => x[1])
    .filter((ad) => BILDIRIM_BILESENI.test(ad));
  if (bildirimli) {
    const eksik = ZORUNLU_BILDIRIM_BILESENLERI.filter((b) => !bildirimBilesenleri.includes(b));
    if (eksik.length) sorunlar.push(`bildirimli pakette zorunlu bileşen yok: ${eksik.join(", ")}`);
    if (!izinler.includes("android.permission.POST_NOTIFICATIONS")) sorunlar.push("bildirimli pakette POST_NOTIFICATIONS izni yok");
  } else if (bildirimBilesenleri.length) {
    sorunlar.push(`bildirim/Firebase bileşeni pakette: ${bildirimBilesenleri.join(", ")}`);
  }
  if (/android:allowBackup="true"/.test(m)) sorunlar.push("allowBackup açık (önbellek yedeğe girmemeli)");
  return { sorunlar, izinler, bildirimBilesenleri };
}

/** Pakete gömülü Expo yapılandırması (assets/app.config JSON) — bildirim kapısı ve EAS proje kimliği tutarlı mı. */
function gomuluYapilandirmaDenetle(metin, { bildirimli, projeKimligi }) {
  const sorunlar = [];
  let c;
  try {
    c = JSON.parse(metin);
  } catch {
    return ["gömülü app.config okunamadı"];
  }
  const nativePush = c?.extra?.nativePush === true;
  if (bildirimli && !nativePush) sorunlar.push("gömülü yapılandırmada extra.nativePush yok (bildirim kapısı kapalı derlenmiş)");
  if (!bildirimli && nativePush) sorunlar.push("bildirimsiz pakette extra.nativePush=true");
  if (c?.extra?.eas?.projectId !== projeKimligi) sorunlar.push(`gömülü EAS proje kimliği ${c?.extra?.eas?.projectId ?? "YOK"} ≠ kimlik.json`);
  return sorunlar;
}

/** Firebase istemci dosyasında bu paketin istemcisi var mı (içerik başka hiçbir yere yazılmaz). */
function firebasePaketiVarMi(json, paket) {
  try {
    const d = typeof json === "string" ? JSON.parse(json) : json;
    return (d?.client ?? []).some((c) => c?.client_info?.android_client_info?.package_name === paket);
  } catch {
    return false;
  }
}

module.exports = {
  SES_IZNI,
  temelIzinler,
  izinliIzinler,
  BILDIRIM_IZINLERI,
  BILDIRIM_BILESENI,
  ZORUNLU_BILDIRIM_BILESENLERI,
  manifestDenetle,
  gomuluYapilandirmaDenetle,
  firebasePaketiVarMi,
};
