# Backend `2.13.2`

**Paket:** `tekserp-backend-20261120_045408-202cdc65.zip`
**SHA256:** `27BE4DC9531C153F3CE79946A3A2F4E4F83BA50852AA550E5D251000FE2179FF`
**Commit:** `202cdc65` (ilk paket `tekserp-backend-20261120_041454-215c7010.zip` · `C438FA09…361D` · `215c7010` — yalnız web paneli farklı; KURULMAZ, yerine bu)
**İçerik:** 2.13.1 paketinin bütün içeriği + patron telefonuna giden çuval verisinde sevk partisi (ad · kod · durum), ambalaj no ve topların üretim parti no'su (kullanıcı isteği 2026-11-20). Paketteki WEB PANELİ (`dist-web`) değişti: yeni iş emri formunda "Siparişlere Paylaştırma" bölümü (`143817e5`) ve paylaştırma satırlarında açık-metre aşımı uyarısı + biçim cümlesi (`202cdc65`). Masaüstü panel 1.3.22 ayrıca, kendi sürüm notuyla yayınlanır.
**Önceki saha sürümü:** **2.13.1** (kuran, kurulumdan önce `/health` ve `app\PAKET.json` ile 2.13.1 ve 371 migration olduğunu ÖLÇER — farklıysa DUR).

Paketleme **`-Surum 2.13.2`** ile koşulur.

## 1. Özet

Migration'sız küçük sürüm. Kullanıcı (2026-11-20): "çuvala özel ad mı, parti no mu veriyorlardı … onu da telefonda
görmemiz lazım; çuval ve çuvalın içeriği filtrelenebilir ve aranabilir olsun". Canlıda ölçülen (salt okuma):
`packing.groupMode = sevk-partisi`; 1879 çuvalın 1483'ü bir sevk partisinde (`PackingGroup`: operatörün verdiği ad ya da
sistemin `P-n`i, kalıcı kod `PRT-YYMM-NNNN`, OPEN/CLOSED) ve ambalaj no (`Sack.packageNo`) taşıyor; topların üretim
partisi ayrı (`Batch.batchNumber`, P54…P59). Bu sürüm üç alanı patron verisine EKLER (mevcut alanlar aynen):

- **`cuval-deposu` anlığı** (Çuvallar ekranı): çuval satırına `partiAdi` · `partiKodu` · `partiDurumu` (OPEN/CLOSED) ·
  `ambalajNo` · `depo` (depo adı); çuvaldaki top satırına `parti` (üretim parti no).
- **`sevkiyat-icerigi` KAYDI** (sevkiyat ayrıntısının çuvalları): çuval satırına `ambalajNo` + aynı üç parti alanı; top
  satırlarına (çuvaldaki ve çuvalsız) `parti`.
- **`cuval` KAYDI:** mevcut `partiId`/`ambalajNo` yanına `partiAdi` · `partiKodu` · `partiDurumu`.

Partisiz çuvalda parti alanları `null`. Üretim parti no YALNIZ gösterilir (benzersiz değildir; kimlik/sıra olarak
kullanılmaz). Sevk partisinin tek okuyucusu `cloud-sync/packing-lot-facts.ts`.

## 2. Ne değişti

- `src/cloud-sync/packing-lot-facts.ts` (yeni): `loadPackingLots` + `partiOf` — üç yüzeyin ortak okuyucusu.
- `src/cloud-sync/catalog-facts.ts`: `cuval` katalog 1 → 2 (üç türev + `packing_groups` kaynağı: parti yeniden
  adlandırılınca/kapanınca/açılınca partinin çuvalları yeniden gider); `sevkiyat-icerigi` 1 → 2 (`packing_groups`
  kaynağı: çuvalları o sevkiyatta olan içerikler yeniden gider).
- `src/cloud-sync/derived.ts` (`cuval` türeticisi), `shipment-content.ts` (çuval/top ek kolon okuması),
  `snapshot-cuval-deposu.ts` + `snapshot-schemas.ts` (katı tel şeması), `projections.ts` (dışlama gerekçesi).
- `package.json` sürüm 2.13.2. Bekçiler: `test_patron_bulut_sevkiyat_icerigi` §7, `test_patron_bulut_anliklar` §3c.

## 3. Sözleşme

