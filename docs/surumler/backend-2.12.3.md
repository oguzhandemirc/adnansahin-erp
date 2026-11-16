# Backend `2.12.3`

**Paket:** `tekserp-backend-20261117_003907-2bdae04a.zip`
**SHA256:** `3F02ECAC169C237784FEFC252BE6CFCA9C4EE2573388B3A9BBACF1ACF226FE79`
**Commit:** `2bdae04a`
**İçerik:** 2.12.2 paketinin (`b276031b`) bütün içeriği + sonrasında `main`e gelenler: iş emri metresini bağlı sipariş satırlarına paylaştırma (`85f70259`; migration yok) ve Tambur bağlamında `plannedQty` · iş emri planlama notu (`8aabc697`; yeni tablo) · sevkiyata girip çıkmış boş çuvalın silinememesi düzeltmesi (`ae8b9979`; `sack_allocations`a donuk `sackNo`) · panel tarafında paylaştırma ve not kartı (`9799084b`, `91259765`, `a86e060f`; tarayıcı paneli bu paketle gelir).
**Önceki saha sürümü:** **2.12.2** (kuran, kurulumdan önce `/health` ve `app\PAKET.json` ile 2.12.2 olduğunu ÖLÇER — farklıysa DUR).

Paketleme **`-Surum 2.12.3`** ile koşulur.

## 1. Özet

İki migration'lı küçük sürüm. Üç iş:

1. **Paylaştırma:** iş emrinin metresi bağlı sipariş satırlarına elle dağıtılır (ör. 1000 m → 800 + 200). Tavan,
   giren ham metre (top yoksa hedef metre); aşım 400 `ALLOCATION_OVER_BASIS`. Sipariş açık metresini aşmak engel
   değil, uyarıdır. Tablet Tambur ekranının sipariş kutusu bu metreyi `plannedQty` olarak alır.
