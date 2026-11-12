# İş emri · Rota/renk · Kalite

İş emri (WorkOrder) üretimi yönetir: topun rotası, adımları, hedef renk/özellik ve sipariş satırına bağı. Rota şablonu adım başına hedef önerir; istasyon yeteneği (renk · özellik · kalite) hangi adımın neyi verebileceğini söyler. Kapsadığı kod: `Teks-Erp/src/services/workorder*.ts`, `route.service.ts`, `station*.ts`, `services/helpers/{step-capability,quality-station,workorder-target-color,workorder-locks,tambur-plan-gate,order-line-scope}.helper.ts`, panel `Electron/src/pages/Operations/` iş emri ekranları, tablet `mobil/src/screens/Modules/HizliIsEmri/`.

## Kurallar

### İş emri ve sipariş bağı

- İş emri N sipariş satırına bağlanır ya da hiçbirine; `WorkOrder.type` bağın aynasıdır: ilk bağda STOK→ORDER, son bağ kalkınca ORDER→STOK, create/replace/quickStart gövdedeki satırdan türetir. [bekçi: test_workorder_order_link · test_quick_start_wo]
- Son bağ kaldırmada tek red hedef kumaşı NULL olan ORDER iş emridir (400); sipariş iptalinde kalan bağ 0 ise iş emri STOK'a döner. [bekçi: test_workorder_order_link]
- İki bağ yolu iki sözleşmedir: create/replace/quickStart siparişten hedef kumaş/renk/özellik TÜRETİR; sonradan `POST /:id/order-links` hiçbir şey MİRAS ALMAZ (kumaş/renk uyuşmazsa 400, en farkı uyarı, uyumsuz bağ yalnız `order-links/override`); birini ötekine "düzeltme". [bekçi: test_workorder_order_link]
- Top↔sipariş satırı bağı YOKTUR; iş emri yalnız üretimi yönetir, karşılama `SackAllocation` ile sevk anında yazılır. [inceleme]
- Bağ işlemlerine kapalı statüler yalnız CANCELLED+SUPERSEDED, plan değişikliğine kapalılar `PLAN_CHANGE_FROZEN_STATUSES` (COMPLETED dahil, 409 `WO_PLAN_FROZEN`); iki listeyi birleştirme — tamamlanmış iş emrine uyumlu "Sipariş Bağla" açıktır. [bekçi: test_wo_target_color_guard]
- İş emri statüsünü yalnız `claimWorkOrderStatusTx` yazar ve her geçiş `work_order_events`e satır düşer; iş emri yalnız `createWorkOrderTx` ile doğar, yeniden açılış `reopenWorkOrderTx`ten geçer. [bekçi: test_workorder_event_yazar · test_workorder_event_ledger]
- `work_order_events` anını `workOrderEventStampTx` verir (iş emri başına kesin artan); Prisma `@default(now())`a bırakma. [bekçi: test_workorder_event_ledger]
- İzlenen plan alanını (`WORK_ORDER_TRACKED_FIELDS`) yazan her yol aynı tx'te alan farkını deftere yazar; tip yalnız `setWorkOrderTypeTx` ile çevrilir; iş emri numarası doğuşta donar (farklı numara 409 `WORK_ORDER_NUMBER_FROZEN`). [bekçi: test_workorder_event_yazar · test_workorder_event_fields]
- Kapanış yalnız terminal-guard'lı `completeWorkOrderIfStepsDone` ile olur (CANCELLED/SUPERSEDED asla COMPLETED'a dirilmez); kapanış künyesi aynı tx'te donar, güncellenmez, canlıdan yeniden hesaplanmaz. [bekçi: test_wo_terminal_guard · test_workorder_close_snapshot]
- Üretim çıktısı kümesi tek kaynak `producedOutputWhere`; liste metriği ile detay aynı kümeden okur. [inceleme]
- İş emri Hareketler ekranı audit OKUMAZ; olaylar kendi defterlerinden tek çizelgeye dizilir, ekran sütunları = Excel sütunları. [bekçi: test_workorder_timeline · test_audit_okuma_kaynagi]
- IN_PROGRESS iş emrinde genel Düzenle renk · en · sipariş bağını değiştiremez (409 `WO_STARTED_USE_ACTION`); yol tek amaçlı eylemlerdir. [bekçi: test_wo_started_edit_gate]
- Tablet düzeltmeleri (renk · en · bağ çözme · kart yeniden basımı) `workorder:write` ∨ `mobile:is-emri-duzelt` ister ve sebep kodu `WORK_ORDER_PLAN_CHANGE` kataloğundan doğrulanır; panel yetkisiz iptal yalnız hiç işlem görmemiş iş emrinde geçer (aksi 409 `WO_CANCEL_PANEL_ONLY`). [bekçi: test_wo_tablet_correction]
- Yanlış okutulan top yalnız "Top Çıkar" ile geri alınır; işlem görmüş top 409 `ROLL_DETACH_PROCESSED`, iş emri boşalıp hiçbir adım başlamamışsa Planlandı'ya döner. [bekçi: test_wo_roll_detach]
- Stok topu açık iş emrine tek boğazdan (`addBatchToWorkOrderTx`) YENİ parti olarak girer ve rotanın ilk adımından başlar; tamamlanmış iş emrine her yoldan 409 `WO_COMPLETED_NO_ADD`, farklı kumaş 400 `ITEM_MISMATCH`. [bekçi: test_wo_batch_add]
- Depo/ham/yarı mamul top YENİ iş emrine yalnız `quick-start` ile girer; kabul edilen statüler backend `quickStart.attachable` ↔ mobil `ATTACHABLE_STATUSES` birebir. [inceleme]
- Giriş noktası: `recomputeStepStatus`ta top, iş emrine girdiği adımdan önceki adımlar için bekleyen değildir; §20 SQL'i ürün kodunun aynasıdır, biri değişince diğeri de değişir. [bekçi: test_consistency · test_fason_wrong_station_guidance]
- Sipariş "açık talep" süzgeci tek kaynak `order-line-scope.helper`; karşılanma raporu `getCoverageForLines` kullanmaz (çift sayım). [bekçi: test_order_line_scope_single_source]
- Sipariş satırının birimi `OrderLine.unit`; MT dışı satırda karşılama ölçülmez (`shippedQty` yazılmaz, sipariş kendiliğinden kapanmaz), açık yüzeyler satırı listede tutar ama metreye düşmez; elle `unit: MT` yazma, `isMeasuredLine` kullan. [bekçi: test_order_line_unit_ledger]
- `Order.destination` doğuşta donar; yalnız create ve siparişin açıkça başka cariye/şubeye taşındığı update yazar, gövdeden yazılamaz. [bekçi: test_order_destination_frozen]
- İş emri listesinde müşteri sipariş bağından türer; birincil müşteri İLK BAĞLANANDIR (ad sırası değil), koparılmış bağ sayılmaz. [bekçi: test_workorder_search]
- Bağ ekleme/kaldırma ve sipariş iptali refakat kartını `markTravelerCardDirtyTx` ile bayat işaretler. [inceleme]
- Yarı mamul arzdır: `malzemeAcigi` ham+yarı mamulü birlikte düşer, sipariş karşılamada `netGap` değişmez. [bekçi: test_semi_finished_surfaces]

