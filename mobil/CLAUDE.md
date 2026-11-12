# Adnan Şahin ERP — Tablet

React Native + Expo 54 saha uygulaması: Android tablet (yatay) ve telefon (dikey), yön kilidi yok; backend'e (`Teks-Erp/`, port 4000) HTTP ile bağlanır. Çekirdek değişmezler kök `CLAUDE.md`de.

## Komutlar

```bash
npx expo start                     # geliştirme; BT/BLE için native derleme: npm run android
npm run typecheck                  # tsc --noEmit
npm run lint
npm test                           # jest --runInBand (commit kapısında koşar)
npm run build:apk -- --musteri=adnansahin --aab # her değişiklik = yeni versionCode; APK + AAB; ./gradlew ELLE ÇAĞRILMAZ
node ../deploy/play-yukle.mjs --musteri=adnansahin --aab=<yol>            # Play dahili test (kuru); --uygula ile yükler
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

- Tablet YALNIZ Google Play'den güncellenir: OTA (expo-updates) yok, uygulama kendi APK'sını indirmez; `updates`/`runtimeVersion` geri eklenmez (bekçi `app-config-kanal.test.ts`).
- `keystore/` git dışıdır; Play yükleme anahtarı kaybı Console'dan anahtar sıfırlama ister.
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
| Yeni ekran / özellik (reçete) | `docs/RECETELER.md` |
| KK1, idempotency, kurşun | `docs/kurallar/kk1.md` |
| Tambur, kesim, refakat kartı | `docs/kurallar/tambur.md` |
| Sebep kataloğu, numara serisi | `docs/kurallar/defter.md` |
| Cihaz eşleme, keşif, HAL | `docs/kurallar/genel.md` |
| Play dağıtımı, kanal | `docs/kurallar/surum-yayin.md`, `docs/ops/SAHA-PLAY-DAGITIM.md` |
| Tablet test sürücüsü (adb) | `mobil/scripts/surucu/README.md` |
