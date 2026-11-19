# Backend `2.13.1`

**Paket:** `tekserp-backend-20261119_030133-a7237270.zip`
**SHA256:** `AC877DD18771BF734C705122DB450F87D7AA76246572787209D023D39D98448E`
**Commit:** `a7237270`
**İçerik:** 2.13.0 paketinin bütün içeriği + bildirim metinlerinde miktar (saha kusuru 2026-11-18) + patron telefonuna giden anlıklarda yeni alanlar (Ek — patron verisi, 2026-11-19). Panel kodunda değişiklik yok.
**Önceki saha sürümü:** **2.13.0** (kuran, kurulumdan önce `/health` ve `app\PAKET.json` ile 2.13.0 ve 371 migration olduğunu ÖLÇER — farklıysa DUR).

Paketleme **`-Surum 2.13.1`** ile koşulur.

## 1. Özet

Migration'sız küçük sürüm. Fabrikanın ürettiği bildirim metinleri kilit ekranında "müşteri + miktar" gösterir
(kullanıcı isteği; bulutun eski türetmesi "ELİZA LALELİ · Sipariş SIP… · 100 m" yazıyordu, 2.13.0 miktarsızdı):

- **Yeni sipariş · Sipariş tamamlandı:** aktif kalemlerin toplamı + birimi (`1.203 m`, `12,5 kg`; bulutla aynı biçim,
  en çok 2 ondalık). Kalemler farklı birimdeyse toplam UYDURULMAZ, `N kalem` yazılır.
- **Sipariş iptali:** iptal edilen miktar (bütün kalemler, iptal edilmişler dahil), aynı kural.
- **Yeni iş emri:** hedef ürün adı + hedef metraj (`targetQuantity`, doluysa).
- **Yeni sevk:** planlanırken topu varsa BRÜT top + metre (sevk çıkışıyla aynı kaynak); boş sevkte miktar yok.

Metin varlığın durum tablosundan okunur; sipariş yaratma kodu DEĞİŞMEDİ.

## 2. Ne değişti

- `src/constants/notification-catalog.ts`: `NotificationFacts.quantity` + `lineCount`, `orderAmountText`; beş türün metni.
- `src/services/notifications/kind-sources.ts`: sipariş yükleyicileri kalemleri okur (`isActiveLine`), iş emri
  yükleyicisi hedef ürün + metraj, yeni sevk yükleyicisi brüt top/metre.
- `package.json` sürüm 2.13.1. Bekçiler: `test_bildirim_cekirdek` (sipariş/iş emri miktarı, biçim), `test_bildirim_turler` (iptal miktarı).

## 3. Sözleşme

- **Kırıldı mı:** HAYIR — yalnız bildirim metninin (`title`/`body`, serbest metin) içeriği değişti; uç, alan, izin,
  enum değişmedi. Bulut metni opak saklar ve olduğu gibi iletir.
- **Eski istemci ne yapar:** panel 1.3.15+ ve tablet 1.0.14+ metni olduğu gibi gösterir; patron uygulaması etkilenmez.
- **`minVersion` dokunuldu mu:** HAYIR.

## 4. Migration

- **Var mı:** HAYIR (toplam **371**, 2.13.0 ile aynı). Kuran "371 migrations found" + "No pending migrations to apply"
  görmelidir; farklı sayı = yanlış paket ya da yanlış DB → DUR.
- **Ne zaman:** —
- **Veri yazan adımlar:** yok.
- **Geri alınabilir mi:** EVET — şema değişmediği için `-GeriAl` 2.13.0 koduna tam döner.

## 5. Kurulum notu

