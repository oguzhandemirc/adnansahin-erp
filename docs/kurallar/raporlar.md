# Raporlar · Filtre · Liste

Raporlar (karneler, sevk/sipariş/stok/kalite/fire/fason/WIP raporları) ve liste ekranlarının süzme, sıralama, arama sözleşmesi. Backend: `Teks-Erp/src/services/reports/`, `src/routes/reports/`, `src/constants/report-catalog.ts`, `src/constants/time.ts`, `src/services/base.service.ts`, `src/utils/query-parser.ts`. Panel: `Electron/src/pages/Reports/`, `lib/report-catalog.ts`, `lib/report-gate.ts`, liste/seçici bileşenleri. Tablet: liste ve seçici ekranları.

## Kurallar

### Raporlar ve karneler

- Rapor kimliğini yalnız `REPORT_CATALOG` (`"<kategori>/<rapor>"`) taşır; Electron `lib/report-catalog.ts` gövdesi birebir aynadır; yeni rapor sırası katalog satırı → ayna → bekçi. [bekçi: test_rapor_katalogu]
- Raporun tarih sözleşmesini (`aralik-iso` · `aralik-gun` · `tek-gun` · `kesit` · `ileri-pencere` · `yok`) ve varsayılan gününü (`varsayilanGun`) katalogda beyan et; yaprakta ikinci kez yazma, günsüz sözleşmede `null` zorunludur. [bekçi: test_rapor_katalogu]
- Panelde rapor tarih girdisini yalnız `ReportDateFilter` çizsin; `pages/Reports/**` altında ham `type="date"` yazma. [bekçi: ham-tarih-girdisi.test.ts]
- Rapor görünürlüğü tek listedir: `SystemSetting` `reports.closedKeys` KAPALI raporları sayar; satır yoksa hepsi açık, yeni rapor açık doğar; rapor başına modül anahtarı açma. [bekçi: test_rapor_kapisi]
- Her rapor ucuna `requireReportOpen("<key>")` tak, sıra `verifyToken` → modül kapısı → rapor kapısı → izin; kapalı rapor 403 `REPORT_DISABLED`, liste okunamazsa 403 `REPORT_GATE_UNAVAILABLE` döner ve okuma önbelleksizdir. [bekçi: test_rapor_kapisi]
- `reportsClosedKeys`i yalnız süperadmin yazar (`PATCH /api/feature-flags`); tanınmayan anahtar yazmada 400 `REPORT_KEY_UNKNOWN`, okumada yok sayılır. [bekçi: test_rapor_kapisi]
- Panelde rapor kapısı kararını yalnız `isReportOpen(key)` versin; karo, route ve komut paleti aynı yüklemi okur, liste yüklenmemişse hiçbir rapor açık değildir. [bekçi: report-gate.test.ts]
- `routes/reports/**` altındaki her `router.get` sorgusunu `.strict()` Zod'dan geçir (parametresizde `emptyQuerySchema`); elle `req.query.x` okuma, sessiz varsayılan (`.catch`) yazma. [bekçi: test_rapor_strict]
- Rapor süzgecini sunucuda uygula; süzgeç beyanını cevabın KÖKÜNDE `suzgec` ile ver, yalnız verilen anahtarları ve `dusenSatir`ı taşı. [bekçi: test_rapor_satis_ekseni]
- Seçici kaynağını raporun kendi `meta.secenekler`inden ver ve süzgeçten bağımsız tut; ayrı izin isteyen liste ucunu seçici kaynağı yapma. [bekçi: test_rapor_satis_ekseni]
- Eksen süzgeçleri (`customerId` · `itemId` · `colorId` · `subcontractorId` · `destination` · `reasonCode`) tek sözleşmeden (`services/reports/_filters.ts`) geçer; Prisma ve SQL ikizleri birlikte değişir; tanınmayan kimlik 404 değil boş sonuç verir. [bekçi: test_rapor_satis_ekseni]
- Panelde eksen seçiminde "Tümü" seçimin yokluğudur: boş eksen istekten tamamen düşer; ayrıştırma tek yerde (`_hooks/reportAxisFilters.ts`), etiket ve şerh sözlükten (`AXIS_LABELS`/`AXIS_CAVEATS`). [bekçi: reportAxisFilters.test.ts]
- `Roll.finalizedAt` ve `statusChangedAt` damgalarını elle yazma; DB trigger'ı (`roll_stamp_production_timestamps`) yazar. [db]
- `finalizedAt`i write-once sanma: top yeniden finalize olursa tazelenir ve daima mevcut kalite sınıfıyla aynı olaydan gelir. [bekçi: test_quality_scorecard]
- Trigger'ın kaynak statü listesine `SHIPPED`/`CANCELLED` ekleme; storno/iade aylar önceki topu bugünün karnesine sokar. [bekçi: test_quality_scorecard]
- Fabrika gününü yalnız `src/constants/time.ts` yardımcılarıyla kes (`factoryDaySql` vb.); çıplak `DATE_TRUNC('day'…)` ya da `CURRENT_DATE` yazma. [bekçi: test_report_day_boundary]
- Takvim günü (günlük seri) saat dilimine bağlıdır, açık yaz; mutlak pencere (son 72 saat, yaşlandırma, gecikme günü) dilimden bağımsızdır, `-- tz-ok:` ile işaretle. [bekçi: test_report_day_boundary]
- Tarih aralığı sınırını istemci verir (seçilen günün yerel 00:00 / 23:59:59.999); backend ek gün yuvarlaması yapmaz. [inceleme]
- "Dönemde sevk edilen metraj"ı yalnız `reports/_shipped.ts`ten oku (brüt: canlı sevk + `RollReturn` geri-eklemesi + doğrudan sevk); ikinci tanım yazma. [inceleme]
- `_shipped.ts`teki `status='DISPATCHED'` süzgecini silme. [bekçi: test_shipped_status_filter]
- Yurtiçi/yurtdışı eksenini `reports/_destination.ts`ten oku: sevk raporu sevkiyatın donmuş yönünü (`Shipment.destination`), sipariş raporu siparişin açılışta donmuş yönünü (`Order.destination`) kullanır; canlı cari kartını okuma. [bekçi: test_rapor_yon_ekseni]
- Kalite karnesini METRE ile say; kapsam `K18_DEAD_STATUSES`i dışlar ama `SCRAP`i dışlamaz. [bekçi: test_quality_scorecard]
- Fason atfını üç kovayla kur (fabrika içi · firma bilinen · firma belirsiz); yalnız `parentReceiptId` JOIN'ine bakma, `entrySource='SUBCONTRACTOR_RETURN'` yük taşır. [bekçi: test_quality_scorecard]
- Parti izlemede iade edilmiş topu müşteri listesinden düşürme (`RollReturn.fromShipmentId` ile geri ekle); parti numarası benzersiz değildir, arama aday listesi döner, izleme `batchId` ile yapılır. [bekçi: test_batch_trace]
- İade karnesinin paydası BRÜT sevktir. [bekçi: test_return_scorecard]
- Fason karnesinde fireyi yalnız kapanmış kalemlerden hesapla; dönen metraj tüm kabul satırlarının toplamıdır. [bekçi: test_subcontract_scorecard]
- OTIF'te terminsiz siparişi paydadan çıkar ama sayısını ayrıca bas. [bekçi: test_shipment_scorecard]
- WIP'te bekleyen anlık snapshot'tır (tarih süzgeci etkilemez), geçen dönemseldir; ortalama bekleme top ağırlıklıdır. [bekçi: test_wip_scorecard]
- Stok yaş çıpası `Roll.statusChangedAt`tir; çıpasız topu yaş kovasına dağıtma, metrajı toplama girsin ve sayısı ayrıca basılsın. [bekçi: test_stock_scorecard]
- Fire karnesinde hurda (metre, `finalizedAt`) ile hata tespiti (adet, `RollError.detectedAt`) ayrı basılır; hata bağı `LEFT JOIN LATERAL … LIMIT 1` olur. [bekçi: test_scrap_scorecard]
- Üretilen metraj kovasını (`loadProducedBuckets`) kalite kataloğundan çözerken `isActive` süzgeci uygulama. [bekçi: test_produced_buckets]
- Sipariş karşılanma raporunda `order.service.getCoverageForLines` kullanma (havuzu her satıra tam yazar, çift sayar). [inceleme]
- Dönem karşılaştırmasını yalnız `_shared.resolveCompareRange` kursun (prev = aynı uzunlukta önceki pencere, prevYear = takvim yılı kaydırması). [inceleme]
- Panelde yaprak rapor önce cevabı gösterir: katalogdaki soru cümlesi `ReportPageLayout`tan, özet şeridi (`MetricCard`) tablodan önce. [bekçi: reportSummaryCoverage.test.ts]
- Her yaprak rapora `ReportExportBar` (Excel · PDF · Yazdır) koy; üç çıktı tek `ReportExportSpec`ten türer ve rapor PDF'i `document-render/`e girmez. [bekçi: reportExportCoverage.test.ts]
- Excel'de görünen sayı biçimini `lib/number-format`ten türet; rapor spec'i yalnız `REPORT_NUM_FMTS` biçimlerini kullanır. [bekçi: reportNumFmt.guard.test.ts]

