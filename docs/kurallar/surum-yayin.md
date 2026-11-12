# Sürüm, yayın ve kurulum

Backend paketinin üretilip fabrika sunucusuna kurulması, panelin (Electron) ve tabletin (OTA/APK) güncelleme kanalına yayınlanması, migration disiplini. Kod: `deploy/` (`paketle.ps1`, `kur.ps1`, `ilk-kurulum.ps1`, `electron-paketle.sh`, `electron-yayinla.sh`, `mobil-yayinla.mjs`, `kanallar.json`), `mobil/scripts/` (`yayinla-ota.mjs`, `build-apk.mjs`), kök `scripts/` (sürüm notu ve kanal kapıları), `Teks-Erp/prisma/migrations/`, `Teks-Erp/src/config/client-version-policy.ts`.

## Kurallar

### Sürüm ve yayın
- Tek dağıtım kanalı `adnansahin`; kanal kimlikleri (yayın adresleri, appId, paket adları, ERP adresi, OTA sertifikası) yalnız `deploy/kanallar.json`da yaşar, koda gömülmez. [bekçi: check-kanallar.mjs]
- Sürüm notu yazılmadan sürüm çıkmaz: taslağı Claude yazar, tek kaynak kök `surum-notlari.json`; `node scripts/surum-notlari-kopyala.mjs` ile panele ve tablete kopyalanır, `node scripts/check-surum-notlari.mjs` geçmeden paketlenmez. [bekçi: check-surum-notlari.mjs]
- Fabrikaya her paketleme ve yayın (backend paketi, panel, OTA, APK) YALNIZ kullanıcının o sürüm için verdiği açık onaydan sonra yapılır; onay başka sürüme taşınmaz. [inceleme]
- Sıra: backend ÖNCE, panel + tablet SONRA; sözleşme kıran değişiklikte (uç kaldırma, alan adı/tipi, zorunlu parametre, enum değeri, yeni izin) "eski istemci ne yapar" sorusu yazılı cevaplanır. [inceleme]
- Müşteri kodu her derleme ve yayın komutunda argümandan verilir (`--musteri=adnansahin` / `electron-paketle.sh adnansahin`); ağaçtaki `musteri.json` işaretçisine güvenilmez, ham `npm run build:win` ile panel paketlenmez. [bekçi: test_kanal_yayin_kapisi.mjs]
- Panel: `./deploy/electron-paketle.sh adnansahin` → `./deploy/electron-yayinla.sh --musteri=adnansahin`; yayın sonrası `--dogrula` ile dışarıdan denetlenir. [bekçi: test_kanal_yayin_kapisi.mjs]
- Tablet OTA: `cd mobil && npm run yayinla:check -- --musteri=adnansahin` → `npm run yayinla -- --musteri=adnansahin` (paketi ÜRETİR) → `node deploy/mobil-yayinla.mjs --musteri=adnansahin --paket=<dizin>` (sahaya çıkarır). [bekçi: test_kanal_yayin_kapisi.mjs]
- Tablet APK yalnız native değiştiyse: `npm run build:apk -- --musteri=adnansahin` → `node deploy/mobil-yayinla.mjs --musteri=adnansahin --apk=<yol> --surum=X --vc=N`; `cd android && ./gradlew` elle çağrılmaz. [inceleme]
- OTA mı APK mı tahmin edilmez: `yayinla:check` "parmak izi tutarlı" derse OTA, "NATIVE DEĞİŞTİ" derse `runtimeVersion` artar + APK; şüphede `runtimeVersion` artırılır. [inceleme]
- OTA turunda `android.versionCode`a dokunulmaz; `versionCode` yalnız yayınlanacak APK için artar. [inceleme]
- Sürüm numarası artmazsa hiçbir istemci güncellenmez; yama hanesi git etiketinden (`panel-v*` / `tablet-v*`) otomatik türer, küçük/büyük hane elle verilen karardır. [bekçi: test_surum.mjs]
- Yükleme sırası: paket dosyaları ÖNCE, manifest / `latest.yml` / APK künyesi EN SON; elle `scp` yapılmaz. [bekçi: test_kanal_yayin_kapisi.mjs]
- OTA manifesti yayın anında donar ve imzalanır, tek üreticisi `mobil/scripts/lib/manifest.mjs`; sunucu yalnız bayt servis eder. [bekçi: test_mobile_update]
- Kod imzalama anahtarları `mobil/keystore/` altında, git ve VDS dışında kalır; anahtar kaybı her tablette sil+kur demektir. [bekçi: update-feed-url.test.ts]
- Yayın sunucusu önündeki Cloudflare proxy açık kalır; DNS-only'ye çevrilirse güncellemeler sessizce durur. [inceleme]
- ERP adresi tabletin derlemesine gömülür ve kanal kaydından çözülür; açık verilen `--api-url` kanalınkiyle eşit olmak zorundadır, koda gömülü varsayılan yoktur. [inceleme]
- İstemci sürüm politikası kodda sabittir (`client-version-policy.ts`); `minVersion` yalnız gerçek sözleşme kırılmasında yükselir, sahadaki sürümden BÜYÜK olamaz ve önce yeni istemci yayınlanır. [bekçi: test_client_policy]
- Electron `artifactName` ASCII kalır, `${productName}` kullanılmaz (ad `latest.yml`de URL'dir). [bekçi: update-feed-url.test.ts]
- Panel güncelleyicisinde `autoUpdater`a modül gövdesinde dokunulmaz (`updater()` getter), `autoInstallOnAppQuit=false` kalır, kontrol zamanlayıcısı yalnız main süreçte koşar. [bekçi: update-check-interval.test.ts]

- Tablet NATIVE sürümü (yeni versionCode) Google Play dahili testten çıkar: `npm run build:apk -- --musteri=adnansahin --aab` → `node deploy/play-yukle.mjs --musteri=adnansahin --aab=<yol>` (kuru) → `--uygula`; ilk paket Console'dan elle, üretim kanalına araç yüklemez. [bekçi: check-kanallar.mjs §5]
- Tablet JS güncellemesi OTA'dan gelmeye devam eder; Play'e her native turunda `runtimeVersion` artar ki yeni JS eski native'e gitmesin. [bekçi: update-feed-url.test.ts]
- Uygulama içi Play güncellemesi FAIL-OPEN'dır: Play yok / Play'den kurulmamış / çevrimdışı / hata → sessiz; yalnız boşta (ana menü, kuyruk boş) önerilir, zorunluluğu sunucu politikası (`minVersion`) belirler; Play ikilisinde APK künyesi okunmaz. [bekçi: playUpdate.test.ts]
- Paket adı değişimi bir KİMLİK GÖÇÜdür: eski uygulama sahada elle kaldırılır, cihaz yeniden eşleşir; `com.teks.erp.mobil` → `com.etkiliyazilim.adnansahin.saha` (2026-11-12, kullanıcı kararı). [bekçi: check-kanallar.mjs DONMUS]

### Backend paketi ve kurulum
- Backend paketi `pwsh -NoProfile -File deploy/paketle.ps1` ile geliştirme makinesinde üretilir; `docs/surumler/backend-<sürüm>.md` yoksa paketleme durur, paket adı/SHA256/commit'i makine yazar. [bekçi: test_surum_belgesi]
- Kurana talimat sohbetten değil `docs/surumler/backend-<sürüm>.md`den yazılır; önceki saha sürümü tahmin edilmez, ölçülür. [bekçi: test_surum_belgesi]
- Prova paketi `paketle.ps1 -Prova` ile üretilir; etiket atmaz, repo değişmez, `kur.ps1` onu `-ProvaKabul` olmadan kurmaz. [bekçi: test_sunucu_betikleri]
- Yayın günü veri betikleri migration değildir: paketin içinden (`node dist\tools\<ad>.cjs`) koşar, dry-run → çıktı saklanır → kullanıcı onayı → `--apply`, sırayı kullanıcı yürütür. [bekçi: test_sunucu_betikleri]
- Sunucu betikleri Windows PowerShell 5.1 ve kısıtlı yürütme ilkesinde koşabilir yazılır: kod metni ASCII, npm `npm.cmd` ile, çağrı `powershell -NoProfile -ExecutionPolicy Bypass -File <betik>`. [bekçi: test_sunucu_betikleri]
- `kur.ps1` SSH oturumunda pm2 daemon'u doğurmaz; uzaktan kurulum `uzaktan-kos.ps1` ile SYSTEM görevine verilir. [bekçi: test_sunucu_betikleri]
- `kur.ps1`de çıkış kodları toplanmaz, başarısız adımlar ADIYLA raporlanır; dosya taşıma `TasiIsrarla` yardımcısından geçer. [bekçi: test_deploy_move_retry]
- Sır taşıyan kurulum dosyaları (`.env`, `db-credentials.json`, `backups\`, `rclone.conf`) yalnız SYSTEM + Administrators'a açılır. [bekçi: test_sunucu_betikleri]

### Migration
- Gerçek veri korunur: `migrate reset`, reseed, toplu `DELETE` yasak; migration geri alınamaz, rollback = yedekten restore. [inceleme]
- Yeni migration `npx prisma migrate dev --create-only` ile üretilir ve iki DEFERRABLE composite FK için gelen `DropForeignKey` satırları silinir; düz `migrate dev` koşulmaz. [bekçi: test_db_invariants]
- Commit edilmemiş migration sahada sessiz eksiktir: üç kapı birlikte koşar — `npm run check:migrations` (commit edildi mi), `test_migration_hygiene` (defter tutarlı mı), `test_schema_drift` (DB şema gibi mi). [bekçi: check-migrations.mjs]
- Bir migration kendisinden SONRA doğan tabloya dokunamaz; ölçüm yeri boş DB'dir. [bekçi: test_migration_order]
- `ALTER TYPE … ADD VALUE IF NOT EXISTS` kendi tek ifadeli dosyasında yaşar, yeni değeri kullanan ifade aynı dosyaya girmez; canlıda uygulanmış eski dosyalar düzeltilmez (checksum). [bekçi: test_migration_enum_add_value]
- Kısıt, veri temizlenmeden aynı sürümde gelmez (expand → backfill → contract); mükerrer varsa migration NOTICE ile atlar, deploy'u düşürmez. [bekçi: test_db_invariants]
- Her yeni `DateTime` `@db.Timestamptz`, her UUID kolon `@db.Uuid`; `PG_SESSION_OPTIONS` (`-c timezone=UTC`) silinmez. [bekçi: test_timestamptz_contract]
- Elle migration `npx tsx scripts/apply-migration.ts <ad> [--apply]` ile uygulanır; hedef `DATABASE_URL`den alınır ve adıyla basılır. [bekçi: test_script_guards]
- Büyük tabloya index ekleyen migration vardiya dışında deploy edilir ve başında `SET statement_timeout = 0;` taşır (DB'de 50 sn sınırı var). [inceleme]
- Patron eşitleme migration'ı backend durmuşken uygulanır ve eşitlemeyi AÇMAZ (tetikleyiciler KAPALI doğar, açmak `patron_sync_set_enabled(true)`); kurulum ve doğrulama `docs/ops/PATRON-ESITLEME-KURULUM.md`. [inceleme]
- Şema değişikliğinden sonra `npm run prisma:generate` koşulur; pull sonrası sıra `npm install` → `prisma:generate` → `prisma:migrate` (= `migrate deploy`). [inceleme]
- Toplu veri düzeltme betiği dry-run varsayılandır, `--apply` öncesi etkilenen her kaydı ve hedef DB'yi adıyla listeler. [inceleme]
- `statement_timeout=50s` DB düzeyinde ELLE kurulur (migration taşımaz); yeni kurulumda ve her geri yüklemeden sonra yeniden uygulanır. [inceleme]
- Yedek ön eki yaşam döngüsüdür: `tekserp_` gün bazlı saklamaya + en yeni 3 dosyaya girer, `premigrate_`/`pre-restore_` rotasyona girmez. [bekçi: test_backup]
- Geri yükleme backend'de DEĞİL: `pm2 stop` → `pg_restore` ile `<canlı>_restore_<damga>` kopyasına → iki RENAME; etki raporunda ölçülemeyen hacme "ölçülemedi" yazılır, 0 değil. [inceleme]
- `SystemLog` 6 aydan eskisi otomatik arşivlenir, `sessions/purge` 6 ayda bir elle koşulur; kalıcı sayı `SystemLog`tan değil kolondan okunur. [bekçi: test_session_purge]
- Bloat takvimle değil ölçümle giderilir: `scripts/index-health.sql` §8/§9 → `REINDEX CONCURRENTLY`. [inceleme]
- Mutabakat (`consistency-check.sql` + `test_consistency`) kırmızısı üç şeyden biridir — kod hatası · iş kararı bekleyen veri · sorgunun kör noktası; bölüm daraltılarak susturulmaz. [bekçi: test_consistency]
- Panel güncelleme şeridi yalnız `ready` durumunda çizilir; `error` şeridi internetsiz makinede her açılışta körleştirir. [inceleme]

## Tuzaklar
- `migrate resolve --applied` SQL'in koştuğunu doğrulamaz; resolve sonrası `\d+` / `pg_enum` / `pg_index.indisvalid` ile elle bak. `applied_steps_count` doğrulama sayılmaz.
- Prisma'nın şema motoru NATIVE'dir: Windows paketi `PRISMA_CLI_BINARY_TARGETS=windows` ve MZ kapısıyla üretilir; "sorgu motoru platformdan bağımsız" paketin tamamı için geçerli değildir.
- Uzun koşan dev backend başkasının migration'ıyla bayatlar (yeni enum değeri P2023 / "uç 400"); çare `prisma generate` + kendi süreç PID'ini yeniden başlatmak, `pkill -f tsx` değil.
- `usesCleartextTraffic` `app.json > android` altında geçersizdir, yalnız `expo-build-properties` bloğunda çalışır; prebuild sonrası `AndroidManifest.xml`de grep ile bak — bekçisi yok.
- Sıcak Metro/Gradle önbelleği ortam değişkenini görmez: hızlı biten APK derlemesi bayat ERP adresi demektir. Release bundle Hermes'tir; Türkçe dize grep'le bulunmaz, ASCII dize ara.
- `nsis.perMachine:true` yüzünden yönetici olmayan Windows hesabında panel güncellemesi kurulmaz ve panel sessizce eski sürümde kalır.
- `/health` public'tir ve operasyonel alan taşımaz; `auditGuard`/`auditWriteFailures` yalnız `/api/admin/health`tedir.
- `pg_restore` veritabanı düzeyi ayarları (`statement_timeout`, `teks.audit_guard`) taşımaz; dökümden sonra yeniden kurulur, rename ile de taşınmaz.
- APK kaldır+kur yapılırsa cihaz kimliği değişir; `devicePairingRequired` açıksa tablet PENDING düşer ve onay ister.

## Bekçiler
Kök: `check-surum-notlari.mjs` · `check-kanallar.mjs` · `test_kanal_yayin_kapisi.mjs` · `test_surum.mjs` · `check-migrations.mjs`

Backend: `test_surum_belgesi` · `test_backend_surum` · `test_client_policy` · `test_mobile_update` · `test_migration_hygiene` · `test_migration_order` · `test_migration_enum_add_value` · `test_schema_drift` · `test_db_invariants` · `test_timestamptz_contract` · `test_sunucu_betikleri` · `test_deploy_move_retry` · `test_deploy_log_rotation` · `test_script_guards` · `test_db_copy`

İstemci: `update-feed-url.test.ts` (Electron + mobil) · `update-check-interval.test.ts` · `update-gate-escape.test.ts` · `clientPolicy.service.test.ts`

Gerekçe ve ölçüm hikâyesi: eski sürüm history dizininde.
