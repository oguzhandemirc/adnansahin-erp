# Sevkiyat · Çuval · Parti · Yarı mamul

Depodaki bitmiş topun çuvala girip sevkiyatla müşteriye çıkması, iadesi ve stornosu; üretim partisi (`Batch`) numarası; ham stok yanında duran yarı mamul kovası. Kod: `Teks-Erp/src/services/shipping.service.ts`, `services/helpers/` (allocation · packing-group · sack-seq · shipment-coverage), `batch.service.ts`, `inventory.service.ts`; panel `Electron/src/pages/Operations/` (SackStore · Shipments · Returns · Rolls); tablet `mobil/src/screens/Modules/` (TartiPaket · Sevkiyat · Depo).

## Kurallar

### Sevkiyat ve çuval

- Sevk rakamını her yüzeyde BRÜT bas: sevk edilmiş sevkiyatın metrajı/adedi canlı çuval sorgusundan üretilmez, iade çıkış belgesini geriye dönük değiştirmez, ayrı belgeyle kapanır. [bekçi: test_dispatch_report_gross]
- Brütün tek kaynağı iptal edilmemiş `RollReturn`dür (`prevSackId` ile geri ekleme): `attachTotals` · `accounting-export` · `getShipmentById` · `collectShipmentDocContent` · `reports/_shipped.ts` aynı yolu kullanır; altıncı hesap yazma. Yalnız `getDispatchReport` donmuş snapshot okur. [bekçi: test_shipment_list_gross · test_shipment_detail_gross · test_dispatch_report_gross]
- "Dönemde sevk edilen metraj"ın tek tanımı `reports/_shipped.ts`dir (iade geri eklemeli, doğrudan sevk dahil); ikinci tanım yazma. [bekçi: test_quality_scorecard]
- Mobil istemcide brütü elle kurma (`rollCount + returnedCount` çift sayar); iade işareti `sack.returnedCount`, dipnot backend'in `summary.returnedCount/returnedMeters` alanından gelir. [inceleme]
- Storno ≠ iade: iade = mal müşteriye ULAŞTI → iade irsaliyesi + `RollReturn` (sebep zorunlu); storno = mal HİÇ ÇIKMADI → çıkış belgesi VOIDED, stok rafa döner, iade defterine yazılmaz. [bekçi: test_shipment_undo_dispatch]
- Düz storno (DISPATCHED→PLANNED) tahsisi SİLMEZ (`ShipmentOrder.isActive=true` + yeniden hesap, plaka/şoför korunur); `releaseSacks` ile storno aynı tx'te `cancelPlannedShipmentTx` çağırır → CANCELLED, tahsis silinir, çuval havuza, toplar çuvalda kalır, irsaliye VOIDED. [bekçi: test_shipment_undo_dispatch]
- Sevkiyat iptal gövdesinin tek kaynağı `cancelPlannedShipmentTx`dir (atomik `expectedStatus` claim); `cancelShipment` ve `undoDispatch({releaseSacks})` onu çağırır, ikinci kopya yazma. DISPATCHED iptal edilmez, storno edilir. [bekçi: test_shipment_undo_dispatch]
- Storno engelini tek yüklemden sor (`resolveUndoBlockReason`: faturalanmış · iadesi alınmış · `shipping.undoDispatchSameDayOnly`); önizleme etkilenen her çuvalı ve topu (barkod · metre · döneceği raf) somut listeler. [bekçi: test_shipment_undo_dispatch]
- Storno ileri kaydı silmez: `dispatchedAt`/`dispatchedById` NULL'lanmaz ("en son ne zaman sevk edildi" anlamındadır), güncel gerçek `status`ta, geçmiş `ShipmentEvent` defterinde çiftli olaylarla durur. [bekçi: test_shipment_event_ledger]
- `SackAllocation`ı sevk ANINDA yaz (`distributeSacksToLines`, spec+şube FIFO); stok yalnız DISPATCH'te `SHIPPED` düşer, PLANNED tahsis sayılmaz, `shippedQty` defterden türer ve elle yazılmaz. [bekçi: test_shipment_undo_dispatch]
- Top ↔ sipariş satırı bağı kurma; çuval bir DEPO nesnesidir (`customerId` opsiyonel, `shipmentId` NULL = havuz), sevkiyat depodan çuval seçilerek kurulur, rezervasyon yoktur. [inceleme]
- Tahsiste kumaş ve renk KESİN eşleşir, yalnız en gevşetilebilir (`shipping.allocWidthToleranceEnabled`, varsayılan kapalı); tahsis sipariş miktarını aşmaz (`shipping.allowOverAllocation`, varsayılan kapalı). [bekçi: test_allocation_repair]
- Siparişe yazılamamış sevkiyatı yalnız onarım ucuyla düzelt (`/api/shipping/repair/allocations`, motor `setShipmentOrders`, sipariş kümesi değişmez, irsaliye v+1); izin `shipping:repair-allocation`, `shipping:write` yetmez. [bekçi: test_allocation_repair]
- Sipariş bağı iki ayrı bayraktır: `shipping.orderRequirement` niyeti (off|warn|block), `shipping.orderCoverage` sonucu ölçer; kapsama kapısı yalnız kurulumda çalışır, `dispatchShipment`te atmaz. `orderRequirement=block` açılmaz (tablet `orderIds` göndermiyor) ve fason doğrudan sevki de kapsar. [bekçi: test_shipping_flags]
- Görev ayrılığı: `shipping:undo-dispatch` (storno + kapanış; `shipping:write` kapsamaz) · `shipping:invoice` (fatura izi) · `shipping:write` (çuval/irsaliye/sevk) ayrı izinlerdir; atama panelde elle yapılır. [bekçi: test_shipment_undo_dispatch, test_shipment_invoice]
- Fatura izi (`invoiceNo`+`invoicedAt`+`invoicedById`) yalnız DISPATCHED sevkiyata atomik claim ile yazılır; tutar/KDV taşımaz. [bekçi: test_shipment_invoice]
- Birim miktarın kaynağını izler: sevk defteri METRE tutar, defterden türeyen her miktar "m" etiketiyle basılır; sipariş satırının birimi (kg/adet) ona yazılmaz. [bekçi: test_auto_draft_shipment]
- Depo çuvalının içeriğine dokunan yol sırayla `touchWarehouseSackTx` (atanmış çuval 409) → PLANNED küme değişirse `touchShipmentPlannedTx` → `markSackContentChangedTx` (kg sıfırlar + `labelDirty`) çağırır. [bekçi: test_sack_touch_gate, test_label_dirty_sources]
- `Sack.notes` bir açıklamadır: `setSackNotes` `touchWarehouseSackTx` kullanmaz (sevk edilmiş çuvala da yazılır); guard'ı "eksik" sanıp ekleme. [bekçi: test_sack_notes]
- Çuval tartısı ölçümdür ve `SackWeighing` defterine yazılır (WEIGHED · REWEIGHED · CLEARED); içerik değişiminin kg sıfırlaması `CLEARED` olayıdır, sessiz silme değil. [bekçi: test_shipment_event_ledger]
- Uydurulmuş kg canlı veriye girmez: istemci `source:'SIMULATED'` beyan eder, `shipping.simulatedWeightEnabled` kapalıyken (varsayılan) 400; tartı cihazı yok/okunamadı/değer ≤ 0 ise tablet mutasyonu hiç çağırmaz. [bekçi: test_sack_weigh_source]
- SACK etiketinin barkodu `Sack.sackNo`dur, ayrı barkod kolonu ekleme; SACK şablonu çözülemezse Türkçe 400, roll etiketine sapma. [bekçi: test_sack_label, test_label_context_fit]
- Sevkiyat/çuval/parti kodunun ön ekini kodda literal yazma; biçim `number_series`ten gelir, tanıma `matchesSeries(resolveSeriesFormat(...), kod)` ile yapılır. [bekçi: test_number_series]
- Toplu iadede defter SATIR bazlı (N top = N `RollReturn`), belge GRUP bazlıdır (`returnGroupId`); iade belgesini üye id'siyle çözme, istemci `documentSourceId` (`returnGroupId ?? id`) kullanır. [bekçi: test_return_bulk_group]
- İade sevkiyat başına bir belge yazar; çok sevkiyatlı iade `POST /api/returns/batch` ile sırayla gider ve tamamlanan/düşen gruplar yanıtta açıkça döner. [bekçi: test_return_scope]
- İade belge numarasının tarih segmenti fabrika gününden (`factoryYmd`) gelir, süreç saat diliminden değil. [bekçi: test_return_document_no]
- Çuvaldan toplu "dağıtma" önce `POST /sacks/distribute/preview` ile etkilenen her topu listeler; uygulama sevkiyata atanmış çuvalı sebebiyle ATLAR, çuval kaydını silmez. [bekçi: test_sack_bulk_distribute]
- Sevk belgesinde müşterideki ürün adı donar, ad rejimi (`shipping.docItemNameMode`, `docCekiNameMode`) her baskıda canlıdır; ekran ve belge aynı zinciri kullanır: override > alias > yok (bizim adımız müşterinin adıymış gibi basılmaz). [bekçi: test_shipment_doc_customer_name]
- Sevk yönü sevkiyatta seçilmez: şubenin yönü, boşsa carinin yönü kilitli gelir (`resolveShipmentDestination`); zincir boşsa ilk açık seçim `claimFirstDestinationTx` ile karta bir kez yazılır. [bekçi: test_shipment_destination_chain, test_shipment_destination_lock]
- İhracat kodu ve Gümrük/İhracat No yalnız yurtdışı sevkiyatın ekranında ve belgesinde görünür; belgede kapı snapshot doğarken uygulanır, eski donmuş belge değişmez. [bekçi: test_export_code_snapshot_gate, test_shipment_dispatch_document]
- Emanet top (`ownerCustomerId` dolu) yalnız sahibine sevk edilir: malın çıktığı her yol `assertOwnerMatchesTx`ten geçer (409 `OWNER_MISMATCH`), kapı bayraktan bağımsızdır. [bekçi: test_emanet]
- Paketleme grubu bir çalışma yaftasıdır, rezervasyon değildir: stok düşmez, çuvalı kilitlemez; üyelik `Sack.packingGroupId`tadır, sevkte temizlenmez (storno çuvalı grubuyla geri getirir). [bekçi: test_packing_group]
- Grup numarası park yeridir: belgeye/etikete basılmaz, kimlik `PackingGroup.id`; sevk partisi modunda kalıcı kimlik `PackingGroup.code` (`PRT-YYMM-NNNN`), `P-n` adı yalnız açık partiler arasında tekildir. [bekçi: test_packing_group, test_sevk_partisi]
- Grubun/partinin tamamına işlem yapan her uç çuval id'lerini SUNUCUDA çözer (`packingGroupId`); istemci seçiminden kurulan kapsam cursor'lu listede grubun yarısını işler. [bekçi: test_packing_group]
- Grup sayacı `nextPackingGroupSeqTx`in ilk ifadesi olan advisory 8031 ile, parti kodu 8034 ile, partisiz ambalaj no 8035 ile korunur; çuval bağlama atomik claim'dir (`updateMany WHERE {shipmentId: null, customerId}`). [bekçi: test_packing_group, test_advisory_lock_namespaces]
- Cari kapısı (`GET /sack-search/customers`) tek toplulaştırma sorgusudur ve sıralama sunucudadır; `scopeWhere` (Prisma) ↔ `scopeSql` (raw) ikizdir, birlikte değişir. [bekçi: test_sack_customer_gate]
- Çuval listesinde sıralamayı yalnız `Sack`ın skaler kolonlarında yap (`createdAt|sackNo|notes|weightKg`); ilişki ya da sonradan hesaplanan alan keyset cursor'la yarım sayfa üretir. [inceleme]

