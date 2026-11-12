# Belge · Etiket · Şablon

Müşteriye ve sahaya giden her kâğıt: sevk irsaliyesi ve muhasebe fişi, iade/fason belgeleri, çeki listeleri, top/çuval etiketleri, belge tasarımı ve yazdırma birleştirme. Kod: `Teks-Erp/src/services/document-render/`, `printed-document*.ts`, etiket servisleri ve raster emitter'ları; panel `Electron/src/components/print/`, `Electron/src/lib/print-merge.ts`, `Electron/src/pages/Operations/Shipments/`; mobil `mobil/src/components/labels/`. Refakat kartı kuralları `tambur.md`'dedir.

## Kurallar

### Donmuş belge ve sevk rakamı
- Donmuş belge HTML değil JSON tutar (`PrintedDocument.snapshot`); HTML her baskıda renderer'dan yeniden üretilir — bu yüzden renderer'a görünür bir şey ekleyen her iş OPT-IN doğar, yoksa geçmiş belgelerin yeniden baskısı sormadan değişir. [bekçi: test_shipment_dispatch_document]
- Sevk rakamı brüttür: fiş donmuş snapshot'tan okur, snapshot'ı üreten `collectShipmentDocContent` de iptal edilmemiş `RollReturn`'leri çuvala geri ekler (sevkten sonra da çağrılır). [bekçi: test_dispatch_report_gross]
- Brüt üreticide çuval satırı, ürün özeti ve çeki satırları tek brüt kaynaktan kurulur; `totalKg` iadeyle değişmez. [bekçi: test_shipment_detail_gross]
- İade sevk belgesini değiştirmez, ayrı belgeyle (RETURN_DISPATCH) kapanır; belgedeki "Güncel" rozeti son sürüm demektir, içerik güncel değil. [bekçi: test_dispatch_report_gross]
- Dondurma sürümü `freezeForSource`'ta max+1 hesaplanır; sabit 1 yazmak storno sonrası yeniden sevkte unique'e çarpar. [bekçi: test_shipment_undo_dispatch]
- Toplu iade N satır + tek irsaliyedir; belge yanıttaki `documentSourceId` (`returnGroupId ?? id`) ile çözülür, üye satır id'siyle çözülmez. [bekçi: test_return_bulk_group]
- Snapshot JSON'ları (`PrintedDocument.snapshot`, `Manifest.snapshot`) liste sorgusunda çekilmez, yalnız detay/baskı select'inde. [inceleme]

### Müşterideki ad
- Sevk belgesinde müşterideki ad DONAR (snapshot), ad rejimi (`shipping.docItemNameMode`) DONMAZ — her baskıda canlı okunur. [bekçi: test_shipment_doc_customer_name]
- "Hangi ad basılır" kararı tek helper'dadır (`document-render/shipment-name-mode.ts`: `resolveDocNameMode`, fail-open `customerNameOr`); irsaliye HTML'i de muhasebe fişi de oradan sorar. [bekçi: test_shipment_doc_customer_name, accounting-export.name-mode.test.ts]
- Müşteri ad/renk zinciri etiketle aynıdır ve renk adı tablolarını yalnız `customer-name.helper` `loadCustomerColorIndex` okur; ikinci çözücü açma. [bekçi: test_musteri_adi_tek_cozucu]
- `musterideki` rejimi fail-open'dır: karşılık yoksa bizim adımız basılır, boş ad basılmaz. [bekçi: test_shipment_doc_customer_name]

