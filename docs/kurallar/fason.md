# Fason · Kartela

Topun rotasındaki dış istasyon adımı: fasoncuya sevk, kabul (tam/kısmi), kalan kapaması, fasondan müşteriye doğrudan sevk, fason karnesi; ayrıca WO'suz kartela fasonu ve kartela defteri. Kod: `Teks-Erp/src/services/subcontractor.service.ts`, `services/helpers/` (fason-open-dispatch · roll-variance · swatch-event · dispatch-header), kartela servisleri; panel `Electron/src/pages/Operations/` fason ekranları; tablet `mobil/src/screens/Modules/FasonKabul` ve fason sevk ekranı.

## Kurallar

### Kabul ve defter

- TAM kabul topu `SUBCONTRACTOR_CONSUMED` yapar, makbuzdan `parentReceiptId`li yeni açık-kumaş toplar doğar (`entrySource=SUBCONTRACTOR_RETURN`); KISMİ kabulde top tüketilmez, `AT_SUBCONTRACTOR` kalır ve `currentQty` atomik decrement ile kalana iner; her teslimat ayrı makbuzdur. [bekçi: test_fason_partial_receive]
- Fason rotanın son adımıysa doğan toplar final üründür (`WAREHOUSE` + tx içinde sıralı barkod + `form=ACIK`); ara adımsa `IN_PRODUCTION` ve barkodsuz doğar, ölçüm sonraki iç istasyonun FINISH'inde damgalanır. [inceleme]
- Sevk kalemi yalnız TAM (`isPartial=false`, iptal edilmemiş) makbuz satırıyla dönmüş sayılır; bütün outstanding süzgeçleri bu yüklemi okur. [bekçi: test_fason_partial_receive, test_fason_open_dispatch_single_source]
- "Açık + outstanding fason sevki" koşulunu yalnız `helpers/fason-open-dispatch.helper.ts`ten al (`OPEN_OUTSTANDING` · `OUTSTANDING_ITEM` · `outstandingItemOfOpenDispatch`); elle kopya yazma, ham SQL ikizleri aynı süzgeci taşır. [bekçi: test_fason_open_dispatch_single_source, test_fason_open_dispatch_semantics]
- Fazla dönen metraj (ya da `receivedQty` verilmemişse) TAM kabuldür: deftere kalan yazılır (clamp), fiziksel fazla ayrı eksende OVERAGE sapmasıdır; düşülen ile doğan iki ayrı büyüklüktür. [bekçi: test_fason_partial_receive]
- Çekme hata değil ölçümdür: kabulde `bornTotal − consumedTotal` farkı (eşik 0,01 m) `RollVariance`a yazılır (eksi SCRAP `FASON_CEKME`, artı OVERAGE), çok toplu kabulde `allocateShrink` orantılı dağıtır; kısmi kabulde de yazılır. [bekçi: test_fason_partial_receive, test_roll_variance]
- Çekme uyarısı yalnız sunumdadır (`fason.shrinkWarnEnabled`, `fason.shrinkTolerancePct`); backend zorlamaz, eşik altındaki fark da deftere yazılır. [inceleme]
- Sapma satırı yalnız kabul yolundan doğar (tek yazar `helpers/roll-variance.helper.ts`); `entrySource=SUBCONTRACTOR_RETURN` yazmak fason kabulü sayılmaz. [inceleme]
- Kısmi kabulde movement açık kalır, son teslimatta `qtyOut = COALESCE(qtyIn, currentQty)` ile kapanır; teslimat izi makbuz kalemlerindedir, `RollOperation SUBCONTRACTOR_RETURNED` yalnız ilk dönüştür. [bekçi: test_fason_partial_receive]
- Replay kimliği `SubcontractorReceipt.clientToken`dır; iptal edilmiş makbuzun token'ı 409 `RECEIPT_CANCELLED`; kalemi `isPartial` olan makbuz "aynı top kümesi" diye cached dönmez. [bekçi: test_fason_partial_receive]
- Kabulde doğan toplar kabul edilen sevkin partisini alır (istemci `batchId` açık sevklerden biri olmalı, yoksa 400 `RECEIPT_BATCH_NOT_OPEN`); aynı sevkin ikinci+ teslimatı yeni parti açar ve bu sayım kendi makbuz satırı yazılmadan ÖNCE yapılır. [bekçi: test_fason_receipt_batch, test_fason_partial_receive]
- Fason kabulünde renk `wo.targetColorId`den gelir; renk uygulamayan fason adımı rengi silmez, "renk veren adım" sorusunun tek kaynağı kategorinin `appliesColor`ıdır. [bekçi: test_station_capability]

### Geri alma ve kapanış