### Parti

- Partinin kimliği yalnız `Batch.id`dir; `batchNumber` ile lookup ya da sıralama yapma — numara benzersiz değildir ve sarar. [inceleme]
- `batches.batchNumber` üzerine `@unique` geri koyma; sarma ilk tekrarda 500 verir ve üretim durur. [bekçi: test_batch_number_format]
- `generateBatchNumberTx`in İLK ifadesi `pg_advisory_xact_lock(8022, 1)`dir; 8022 KK1'in 8021'inden ayrı kalır. [bekçi: test_batch_number_format, test_advisory_lock_namespaces]
- Kısa parti no (`batch.shortNumberEnabled`, varsayılan açık: P01…P99) global sarar, yalnız aynı iş emrinde dolu numarayı atlar (`BATCH_NUMBER_TAKEN_WHERE`); aralık o iş emrinde doluysa 409 `BATCH_NUMBER_WO_FULL`. [bekçi: test_batch_number_format, test_wo_batch_add]
- Sayaç saklanmaz, en son doğan kısa partiden türer; sayaç sorgusunun regex'i biçimden türetilir (`seriesPosixRegex`), elle yazılmaz. [bekçi: test_batch_number_format]
- Müşteriye doğrudan sevk edilmiş fason sevki parti cerrahisine girmez: K15 birleştirme atlar, K16 taşıma/bölme 409. [bekçi: test_fason_direct_ship_dispatch_lock]

