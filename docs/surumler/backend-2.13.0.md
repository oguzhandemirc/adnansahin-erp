# Backend `2.13.0`

**Paket:** `(paketleme yazar)`
**SHA256:** `(paketleme yazar)`
**Commit:** `(paketleme yazar)`
**İçerik:** 2.12.4 paketinin bütün içeriği + platformlar arası bildirimin fabrika çekirdeği (olay defteri, kişi başına teslim, atama tabloları, üretici kancası, okuma uçları) ve bildirim atama yönetimi (iki yeni izin, atama/şablon/tercih uçları) + patron bulutuna bildirim köprüsü (teslimler buluta, okundu iki yönde). Bildirim üretimi şalteri `notifications.enabled` varsayılan KAPALI.
**Önceki saha sürümü:** **2.12.4** (kuran, kurulumdan önce `/health` ve `app\PAKET.json` ile 2.12.4 olduğunu ÖLÇER — farklıysa DUR).

Paketleme **`-Surum 2.13.0`** ile koşulur.

## 1. Özet

Bir ekleyici migration'lı küçük sürüm. Fabrika bildirimi TEK yerde üretir: sipariş, iş emri ve sevkiyat
oluşturulduğunda (hangi yüzeyden olursa olsun) atanmış ve veri izni olan kişilere teslim satırı doğar; işi yapan
kendi bildirimini almaz. Şalter kapalıyken (varsayılan) hiçbir bildirim satırı doğmaz, backend 2.12.4 ile aynı
davranır.

- Yeni tablolar: `notification_events` (tür, varlık, donmuş yazar adı, başlık, metin, rota; UNIQUE(kind, entityId)) ·
  `notification_deliveries` (kişi başına teslim + `readAt`; okundu bilgisinin tek otoritesi) ·
  `notification_assignments` (kişi × tür, `mutedByUser`) · `permission_template_notifications` (şablon × tür).
- Üretim noktası `AuditService.log` sonunda hata yutan kancadır (kullanıcı istisna onayı 2026-11-17): denetim satırı
  OKUNMAZ; tür ve metin durum tablosundan, yazar çağrının argümanından gelir. Kanca hatası fabrikanın yazmasını
  durdurmaz.
- İlk türler: `yeni-siparis`, `yeni-is-emri`, `yeni-sevk`.
- Okuma uçları `/api/bildirimler` (yalnız oturum): liste (cursor), tek okundu, tümü okundu.
- Şalter `notifications.enabled` YALNIZ süperadmin tarafından değiştirilir (`patronCloud.*` şalterleriyle aynı sınıf).
- Bulut köprüsü (D4): teslimler imzalı `POST /v1/bildirimler` ile patron bulutuna gider (telefona push), panelde okunan
  buluta, telefonda okunan fabrikaya döner. Ayrı düğmesi yok: yalnız eşitleme ön koşulu AÇIK ∧ `notifications.enabled`
  AÇIK iken istek atılır; ikisinden biri kapalıysa sıfır dış istek.