- **Kırıldı mı:** HAYIR — yalnız alan EKLENDİ; uç, projeksiyon adı, izin, enum değişmedi.
- **Eski istemci ne yapar:** patron uygulamasının eski sürümü yeni alanları görmezden gelir; panel/tablet etkilenmez.
  Yeni uygulama alan yoksa (fabrika 2.13.1) parti sütununu boş veri yüzünden gizler, süzgeci çizmez.
- **`minVersion` dokunuldu mu:** HAYIR.

## 4. Migration

- **Var mı:** HAYIR (toplam **371**, 2.13.1 ile aynı). Kuran "371 migrations found" + "No pending migrations to apply"
  görmelidir; farklı sayı = yanlış paket ya da yanlış DB → DUR.
- **Ne zaman:** —
- **Veri yazan adımlar:** yok. Eşitleme tetikleyicileri değişmedi (`packing_groups` filigranı `updatedAt` ile okunur).
- **Geri alınabilir mi:** EVET — şema değişmediği için `-GeriAl` 2.13.1 koduna tam döner.

## 5. Kurulum notu

- **Beklenen kesinti:** ≈ 70 sn (migration yok).
- **KURULUM SIRASI:** bulut imajı GEREKMEZ, sıra serbest (yalnız fabrika). Ölçüldü 2026-11-20: yeni projeksiyon adı yok
  (bulut kataloğu `katalog-ozeti.json` yalnız ad/izin/saklama alanı taşır, alan listesi taşımaz), satırlar ve anlıklar
  bulutta şemasız jsonb; katalog sürümü artışını bulut zaten tanır (`KATALOG_SURUMU` → TAM ister, `sync-apply.ts`).
  `cuval` ve `sevkiyat` listelerinin bulut arama/süzgeç beyanı (`LIST_SEARCH`) bu alanlara dayanmaz; değişmedi.
- **Kurulum yöntemi:** 2.13.1 ile aynı (paketin kendi `kur.ps1` + `uzaktan-kos.ps1`i).
- **Bu sürüme özel:** yeni ayar anahtarı yok; `.env`e DOKUNMAZ.
- **İlk eşitleme turu:** katalog sürümü artan HER projeksiyon kurulumdan sonraki ilk turda bir kez TAM gönderilir:
  `cuval` 2, `sevkiyat-icerigi` 2, `is-emri` 5, `siparis-kalemi` 2 (Ek A7), `sevkiyat` 2 (Ek A5), `siparis` 5 (Ek A6). `sevkiyat-icerigi` ağır satırdır (birim 100 kök); TAM gönderim saklama penceresindeki
  sevkiyat sayısı kadar sürer — provada süre ölçülür.
- **Sınırlar (her sürümde geçerli):** `migrate reset`/reseed/DB drop YOK · uygulanmış migration'a dokunma ·
  postgres/node süreçlerini `Stop-Process` ile durdurma · `C:\TeksERP\pgsql\bin` JUNCTION'dır, recursive SİLİNMEZ ·
  `-GeriAl` ile `-Zorla` birlikte KULLANMA (elle, etkileşimli koşum) · başarısız kurulumu TEKRAR DENEME · hata → DUR, insana rapor et.

## 6. Geri alma

`kur.ps1 -GeriAl` 2.13.1'i geri koyar; uzaktan (görev üzerinden) koşumda onay sorusu asılı kaldığı için çalışan biçim
`-GeriAl -Zorla`dır (2.13.1 provasında ölçüldü). Geri dönüşte telefona parti alanları gelmez (uygulama sütunu gizler);
bulut eski satırları bir sonraki değişikliğe kadar yeni alanlarla saklar — zararsız.

## 7. Doğrulama — kurulumdan sonra rapor edilecekler

- yeni sürüm + `pm2 ls`; `/health` → `UP/UP 2.13.2`; 371 migration, bekleyen yok
- eşitleme turu log'unda `cuval` ve `sevkiyat-icerigi` TAM gönderiminin bittiği, hata satırı yok
- uygulamada Çuvallar ekranında Parti sütunu (ör. `DNZ-084`) ve Parti süzgeci; sevkiyat ayrıntısında çuvalın partisi
- `backend-err-*.log` (en yenisi) — yeni hata yok
- ölçülen kesinti

## 8. Ekler (aynı sürüm, migration yok, yalnız alan EKLEME)

### Ek A7 — iş emrinden siparişe paylaştırma (`is-emri` 4 → 5, `siparis-kalemi` 1 → 2)

