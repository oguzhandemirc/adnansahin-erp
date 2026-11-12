# Patron eşitleme migration'ı — fabrika kurulumu

İki migration: `20260929152815_patron_bulut_esitleme` (2 tablo, 31 filigran indeksi, 28 tetikleyici) + `20260929180000_bulut_gelen_kutusu_makbuzu` (1 tablo). Yalnız EKLER; mevcut kolon/veri değişmez. Tetikleyiciler KAPALI doğar — bu kurulum eşitlemeyi AÇMAZ. Kurallar: `docs/kurallar/patron-bulutu.md`.

## Ön koşullar
- Bu iki migration'ı taşıyan backend paketi sunucuda, `.env` yerinde.
- Vardiya dışı pencere: tabletten ve panelden yazma yok.
- Diskte en az bir tam yedek kadar boş yer.

## 1. Yedek
`kur.ps1` adım [3/9] `premigrate_` yedeğini alır; dosyanın oluştuğunu ve boyutunun sıfır olmadığını gör. Geri dönüşün tek yolu bu yedektir.

## 2. Backend'i durdur → migration → başlat
Komut (yönetici PowerShell; çıplak `C:\TeksERP\kur.ps1` yürütme ilkesine takılır): `powershell -NoProfile -ExecutionPolicy Bypass -File C:\TeksERP\kur.ps1 -Paket <zip>`.

`kur.ps1` sırayla: [4/9] pm2 durdurur → [5/9] eski kodu `app.eski-*` adıyla kenara alır, yenisini yerleştirir → [6/9] bağımlılıklar pakette yoksa `npm ci --omit=dev` (internet ister) → [7/9] `migrate deploy` → [8/9] pm2 başlatır → [9/9] sağlık kontrolü. Adımlardan biri kırmızıysa durulur, sonraki adıma elle geçilmez.

Backend durmuşken uygulanır: migration `rolls`/`roll_movements` dahil 32 tabloya kısa ShareLock alır; açık yazma tx'i onu bekletir. Başladıktan sonra eşitleme KAPALI kalır; açma ayrı bir bakım işidir (`patron-bulutu.md` § Açma reçetesi).

## 3. Doğrulama (psql, salt okuma)
```sql
SELECT * FROM patron_sync_status();
-- beklenen: enabled_triggers = 0 · total_triggers = 28 · swallowed_errors = 0

SELECT count(*) FROM pg_trigger t JOIN pg_proc p ON p.oid = t.tgfoid
 WHERE p.proname LIKE 'sync_mark_%' AND NOT t.tgisinternal;
-- beklenen: 28

SELECT count(*) FROM sync_marks;
-- beklenen: 0

SELECT migration_name, finished_at FROM _prisma_migrations
 WHERE migration_name IN ('20260929152815_patron_bulut_esitleme',
                          '20260929180000_bulut_gelen_kutusu_makbuzu');
-- beklenen: 2 satır, finished_at dolu
```
Ardından panelde top listesi açılır, tabletten bir okutma yapılır (normal çalışma).

## 4. Geri dönüş
- Uygulama sorunu: eski backend paketi bu şemayla çalışır (ölçüldü: okuma sonuçları birebir, tetikleyiciler kapalıyken sıfır çağrı) — yalnız paketi geri koy, şemaya dokunma: `powershell -NoProfile -ExecutionPolicy Bypass -File C:\TeksERP\kur.ps1 -GeriAl`. Sonundaki "DB migration'lari GERI ALINMADI" uyarısı BEKLENİR (iki tablo boş durur); eski paketle `migrate status` "Database schema is up to date!" der (D8 provası 2026-11-12).
- Şema sorunu: migration geri alınmaz; backend durdurulur, 1. adımdaki yedekten geri yüklenir (`docs/kurallar/surum-yayin.md` § Migration).