### Rota, renk, özellik

- "Adım renk/özellik verebilir mi" tek yüklem `stepCanApplyColor`/`stepCanApplyProperty` (istasyon bayrağı VEYA adımın fason hizmeti); tekil `requiredCategory.appliesColor` ya da `kind ===` yazma. [bekçi: test_station_capability_flags]
- Rota adımında kategori seçilmemişse istasyonun varsayılan kategorisi okunur; yalnız istasyona bakmak fason boyahane adımını reddeder. [bekçi: test_route_step_targets]
- Fason KABULDE rengin fiilen uygulandığı sevkin `requiredCategory` bayrağından okunur; istasyon bayrağı "yapabilir", kategori bayrağı "yaptı" der — birleştirme. [bekçi: test_station_capability_flags · test_fason_receipt_color_width]
- Renk istasyon kısıtı değil reçetedir: `StationColor` filtre olarak okunmaz, ikinci renk filtresi eklenmez. [bekçi: test_station_capability]
- `FabricProperty` create'te `stationIds` zorunlu ve bağ aynı insert'te; update'te `stationIds` verilmezse bağa dokunma; boş dizi iki yolda da 400. [bekçi: test_property_station_binding]
- `StationProperty` satırının varlığı "verebilir" der; `mode` (AUTO|OPTIONAL|REQUIRED, varsayılan OPTIONAL) yalnız teyit biçimidir, kurşun bypass AUTO arar, SEÇİM özelliği AUTO olamaz. [bekçi: test_station_property_mode]
- SEÇİM (CHOICE) özelliği hedef olamaz: aktif seçim uçları `assertTargetablePropertyIds` (400), echo uçları `partitionTargetableIds`; sözleşmeyi sunucu korur. [bekçi: test_property_targetable]
- Hedef/Düzelt replace'leri yalnız FLAG satırlarına dokunur; CHOICE satırı operatör verisidir, `RollProperty.valueId` kesim/finalize/geri alma/fason çocuklarına taşınır. [bekçi: test_property_value_selection]
- Kat değeri kolondadır (`foldType`); katalog boşsa fail-open, metre cihazı kat rolüyle birebir eşleşir yoksa `null` (başka cihaza sapmaz). [bekçi: test_fold_catalog]
- Rota şablonu hedefi ÖNERİDİR, kilit değil; rotadan iş emrine son renk veren adım kazanır, özellikler birleşir, adımın istasyonu değişince hedefi sıfırlanır. [bekçi: test_route_step_targets]
- Sipariş bağlı iş emrinde renk siparişin şartıdır; rota şablonu hedefi onu ezemez (panel `applyRouteTarget` ve tablet `chooseRoute` dokunmaz). [inceleme]
- Rota kapsaması KATEGORİ düzeyinde reddetmez, uyarır (`collectRouteCoverageWarnings` → `ApiResponse.warnings`); "mal zaten öyle geliyor" muafiyeti `every` ile ölçülür, `some` kapıyı sessizce açar. [bekçi: test_wo_route_coverage_goods]
- Hedef renk değişikliğinin iki kapısı (Düzenle · Rengi Değiştir) tek bekçi `assertTargetColorChange`'ten geçer; renk kilidi MALA bakar: kısmi boyada 409 `COLOR_PARTIAL_CONFIRM`, hepsi boyalıysa 409 `COLOR_DYED_BLOCKED`. [bekçi: test_wo_target_color_guard]
- Fason kabulde hedef renk kilit altında taze okunur; `expectedTargetColorId` farklıysa 409 `TARGET_COLOR_CHANGED`. [bekçi: test_wo_target_color_guard]
- Tambur plan-sapma kapısı (renk/en) üç depo-indiriş yolunda tek helper `tambur-plan-gate.helper`; sapan top 409 `PLAN_MISMATCH` + `confirmMismatch` ile iner, sapma `RollPlanDeviation` defterine yazılır, audit'e değil. [bekçi: test_tambur_plan_gate]
- "Boyahaneye Geri Gönder" hedefini sunucu çözer (önceki en yakın boya adımı, yoksa 400 `NO_DYE_STEP_IN_ROUTE`); `AT_SUBCONTRACTOR` yazılmaz, fiziksel çıkış Fason Sevk'ten. [bekçi: test_tambur_send_to_dye]
- Sipariş kalemi rengi genel update ile değil `PATCH /orders/:id/lines/:lineId/color` ile değişir (sebep + audit). [inceleme]