2. **Planlama notu:** iş emrine tek, düzenlenebilir not (≤ 2000 karakter); yeni `work_order_notes` tablosu.
3. **Canlı hata düzeltmesi:** bir kez sevkiyata girip çıkmış, sonra boşalmış çuval silinemiyordu (P2003 "Geçersiz
   referans"). Artık silinir: geçmiş tahsis satırları silinmez, çuval bağı koparılır (`sackId → NULL`) ve satır
   çuvalı donuk `sackNo` ile söyler. Etkin tahsisi olan çuval yine silinmez (409 `SACK_HAS_ACTIVE_ALLOCATION`).

Ölçüm (git, `b276031b` = 2.12.2 `..` bu commit): yeni migration **2** (toplam **369**) · yeni HTTP ucu **3**
(`PUT /api/work-orders/:id/order-links/allocations`, `GET|PUT /api/work-orders/:id/note`; mevcut
`POST …/order-links` gövdesine opsiyonel `allocations`) · yeni izin kodu **0** (mevcut `workorder:read`/`workorder:write`) ·
yeni rol şablonu **0** · yeni ayar anahtarı **0** · yeni ortam değişkeni **0** · yeni npm paketi **0** (`package.json`da
yalnız `version`) · `client-version-policy.ts` değişmedi · `deploy/` değişmedi (`kur.ps1`, `uzaktan-kos.ps1` 2.12.2 ile aynı).

## 2. Ne değişti

- **Paylaştırma** (`helpers/order-link-allocation.helper.ts`, `workorder-link.service.ts`; sözleşme
  `docs/kurallar/is-emri.md`): `PUT …/order-links/allocations` gövdesi `{ allocations: [{ orderLineId, allocatedQty }] }`;
  gönderilmeyen bağın miktarı korunur, `0` = paylaştırma yok. `GET /api/work-orders/:id` yanıtına `allocation`
  (`basis`, `basisKind` INPUT|TARGET|NONE, `allocated`, `remaining`) eklenir. Mevcut `order_line_work_orders.allocatedQty`
  kolonu kullanılır — şema değişmez. Değişiklik iş emri zaman çizelgesine ve audit'e düşer.
- **Tambur bağlamı:** `orders[].lines[].plannedQty` (bu iş emrinden satıra paylaştırılan metre, yoksa `null`). Diğer
  alanlar aynı; eski tablet alanı yok sayar.
- **Planlama notu** (`workorder-note.service.ts`): `GET` (`workorder:read` ya da `workorder:write`) ve `PUT`
  (`workorder:write`, boş/`null` = temizle). Kayıt audit'e düşer.
- **Boş çuval silme** (`shipping.service.ts`, `helpers/sack-allocation.helper.ts`): çuval sert silinince damgalı
  (geçmiş) tahsis satırlarının bağı tek boğazda koparılır; numarası boş eski satır önce numarasını alır. Sevkte
  yazılan yeni tahsis satırı `sackNo`yu doğuşta taşır. Çuval sevkiyattan çıkarılınca o çuvalın etkin tahsisi damgalanır.
- **Sipariş sevkiyat listesi** (`order.service.ts`): bağı kopmuş satır güvenle atlanır (etkin satırın çuvalı hep var).
- **Pakette `dist-web` yeniden derlenir:** panel kodu 1.3.18 + paylaştırma ve not kartı (masaüstü panel sürümü
  ayrı yayınlanır; bu paket onu değiştirmez).

## 3. Sözleşme

- **Kırıldı mı:** HAYIR — yeni uçlar ve yanıtlara yeni alanlar eklendi; mevcut uç, alan, enum ve izinler aynı.
  `sack_allocations.sackId` artık `NULL` olabilir; yalnız bağı kopmuş (damgalı, geçmiş) satırda — etkin satırda
  CHECK ile yasak. Hiçbir uç bu tabloyu ham satır olarak dışarı vermez.
- **Eski istemci ne yapar:**
  - **Panel 1.3.15–1.3.18 (masaüstü):** paylaştırma/not uçlarını çağırmaz; `allocation` alanını yok sayar. Boş çuval
    silme düğmesi aynı ucu çağırır — artık başarılı olur.
  - **Tablet 1.0.14–1.0.20:** `plannedQty`yi yok sayar (1.0.20'ye kadar gösterim yok); diğer akış aynı.
- **Panel uyumluluğu:** panel **1.3.15–1.3.18**, tablet **1.0.14–1.0.20** ile uyumlu.
- **`minVersion` dokunuldu mu:** HAYIR (`client-version-policy.ts` 2.11.7'den beri değişmedi).

## 4. Migration

- **Var mı:** EVET, iki tane (toplam **369**). Kuran `[7/9]`da "369 migrations found" + iki migration'ın uygulandığını
  görmelidir; farklı sayı = yanlış paket ya da yanlış DB → DUR.
  1. `20261116210125_work_order_notes` — yalnız yeni tablo `work_order_notes` (+ tekil indeks + `work_orders`a FK,
     `ON DELETE CASCADE`). Mevcut tablolara dokunmaz, backfill yok. Kurulumdan sonra tablo BOŞ.
  2. `20261116211847_sack_allocation_frozen_sack_no` — `sack_allocations`a `sackNo VARCHAR(64)` (expand) ·
     `sackId` `DROP NOT NULL` · **backfill:** her satıra çuvalının numarası (`UPDATE … FROM sacks`, canlıda ≈ 3.700
     satır) · iki CHECK (`sack_allocations_active_has_sack`, `sack_allocations_detached_has_no`; `NOT VALID` +
     `VALIDATE`). FK `sack_allocations_sackId_fkey` RESTRICT olarak KALIR. Numarası doldurulamayan satır kalırsa
     deploy düşmez, `NOTICE` yazar (yalnız yetim veride; beklenmez).
- **Ne zaman:** `[7/9]` `prisma migrate deploy`, backend DURUKKEN (kesinti içinde).
- **Veri yazan adımlar:** yalnız 2'nin backfill'i (`sack_allocations.sackNo`); başka tabloya yazılmaz.
- **Geri alınabilir mi:** migration GERİ ALINMAZ (rollback = `[3/9]` `premigrate_` yedeğinden restore). `-GeriAl`
  yalnız KODU 2.12.2'ye döndürür; şema yeni kalır. Yeni şema 2.12.2 koduyla uyumludur (§6, provada ölçüldü).

**Kurulum sonrası doğrulama sorguları (psql, salt okuma):**
```sql
SELECT count(*) FILTER (WHERE "sackNo" IS NULL), count(*) FILTER (WHERE "sackId" IS NULL), count(*) FROM sack_allocations;
-- beklenen: 0 | 0 | {toplam}
SELECT conname FROM pg_constraint WHERE conrelid='sack_allocations'::regclass AND contype='c' ORDER BY 1;
-- beklenen: sack_allocations_active_has_sack, sack_allocations_detached_has_no (ve önceden olanlar)
SELECT count(*) FROM work_order_notes;   -- beklenen: 0
```

## 5. Kurulum notu

- **Beklenen kesinti:** ≈ 1 dk (Windows provasında ölçülen 40,8 ve 56,2 sn; iki migration birlikte ≈ 0,3 sn). Kesintiden
  ÖNCEKİ `[1/9]`–`[3/9]` (paket açma + yedek) ≈ 5–6 dk, toplam ≈ 7–8 dk; bu sürede fabrika ÇALIŞIR ve ekranda `[1/9]`
  satırından başka çıktı olmayabilir — kesme.
- **Sıra:** bu backend → doğrulama (§4 sorguları + §7) → masaüstü panel/tablet sürümleri ayrı onayla.
- **Kurulum yöntemi:** 2.12.2 ile aynı — paket `C:\TeksERP\guncelleme\`e; paketin kendi `kur.ps1` + `uzaktan-kos.ps1`i
  çıkarılır, `C:\TeksERP\kur.ps1` onunla değiştirilir; SYSTEM görevi:
  `uzaktan-kos.ps1 -Betik C:\TeksERP\kur.ps1 -Argumanlar '-Kok C:\TeksERP -Paket {zip} -Zorla'`.
- **Bu sürüme özel:** veri aracı yok; yeni ayar anahtarı yok; kurulum `.env`e DOKUNMAZ (patron bulutu ve destek
  satırları yerinde kalır). Patron bulutu eşitlemesi AÇIKKEN kurulur (2.12.2 ile aynı davranış): backend durunca
  eşitleme işleri durur, açılışta yeniden başlar. Backfill `sack_allocations`a yazar; bu tablo patron eşitleme
  tetikleyicisi taşıyorsa işaret yazılır (ölçüm: kurulum önce/sonra `patron_sync_status()` ve `sync_marks`).
- **Sınırlar (her sürümde geçerli):** `migrate reset`/reseed/DB drop YOK · uygulanmış migration'a dokunma ·
  postgres/node süreçlerini `Stop-Process` ile durdurma, `postgresql-tekserp` servisine dokunma ·
  `C:\TeksERP\pgsql\bin` JUNCTION'dır, recursive SİLİNMEZ · gece yedeği görevi çakışmamalı · elle koşumda
  `-GeriAl` ile `-Zorla` birlikte KULLANMA · başarısız kurulumu TEKRAR DENEME · hata → DUR, insana rapor et.

## 6. Geri alma

Uygulama sorununda: `kur.ps1 -GeriAl` bu kurulumun kenara aldığı `app.eski-*`i (2.12.2) geri koyar. Sondaki
"DB migration'lari GERI ALINMADI" uyarısı BEKLENİR: iki migration yerinde kalır. 2.12.2 kodu yeni şemada çalışır:
yeni tabloyu ve `sackNo` kolonunu tanımaz (okumaz, yazmaz); tahsisleri hep çuval ilişkisi ve etkin-satır süzgeciyle
okur, bağı kopmuş satıra uğramaz. Geri dönüşte kalan farklar: 2.12.2'nin yazdığı yeni tahsis satırları `sackNo`suz
doğar (CHECK'i ihlal etmez; 2.12.3'e dönünce çuval silinirken numarası doldurulur) · boş çuval silme hatası geri gelir ·
paylaştırma değerleri ve notlar DB'de durur ama görünmez. Şema/veri sorunu: backend durdurulur, `premigrate_`
yedeğinden restore (`docs/kurallar/surum-yayin.md` § Migration).

## 7. Doğrulama — kurulumdan sonra rapor edilecekler

- yeni sürüm + `pm2 ls` (online, restart sayısı, SYSTEM); `/health` → `UP/UP 2.12.3`
- `[7/9]`: "369 migrations found" + iki migration uygulandı; `_prisma_migrations` 369 bitmiş / 0 sorunlu
- §4 doğrulama sorguları: `sackNo` boş 0 · `sackId` boş 0 · iki CHECK var · `work_order_notes` 0
- psql: `SELECT * FROM patron_sync_status();` → kurulumdan ÖNCEKİ değerle aynı
- kullanıcı / sipariş / top / çuval / sevkiyat / tahsis sayıları kurulumdan öncekiyle aynı; sevk edilen toplam metre aynı
- `.env` satır sayısı ve özeti kurulumdan öncekiyle aynı
- `backend-err-*.log` (en yenisi) — yeni hata yok; açılış log'unda patron eşitlemesi işleri yeniden başladı
- oturumla bir iş emrinde `GET /api/work-orders/:id` → 200 + `allocation`; `GET …/note` → 200 `body: null`
- panelde parolayla giriş + sipariş listesi; tabletten PIN ile giriş + bir okutma
- ölçülen kesinti

**Prova (2026-11-17, Mac, fabrikanın 16-11 03:00 gece yedeği — canlı 2.12.2 kurulumundan sonra, 367 migration) — GEÇTİ:**
- Paket: `PAKET.json` `2.12.3 · 2bdae04a · 369 · prova false · temiz ağaç`; etiket atılmadı.
- İki migration güncel veride: `work_order_notes` 4 ms, `sack_allocation_frozen_sack_no` 30 ms (backfill 3.703 satır,
  1.988'i damgalı); 369 / 0; `sackNo` boş 0, `sackId` boş 0, numara uyuşmayan 0; iki CHECK doğrulanmış; FK RESTRICT
  kaldı; `work_order_notes` 0; etkin sevk metresi (= `shippedQty` toplamı) aynı.
- 2.12.3 koduyla sevkiyata girip çıkmış boş çuval (`CV1411260009`) silindi; 2 geçmiş tahsis satırı `sackNo` ile duruyor
  (`sackId` NULL), `shippedQty` aynı.
- Geri dönüş uyumu: aynı DB'de (bağı kopuk satırlar VARKEN) 2.12.2 kodu (`b276031b`) sipariş ayrıntısı, sipariş
  sevkiyatları, iptal sevkiyat ayrıntısı, son 30 sevkiyat ayrıntısı ve depo panosunu hatasız döndürdü.
- Sınır: Mac'te servis katmanında ölçüldü; HTTP ve kurulum mekaniği aşağıdaki Windows provasında.

**Windows provası (2026-11-17, ThinkPad'deki fabrika kopyası, 2.12.2 → bu paket; eşitleme ve destek KAPALI) — GEÇTİ:**
- Kurulum (`uzaktan-kos.ps1` + `kur.ps1 -Zorla`): 414,3 sn, kesinti 40,8 sn; `[7/9]` "369 migrations found" + iki migration
  uygulandı (`work_order_notes` 154 ms, `sack_allocation_frozen_sack_no` 132 ms); UP/UP 2.12.3, `_prisma_migrations` 369 / 0.
- Bütün sayılar, tahsis üçlüsü (3.703 · 1.988 · 447.491,8 m), `patron_sync_status()` `0·28·1` ve `.env` SHA256 aynı;
  `sackNo` boş 0, `sackId` boş 0, iki CHECK doğrulanmış, `work_order_notes` 0; `sack_allocations`ta eşitleme tetikleyicisi yok.
- HTTP: paylaştırma 800 + 200 → 200 (tavan INPUT 1.263 m); aşım → 400 `ALLOCATION_OVER_BASIS`, DB değişmedi; Tambur bağlamı
  `plannedQty` 800 / 200; not yaz-oku-temizle 200; `CV1411260009` panel ucuyla silindi (200), 2 geçmiş tahsis satırı `sackNo`
  ile duruyor, `shippedQty` aynı; sipariş/sevkiyat/çuval okuma uçları 200; eski tablet uçları (cihaz bildirimi, `mobile`
  girişi, tambur bağlamı, depo panosu, çuval arama) 200.
- Geri alma (`-GeriAl -Zorla`): 16,5 sn, kesinti 7,5 sn, UP/UP 2.12.2, şema 369 kaldı; 2.12.2 kodu bağı kopuk satırlar
  varken aynı okuma ve tablet uçlarında 200, hata günlüğünde Prisma/500 yok. Yeniden kurulum: 476,6 sn, kesinti 56,2 sn,
  "No pending migrations to apply". Ayrıntı ve canlı reçetesi: repo dışı `PROVA-2.12.3-2026-11-17.md`.
