# Saha uygulaması — Google Play dahili test dağıtımı

Uygulama: **Adnan Şahin TeksERP Saha** (`com.etkiliyazilim.adnansahin.saha`). Native sürüm Play dahili testten, JS düzeltmeleri OTA'dan gelir. Kurallar: `docs/kurallar/surum-yayin.md`.

## Paket üretimi
1. `surum-notlari.json`a tablet notu → `node scripts/surum-notlari-kopyala.mjs` → `node scripts/check-surum-notlari.mjs`.
2. `mobil/app.json`: `version` + `android.versionCode` artar; native değiştiyse `runtimeVersion` (ve `deploy/kanallar.json`) artar.
3. `cd mobil && npm run build:apk -- --musteri=adnansahin --aab` → APK + AAB, aynı derleme, bütün kapılar.
   Yükleme anahtarı `mobil/keystore/` (git dışı); yedeği repo dışında, parola yalnız yedeğin yanındaki `OKU.txt`'te.

## İlk yükleme (bir kez, elle)
Play Console → uygulama → Test → Dahili test → Yeni sürüm → AAB'yi sürükle → sürüm notu (tr-TR) → kaydet → yayınla.
İlk yüklemede Play App Signing'i kabul et (Google uygulama anahtarını tutar, bizdeki anahtar yükleme anahtarıdır).

## Sonraki yüklemeler (betik)
```
node deploy/play-yukle.mjs --musteri=adnansahin --aab=<yol>            # KURU: yerel kapılar
node deploy/play-yukle.mjs --musteri=adnansahin --aab=<yol> --oku      # Play'i okur
node deploy/play-yukle.mjs --musteri=adnansahin --aab=<yol> --uygula   # yükler → internal → onay → geri okur
```
Servis hesabı anahtarı repo dışında, 0600; Console'da hesaba bu uygulama için "sürüm yayınlama" izni verilir.

## Test listesine cihaz ekleme
Console → Dahili test → Test kullanıcıları → e-posta listesi. Tabletteki Google hesabı listede olmalı; "Katılım bağlantısı" kopyalanır.

## Tablette ilk kurulum
1. Gönderilmemiş kayıt kalmadığını gör (eski uygulamada kuyruk boş).
2. Eski **TeksERP** uygulamasını kaldır (Ayarlar → Uygulamalar → TeksERP → Kaldır).
3. Tablette katılım bağlantısını aç → "Test kullanıcısı ol" → Play'den **Adnan Şahin TeksERP Saha**'yı kur.
4. Uygulamayı aç → sunucu adresini doğrula → cihaz eşleştirme (panelden onay; kimlik değiştiği için yeni cihaz görünür).
5. Cihaz ayarları: yer/istasyon, okuyucu, tartı/yazıcı eşleşmesi (Ayarlar → Yer ve donanım).

Sonraki sürümlerde uygulama ana menüde "Yeni sürüm hazır — Güncelle" der; zorunlu sürümde tam ekran Play güncellemesi açılır.

## Geri dönüş
Play'de sürüm geri alınmaz; düzeltme daha büyük `versionCode` ile yeni paket olarak çıkar. Acil JS düzeltmesi OTA ile (aynı `runtimeVersion`). Play erişimi olmayan cihaza aynı derlemenin APK'sı USB ile kurulabilir (uygulama içi güncelleme o cihazda sessiz kalır).