### Kalite

- "Bu adım kalite kontrol yürütür mü" tek kaynak `quality-station.helper.ts`; bellek-içi `stepCanApplyQuality` ile Prisma parçası `QUALITY_STATION_WHERE` boğaz-ikizdir, birlikte değişir; saf yüklemi WHERE'e koyma, yeni `kind === PROCESS_QC` yazma. [bekçi: test_station_quality_capability]
- Seed yetenek bayraklarını (`appliesColor/appliesProperty/appliesQuality`) açıkça yazar; kolon varsayılanına güvenen seed boyahaneyi renksiz, KK istasyonunu kalitesiz doğurur. [bekçi: test_station_quality_capability]
- Tipsiz hata girişi kataloğun varsayılan tipine düşer, varsayılan yoksa 400; istemci listenin ilkini uydurmaz. [bekçi: test_default_defect_type]
- Her rotanın son adımı topu finalize eder (Tambur özel değil); `qualityGrade` nullable ve yalnız kalite istasyonları belirler; `PRODUCED` limbosu yok. [bekçi: test_finalize_last_step]
- Final statü kaliteden çözülür (`QualityGrade.targetStatus`, kod yoksa WAREHOUSE); kalite kodunu koda gömme (`code === 'FIRE'` yasak). [inceleme]
- `RollError` Tambur kararıyla kapanır (`isProcessed` + `CUT|NO_CUT`); kurşun bypass'ta `KURSUN_APPLIED`/`QC2_COMPLETED` yazılmaz, RollError açılmaz. [inceleme]
- Koşullu etiket elemanı (`showIf`) `QualityGrade.code` ile karşılaştırır, kalitesiz topta basılmaz; tek uygulama noktası `prepareElements`. [bekçi: test_label_element_condition]
- İstasyon türü kümesi panelde form şemasından türetilir, sabit allowlist yok. [bekçi: test_panel_station_kind_aynasi]
- Tablet ekran seçimi istasyon TÜRÜNDEN (`SCREEN_BY_STATION_KIND` ↔ backend `SESSIONABLE_STATION_KINDS`, bijektif); bu tabloya yetenek sokma. [inceleme]