Ölçüm (git, 2.12.4 `..` bu commit): yeni migration **2** (`20261117132248_bildirim_cekirdek`,
`20261117180000_bildirim_bulut_koprusu`; toplam **371**) · yeni bulut kanalı ucu **1** (`/v1/bildirimler`, fabrika istemci) ·
yeni HTTP ucu **11** (`/api/bildirimler` altında 3 + 3, `/api/bildirim-atamalari` altında 5; §2) · yeni izin kodu **2**
(`bildirim:yonet`, `bildirim:tercih`; migration'sız, boot uzlaştırması getirir, kimseye ATANMAZ) · yeni rol şablonu
**0** · yeni ayar anahtarı **1** (`notifications.enabled`) · yeni ortam değişkeni **0** · yeni npm paketi **0** ·
`client-version-policy.ts` değişmedi · `deploy/` altında backend kurulum betikleri değişmedi.

## 2. Ne değişti

- **Şema** (`prisma/schema.prisma`): dört model + `User` / `PermissionTemplate` ters ilişkileri.
- **Kanca** (`services/audit.service.ts`): `log()` sonunda `notifyAuditCall`; tek-satır `logMany` (içe aktarım) üretmez.
- **Bildirim servisleri** (`services/notifications/`): tür kataloğu `constants/notification-catalog.ts`; üretici,
  alıcı hesabı (atama ∧ aktif ∧ türün veri izni ∧ yazar değil ∧ tercih izni varsa kapatmamış; teknik ve yalnız-saha
  hesap almaz), şalter önbelleği, gelen kutusu servisi.
- **Uçlar** (`routes/notification.routes.ts`): `GET /api/bildirimler` · `POST /api/bildirimler/:id/okundu` ·
  `POST /api/bildirimler/tumu/okundu`.
- **Atama yönetimi (D2)** (`routes/notification-admin.routes.ts`, toplu kapı `bildirim:yonet`):
  `GET /api/bildirim-atamalari/kullanicilar` · `GET|PUT /api/bildirim-atamalari/kullanicilar/:userId` ·
  `GET /api/bildirim-atamalari/sablonlar` · `GET|PUT /api/bildirim-atamalari/sablonlar/:templateId`. Kişinin kendisi:
  `GET /api/bildirimler/katalog` · `GET /api/bildirimler/tercihler` · `PUT /api/bildirimler/tercihler` (`bildirim:tercih`).
  Şablon uygulaması (`PermissionManagementService.applyTemplate` ve `PUT /api/admin/users/:id/permissions` gövdesindeki
  isteğe bağlı `appliedTemplate {templateId, mode}`) bildirim setini de kopyalar; atama oturum düşürmez. Alan verilmezse
  izin ucu bugünkü gibi davranır (eski panel etkilenmez).
- **Ayar** (`services/system-setting.service.ts`): `SETTING_KEYS.NOTIFICATIONS_ENABLED` + `readNotificationsEnabled`;
  `constants/reserved-settings.ts` `SUPERADMIN_WRITE_SETTING_KEYS` kümesine eklendi.
- **Bulut köprüsü (D4)** (`jobs/cloud-notify.job.ts`, `services/notifications/cloud-bridge.service.ts`): eşitleme
  işleriyle birlikte başlar/durur (`jobs/patron-cloud.jobs.ts`); 30 sn'de bir + yeni teslim doğunca ≈1 sn içinde
  (üretici dürter, beklemez). Gönderir: son 2 saatte doğmuş, gitmemiş teslimler + panelde okunup bildirilmemiş
  okundular; yanıtta gelen telefon okumalarını `readAt`e yazar (yalnız boşsa) ve sonraki istekte teyit eder.
  Bulut hesabı olmayan alıcının teslimi de gider, bulut sayıp atlar. Eski bulut (404) → tek satır uyarı + 60 dk geri
  çekilme; hata → artan geri çekilme; hiçbir hata yazma yoluna sızmaz. Tel sözleşmesi `cloud-sync/wire/esitleme.ts`
  bulutla bayt-eşit güncellendi (mühür yenilendi).

## 3. Sözleşme

- **Kırıldı mı:** HAYIR — yalnız yeni uçlar ve yeni tablolar EKLENDİ; mevcut yanıtlar değişmedi.
- **Eski istemci ne yapar:**
  - **Panel 1.3.15–1.3.18 (masaüstü):** yeni uçları çağırmaz; etkilenmez.
  - **Tablet 1.0.14–1.0.22:** etkilenmez.
  - **Patron bulutu:** köprü ucunu bilmeyen eski bulut 404 döner → fabrika uyarı yazıp 60 dk geri çekilir; başka
    eşitleme etkilenmez. Yeni bulut ÖNCE kurulur (§5).
  - **Patron uygulaması:** eski uygulama yeni türleri (`yeni-is-emri`, `yeni-sevk`) ayar ekranında göstermez ama
    push'u alır.
- **Panel uyumluluğu:** panel **1.3.15–1.3.18**, tablet **1.0.14–1.0.22** ile uyumlu.
- **`minVersion` dokunuldu mu:** HAYIR.

## 4. Migration

- **Var mı:** EVET — `20261117132248_bildirim_cekirdek` + `20261117180000_bildirim_bulut_koprusu` (toplam **371**).
  Yalnız ekleyici: dört yeni tablo, index ve FK; `notification_deliveries`e iki boş damga kolonu + bir index (aynı
  sürümün yeni tablosu). Kuran `[7/9]`da "371 migrations found" + 2 migration uygulandığını görmelidir; farklı sayı =
  yanlış paket ya da yanlış DB → DUR.
- **Ne zaman:** bakım penceresinde; tablolar boş doğar, süre ihmal edilebilir.
- **Veri yazan adımlar:** yok.
- **Geri alınabilir mi:** kod EVET (`-GeriAl` 2.12.4 koduna döner; yeni tablolar boş kalır ve eski kod onları
  okumaz). Migration geri alınmaz (rollback = yedekten restore; gerekmez).

## 5. Kurulum notu

- **Beklenen kesinti:** ≈ 70–90 sn. Kesintiden ÖNCEKİ `[1/9]`–`[3/9]` (paket açma + yedek) ≈ 9 dk; bu sürede
  fabrika ÇALIŞIR.
- **KURULUM SIRASI:** bulut ÖNCE (bildirim köprüsü: bulut göçü `20261117170000_bildirim_koprusu` + `db-rolleri.ts`,
  `BILDIRIM_KAYNAGI` varsayılan `bulut` kalır) → bu backend → doğrulama (§7). Panel sürümü ayrı. Bulut önce
  kurulmazsa da zarar yok: köprü 404 alır ve geri çekilir.
- **Kurulum yöntemi:** 2.12.4 ile aynı — paket `C:\TeksERP\guncelleme\`e; paketin kendi `kur.ps1` + `uzaktan-kos.ps1`i
  çıkarılır, `C:\TeksERP\kur.ps1` onunla değiştirilir; SYSTEM görevi:
  `uzaktan-kos.ps1 -Betik C:\TeksERP\kur.ps1 -Argumanlar '-Kok C:\TeksERP -Paket {zip} -Zorla'`.
- **Bu sürüme özel:** `notifications.enabled` kurulumda AÇILMAZ (satır yok = kapalı). Açma ayrı karar ve yalnız
  süperadmin: `PUT /api/admin/settings/notifications.enabled` `{"value":"true"}`; geri dönüş aynı uç `"false"`.
  Kurulum `.env`e DOKUNMAZ.
- **Sınırlar (her sürümde geçerli):** `migrate reset`/reseed/DB drop YOK · uygulanmış migration'a dokunma ·
  postgres/node süreçlerini `Stop-Process` ile durdurma, `postgresql-tekserp` servisine dokunma ·
  `C:\TeksERP\pgsql\bin` JUNCTION'dır, recursive SİLİNMEZ · gece yedeği görevi çakışmamalı · elle koşumda
  `-GeriAl` ile `-Zorla` birlikte KULLANMA · başarısız kurulumu TEKRAR DENEME · hata → DUR, insana rapor et.

## 6. Geri alma

Uygulama sorununda: `kur.ps1 -GeriAl` bu kurulumun kenara aldığı `app.eski-*`i (2.12.4) geri koyar. Yeni tablolar
DB'de kalır; eski kod onlara dokunmaz. Şalter açılmışsa geri dönüşte bildirim üretimi kendiliğinden durur.

## 7. Doğrulama — kurulumdan sonra rapor edilecekler

- yeni sürüm + `pm2 ls` (online, restart sayısı, SYSTEM); `/health` → `UP/UP 2.13.0`
- `[7/9]`: "371 migrations found" + 2 uygulandı; `_prisma_migrations` 371 bitmiş / 0 sorunlu
- psql (salt okuma) — yeni tablolar boş ve şalter satırı yok:
  `SELECT (SELECT count(*) FROM notification_events) AS olay, (SELECT count(*) FROM notification_deliveries) AS teslim, (SELECT count(*) FROM system_settings WHERE key = 'notifications.enabled') AS salter;`
- backend log'unda (eşitleme açıksa) `bildirim köprüsü işi başladı`; şalter kapalıyken bulut günlüğünde
  `bildirim köprüsü` satırı YOK (sıfır istek)
- psql: `SELECT * FROM patron_sync_status();` → kurulumdan ÖNCEKİ değerle aynı
- kullanıcı / sipariş / top / çuval / sevkiyat sayıları kurulumdan öncekiyle aynı
- `.env` satır sayısı ve özeti kurulumdan öncekiyle aynı
- `backend-err-*.log` (en yenisi) — yeni hata yok
- panelde parolayla giriş + bir sipariş listesi açılışı; tabletten PIN ile giriş
- ölçülen kesinti