### Filtre, liste, arama

- Süzgeci elle okuyan her servis id filtresini `readIdCondition`/`readFilterList`ten geçirir; CSV de bir string'dir ve ham geçirmek ya 400, ya sessiz 0 satır, ya sessizce düşen filtre üretir. [bekçi: test_filter_multi_select]
- Tanınan bir süzgeç adı `filter[...]` sarmalı olmadan gelirse 400 `BARE_FILTER_PARAM` döndür; tek kapı `assertNoBareFilterParams`, süzgeci elle okuyan uç okuduğu adları kapıya da verir. [bekçi: test_bare_filter_param]
- Cursor'lu listede süzmeyi sunucuda yap; istemci süzmesi yalnız eldeki sayfayı süzer ve yanlış "kayıt yok" gösterir. [bekçi: test_tambur_recent_output_filter]
- Liste, cursor ve özet şeridini tek where'den kur (`BaseService.buildListWhere`); stats ucu ayrı where kurmaz. [bekçi: test_order_stats]
- İlişki süzgecini (`filter[allowedColorId]` vb.) servis `extraWhere` override'ında `readIdCondition` ile oku; izinli listesi boş olan ürün her rengi alır (`none OR some`). [bekçi: test_item_allowed_filter]
- Seçici seçeneğindeki sayı faceted'dır: listenin where kurucusundan kendi anahtarı hariç taban kurulur; seçenek sayısı = seçilince liste toplamı. [bekçi: test_wo_place_filter]
- "Hangi kalem hâlâ talep" süzgecini yalnız `helpers/order-line-scope.helper.ts`ten al (`ACTIVE_LINE` ↔ `isActiveLine`); elle `cancelledAt: null` kopyası yazma; geçmiş/defter sorusu süzmez. [bekçi: test_order_line_scope_single_source]
- Statü çoklu daraltmasını kapsam anahtarı `status`a dokunmadan ayrı anahtarla yap (top listesinde `statusIn[]`). [inceleme]
- Topun bir statüye geliş anı `createdAt` değildir: giriş sekmeleri (Ham Stok, Yarı Mamul) `createdAt`, diğerleri `updatedAt desc` sıralanır (`rollTabDefaultSortBy`); yeni bir "topu şu statüye çek" yolu bu sıralamayı da karşılar. [bekçi: service.test.ts]
- `updatedAt`i hareket sayma: kolon adı "Son İşlem"dir; FIFO/yaşlandırma için `statusChangedAt` kullanılır. [inceleme]
- Sevkiyat listesi union'ında `Shipment.dispatchedAt` ≙ `DirectShipment.shippedAt`; sıralama, aralık ve cursor where'i doğrudan sevk dalında `shippedAt`e çevrilir; toplamlar brüttür. [bekçi: test_shipment_list_gross]
- Kesimle doğan çocuk top `createdMachineId` damgasını alır; yoksa "Bu makine" süzgeci kesimleri görmez. [bekçi: test_tambur_cut_idempotency]
- Panelde "tümünü göster" seçicileri `loadAllForPicker` kullanır; inline `pageSize: N` yazma, 500 aşılırsa açık hata ve arama tabanlı seçiciye geç. [inceleme]
- Seçici modalı kalıbı: kutuya tıkla → doğrudan modal, süzme sunucuda, tek `useInfiniteQuery` (`listCursor`); yerleşik `<select>`, DataTable ve iki sorgu yazma. [bekçi: ItemPickerModal.test.tsx]
- Sayfa içi arama (Ctrl+F) yoktur; kayıt araması listenin sunucu aramasıdır. [inceleme]
- Electron servis yollarını tam yaz (`/api/...`); `apiClient.baseURL` `/api` içermez. [inceleme]
- Filtre/lookup sözleşmesi değişince backend önce, panel ve tablet sonra dağıtılır. [inceleme]