## Tuzaklar

- Özellik-BAŞINA kapsama ("ŞU özelliği veren istasyon var mı") hâlâ SERTTİR: create 400, replace/updateTargetProperties 409, `goods` muafiyeti uygulanmaz ve hiçbir bekçi ölçmez — "kapsama uyarır" kuralını bu yola genişletme.
- Kurşun→KK→Tambur üçlü rota kurma: bypass uygunluğu "sonraki adım TAMBUR türü" şartına bakar (`kursun-bypass-eligibility.helper.ts`), sessizce kapanır.
- `assertWoAtStepKind(PROCESS_QC)` Tambur kart-okutma yoluyla paylaşılır; imzasını yeteneğe çevirmek Tambur'u da değiştirir.
- `setCapabilities` renge yalnız `colorIds` açıkça gelirse dokunur (`[]` hepsini siler); `properties[].mode` verilmezse mevcut mod korunur.
- §20 kırmızısı her zaman drift değildir: tek topu sonradan iptal edilen COMPLETED adım beklenen PENDING'e çöker; satır elle yorumlanır.
- `ReworkRollsDialog`'da fason firma seçicisi load-bearing: firma çözülemezse backend sevki sessizce atlar.
- Mobil Hızlı İş Emri `scanClassify` sırası load-bearing (iptal → statü → çuval/sevkiyat → kumaş); SHIPPED topa "çuvaldan çıkarın" demek malın müşteride olduğunu gizler.
- Mobil `canUnlinkOrderLine` yalnız aynadır; son söz backend'indir, ikinci kural kümesi yazma.
- Yetenek "VAR" sayılmak için motor + çıkış yüzeyi + izin ataması üçü birden gerekir; backend'de olup hiçbir istemcide çizilmeyen yol yok sayılır.

## Bekçiler

test_workorder_order_link · test_quick_start_wo · test_wo_target_color_guard · test_workorder_event_yazar · test_workorder_event_ledger · test_workorder_event_fields · test_wo_terminal_guard · test_workorder_close_snapshot · test_workorder_timeline · test_audit_okuma_kaynagi · test_wo_started_edit_gate · test_wo_tablet_correction · test_wo_roll_detach · test_wo_batch_add · test_consistency · test_fason_wrong_station_guidance · test_order_line_scope_single_source · test_order_line_unit_ledger · test_order_destination_frozen · test_workorder_search · test_semi_finished_surfaces · test_station_capability_flags · test_route_step_targets · test_fason_receipt_color_width · test_station_capability · test_property_station_binding · test_station_property_mode · test_property_targetable · test_property_value_selection · test_fold_catalog · test_wo_route_coverage_goods · test_tambur_plan_gate · test_tambur_send_to_dye · test_station_quality_capability · test_default_defect_type · test_finalize_last_step · test_label_element_condition · test_panel_station_kind_aynasi · istemci: scanClassify.test.ts · canUnlinkOrderLine.test.ts · ReworkRollsDialog.test.tsx · stationScreens.test.ts · WorkOrderFixSheet.test.tsx · WorkOrderDetachSheet.test.tsx

Gerekçe ve ölçüm hikâyesi: eski sürüm history dizininde.
