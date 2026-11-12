# Adnan Şahin ERP — Tablet

React Native + Expo 54 saha uygulaması: Android tablet (yatay) ve telefon (dikey), yön kilidi yok; backend'e (`Teks-Erp/`, port 4000) HTTP ile bağlanır. Çekirdek değişmezler kök `CLAUDE.md`de.

## Komutlar

```bash
npx expo start                     # geliştirme; BT/BLE için native derleme: npm run android
npm run typecheck                  # tsc --noEmit
npm run lint
npm test                           # jest --runInBand (commit kapısında koşar)
npm run yayinla:check -- --musteri=adnansahin   # OTA mı APK mı? (native parmak izi)
npm run yayinla -- --musteri=adnansahin         # OTA paketi üretir (ota-cikti/adnansahin/<rv>/<damga>)
npm run build:apk -- --musteri=adnansahin       # native değişti → APK; ./gradlew ELLE ÇAĞRILMAZ
node ../deploy/mobil-yayinla.mjs --musteri=adnansahin --paket=<ota-cikti/...>   # sahaya çıkış, manifest en son
```

Ağır koşum `node ../scripts/agir-is.mjs -- <komut>` ile. Sürüm notu (`surum-notlari.json`) yazılmadan yayın yapılmaz.

## Mimari sınırlar

- Ekran = ince kabuk + görünüm + ekran-hook + saf mantık modülü (yanında `.test.ts`); ekran HTTP kurmaz, `services/<domain>.service.ts` → `apiClient`.
- API adresi `EXPO_PUBLIC_API_URL` → `src/constants/api.ts`, derleme anında gömülür; JWT `expo-secure-store`'da; kanal kimliği `app.config.js`ten `TEKSERP_KANAL` ile gelir, `app.json`a kanal için yazılmaz.
- Donanım VERİdir: cihazlar backend `PeripheralDevice`'ta, tablette cihaz-yerel seçim yok; çözümleme oturum kapsamlı (`useMachinePeripherals`), oturum yoksa boş (fail-closed). HAL `services/hal/`, saha yolu BT-Classic; BLE'yi yeni işe seçme.
- Okutma geri bildirimi yalnız `services/scanFeedback.signalScan` / `hooks/useScanFeedback`; HTML yazdırma yalnız `services/printHtml.ts`.
- İdempotency token'ı `offline/entryAttempt.ts` tek kaynaktır; çuval mutasyonları online-only.
- İzin union'ı `src/types/permissions.ts` backend kataloğundan ELLE taşınır.
- Yeni paket kullanıcı onayı + `docs/standart/KUTUPHANELER.md` karar kaydı ister; native modül, izin, ikon, SDK veya config-plugin APK turu ister.

## Tuzaklar

- `runtimeVersion` native kimliğidir: native değişip artmazsa yeni JS eski native'i çağırır ve bütün tabletler çöker. OTA turunda `versionCode`a dokunulmaz.
- `keystore/` git dışıdır; kaybı her tablette sil + yeniden kur demektir.
- Sensör fail-closed: cihaz yok / bond yok / okunamadı / değer ≤ 0 → Türkçe toast, mutasyon HİÇ çağrılmaz; `simulate` cihazda uydurulan değer `source:'SIMULATED'` beyanıyla gider.
- `Card` + `onPress` kullanma (`Card.Content` dokunmayı yutar); tıklanabilir alan Paper `TouchableRipple`/`Button`/`IconButton`/`List.Item`.
- `SegmentedButtons` `flexDirection:'row'` kabının doğrudan çocuğu olamaz (yanındaki başlığı sıfır genişliğe iter).
- Ön-dolu metin kutusu modalda `ModalTextInput` olur (portal gecikmesi imleci çökertir); modalda `NumpadHost` yok, `NumpadInput` var.
- Yeni modül modalı `ModuleSheet` (tek kart) ya da `PagedSheet` (gövde ekranın %70'inden uzunsa); üçüncü biçim yok, düğmeler kartın içinde sabit.
- `ScannerRollStrip` `rolls` girişini EKLENME sırasında bekler; ters sırada state tutan ekran çeviriyi kendi yapar, yoksa vurgu yanlış satıra gider.
- Kendi açtığımız Android sistem diyaloğu `withSystemDialog()` ile sarılır (boşta kilidi "ayrıldı" sanmasın).
- Yerleşim hatasında tahmin değil ölçüm: `adb exec-out screencap` + `uiautomator dump`.

## Dokunmadan önce oku

| Konu | Belge |
|---|---|
| Ekran kalıbı, çevrimdışı yazma, okutma, UI sözleşmesi, boyut, test | `docs/standart/MOBIL.md` |
| Yeni ekran / özellik, OTA-APK kapıları (reçete) | `docs/RECETELER.md` |
| KK1, idempotency, kurşun | `docs/kurallar/kk1.md` |
| Tambur, kesim, refakat kartı | `docs/kurallar/tambur.md` |
| Sebep kataloğu, numara serisi | `docs/kurallar/defter.md` |
| Cihaz eşleme, keşif, HAL | `docs/kurallar/genel.md` |
| OTA, APK, kanal | `docs/kurallar/surum-yayin.md`, `docs/ops/MOBIL-UZAKTAN-GUNCELLEME.md` |
| Tablet test sürücüsü (adb) | `mobil/scripts/surucu/README.md` |