- **Beklenen kesinti:** ≈ 70 sn (migration yok).
- **KURULUM SIRASI:** ÖNCE patron bulutu imajı (Ek — patron verisi, D maddesi + cari özeti yanıtı), SONRA bu paket. Sıra ZORUNLU: paket `sevkiyat-icerigi` projeksiyonunu da gönderir (b937033f) ve bu adı tanımayan eski bulut imajı onu reddeder, eşitleme turları kısmi düşer (ölçüldü 2026-11-19: canlı imaj a735a107, bf4fe196'yı içermiyor). Bulut geri alınırsa fabrika da 2.13.0'a geri alınır. Öteki yeni alanları eski bulut zararsız saklar (bkz. Ek).
- **Kurulum yöntemi:** 2.13.0 ile aynı (paketin kendi `kur.ps1` + `uzaktan-kos.ps1`i).
- **Bu sürüme özel:** yeni ayar anahtarı yok; `.env`e DOKUNMAZ; `notifications.enabled` değeri korunur.
- **Sınırlar (her sürümde geçerli):** `migrate reset`/reseed/DB drop YOK · uygulanmış migration'a dokunma ·
  postgres/node süreçlerini `Stop-Process` ile durdurma · `C:\TeksERP\pgsql\bin` JUNCTION'dır, recursive SİLİNMEZ ·
  `-GeriAl` ile `-Zorla` birlikte KULLANMA · başarısız kurulumu TEKRAR DENEME · hata → DUR, insana rapor et.

## 6. Geri alma

`kur.ps1 -GeriAl` 2.13.0'ı geri koyar (uzaktan, görev üzerinden koşumda onay sorusu asılı kaldığı için çalışan biçim `-GeriAl -Zorla`dır — provada ölçüldü 2026-11-19: 16 sn, kesinti 5 sn; §5'teki "birlikte kullanma" yasağı elle, etkileşimli koşum içindir); bildirim metinleri yeniden miktarsız olur, başka fark yok.

## 7. Doğrulama — kurulumdan sonra rapor edilecekler

- yeni sürüm + `pm2 ls`; `/health` → `UP/UP 2.13.1`; 371 migration, bekleyen yok
- panelden deneme siparişi gerekmez: bir sonraki gerçek siparişin bildirim metninde `· 1.203 m` biçiminde toplam (psql salt okuma:
  `SELECT body FROM notification_events ORDER BY "createdAt" DESC LIMIT 3;`)
- `backend-err-*.log` (en yenisi) — yeni hata yok
- ölçülen kesinti

## Ek — patron verisi: süzülmüş stok toplamı, hazır dönemler, carinin depodaki malı (2026-11-19; sürüm 2.13.1 kalır, migration YOK)

Kullanıcı kararı 2026-11-19 ("bunların hepsini yap"). Yalnız eşitleme işinin anlık turunda çalışır; kapatma düğmesi
kapalıyken hiçbiri koşmaz. Sipariş/müşteri yaratma kodu, migration, npm paketi, `lisans-protokol` ve bayt-eşit tel
dosyaları DEĞİŞMEDİ. Commit'ler: `4512b768` (A) · `ee4567a2` (B+C) · `6b11c8e5` (D, yalnız bulut).

- **A · `stok-kalem`:** her top satırı (`ham.toplar`, `bitmis.toplar`, `bitmis.cuvaldakiToplar`) `depodaTop`/`depodaMetre`
  (raf) · `cuvaldaTop`/`cuvaldaMetre` (çuval) hazır katkısını taşır; metre kesin 3 hane. Uygulama süzgeç etkinken yalnız
  süzülen topların bu alanlarını toplar; süzgeçsiz toplam bölüm toplamıyla birebir (bekçi). Rapor servisi top satırına
  `exactQty` + `labelCustomerId` ekledi (panel ucuna yalnız ek alan).
- **B · `cari-ozeti` hazır dönemler:** `tumZamanlar` · `son12Ay` (mevcut) + `buAy` · `gecenAy` · `son3Ay` · `son6Ay` · `buYil` ·
  `gecenYil` (yalnız sayı; "en çok alınan" yalnız ilk ikisinde); anlık kökünde `uretimGunu` + `donemler` (sınırlar).
