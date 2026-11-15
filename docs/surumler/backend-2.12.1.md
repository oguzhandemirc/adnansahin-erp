# Backend `2.12.1`

**Paket:** _(paketleme doldurur)_
**SHA256:** _(paketleme doldurur)_
**Commit:** _(paketleme doldurur)_
**İçerik:** 2.12.0 paketinin (`d29ee21f`) bütün içeriği + sonrasında `main`e gelenler: parola politikası tek helper (`7fb2f37d`) · kısıtlı oturum + `POST /api/auth/change-password` (`ee086a4e`) · PIN/kart yalnız onaylı saha cihazından (`bbd4ebe9`) · süperadmin/admin PIN/kartla giremez (`6d5de827`) · IP kilit kovası düzeltmesi (`aba60bb7`) · `passwordPolicyVersion` (`9d611137`) · eşitleme/gelen kutusu anahtarını yalnız süperadmin çevirir (`9f6f5018`) · `patron:giris` izni + kullanıcı listesi işi (`38cc36a0`, `4a36e2a8`) · gelen kutusu yazar izni reddi (`c73a5a04`) · cihaz donanım özeti (`d5b3bb7e`, `9bdb7d12`) · "Patron (Yalnız Görme)" rol şablonu (`c295aafc`) · sipariş türevleri `toplamMiktar` + `uretim` (`2ac3d898`, `4c82f21f`) · "şimdi güncelle" isteği (`1ffa8792`) · zayıf parola zorlaması anahtarın arkasında, varsayılan KAPALI (`57094683`).
**2.12.0 hiç kurulmadı:** bu paket doğrudan **2.11.7**'nin üstüne kurulur; 2.12.0'ın 2 migration'ı ve bu sürümün 2 migration'ı aynı kurulumda uygulanır (toplam 4). 2.12.0 zip'leri KULLANILMAZ.
**Önceki saha sürümü:** **2.11.7** (kuran, kurulumdan önce `/health` ve `app\PAKET.json` ile 2.11.7 olduğunu ÖLÇER — farklıysa DUR).

Paketleme **`-Surum 2.12.1`** ile koşulur (yama hanesi `backend-v2.12.0` etiketinden de 2.12.1 çıkar; elle verilmesi
belgeyle paketin aynı sayıyı taşımasını garanti eder).

## 1. Özet

2.12.0'daki patron bulutu eşitlemesi (hepsi varsayılan KAPALI) ve Bağlı Cihazlar / stok top listesi uçlarına ek
olarak **parola ve giriş sıkılaştırması** geldi. Sahada görünür iki davranış değişikliği var, ikisi de bilinçli:

1. **Hızlı PIN ve QR kart girişi yalnız onaylı + aktif saha cihazından** (`x-device-id` → TABLET/PHONE, APPROVED).
   Panelden (electron/web) ya da cihaz başlıksız PIN → 403 `PIN_FIELD_ONLY`. Canlı veride son 60 günün 61 PIN
   girişinin 61'i onaylı TABLET kaydından geldi (ölçüm § Doğrulama).
2. **Süperadmin ve `admin:` izinli hesaplar PIN/kartla giremez** (tanınmayan PIN ile aynı 401). Canlı veride
   PIN'li 10 kullanıcıdan hiçbiri `admin:`/`*` izni taşımıyor; etkilenen tek hesap PIN'i olan sistem hesabı
   (son 60 günde PIN girişi 0; kart girişi fabrikada kapalı).

Yeni parola yazımları (kullanıcı oluşturma, şifre sıfırlama, kendi parolasını değiştirme) yeni kurala uymak
zorunda (≥ 10 karakter, bilinen/dizi/kullanıcı adı tabanlı parola yok; ret 400 `PASSWORD_POLICY`). **Mevcut
parolalar çalışmaya devam eder:** `auth.enforceStrongPasswordOnLogin` varsayılan KAPALI — kapalıyken zayıf
parolayla giriş 2.11.7 ile birebir (tam token, `passwordChangeRequired` yok).