### Yarı mamul

- Yarı mamulü arzdan DÜŞME, ayrı göster: `malzemeAcigi = max(0, uretilecek − (ham + yariMamul))`. [bekçi: test_semi_finished_surfaces]
- `rollScope=RAW_STOCK` ham + yarı mamulün birleşimidir ve daraltılmaz (tablet Hızlı İş Emri top seçicisinin tek kaynağı). [bekçi: test_semi_finished_entry]
- `rollScope` fail-closed'dır: tanınmayan kapsam 400 (yoksa CANCELLED/SHIPPED dahil tüm tablo döner). [inceleme]
- Stok Karnesi ↔ Envanter rozeti ↔ Kanban kolonu aynı stok sorusuna tek rakam basar; bir kova ayrılınca üçü aynı turda ayrılır. [bekçi: test_production_flow_columns]
- `Roll` yalnız kumaş kaleminden doğar: `createInitialEntry` kapısı "FABRIC ise geç" diye yazılır; iplik kg defterine gider. [bekçi: test_goods_receipt]
- Mal kabulde top sınıfı satır bazlıdır (`lineClass: RAW | SEMI_FINISHED | FINISHED`); eski `rawStock` boolean geriye dönük okunur. [bekçi: test_goods_receipt]
- `STOCK` bir statüdür; topun envanter sekmesini `entrySource` belirler, kullanıcı metnini statüden türetme. [inceleme]