- **C · cari başına:** `acik.enEskiSiparisTarihi` + `acik.enEskiSiparisYasGun` · `enCokUrun[].sonSiparisTarihi` ·
  `depodakiMal {depodaTop, depodaMetre, cuvaldaTop, cuvaldaMetre}` (yalnız ETİKET müşterisi). Termini geçen sipariş sayısı
  EKLENMEDİ (anlık kuralı termin/gecikme türevini yasaklar — kullanıcı kararı bekliyor).
- **D · bulut (fabrika değil):** sipariş + sevkiyat liste süzgecinde `IPTAL_HARIC` (ters eşitlik); `/oturum`
  `liste.suzgecDegerleri` beyanı; `GET /api/cari-ozeti/:id` yanıtına `uretimGunu` + `donemler`.

**Uyumluluk:** bulut anlık içeriğini şemasız jsonb saklar → eski bulut yeni alanları saklar ve cari özetinin müşteri
girdisini aynen döner (yalnız `uretimGunu`/`donemler` dönmez). Yeni bulut + eski fabrika: yeni alanlar yok, yanıtta null.
Eski uygulama yeni alanları görmezden gelir; yeni uygulama `IPTAL_HARIC`ı yalnız `suzgecDegerleri` beyanlıysa gönderir.

**Yük (tahmin; kesin sayı provada):** `stok-kalem` top başına ≈ 70 bayt (≈ 3.500 top → ≈ +0,25 MB ham, gzip ≈ +25 KB);
`cari-ozeti` cari başına ≈ +1,3 KB sayı + "en çok" satırı başına ≈ +45 bayt (≈ 190 cari → ≈ +0,4 MB ham, gzip ≈ +50 KB).
Anlıklar ilk pakette gider; sınır 4 MB gzip / 32 MB açık. Tur süresi: cari özeti dönem sorguları 2 → 8 dönem (sırayla).

**Provada bakılacak:** eşitleme turu log'unda anlık süreleri (`cari-ozeti`, `stok-kalem`) ve hata satırı yok;
bulut `projection_rows`ta `stok-kalem` ve `cari-ozeti` boyutu; uygulamada stok süzgeci + cari dönemleri.

## Ek 2 — iş emrinin fason firma payı (E, 2026-11-19; sürüm 2.13.1 kalır, migration YOK)

- **`is-emri` katalog 3 → 4:** satıra YALNIZ `fasonFirmaPayi: [{fasonFirmaId, kategoriKodlari, top, metre}]` eklendi
  (mevcut alanlar aynen). Küme `asamaTop` "fason" satırının AYNI topları; firma topun açık kaleminden
  (`outstandingItemOfOpenDispatch`, birden çoksa en son sevk), işlem = firmanın hizmet kategori KODLARI (`fason-acik` ile
  aynı kod), açık kalemi olmayan fason topu `fasonFirmaId: null` satırında. Toplam her İE'de "fason" satırına eşit (bekçi
  `test_patron_bulut_is_emri` §3, DB'deki her İE). Fasonsuz İE'de `[]`.
- **Uyumluluk:** sürüm artışı kurulumdan sonraki ilk turda `is-emri` için bir kez TAM gönderim başlatır (eski bulut da
  `KATALOG_SURUMU` ile TAM ister); bulut satırı şemasız saklar, bulut değişmedi. Eski uygulama alanı görmez; yeni uygulama
  dizi yoksa (eski fabrika) bugünkü gibi davranır.
- **Yük:** fasonlu İE başına 1–2 satır × ≈ 110 bayt; bir kerelik TAM gönderim `is-emri`nin bütün satırları kadardır.
- **Provada bakılacak:** ilk turda `is-emri` TAM gönderimi bitti mi; uygulamada iki firmaya bölünmüş iş emri firma süzgecinde
  Top/Metre payı ve alt şerit toplamı.