### Belge tasarımı, kolon, sayı
- İç veri taşıyan kolon ve bölüm OPT-IN doğar (`defaultHidden` + `columns.<tablo>.shown` / bölüm allowlist'i); `hidden`/`sections` blocklist'tir ve yeni kolonu müşteriye sızdırır. Allowlist hem renderer'da hem panelde işaretlenir. [bekçi: test_sack_note_document]
- Müşteri belgesindeki iç veri kolonu tek kapıdan (belge tasarımı) yönetilir; ikinci bir global anahtara bağlama. [bekçi: test_belge_ekran_ayni]
- Kolon kataloğu renderer ile panelde ayna tutulur; birine eklenen kolon diğerine de eklenir. [bekçi: test_document_customization]
- Kolon başlığında boş dize "varsayılana dön"dür; başlıksız basmak ayrı listededir (`columns.<tablo>.blankLabels`). [bekçi: test_document_customization]
- Aynı belgenin PDF'i ve Excel'i aynı `DocColSpec` modelinden türer (`doc-model.ts`; Excel `GET /api/printed-documents/:type/:id/tables`); panelde Excel için elle kolon listesi yazılmaz. [bekçi: test_sevk_belge_excel_esit, test_sevk_belge_altin, doc-tables-export.test.ts, dumpEsitlik.test.ts]
- Muhasebe fişi Excel'i ayrık kipte (`shipping.docProductColorSplit`) irsaliyeyle hücre hücre aynıdır. [bekçi: accounting-export.name-mode.test.ts]
- Belgede görünen sayı yalnız `docNum`'dan geçer (ticari yuvarlama, PDF = Excel); yuvarlama rejimi donmuş zarfta damgalıdır, CSS ölçüsü `cssFixed`'ten geçer, çıplak `toFixed` yazma. [bekçi: test_belge_ticari_yuvarlama, test_belge_yuvarlama_damgasi]
- Belgedeki tarih/saat yalnız `document-render/fmt-date.ts` (`factoryDateTr`/`factoryDateTimeTr`) ile basılır; renderer kendi tarih biçimleyicisini yazmaz. [bekçi: test_doc_fmt_date]
- Belge başlığı yalnız `doc-style.ts` `docTitle` ile büyütülür; çıplak `toUpperCase()` / `toLocaleUpperCase("tr")` yazma. [bekçi: test_belge_baslik_harf]
- A4→A5 ölçeklemesi iki orandır (genişlik ~0.68, yazı ~0.85), tek `scale()` değil; ölçüler `doc-density.ts` / `fason-ceki.density.ts`'tedir. [bekçi: test_doc_density_fields]
- Belgeye özel CSS ortak katmandan SONRA basılır. [bekçi: test_doc_density_fields]
- Tek seferlik baskı parametreleri (`?pageSize=`, `?rowNotes=1`, `?rowTags=1`, `?sections=`) ayarı yalnız o baskı için ezer, hiçbir yere yazılmaz, sürüm doğurmaz; geçersiz değer sessizce yok sayılır. [bekçi: test_doc_pagesize_override, test_sack_note_document]
- Fason çekisinde parti top başınadır; eski donmuş belge geriye dönük doldurulmaz. `gridRows` aralığa kırpılır, baskı yolu düşmez. [bekçi: test_fason_ceki_html]
- Çeki Listesi kâğıdı ilk basımda `Manifest` doğurur; aynı içerik aynı CL numarası, farklı içerik yeni numara alır; numara render'da üretilmez. [bekçi: test_ceki_listesi_no]

### İzin
- Belge tasarımı ayrı yetkidir (`document-template:read/write`); izin kümeleri tek kaynak `constants/document-design.ts`, Electron `lib/permissions.ts` aynalar; kart ↔ route izin listesi birebir. [bekçi: test_document_template_permission]
- `PATCH /api/feature-flags` guard'ı anahtar kapsamlıdır: gövde yalnız `documentsConfig`/`travelerCardConfig` taşıyorsa dar izin yeter, aksi hâlde `admin:settings`; düz OR'a çevirme, firma kimliği anahtarlarını kümeye ekleme. [bekçi: test_document_template_permission, test_settings_password]
- `admin:settings` belge tasarımı kümelerinden düşürülmez; boot uzlaştırması yeni izni getirir ama kimseye atamaz. [bekçi: test_document_template_permission]
- Belge tasarımının önizleme ucu ekranı açan izinle (`DOCUMENT_DESIGN_READ`) aynı kümeyi taşır. [bekçi: test_document_template_permission]

### Etiket
- SACK etiketinde barkod + QR = `Sack.sackNo`; Sack'e ayrı barkod kolonu eklenmez, çuval etiketinde ürün/renk/kat alanı olmaz. [bekçi: test_label_context_fit]
- SACK baskısı fail-closed: şablon çözülemez ya da bağlama uymazsa 400, top etiketine sapmaz; uyum `LabelTemplate.kind`'a değil şablonun bağladığı alanlara bakar (`analyzeContextFit`). [bekçi: test_label_context_fit]
- Koşullu etiket elemanı (`showIf`) `QualityGrade.code` ile karşılaştırır, kalitesiz topta basılmaz; tek uygulama noktası `prepareElements`. [bekçi: test_label_element_condition]
- Etikete katalog kodu basılır, görünen ad değil; değeri olmayan alan atlanır. [bekçi: test_fold_edit_and_label]
- Çuval notu `labelDirty`'yi yalnız etkin çuval şablonu notu basıyorsa işaretler (`sackNoteAppearsOnLabel`). [bekçi: test_label_dirty_sources]
- `Sack.notes` bir açıklamadır: sevk edilmiş çuvala da yazılır, içerik guard'ı uygulanmaz; guard'ı "eksik" sanıp ekleme. [bekçi: test_sack_notes]
- Çuval kg'si müşteri belgesine basıldığı için simüle değer `source:'SIMULATED'` beyanıyla gelir ve `shipping.simulatedWeightEnabled` kapalıyken 400 alır. [bekçi: test_sack_weigh_source, useSackWeigh.test.tsx]
- Mobil baskı audit'ine giden `rollId` mutation değişkeninden geçer, kapanıştan okunmaz. [bekçi: LabelPreviewSheet.test.tsx]
- Mobil etiket yazıcısı oturumdan çözülür (`getForSession('LABEL_PRINTER')`, oturum yoksa boş); taşıma BT-Classic/SPP'dir. [inceleme]

### Panel baskı yüzeyi
- Sevk irsaliyesinin tek yüzeyi `ShipmentDocDialog`'dur; belgeye özgü araç çubuğu kalemi jenerik `PrintedDocDialog`'a gömülmez, slot ile gelir. [bekçi: ShipmentDocDialog.test.tsx]
- Belge satırı tıklanınca önce önizleme açılır, doğrudan yazıcıya gitmez. [inceleme]
- Toplu baskı birleştirmesinde her belge kendi gölge köküne (`<template shadowrootmode="open">`) girer; ilk `<head>` + gövdeler deseni belgede yasaktır, kap iframe olmaz, tek belge HTML'i aynen döner. [bekçi: print-merge.test.ts]
- Birleştirmede `@page` adlandırılmış sayfaya taşınır (`@page wdocN`), CSS yorumları taramadan önce silinir, `position:fixed` → `absolute`. [bekçi: print-merge.test.ts]
- Toplu belgede atlanan her belge (yok, alınamadı, birleştirilemedi) kullanıcıya ayrı ayrı raporlanır. [inceleme]
- Baskı ve önizleme iframe'leri `sandbox="allow-same-origin allow-modals"` taşır; `allow-scripts` ekleme. [inceleme]
- Salt okuma iznindeki tasarım ekranında yazma aksiyonları hiç çizilmez. [inceleme]

## Tuzaklar
- Sayfa A5 seçili, yazıcıda A4 kâğıt varsa çıktı küçük basılır (Chromium `@page`'i büyütmez); çare tek seferlik `?pageSize=` seçicisidir.
- Tek seferlik kâğıt boyu seçicisinde belgenin kendi boyutu yalnız ezme yokken `@page`'ten okunur (`readDocPageSize`); ezmeli HTML'i kaynak saymak düğmeyi kilitler.
- `label-template:read/write` çiftinde READ, WRITE'ı kapsamaz; yalnız yazma izni verilen kullanıcı Etiketler ekranını açamaz. Yeni izin çiftinde bu hatayı tekrarlama.
- İstemci gövdesini elle kuran `mutationFn` yeni alanı sessizce düşürür (kesimde kat ve baskı audit kimliği böyle kayboldu); alanı iki uçta da ekle.
- Yorumdaki `@page` metni birleştirme tarayıcısını kandırır ve kartı iki sayfa basar; yorum silme sırası değiştirilmez.
- `docItemNameMode` kapsamı yalnız sevk irsaliyesi ailesidir; fasondan doğrudan sevk irsaliyesi ve dönem dökümü bilinçli dışarıdadır.
- Fason çekisinde `accountNo` bölümü opt-in'dir; açılmadıkça eski donmuş çekiler de basmaz (bilinçli).
- Çek teslim bordrosu anlık çıktıdır, donmuş belge üretmez ve çekin durumunu değiştirmez.

## Bekçiler
test_shipment_dispatch_document, test_dispatch_report_gross, test_shipment_detail_gross, test_shipment_undo_dispatch, test_return_bulk_group, test_shipment_doc_customer_name, test_musteri_adi_tek_cozucu, test_sack_note_document, test_belge_ekran_ayni, test_document_customization, test_sevk_belge_excel_esit, test_sevk_belge_altin, test_belge_ticari_yuvarlama, test_belge_yuvarlama_damgasi, test_doc_fmt_date, test_belge_baslik_harf, test_doc_density_fields, test_doc_pagesize_override, test_fason_ceki_html, test_ceki_listesi_no, test_document_template_permission, test_settings_password, test_label_context_fit, test_label_element_condition, test_fold_edit_and_label, test_label_dirty_sources, test_sack_notes, test_sack_weigh_source · İstemci: accounting-export.name-mode.test.ts, doc-tables-export.test.ts, dumpEsitlik.test.ts, ShipmentDocDialog.test.tsx, print-merge.test.ts, PrintPageSizeToggle.test.tsx, docRows.test.ts, LabelPreviewSheet.test.tsx, useSackWeigh.test.tsx

Gerekçe ve ölçüm hikâyesi: eski sürüm history dizininde.