## Tuzaklar

- `_shipped.ts`teki `status='DISPATCHED'` süzgecinin kaybını normal veri göstermez (storno `dispatchedAt`i null'lar); yalnız anomali kurulan bekçi yakalar, "gereksiz" diye silme.
- Kesim kaybını naif `Σ(initial−current)` ile hesaplama: tüketilen ebeveynin `currentQty`si sıfırlandığı için hayali kayıp çıkar; metrik bilerek yoktur.
- Fire karnesinde düz JOIN iki hatalı topu iki kez sayar (100 m → 200 m hurda).
- Fason karnesinde açık kalemi paydaya almak dün sevk edilen partiyi %100 fire gösterir; fasondan müşteriye giden metre fire değildir.
- Tekil id çözen panel yardımcıları CSV'de `undefined` döner ve rozet sessizce yanlış etikete düşer; çok seçimde "N firma" yaz.
- "İstasyon" süzgeci (`currentStationId`) yalnız üretim sekmelerinde anlamlıdır; depoda top istasyonda durmaz, liste daima boş görünür.
- Tablette `NumpadHost` `autoActivate`ı tek alana ver; ikisine verilirse kazananı mount sırası belirler ve metraj yerine En değişir.
- Mobilde fason firma listesi `pageSize:500` ile çekiliyor ve 500'ü aşarsa sessizce kesilir; Electron'daki açık hata karşılığı yok.

## Bekçiler

Backend: `test_rapor_katalogu` · `test_rapor_kapisi` · `test_rapor_strict` · `test_rapor_satis_ekseni` · `test_rapor_yon_ekseni` · `test_report_day_boundary` · `test_shipped_status_filter` · `test_quality_scorecard` · `test_batch_trace` · `test_return_scorecard` · `test_subcontract_scorecard` · `test_shipment_scorecard` · `test_wip_scorecard` · `test_stock_scorecard` · `test_stok_kalem_raporu` · `test_scrap_scorecard` · `test_produced_buckets` · `test_shipment_list_gross` · `test_filter_multi_select` · `test_bare_filter_param` · `test_tambur_recent_output_filter` · `test_order_stats` · `test_item_allowed_filter` · `test_wo_place_filter` · `test_order_line_scope_single_source` · `test_tambur_cut_idempotency`

Panel: `report-gate.test.ts` · `ham-tarih-girdisi.test.ts` · `reportAxisFilters.test.ts` · `reportSummaryCoverage.test.ts` · `reportExportCoverage.test.ts` · `reportNumFmt.guard.test.ts` · `service.test.ts` (Rolls) · `ItemPickerModal.test.tsx`

Gerekçe ve ölçüm hikâyesi: eski sürüm history dizininde.