## Tuzaklar

- Belge üreticisi sevkten SONRA da koşar (`reissue`, lazy-init); "sevkte donduruldu" tek koruma değildir — yeni sevk içeriği yüzeyi brütü `RollReturn`den kurmalı.
- İade `Roll.shipmentId`yi NULL'lar; canlı `shipmentId` kümesinden kurulan her toplam sessizce NET olur.
- Düz storno ile `releaseSacks` kapanışı tahsis için ters şey yapar (biri korur, biri siler); ikisi çelişki değil iki ayrı yoldur.
- `shipping.confirmationEnabled` kapalıyken sevkiyat doğrudan DISPATCHED doğar; "Sevkiyatı da kapat" kutusu yalnız açık rejimde çizilir.
- Panelde `ROLL_TABS`a sekme eklenip `buildRollForceFilters`a dal yazılmazsa tip hatası çıkmaz, kapsamsız liste doğar.
- Sekmeye bağlı aksiyonu "X değilse göster" diye yazma; aynı gövdeyi kullanan Kartela ve Top Arşivi sayfalarına buton sızar.
- `weighRequiredEnabled` / `manualWeightRestrictedEnabled` yazıldı ama açılmadı; açmak eski tablet sürümlerini 403'e düşürür.
- `GET /api/batches/number-state`in "sıradaki" değeri önizlemedir, rezervasyon değil.
- Yeni `rollScope`/sipariş karşılama alanı eklerken panel onu opsiyonel okur (`?? 0`) ve backend önce çıkar.

## Bekçiler

test_dispatch_report_gross · test_shipment_list_gross · test_shipment_detail_gross · test_quality_scorecard · test_shipment_undo_dispatch · test_shipment_event_ledger · test_shipment_invoice · test_allocation_repair · test_shipping_flags · test_auto_draft_shipment · test_sack_touch_gate · test_label_dirty_sources · test_sack_notes · test_sack_weigh_source · test_sack_label · test_label_context_fit · test_number_series · test_return_bulk_group · test_return_scope · test_return_document_no · test_sack_bulk_distribute · test_shipment_doc_customer_name · test_shipment_destination_chain · test_shipment_destination_lock · test_export_code_snapshot_gate · test_shipment_dispatch_document · test_emanet · test_packing_group · test_sevk_partisi · test_sack_customer_gate · test_advisory_lock_namespaces · test_batch_number_format · test_wo_batch_add · test_fason_direct_ship_dispatch_lock · test_semi_finished_surfaces · test_semi_finished_entry · test_production_flow_columns · test_goods_receipt

Gerekçe ve ölçüm hikâyesi: eski sürüm history dizininde.