Kullanıcı (2026-11-20): "telefonda siparişin tamamını görüyoruz, paylaştırılmış hâlini değil".

- **Alan:** `is-emri.siparisPaylari: [{ siparisId, siparisNo, siparisKalemiId, musteriAdi, urunAdi, renkAdi,
  siparisMetre, paylastirilanMetre (number|null), gosterilenMetre }]` — kalem başına bir öğe.
  `siparis-kalemi.isEmriPaylari: [{ isEmriId, isEmriNo, paylastirilanMetre (number|null), gosterilenMetre }]`.
  Mevcut `siparisMetre` (İE toplamı) DEĞİŞMEZ.
- **Kaynak:** açık bağlar (`ACTIVE_ORDER_LINK`), küme ve sıra `WO_ORDER_LINKS_SELECT` ile aynı (`WO_ORDER_SHARES_SELECT`,
  `cloud-sync/work-order-facts.ts`) → `siparisIdleri` ile aynı sıra. `siparisMetre` = kalemin `quantity`si;
  `paylastirilanMetre` = `plannedQtyOf(allocatedQty)` (0 → null) — Tambur bağlamı `plannedQty` de artık bunu çağırır
  (`tambur.service`, davranış aynı); `gosterilenMetre` = `orderLineDisplayQty` (tablet Tambur kuralının sunucu ikizi,
  `order-link-allocation.helper`; bekçi mobil dosyasıyla aynı matriste eşitliği ölçer). Birim dönüşümü yok (MT dışı
  kalemde paylaştırma zaten 0 → gösterilen = kalem miktarı).
- **Değişiklik izleme:** paylaştırma yazımı `updateMany` ile bağ satırının `updatedAt`ini ilerletir (ölçüldü) →
  `is-emri` `via(work_order_to_order_lines.workOrderId)` (zaten vardı) ve `siparis-kalemi`ne eklenen
  `via(work_order_to_order_lines.orderLineId)`. Kalem ürün/renk adı değişince İE de yeniden gider (`WOS_OF_ITEMS/COLORS`
  açık bağlı kalem yolu eklendi). İE numarası değişmediği için `isEmriPaylari` `work_orders` kaynağına bağlanmadı.
- **Uyum:** bulut satırları şemasız jsonb saklar; yeni alanlar bulut imajı gerektirmez. Eski uygulama alanı görmezden
  gelir; yeni uygulama alan yoksa (fabrika 2.13.1) sipariş metresine düşmelidir.
- **Yük:** öğe başına ≈ 290 B (`siparisPaylari`), ≈ 120 B (`isEmriPaylari`); İE başına tipik 1–3 bağ → satır başına
  ≲ 1 KB artış. Ek sorgu: `is-emri` türeticisinde yok (aynı bağ sorgusunun seçimi genişledi), `siparis-kalemi`
  türeticisinde paket başına 1 `findMany`. TAM gönderim süresi provada ölçülür.
- **Provada bakılacak:** paylaştırması olan bir İE'de telefon satırında `gosterilenMetre` = panel "Düzenle"deki metre;
  panelden paylaştırmayı değiştirip bir sonraki turda İE ve kalem satırının yeniden geldiği.

### Ek A5 — sevkiyat listesi süzgeç dizileri (`sevkiyat` 1 → 2)

Sevkiyat LİSTESİ kumaş/renk/en/parti/sipariş/depo ile süzülüp aransın diye satıra içerikten tekil diziler EKLENDİ.

- **Alan:** `urunIdleri` + `urunAdlari`, `renkIdleri` + `renkAdlari` (kimlik/ad çiftleri AYNI sırada: `urunAdlari[i]` =
  `urunIdleri[i]`nin adı; sıra ada göre tr, eşitlikte kimlik), `enler` (sayı, artan), `partiAdlari` + `partiKodlari`
  (sevk partisi, aynı sırada), `uretimPartileri` (`Batch.batchNumber`, yalnız gösterim/metin), `etiketMusterileri`,
  `siparisNolari`, `depolar`. Hepsi tekil + kararlı sıralı (içerik değişmedikçe dizi değişmez); boşsa `[]`.