Ölçüm (git, `da96f611` = 2.11.7 `..` bu commit): yeni migration **4** (toplam **367**) · yeni HTTP ucu **3**
(`GET /api/sessions/active`, `GET /api/reports/inventory/scorecard/kalem/toplar`, `POST /api/auth/change-password`) ·
yeni izin kodu **2** (`system:sessions`, `patron:giris`) · yeni rol şablonu **1** (`WEB_BOSS_READONLY`) · yeni npm
paketi **0** (`package.json`da yalnız `version` satırı değişti) · `client-version-policy.ts` değişmedi ·
`deploy/kur.ps1` ve `deploy/uzaktan-kos.ps1` değişmedi.

## 2. Ne değişti

**2.12.0'dan gelenler** (ayrıntı `docs/surumler/backend-2.12.0.md` §2): patron bulutu D1–D5 (KAPALI), cari özeti
verisi, `GET /api/sessions/active` + `system:sessions`, stok kalem/top listesi ucu, fason/iş emri anlıkları.

**2.12.0'dan sonra:**
- **Parola politikası tek helper** (`helpers/password-policy.helper.ts`): parola yazan her yol aynı kuralı
  uygular; route Zod'u eşik taşımaz (`min(6)` → `min(1).max(200)`; kural serviste). Her yeni parola
  `passwordPolicyVersion` ile yazılır (istemci yazamaz).
- **Kendi parolasını değiştirme:** `POST /api/auth/change-password` (eski parola ister, yanlışsa 400
  `CURRENT_PASSWORD_INVALID`; başarıda `tokenVersion++`, bütün oturumlar düşer, yeni tam token döner).
- **Kısıtlı oturum (anahtarın arkasında):** `auth.enforceStrongPasswordOnLogin` AÇIKKEN zayıf parolayla masaüstü
  girişi yalnız parola değiştirme kapsamlı token alır; sahada token yalnız `mobile:*`. KAPALIYKEN (varsayılan)
  hiçbir giriş daralmaz.
- **PIN/kart saha cihazı kapısı** ve **ayrıcalıklı hesap PIN/kart reddi** (§1).
- **IP kilit kovası** (Y4): başarılı giriş geniş (IP) kovayı artık SIFIRLAMAZ; yalnız o kimliğin kendi hataları
  düşülür. Etki: aynı IP'den çok sayıda yanlış deneme olursa kova süre dolana kadar dolu kalır.
- **Eşitleme/gelen kutusu anahtarı** (`patronCloud.syncEnabled`, `patronCloud.inboxEnabled`) yalnız sistem hesabı
  (süperadmin) oturumundan çevrilir; diğerleri 403 `SUPERADMIN_ONLY`.
- **Patron hattı (yalnız eşitleme işinde koşar, KAPALIYKEN etkisiz):** `patron:giris` izni (kimseye atanmaz,
  "Admin (Tam Yetki)" de taşımaz) + buluta kullanıcı listesi işi · gelen kutusu, yazarı fabrika iznini kaybetmiş
  telefon kaydını reddeder · sipariş anlığına `toplamMiktar` ve `uretim` (katalog v4) · telefondan "şimdi güncelle".
- **Cihaz donanım özeti:** `announce` gövdesinde isteğe bağlı `hw` alanı (biçimsiz → yok sayılır, 400 değil);
  `devices.hwDigest`/`hwSource` kolonları. Yeniden kurulan uygulamayı eski kaydına bağlama
  `device.autoReattachKnownHardware` arkasında, varsayılan KAPALI. Masaüstü okunamayan yerel kimliği ezmez.
- **Rol şablonu** "Patron (Yalnız Görme)" (`WEB_BOSS_READONLY`): açılış uzlaştırması şablon kataloğuna yazar,
  kimseye UYGULANMAZ.