- Makbuz iptali LIFO'dur: aynı topa dokunan daha yeni aktif makbuz varken 409 `RECEIPT_NOT_LATEST`; TAM kalem statüyü geri çeker, KISMİ kalem metrajı atomik increment ile geri koyar. [bekçi: test_fason_partial_receive]
- Kabul iptali stok defterine TERS satır yazar (`FASON_RECEIPT` → `FASON_RECEIPT_CANCEL`, `reverseLatestScopedStockMove`); doğan topun güvenli statüleri `BORN_ROLL_SAFE_STATUSES`, engeller `computeBornRollBlockingReasons` ↔ `blockingCondition` ikizidir — çuvala girmiş ya da başka canlı hareketi olan doğan top iptali bloklar. [bekçi: test_stock_ledger_fason]
- "Kalan gelmeyecek" yalnız elle kapanır (`POST /api/subcontractor/close-remainder`, sebep zorunlu, zaman aşımı yok): top `SUBCONTRACTOR_CONSUMED`, kalan `RollVariance` SCRAP `SUBCONTRACTOR_REMAINDER`, kaleme `remainderClosedAt`. [bekçi: test_fason_partial_receive]
- Kalan kapaması geri alma kapısını topun geçmişinden kur: bu adımda `remainderClosedAt` kalemi yoksa 409 `REMAINDER_NOT_CLOSED_AT_STEP`, top doğrudan sevk edilmişse 409 `ROLL_DIRECT_SHIPPED`, iş emri terminalse 409 `WORK_ORDER_TERMINAL`; damga kaldırma atomik claim, WO kilidi tx'in ilk ifadesi. [bekçi: test_fason_reopen_remainder_guard]
- İş emri manuel kapatma fasondaki ya da açık fason sevkine bağlı top varken 409 verir; fason dönüşü top STOCK'a çekilemez. [bekçi: test_wo_manual_complete]

### Doğrudan sevk ve karne

- Fasondan müşteriye doğrudan sevk (DSK) yapılmış fason sevki iptal edilmez, kalemleri taşınmaz; DSK koşulu iptalin atomik claim'indedir (`directShipments: { none: {} }`), tx dışı okuma yalnız önizlemedir. [bekçi: test_fason_direct_ship_dispatch_lock]
- Fasondan kısmi doğrudan sevkte ebeveynin `initialQty`sini düşürme, yalnız `currentQty` iner; `initialQty` üretim anı snapshot'ıdır. [bekçi: test_input_rolls_directship]
- `SubcontractorDispatch.directShippedAt` yalnız sevkin TÜM kalemlerinin topu müşteriye çıktığında basılır; karar işlem sırasından bağımsızdır. [bekçi: test_subcontract_scorecard]
- Fason karnesinde fire yalnız kapanmış kalemlerden: dönen = kabul defteri `SUM(COALESCE(receivedQty, currentQty))` + sapma defteri neti; müşteriye doğrudan giden metre BAŞARILI TESLİMDİR (fire = giden − dönen − müşteriye giden); çekme `openQty`ye girmez. [bekçi: test_subcontract_scorecard, test_fason_partial_receive]
- Fason doğrudan sevk `shipping.orderRequirement` kapsamındadır (`orderless` beyanı kaçıştır). [bekçi: test_shipping_flags]

### Akış ve giriş noktası

- İş emrine aşağıdan katılan top (fason dönüşü, elle eklenen) yukarıdaki adımları bekletmez: giriş noktası bu WO'daki en erken hareketin `stepSequence`idir. [bekçi: test_consistency, test_fason_wrong_station_guidance]
- Manuel taşıma fason adımına `AT_SUBCONTRACTOR` yapmaz (mal içeride bekler, çıkış fason sevkle); Konumu Düzelt'in hızlı kabulü daima TAM kabul gönderir, kısmi kabul yalnız `FasonReceiveDialog` ve tabletten. [inceleme]
- Birden çok partiye yayılan seçimde strateji alanla gelir (`multiBatchStrategy`): yoksa 409 `MULTI_BATCH`; `SEPARATE` parti başına sevk tek tx'te, `MERGE` en eskide birleştirir. [bekçi: test_batch_multibatch_dispatch]
- Fasondaki/kartelalık/tüketilmiş/sevk edilmiş top (`ALWAYS_BLOCKED`) hiçbir düzeltme yoluyla değiştirilmez; kapsam topun durumundan çözülür. [bekçi: test_roll_edit_unified]
- Mobil fason adımında `dispatchWithoutColor` değeri her adım için açıkça gönderilir (true da false da). [bekçi: test_dispatch_without_color]

### İş ortağı kimliği