- **Kaynak:** `sevkiyat-icerigi` ile AYNI top kümesi — çuvalların BRÜT içeriği (canlı toplar + iptal edilmemiş, canlı
  kümede olmayan iadeler `prevSackId` ile) + çuvalsız toplar; **hayalet top (`yok`) sayılmaz**; iade satırının
  ürün/renk/eni iade anındaki değerdir. Toplu okuma `cloud-sync/shipment-content.ts` `loadShipmentFacets` (birim başına
  4 sorgu; top ek kolonları `loadRollExtras`, parti `loadPackingLots` içerikle ortak), saf biçim `shipmentFacets` +
  `cloud-sync/facet-arrays.ts`. Panel servisi kök başına ÇAĞRILMAZ; eşitliği bekçi DB'deki her sevkiyatta içerik
  kaydıyla ölçer. `siparisNolari` çuvalların ETKİN tahsislerinden (`SackAllocation` → kalem → sipariş) gelir —
  mevcut `siparisIdleri` (`shipment_orders`, sevkiyatın seçili siparişleri) ile aynı küme olmak ZORUNDA DEĞİL (tahsis
  düşmeyen seçili sipariş `siparisIdleri`nde var, `siparisNolari`nda yok). `depolar` = çuvalların `warehouseId` deposu.