## 5. Eşitlemeyi açma (ayrı bakım işi, kullanıcıya gösterilerek)
1. Anahtar: `.env`e `PATRON_CLOUD_KEY_FILE=<mutlak yol>` (veri dizininde, repoda değil) → fabrikada paketin içinden `node dist\tools\patron-bulut-anahtar.cjs --dosya=<aynı yol>` (geliştirmede `npx tsx scripts/patron-bulut-anahtar.ts`; araç `.env`i yolu çözdükten sonra yükler, `--dosya=` açık verilir); dosya yoksa 0600 üretir, `--kurulum=` ve `--acik-anahtar=` değerlerini basar (özel anahtarı basmaz). Windows'ta mod bitleri ölçülmez; anahtarın klasörü elle SYSTEM + Administrators'a kısıtlanır.
2. Buluta kaydet: bulutta `tesis.ts kurulum-kaydet --kurulum=… --acik-anahtar=… --bitis=yok`. `yok` = süresiz hak (lisans/abonelik yok); süreli kurulumda ISO tarih verilir. Eski bulut imajı (2026-11-12 öncesi) `yok`u boş yazıp her isteği 403 `PATRON_BULUT_KAPALI` ile reddediyordu; o imajda kayıtlı kurulum yeni imajla aynı komutu yeniden koşarak düzelir.
3. Ortam: `.env`e `PATRON_CLOUD_URL=https://<bulut kökeni>` → backend yeniden başlatılır. Adres tek başına açmaz; açılış log'u sessizdir.
4. Ayar: `PUT /api/admin/settings/patronCloud.syncEnabled` `{"value":"true"}` (admin:settings + ayar şifresi). Beklenen log: `tetikleyiciler açıldı (28; …)` + `eşitleme işi başladı`; psql `SELECT * FROM patron_sync_status()` → `enabled_triggers = 28`.
5. İlk yüklemeyi izle: ilk tur 30 sn sonra koşar; başarı sessizdir (bulut log'unda `POST /v1/esitle 200`), hata tek satırdır: `UYARI [patron-bulut] eşitleme turu HATA (<kod>)` — iş aralık × 2^n geri çekilir (tavan 60 dk) ve kendiliğinden toparlanınca `eşitleme toparlandı` yazar.

Geri dönüş: aynı uç `"false"` → `eşitleme işi durdu` + `tetikleyiciler kapatıldı (28; AYAR_KAPALI; …)`. Adresi `.env`den silip yeniden başlatmak da açık kalmış tetikleyicileri açılışta kapatır.

### Sözleşme genişletmesinde sıra (M2a cari özeti ve sonrası)
Önce bulut, sonra fabrika. Ters sırada (yeni fabrika + eski bulut) eşitleme DURMAZ: eski bulut paketi 200 ile alır, tanımadığı `iade` ve `cari-ozeti`yi girdi bazında `PROJEKSIYON_BILINMIYOR` ile reddeder, siparişin katalog sürümü 2 için TAM ister (ölçüldü 2026-11-12, `main` bulutuyla); ama tur `KISMI` olur (tek UYARI satırı), reddedilen iadeler her turda baştan, cari özeti her anlık aralığında yeniden gider — bulut güncellenince kendiliğinden düzelir. Eski uygulama yeni bulutla çalışır (var olan uçların yanıtı değişmedi).

### Ölçülen (yerel prova, 2026-11-12; 13 projeksiyon, 5.703 kayıt)
- İlk TAM yükleme 6,1 sn · 3 istek · en büyük gövde 1.825 KB açık / 302 KB gzip · ölçüm sürecinin RSS'i 339 → 367 MB; bulut tesis DB'si 14 MB (`projection_rows` 5 MB).
- Fabrika ↔ bulut satır sayısı 13 projeksiyonda birebir (sipariş 969, sevkiyat 493, çuval 1.620, iş emri 1.150 …).
- Artımlı tur (3 yazım): 1 istek, 8 kayıt, 0,4–0,7 sn, gövde < 5 KB.
- Bulut kapalıyken API çağrıları 200 döndü; ilk hata turu tek UYARI satırı, bulut açılınca aralık × 2 sonra kendiliğinden toparlandı, kesintide yapılan yazım kayıpsız gitti. Kapatınca tetikleyici 0, `sync_marks` büyümedi, dış istek 0.

## 6. Telefondan yazmayı açma (okumadan EN AZ BİR HAFTA sonra, kullanıcıya gösterilerek)

Ön koşul: § 5 en az bir haftadır sorunsuz çalışıyor (eşitleme turu hatasız, telefonda okunan sayılar fabrikayla aynı).

1. Ayar: `PUT /api/admin/settings/patronCloud.inboxEnabled` `{"value":"true"}` (admin:settings + ayar şifresi). Beklenen log: `teknik kullanıcı doğdu (…)` (yalnız ilk açılışta) + `gelen kutusu işi başladı (telefondan yazma AÇIK)`. Teknik kullanıcı `patronbulutu` panel kullanıcı listesinde GÖRÜNMEZ ve giriş yapamaz; kullanıcı adı başka bir hesapta doluysa doğmaz ve log `KULLANICI_ADI_DOLU` der (iş başlamaz).
2. Telefondan deneme: patron uygulamasından bir yeni sipariş gönder → en geç `patronCloud.inboxIntervalSeconds` (varsayılan 30 sn) sonra panelde sipariş görünür, "Oluşturan: Patron Bulutu (telefon)"; uygulamada sonuç "işlendi" + sipariş no. Ret (ör. pasif müşteri) uygulamada Türkçe nedenle görünür.
3. İzle: hata tek satırdır (`UYARI [patron-bulut] gelen kutusu turu başarısız …`), iş aralık × 2^n geri çekilir (tavan 10 dk). Üç denemede işlenemeyen mesaj `… makbuzlu ret yazıldı` satırıyla kapanır ve telefonda "fabrikada işlenemedi" görünür.

Geri dönüş TEK AYAR: aynı uç `"false"` → `gelen kutusu işi durdu`; okuma (eşitleme) etkilenmez, teknik kullanıcı aktif ama girişsiz kalır. İşlenmiş kayıtlar silinmez (normal sipariş/müşteri kaydıdır; panelden iptal/pasif).

Bilinenler: telefondan gelen birim fiyat yok sayılır (fiyatı panelden girin). Benzer adlı müşteri varsa telefon kartı reddedilir — kısa adlarda (≤ 8 harf) eşik düşüktür ve gerçekten farklı bir firma da reddedilebilir; o kart panelden açılır.

## Ölçülen süreler (yerel prova, ~23,5 bin top)
- Migration SQL'i < 1 sn (89–169 ms + 9–17 ms; süreç dahil 1,0–1,8 sn); en uzun tablo kilidi ≈ 91 ms (yüklü makinede 129 ms).
- Asıl süre yedek + backend'i durdurup başlatmaktır.
- D8 provası (2026-11-11 yedeğinin kopyası, macOS, yüklü makine): `pg_dump -Fc` 4,5 sn / 29,9 MB · `migrate deploy` 2,5 sn (SQL 219 + 31 ms) · backend açılışı 1,1–1,6 sn; açılışta yazılan tek satır `STARTUP` audit kaydı (eski sürümle aynı). Fabrika sunucusundaki süre ayrıca `npm ci`ye ve pm2'ye bağlıdır. Eski ↔ yeni karşılaştırma betiği: `Teks-Erp/scripts/prova_eski_yeni_karsilastirma.mjs`.
- Kapalıyken yazma maliyeti: tetikleyici 0; fark yalnız yeni filigran indeksi bakımı (5000 topluk toplu güncelleme 398 → 414 ms).