- Müşteri · tedarikçi · fason ilişkileri kartın üç rol bayrağıdır; `Customer.type` bunlardan türer (tek yazar `resolveCompanyType`), yeni kod bayrağı okur ve `type`a yazmaz; fason rolü profil bağından türer (`syncSubcontractorRoleTx`). [bekçi: test_partner_roles]
- Fason profili (`Subcontractor`) bir cari kartına bağlanır, cari hesap yalnız kartta yaşar; bağsız profil göçü tahminle bağlamaz, bağ `--baglan` ile kullanıcı kararıdır. [bekçi: test_subcontractor_customer_profile, test_migrate_partner_roles]
- Fason firmanın ticari kimliği (alış siparişi, mal kabul) `resolvePartyToCardTx` ile karta çözülür; fason işinin tarafı profil olarak kalır. [bekçi: test_supplier_party_tek_adres]
- `CariAccount.subcontractorId` ve `Customer.type` kaldırma fazı `test_rol_modeli_kalinti`nin dört kolu yeşil olmadan açılmaz; "ölçülemedi" temiz sayılmaz. [bekçi: test_rol_modeli_kalinti]

### Kartela

- Kartela fasonu üretim fasonundan ayrı ve WO'suzdur: `KartelaDispatch` (`AT_KARTELA`) → `KartelaReceipt` ile N `Swatch`, ebeveyn `KARTELA_CONSUMED`; idempotency `SwatchStockReduction.clientToken`dadır. [bekçi: test_kartela_stock_and_ship]
- Kartelanın yerini ve doğuşunu yalnız `helpers/swatch-event.helper.ts` yazar (`transitionSwatchesTx` · `createSwatchesTx`); her geçiş aynı tx'te `swatch_events`e satır düşer. [bekçi: test_swatch_event_yazar, test_swatch_event_ledger]
- "Stokta kartela" yalnız `SWATCH_IN_STOCK_WHERE`dir; stokta/çuvalda/sevkiyatta kartela ürün ve renk için canlı referanstır (arşivlenemez). [bekçi: test_swatch_event_timeline, test_kartela_arsiv_kapisi]
- Kartela durumu ile yer kolonları DB seddiyle bağlıdır (`swatches_status_shape`); sevkiyattan çıkarırken kartela geçişi çuvalın `shipmentId`sinden ÖNCE yazılır, kilit sırası çuval → kartela. [db] [bekçi: test_swatch_event_paths, test_kartela_durum_anomali]
- Kartela stok düşümü geri alınır, silinmez; kabulü iptal edilmiş ya da sevkiyatta/çuvalda kartela varsa tüm belge 409. [bekçi: test_swatch_stock_reduction_reversal]

## Tuzaklar

- Fason istasyonu iki alandan tanınıyor: `Station.type=EXTERNAL` (guard'lar) ve `Station.kind=SUBCONTRACTOR` (listeler); ikisini bağlayan doğrulama yok, istasyon kurarken ikisini birlikte yaz.
- Olmayan enum üyesiyle süzme (`StationKind.EXTERNAL`) Prisma'da koşulu sessizce düşürür; `scripts/` tip kapısı `npm test` ön koşuludur, tek testte atlanır.
- İş emri kapanış GUARD 1b ve `rescueStuckRoll` "açık fason sevkine bağlı top"u helper'sız, daha dar bir yüklemle yazıyor; AST bekçisi bu kalıbı görmüyor.
- Fason kabulü haftalar önce yaratılmış topu bugün depoya alır; Ham Stok dışı sekmeler `updatedAt desc` sıralanır, yeni "statüye çek" yolu bu sözleşmeyi bozmamalı.
- Yeniden üretime almada fason firma seçicisi taşıyıcıdır: firma `stepPlanning` ile gitmezse "Fasona gönder" sessizce hiçbir şey yapmaz.
- Kısmi kabulde barkod son teslimata/kalan kapamaya kadar yaşar; "barkod geçersizleşir" uyarısı yalnız tam kabulde kesindir.
- Test fixture'ında fason firmasını seed'den arama; `scripts/fixture-subcontractor.ts` ile üret (pasif kayıt bulunup ilk çağrı patlar).
- RN Paper `SegmentedButtons` satır kabının doğrudan çocuğu olunca yanındaki başlık sıfır genişliğe iner; açık `width` ver.

## Bekçiler

test_fason_partial_receive · test_fason_open_dispatch_single_source · test_fason_open_dispatch_semantics · test_roll_variance · test_fason_receipt_batch · test_station_capability · test_stock_ledger_fason · test_fason_reopen_remainder_guard · test_wo_manual_complete · test_fason_direct_ship_dispatch_lock · test_input_rolls_directship · test_subcontract_scorecard · test_shipping_flags · test_consistency · test_fason_wrong_station_guidance · test_batch_multibatch_dispatch · test_roll_edit_unified · test_dispatch_without_color · test_partner_roles · test_subcontractor_customer_profile · test_migrate_partner_roles · test_supplier_party_tek_adres · test_rol_modeli_kalinti · test_kartela_stock_and_ship · test_swatch_event_yazar · test_swatch_event_ledger · test_swatch_event_timeline · test_kartela_arsiv_kapisi · test_swatch_event_paths · test_kartela_durum_anomali · test_swatch_stock_reduction_reversal

Gerekçe ve ölçüm hikâyesi: eski sürüm history dizininde.