- **Değişiklik izleme:** mevcut `sacks`/`rolls`/`roll_returns` via + `shipment_orders` işareti; eklenen kaynaklar:
  `items`, `colors` (topun/iadenin ürünü-rengi), `customers` (sevkiyat carisine ek olarak topun etiket müşterisi),
  `packing_groups`, `warehouses`, `sack_allocations` (**`createdAt` filigranı**: tabloda `updatedAt` yok; damgalama
  `clearedAt` her yolda aynı tx'te sevkiyat/çuval/bağ yazar → mevcut kaynaklar yakalar). `batches.batchNumber` ve
  `orders.orderNumber` doğuşta materyalize edilir, değişmez → kaynak değil.
- **Uyum:** bulut satırı şemasız saklar, imaj gerekmez. Diziyle SÜZMEK için bulutta yeni üyelik süzgeci gerekir
  (bugün yalnız `is-emri` için `LIST_MEMBER_FILTERS`) — o iş bulut tarafındadır; o gelene kadar alanlar yalnız taşınır.
- **Yük (ölçüldü, yerel test DB, sentetik 586 sevkiyat · 1758 çuval · 8790 top):** `loadShipmentFacets(586)` 70–121 ms;
  TAM sayfa `buildRecords(sevkiyat, 586)` 91 ms, 586 satır 532 KB (satır başı ≈ 930 B, dizilerle). Kıyas: kök başına panel
  servisi 2,9 ms/sevkiyat (≈ 1,7 sn). Ad değişimi: yaygın bir ürün/renk/etiket carisinin adı değişirse o ürünlü bütün
  sevkiyat satırları (saklama penceresinde) yeniden gider — seyrek, satır hafif.
- **Provada bakılacak:** ilk tur `sevkiyat` TAM süresi; birkaç sevkiyatta dizilerin uygulamadaki sevkiyat ayrıntısıyla
  (çuval içerikleri) aynı ürün/renk/en/partiyi söylediği.

### Ek A6 — sipariş listesi süzgeç dizileri (`siparis` 4 → 5)

- **Alan:** `urunIdleri` + `urunAdlari`, `renkIdleri` + `renkAdlari` (kimlik/ad çiftleri AYNI sırada, ada göre tr),
  `enler` (sayı, artan). Biçim `sevkiyat` dizileriyle ortak (`cloud-sync/facet-arrays.ts`); boşsa `[]`.
- **Kaynak ve kalem kapsamı:** siparişin kalemleri, kapsam mevcut `kalemSayisi` türeviyle AYNI —
  `order-line-scope.helper` `isActiveLine` (iptal edilmemiş kalem; ölçü birimi süzülmez, KG kalemin ürünü de girer).
  İptal edilmiş kalemin ürünü/rengi/eni dizilere girmez; eni boş kalem `enler`e girmez. Okuma `orderDerived`in
  zaten koşan kalem sorgusunun seçimi genişletilerek (ek sorgu YOK). Sipariş/müşteri yaratma koduna dokunulmadı.
- **Değişiklik izleme:** kalem ekleme/iptal/düzeltme mevcut `via(order_lines.orderId)` ile; eklenen `items` ve
  `colors` kaynakları ad değişince o ürünlü/renkli kalemi olan siparişleri yeniden gönderir.
- **Uyum:** bulut satırı şemasız saklar, imaj gerekmez; diziyle süzmek için bulutta üyelik süzgeci gerekir (bulut işi).
  Eski uygulama alanları görmezden gelir.
- **Yük:** satır başına tipik 1–3 kalemle ≈ 200–400 B artış; ek sorgu yok. Ad değişiminde o ürünün geçtiği bütün
  siparişler (saklama penceresinde) yeniden gider — seyrek.
- **Provada bakılacak:** ilk tur `siparis` TAM süresi (sürüm 5); birkaç siparişte dizilerin uygulamadaki kalemlerle
  aynı ürün/renk/eni söylediği, iptal kalemin görünmediği.

### Ek — iş emri yaratmada paylaştırma (migration yok, sözleşme alanı mevcut)

Kullanıcı (2026-11-20): "yeni iş emrine sipariş bağlarken bu miktarın ne kadarını bu iş emrine bağlayacaksın hemen orada
müdahale edebilmeliyiz" — sonradan "Paylaştır"a basmadan.

- **Alan:** `POST /api/work-orders` gövdesindeki MEVCUT `orderLineAllocations: [{ orderLineId, allocatedQty? }]` (öğe biçimi
  "Sipariş Bağla" `allocations` ile aynı; Zod şeması zaten vardı). Yeni alan/uç YOK.
- **Davranış:** bağ HEP 0 doğar; `allocatedQty` > 0 olan satırlar AYNI tx'te `applyOrderLinkAllocationsTx` ile yazılır —
  tavan (top yok → hedef metre, hedef de yoksa tavan yok), aşım 400 `ALLOCATION_OVER_BASIS`, MT dışı satır 400
  `ALLOCATION_UNIT_NOT_MEASURED`; ret iş emrini (ve refakat kartını) da geri alır. Defter `orderAllocation`
  FIELD_CHANGED yazar; açık aşımı yanıtta `warnings`; audit `allocationChanges` + `allocation`.
- **Kapanan delik:** 2.13.2 öncesi create `allocatedQty`yi doğrulamadan doğrudan yazıyordu (panel ve tablet bugün
  göndermediği için sahada iz yok — canlıda `allocatedQty > 0` olup `orderAllocation` olayı olmayan bağ provada sayılır).
- **Uyum:** alanı göndermeyen istemci (tablet hızlı iş emri `orderLineIds`, eski panel) birebir eski davranış: bağ 0.
  `clientToken` replay aynı kaydı döndürür, paylaştırma/defter ikinci kez yazılmaz.
- **Düzenle de aynı boğazda:** `PUT /work-orders/:id` gelen `allocatedQty`yi artık doğrudan yazmaz, aynı tx'te
  `applyOrderLinkAllocationsTx`ten geçirir (yeni hedef metre tavana girer; ret tüm Düzenle'yi geri alır); miktarsız gövde
  (bugünkü panel) birebir eskisi gibi. create/replace Zod alanı "Sipariş Bağla" ile tek tanım (sonlu, ≥ 0, ≤ 999.999.999 —
  üstü `Decimal(12,3)` kolona sığmaz, artık Zod 400). [bekçi: test_workorder_order_allocation §12–§14]

### Ek — aynı gecenin bulut imajı: Cariler sıralaması (fabrika paketi DEĞİŞMEDİ)

Bu backend paketi (`202cdc65`) aynen kalır; aynı kurulumda geçilecek bulut imajı `adnan-patron:ed9d4a8cc664` olur
(önceki aday `a340068c5225` kurulmaz). İmaj yalnız uygulama API'sine Cariler sütun sıralamasını ekler (`1ac6a7c6`): rol ve
durum fabrikanın mevcut bayraklarından (`musteriRolu`·`tedarikciRolu`·`fasonRolu`, `aktif`), sevk yönü, kayıt tarihi ve
kişisel alt satırdan yetkili/telefon — ikincisi yalnız kişisel izinli hesaba beyan edilir, izinsize 403. Bulut hesap
yapmaz, yeni alan/projeksiyon ve bulut göçü YOK; fabrika gönderdiği alanları değiştirmez. Uygulama (`ed9d4a8c`) başlığı
yalnız bulut alanı beyan ediyorsa açar (eski bulutta kapalı). [bekçi: patron/sunucu test_veri_tablosu §1g–§3m]
