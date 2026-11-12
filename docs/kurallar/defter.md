# Defter · Numaralandırma · Mükerrer · Sebep katalogları

Durum tabloları "şu an ne"yi, defterler "ne oldu"yu tutar ve "ne oldu" asla değişmez; geri almak silmek değil TERSİNİ yazmaktır. Kapsam: defter ve ters kayıt, numara serileri, mükerrer/ana veri arşivi, sebep kataloğu. Kod: `Teks-Erp/src/services/helpers/` (defter yazıcıları), `number-series*`, `master-data-merge*`, `reason-preset*` servisleri; beyanlar `Teks-Erp/scripts/lib/`.

## Kurallar

### Defter ve ters kayıt

- Defter satırını (`RollOperation` · `RollMovement` · `WarehouseMovement` · `RollStatusEvent` · `ShipmentEvent` · `SwatchEvent` · `SackAllocation` …) `delete`/`deleteMany` ile silme. [bekçi: test_defter_ters_yol]
- Fiziksel silme yalnız iki sınıfta yazılır: deftere hiç yazmamış taslak (atomik claim'li) ve saf yapılandırma pivotunun replace'i; yeni silme yolu sınıfını kod yorumunda adıyla anar, diğer her "sil" durum geçişidir (`isActive:false` · `VOIDED` · `revokedAt`). [bekçi: test_defter_ters_yol]
- Ticari pivotu (`ItemPrice` · `SackAllocation` · `WorkOrderToOrderLine` · `RollProperty` · `WorkOrderTargetProperty`) sil-yaz yapma; damgayla (`revokedAt`/`clearedAt` + partial unique) sürümle. [inceleme]
- Geri alma ileri kaydı silmez ve değiştirmez, tersini BUGÜNE yazar; ileri damgayı (`dispatchedAt` ailesi) `null`'lama — yalnız tarihçesi ayrı defterde satır olan DURUM kolonu (`weighedAt` · `remainderClosedAt` · `invoicedAt`) beyanlı sitede null'lanır. [bekçi: test_defter_ters_yol]
- Yeni ileri olayı ya da sebep kodunu ters mekanizmasıyla (damga · ters bağ · tipli enum çifti · net karşı olay · karşı kayıt) AYNI commit'te `scripts/lib/defter-beyan.ts`e yaz; ad kalıbı (`*_CANCEL`) ölçüt değildir. [bekçi: test_defter_ters_yol]
- Bir varlığın durumunu/miktarını değiştiren HER yol (toplu yol dahil) o varlığın defterine satır yazar; ham `updateMany` ile defter kapısını atlama. [bekçi: test_stok_defteri_bag_olcumu]
- Raftan üretime giren her yol `PRODUCTION_ISSUE` çıkışı (tek yazıcı `production-issue-ledger.helper.ts`), üretimden rafa giren her yol `PRODUCTION` girişi yazar. [bekçi: test_stock_ledger_manual_move · test_stock_ledger_production_entry]
- İş emri değiştiren topun açık `PRODUCTION_ISSUE` satırı bağlı tersiyle kapanıp yeni adıma yeniden yazılır (`rebindProductionIssuesTx`); `ROLL_DETACH` yalnız topun iş emrinden ÇIKTIĞI yoldur. [bekçi: test_wo_roll_detach]
- Append-only defter `updatedAt` almaz, kronolojisi `createdAt`'tir; bir tablo hem defter hem durum kaynağı olmaz. [bekçi: test_db_invariants]
- Damgalı defterde tekil kısıt partial'dır (`WHERE "revokedAt" IS NULL`) ve `test_db_invariants` envanterine girer; `@@unique` `map:` ile adlandırılır. [bekçi: test_db_invariants · test_roll_operation_revoke]
- Damgalı defteri okuyan her yol (`include`/`_count`/`some`, ham SQL ve `recomputeStepStatus` dahil) aktif yüklemi TEK helper'dan alır (`ACTIVE_SACK_ALLOCATION` vb.); `every` yazılmaz. [bekçi: test_roll_movement_revoke · test_roll_operation_revoke · test_sack_allocation_cleared]
- Partial unique'li defterde `upsert`in `where`ine aktif yüklemi koy; yoksa geri alınmış satırı bulur ve iş tekrarlanamaz. [bekçi: test_roll_operation_revoke]
- Geri alınmış satırı bir daha değiştirme; geçmişi koruyan guard'lar (adım silme, istasyon/makine kalıcı silme) geri alınmış satırları da sayar. [bekçi: test_roll_movement_revoke]
- Aynı tx'te aynı varlığa çok satır yazan defterin damgası yalnız `ledger-stamp.helper.ts`ten gelir; "en son" okuyucu `createdAt`in yanına `id` koyar, depo defteri sırası yalnız `MOVEMENT_ASC`/`MOVEMENT_DESC`. [bekçi: test_defter_damgasi_kaynagi · test_depo_defteri_damgasi · test_esitlik_bozucu]
- Stok hareketi ucu: `warehouseId === null ⇔ status ∉ WAREHOUSE_STOCK_STATUSES`; stok dışından stok dışına satır yazılmaz. [db] [bekçi: test_stock_ledger_helper]
- Yazılamaz satırın davranışını çağrı yerinde `onUnwritable: "skip" | "throw"` ile beyan et; varsayılan yoktur. [bekçi: test_stock_ledger_helper]
- Stoktan çıkan yolda deposuz top `assertRollsHaveWarehouse` ile 409 + barkod listesi alır. [bekçi: test_stock_ledger_warehouseless]
- Kesim malı böler: ebeveyn çıkışı + çocuk girişi aynı `transformGroupId`de, biri yazılamıyorsa hiçbiri; stok sebep kodu malın YERİNDEN türer, aşım gruba girmez. [bekçi: test_stock_ledger_transform]
- Ters kayıt kapsamı tip düzeyinde ayrılır ("topun tüm izi" ≠ "şu işlem"); `OR workOrderStepId IS NULL` tek yüklemde yazılmaz. [bekçi: test_stock_ledger_kursun_reopen]
- Sayım fark fişi tek belgede, LIFO stornolanır; "terslenmiş mi" sorusunun tek cevabı `reversesMovementId` bağıdır. [bekçi: test_stock_count_reversal]
- Snapshot kolonları (`preShipStatus` · `initialQty` …) `scripts/lib/snapshot-kolonlari.ts`te beyanlıdır; canlı değerden yeniden türetilmez, "düzeltilmez". [bekçi: test_snapshot_kolonlari]
- Çalışma oturumu geçmişi silinmez; oturumu olan istasyon/makine kalıcı silinemez (409), pasife alınır. [bekçi: test_work_session_history_guard]
- `SystemLog`'dan karar, iş sayısı, durum ya da join türetme; yeni audit okuyucusu `scripts/lib/audit-okuma-beyan.ts`e yalnız yönetici onayıyla girer. [bekçi: test_audit_okuma_kaynagi]
- Yaşa göre budanan tablo telemetri olarak beyan edilmeden budanmaz; defter hiç budanmaz. [bekçi: test_telemetri_defter_degil]

### Numaralandırma

- Numara doğuşta tam string olarak kendi kolonuna yazılır; ekran, belge ve barkod o kolonu okur. Tek istisna `shipping.sackSeqPrefixLive`dır ve ekran ile belge aynı resolver'ı çağırır. [bekçi: test_number_series · test_sack_seq_label]
- Serinin kimliği `number-series-catalog.ts`te, biçimi `number_series`/`number_series_lines`tadır; boot uzlaştırması `prefix`/`dateSegment`/`digits`/`separator`/`retiredPrefixes`e dokunmaz. [bekçi: test_number_series · test_number_series_lines]
- `utils/code-format.ts` biçimlendiricilerini yalnız `number-series.service.ts` import eder; kod tek `resolveSeriesFormat` okumasından `formatSeriesCode` ile kurulur, ön ek/hane/örnek kod literali yazılmaz. [bekçi: test_number_series · test_bayat_kod_literali]
- Sayaç türetilir (aynı başlı kodların sayısal max'ı + adım, kapsam `formatChangedAt` sonrası, hesap `series-counter.helper.ts`); ayrı sayaç tablosu ya da yeni advisory uzayı açma, sıfırlama dönemi tarih segmentinin sonucudur. [bekçi: test_number_series · test_number_series_scope]
- Sıra hane sınırını aşınca kod genişler, sarmaz (sarma yalnız `wrap=true` + üst sınırla); doğrulama `\d{digits,}` kabul eder. [bekçi: test_number_series · test_batch_number_format]
- Biçim değişimi geçmişe dokunmaz: eski ön ek/biçim emekliye ayrılıp okutulmaya devam eder, yeniden numaralama sunulmaz, geçiş geçmiş tarihe yazılamaz. [bekçi: test_number_series · test_number_series_lines]
- Okutulan kodun türü yalnız sunucunun `classifyScannedCode`undan çözülür; istemci ön eki regex'e çakmaz, tanınmayan kod aramaya düşer. [bekçi: test_scan_series · scanSeries.service.test · resolvePoolScan.test]
- `/api/scan/series` ve `/api/scan/resolve` izin kodu taşımaz ama kayıt tablolarına inmez ve kayıt alanı döndürmez. [bekçi: test_scan_series · test_route_auth_coverage]
- Okutulan serinin ön eki ASCII büyük harf + rakam, ≤ 6 karakter; ön ek çakışması tarama uzayında küresel, aynı kolonu paylaşan serilerde (`docNo`) ön ekler birbirinin başlangıcı olamaz. [bekçi: test_number_series · test_number_series_panel]
- Okutulan serinin biçimi, sahadaki panel/tablet o ekseni taşımıyorsa değiştirilemez (400 `NUMBER_SERIES_CLIENT_TOO_OLD`). [bekçi: test_eski_istemci_okutma · test_number_series_scope]
- Master veri kodunu istemci üretmez; elle numara yolları `assertManualNumberAllowed`dan geçer. [bekçi: test_subcontractor_code_autogen · test_number_series_panel]
- İade belge no `RollReturn.returnNo`dan okunur, belgeye aittir (üye satırlar liderin numarasını taşır), belge başına bir kez üretilir. [bekçi: test_return_no_backfill]
- "Sıradaki numara" ve önizleme üretim yolunun kendi hesabından gelir; panel biçimlendirici yazmaz. [bekçi: test_number_series_siradaki · test_number_series_panel]
- Biçim değişimi etkin etiket şablonunda barkodu taşırıyorsa 409 `NUMBER_SERIES_LABEL_OVERFLOW`. [bekçi: test_label_width_gate]
- Seri önbelleği bilerek fail-SAFE'tir (okunamazsa katalog tohumu): numara üretememek üretimi durdurur. [inceleme]

### Mükerrer ve ana veri arşivi

- Türkçe katlama yalnız `utils/tr-case.ts`ten (`upperTr`/`lowerTr`, ad için); kod için `foldCodeForCompare`, içe aktarımda yazan ve okuyan aynı helper'ı çağırır. [bekçi: test_tr_case]
- Ad mükerrerinin son hattı DB seddidir (`<tablo>_nameFold_key`; birleştirmeye katılan tabloda partial `mergedIntoId IS NULL`, renkte `tr_fold_color(name)` ifade unique'i); `assertNameNotDuplicate` kaldırılmaz. [db] [bekçi: test_db_invariants · test_master_data_name_dup]
- Kimlik alanına (VKN vb.) tekillik seddi koyma; o eşleştirme sinyalidir. [inceleme]
- Yeni master model rol bayrağı mı ayrı kimlik mi ölçülmeden doğmaz; tekillik tablolar arası sorulur. [bekçi: test_master_data_kimlik_tekilligi]
- Birleştirme defterlidir (`MergeOperation`): taşınan satır kimliği `RETURNING` ile yazılır, geri alma LIFO; çakışma yüklemi tek kaynak `conflictPredicateSql`. [bekçi: test_master_data_merge_revert · test_master_data_merge_conflicts]
- Survivorship seçimi değer değil kayıt üzerindendir, alan yazımı atomik claim'den SONRA. [bekçi: test_merge_field_picks]
- Mükerrer TOP birleştirilmez, `MUKERRER` sebebiyle kendi ucundan iptal edilir; toplu iptal ucu yoktur. [bekçi: test_duplicate_rolls]
- Canlı referanslı ana veri pasife alınmaz: 409 + engelleyen kayıtlar tek tek döner. [bekçi: test_item_archive_gate · test_master_data_archive_gate · test_kartela_arsiv_kapisi]
- Ürün kartı üç durumludur (Aktif · Tükenene kadar · Pasif); kullanılabilirliği yalnız `assertItemUsable` söyler, ölüden canlıya geri alma önce `assertRollsRevivable`/`assertSwatchesRevivable` çağırır. [db] [bekçi: test_item_usage_single_source · test_item_lifecycle_single_writer · test_item_archive_db_guard]

### Sebep katalogları

- Sebep listeleri `ReasonPreset`te yaşar; `code` doğuşta yazılır ve ASLA değişmez, satır silinmez gizlenir, son aktif satır gizlenemez, gizli kod doğrulamada geçerlidir. [bekçi: test_reason_presets]
- Sebep kodunu sunucu türetir (`resolveReasonCode`); bilinmeyen kod 400, serbest metne kod uydurulmaz. [bekçi: test_reason_presets]
- Sebep önbelleğinde TTL tazeliktir: bayat liste döner ve tazelenir, kod kataloğuna düşme yalnız hiç dolmamışsa. [bekçi: test_reason_presets]
- `ReasonPresetKind` backend, panel ve tablette elle aynalanır; yeni kind hepsine birlikte eklenir, ayna `Record<ReasonPresetKind,…>` ile yazılır. [bekçi: test_reason_preset_kind_parity]
- Sebep yazma izni `roll:manual-adjust` ∨ `mobile:tambur-duzelt`tir. [inceleme]
- Tablet katalogu sunucu → disk → APK zemini sırasıyla okur, zemin kaldırılmaz; metin saklayan kind'ın sentetik `BUILTIN_<i>` kodu sunucuya gönderilmez. [inceleme]
- Sebep seçimi `ReasonPresetPicker`, sıralama `mergeVisibleOrder` ile yapılır. [bekçi: ReasonPresetPicker.test · reasonPreset.order.test]

## Tuzaklar

- Prisma `@@unique` constraint değil INDEX üretir: `DROP CONSTRAINT IF EXISTS` sessizce hiçbir şey yapmaz, `DROP INDEX` gerekir; predicate değişiminde yeni index geçici adla kurulur → eski düşer → `RENAME`.
- Ters kayıt yolu ileri kaydı iptal eden belgeyi `FOR SHARE` ile kilitleyip SONRA taze okur; yoksa ölü belgenin kaydı dirilir.
- Deftere `RESTRICT` ile bağlı satır eklemek, ebeveyni silen her yeri (bekçi temizlikleri dahil) ödev yapar; temizlik hatası `.catch(() => {})` ile yutulmaz.
- `WarehouseMovement` geçmişi defter öncesi için eksiktir ve onarılmayacaktır; o dönem için Σ hareket ↔ stok mutabakatı tanımsızdır.
- `RollPlanDeviation` karar defteridir ama damga kolonu ve ters yolu yok (açık borç); tasarım `docs/design/PLAN-SAPMA-GERI-ALMA-TASARIM.md`.
- Ön ek ile kodu iki ayrı `new Date()`ten kurma: gece yarısında dünün ön ekiyle taranıp bugünün ön ekiyle yazılır, `@unique` çakışır.
- `GET /<kaynak>/similar-names` router'da `/:id`den ÖNCE tanımlanır; sonra gelirse id sanılıp 400 döner ve panelde uyarı çizilmez.
- Yeni tabloya ad seddi eklemeden önce `scripts/find_fold_duplicates.ts` koşulur; mükerrer varken sed yumuşak kapıyla (atla + NOTICE) iner ve `test_db_invariants` §1 kırmızısı bilinçlidir.

## Bekçiler

test_defter_ters_yol · test_db_invariants · test_stok_defteri_bag_olcumu · test_roll_movement_revoke · test_roll_operation_revoke · test_sack_allocation_cleared · test_defter_damgasi_kaynagi · test_depo_defteri_damgasi · test_esitlik_bozucu · test_stock_ledger_helper · test_stock_ledger_manual_move · test_stock_ledger_production_entry · test_stock_ledger_transform · test_stock_ledger_warehouseless · test_wo_roll_detach · test_snapshot_kolonlari · test_audit_okuma_kaynagi · test_telemetri_defter_degil · test_number_series · test_number_series_lines · test_number_series_scope · test_number_series_panel · test_number_series_siradaki · test_eski_istemci_okutma · test_scan_series · test_return_no_backfill · test_label_width_gate · test_tr_case · test_master_data_name_dup · test_master_data_merge_revert · test_master_data_merge_conflicts · test_duplicate_rolls · test_master_data_archive_gate · test_reason_presets · test_reason_preset_kind_parity

Gerekçe ve ölçüm hikâyesi: eski sürüm history dizininde.