- **Pakette `dist-web` (tarayıcı paneli) yeniden derlenir:** bu commit'teki panel kodu = panel **1.3.17**
  (üst çubukta "Parolamı değiştir", kısıtlı giriş adımı, Genel Ayarlar'da iki yeni anahtar) + 1.3.16 ekranları.

**Yeni ayar anahtarları** (yoksa varsayılan geçerli; hiçbiri migration ile yazılmaz):

| Anahtar | Varsayılan |
|---|---|
| `patronCloud.syncEnabled` | `false` (yalnız süperadmin çevirir) |
| `patronCloud.syncIntervalMinutes` | `5` (1–60) |
| `patronCloud.inboxEnabled` | `false` (yalnız süperadmin çevirir) |
| `patronCloud.inboxIntervalSeconds` | `30` (20–600) |
| `patronCloud.reportIntervalSeconds` | `30` (20–600) |
| `auth.enforceStrongPasswordOnLogin` | `false` (kapalıyken giriş 2.11.7 ile aynı) |
| `device.autoReattachKnownHardware` | `false` |

**Yeni ortam değişkenleri** (`.env`; ikisi de BOŞ = kapalı, kurulumda eklenmez): `PATRON_CLOUD_URL` ·
`PATRON_CLOUD_KEY_FILE`.

## 3. Sözleşme

- **Kırıldı mı:** HAYIR (uç kaldırılmadı, alan adı/tipi, enum ve mevcut izinler aynı) — ama iki bilinçli
  davranış daralması var: panel/cihazsız istemciden PIN/kart → 403 `PIN_FIELD_ONLY`/`CARD_FIELD_ONLY`;
  ayrıcalıklı hesap PIN/kart → 401. Yeni parola yazımı kurala uymazsa 400 `PASSWORD_POLICY` (eskiden ≥ 6 karakter
  yetiyordu).
- **Eski istemci ne yapar:**
  - **Panel 1.3.15 / 1.3.16:** değişmeden çalışır. Panel PIN/kart ucunu hiç çağırmaz (Electron'da grep 0);
    `auth.enforceStrongPasswordOnLogin` kapalıyken `passwordChangeRequired` hiç dönmez, yani eski panelin
    tanımadığı kısıtlı oturum oluşmaz. Kullanıcı oluşturma/şifre sıfırlamada kısa parola artık sunucudan 400
    `PASSWORD_POLICY` + Türkçe neden alır (panel ön denetimi 6 karakter; mesaj sunucudan gelir).
    **Anahtarı 1.3.17 yaygınlaşmadan AÇMA:** açıkken zayıf parolalı kullanıcı eski panelde izinsiz oturuma düşer.
  - **Tablet 1.0.12 / 1.0.14:** her istekte `x-device-id` gönderir ve açılışta `announce` eder (1.0.8'den beri);
    eşleştirme kapalıyken kayıt APPROVED/TABLET doğar → PIN girişi geçer. `hw` alanı göndermez → isteğe bağlı,
    yok sayılır.
  - Sahada son 14 günde görülen eski paneller (1.3.7, 1.3.8, 1.3.10) için de aynı: yeni uç çağırmazlar, PIN
    kullanmazlar; `minVersion` değişmediği için kilitlenmezler.
- **Panel uyumluluğu:** panel **1.3.15, 1.3.16**, tablet **1.0.12, 1.0.14** ile uyumlu. 1.3.16'nın Bağlı Cihazlar /
  "Kalem ve top" ekranları ve 1.3.17'nin parola adımı bu backend'den SONRA kurulur.
- **`minVersion` dokunuldu mu:** HAYIR (`client-version-policy.ts` 2.11.7'den beri değişmedi).

## 4. Migration

- **Var mı:** EVET — 4 migration (2.12.0'ın 2'si + 2 yeni), hepsi yalnız EKLER, veri dönüştürmez:
  - `20260929152815_patron_bulut_esitleme` (2 tablo, 31 filigran indeksi, 28 tetikleyici — KAPALI doğar)
  - `20260929180000_bulut_gelen_kutusu_makbuzu` (1 tablo)
  - `20261113121837_user_password_policy_version` (`users.passwordPolicyVersion INTEGER NOT NULL DEFAULT 0`;
    PG 11+ varsayılanlı ADD COLUMN tabloyu yeniden yazmaz; mevcut satırlar 0)
  - `20261113153958_cihaz_donanim_ozeti` (`devices.hwDigest`, `hwSource` NULL kolon + `devices_hwDigest_key` UNIQUE indeks)
- **Toplam migration:** **367** (2.11.7: 363). Kuran `[7/9]`da "367 migrations found" + **4** uygulanan migration
  görmelidir; farklı sayı = yanlış paket ya da yanlış DB → DUR.
- **Ne zaman:** backend DURMUŞKEN (`kur.ps1` sırası bunu sağlar); `rolls`/`roll_movements` dahil 32 tabloya kısa
  ShareLock (tetikleyici kurulumu), `users` ve `devices`e kısa AccessExclusive (ADD COLUMN / indeks). Reçete:
  `docs/ops/PATRON-ESITLEME-KURULUM.md`.
- **Veri yazan adımlar:** yok (yeni tablolar boş, yeni kolonlar varsayılan/NULL).
- **Geri alınabilir mi:** migration GERİ ALINMAZ; ama eski paket (2.11.7) yeni şemada çalışır (§6).

## 5. Kurulum notu

- **Beklenen kesinti:** ölçülen kısım < 5 sn (migration + açılış, § Doğrulama); asıl süre pm2 durdur/başlat ve
  dosya taşıma — tahmini 1–3 dk (Windows'ta ÖLÇÜLMEDİ).
- **Sıra:** patron bulutu ayakta → bu backend (eşitleme KAPALI) → panel 1.3.17 / tablet 1.0.17 (isteğe bağlı,
  ayrı onayla) → okuma ayrı bakım işiyle açılır → ≥ 1 hafta sonra yazma.
- **Kurulum yöntemi:** 2.11.7 ile aynı — paket `C:\TeksERP\guncelleme\`e; paketin kendi `kur.ps1` +
  `uzaktan-kos.ps1`i çıkarılır, `C:\TeksERP\kur.ps1` onunla değiştirilir; SYSTEM görevi:
  `uzaktan-kos.ps1 -Betik C:\TeksERP\kur.ps1 -Argumanlar '-Kok C:\TeksERP -Paket {zip} -Zorla'`.
- **Bu sürüme özel:** veri aracı yok; `.env`e yeni satır EKLENMEZ; yeni ayar anahtarı YAZILMAZ (hepsi kapalı
  varsayılanla gelir). Kurulumdan sonra tabletten bir PIN girişi denenir (saha cihazı kapısı).
- **Sınırlar (her sürümde geçerli):** `migrate reset`/reseed/DB drop YOK · uygulanmış migration'a dokunma ·
  postgres/node süreçlerini `Stop-Process` ile durdurma, `postgresql-tekserp` servisine dokunma ·
  `C:\TeksERP\pgsql\bin` JUNCTION'dır, recursive SİLİNMEZ · gece yedeği görevi çakışmamalı · elle koşumda
  `-GeriAl` ile `-Zorla` birlikte KULLANMA · başarısız kurulumu TEKRAR DENEME · hata → DUR, insana rapor et.

## 6. Geri alma

Uygulama sorununda: `kur.ps1 -GeriAl` bu kurulumun kenara aldığı `app.eski-*`i (2.11.7) geri koyar; şemaya
dokunulmaz. Sondaki "DB migration'lari GERI ALINMADI" uyarısı BEKLENİR. 2.11.7 kodu yeni şemada çalışır: yeni
kolonlar varsayılanlı/NULL'dur ve eski kod onları yazmaz (eski kodla yazılan parola `passwordPolicyVersion` 0
kalır = "buluta gitmez", güvenli yön). Şema sorununda: backend durdurulur, `[3/9]`un `premigrate_` yedeğinden
geri yüklenir (`docs/kurallar/surum-yayin.md` § Migration).

## 7. Doğrulama — kurulumdan sonra rapor edilecekler

- yeni sürüm + `pm2 jlist` (online, restart sayısı); `/health` → `UP/UP 2.12.1`
- `[7/9]`: 4 migration uygulandı; `_prisma_migrations` 367 bitmiş / 0 sorunlu
- psql: `SELECT * FROM patron_sync_status();` → `enabled_triggers = 0` · `total_triggers = 28` ·
  `swallowed_errors = 0`; `SELECT count(*) FROM sync_marks;` → 0
- psql: `SELECT count(*), count(*) FILTER (WHERE "passwordPolicyVersion" = 0) FROM users;` → iki sayı eşit,
  kurulumdan önceki kullanıcı sayısıyla aynı
- psql: `SELECT code FROM permissions WHERE code IN ('system:sessions','patron:giris') ORDER BY 1;` → 2 satır
  (açılış uzlaştırması getirir; kimseye ATANMAZ)
- `backend-err*.log` son satırlar — yeni hata var mı; açılış log'unda patron eşitlemesi için hata yok
- panelde (1.3.15/1.3.16) parolayla giriş + top listesi + müşteri kartı; **tabletten PIN ile giriş** + bir okutma
- tarayıcı panelinde (yönetici) Sistem → Bağlı Cihazlar açılır, en az kendi oturumunu listeler
- ölçülen kesinti
