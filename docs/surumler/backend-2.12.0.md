# Backend `2.12.0`

**Paket:** `tekserp-backend-20261113_033538-ad19d317.zip`
**SHA256:** `0A73D1A006865138190004687FEC7CD948266DFEC87CEF153F0F856228C2761C`
**Commit:** `ad19d317`
**İçerik commit'leri:** `23c79311` (D1 imza + bulut istemcisi + kapatma düğmesi) · `e3a4990e` (D2 migration'lar) · `ce70d361`…`fbbde853` (D3a eşitleme turu) · `73064213`, `9747e7d7` (D3b anlıklar) · `f583e724` (D4 gelen kutusu) · `3c9345b6` (D5 rapor isteği) · `0b57a21d` (cari özeti verisi) · `08da6a4c` (Bağlı Cihazlar ucu + izin) · `087266f0` (fason anlığına top sayıları)
**Yeniden paketlendi (2026-11-13):** 2026-11-12 paketi (`…150506-bd801c2e`) hiçbir yere kurulmadan bayatladı; sürüm 2.12.0 kaldı, eski zip kenara alındı.
**Önceki saha sürümü:** **2.11.7** (kuran, kurulumdan önce `/health` ve `app\PAKET.json` ile 2.11.7 olduğunu ÖLÇER — farklıysa DUR).

Paketleme **`-Surum 2.12.0`** ile koşulur: bu repoda `backend-v*` etiketi yok, yama otomatiği `package.json`dan
sayar ve küçük hane artışını bilemez (küçük hane bir karardır).

## 1. Özet

Patron bulutu eşitlemesi (D1–D5) ve müşteri (cari) özeti verisi geldi. **Hepsi varsayılan KAPALI**: adres,
anahtar dosyası ve ayar açılmadıkça backend dışarıya istek atmaz, iş kaydı yazmaz, tetikleyiciler kapalı
kalır. Ek olarak Sistem → **Bağlı Cihazlar** için salt okuma ucu (`GET /api/sessions/active`) ve izni
(`system:sessions`) geldi. Mevcut panel/tablet akışlarında değişiklik YOK.

Ölçüm (git, `1eadbd75` birleşik 2.11.7 `..` bu commit): yeni migration **2** (toplam **365**) · yeni HTTP ucu
**1** (`GET /api/sessions/active`) · yeni izin kodu **1** (`system:sessions`) · yeni npm paketi **0** · `client-version-policy.ts` değişmedi · `deploy/kur.ps1` değişmedi.

## 2. Ne değişti

- **D1** istek imzası (Ed25519, kurulum anahtarı) + bulut istemcisi + kapatma düğmesi; tek karar yeri
  `cloud-sync/eligibility.ts` (adres ∧ geçerli anahtar ∧ kurulum kimliği ∧ `patronCloud.syncEnabled`).
- **D2** eşitleme defteri: `sync_marks`, `sync_watermarks`, `cloud_inbox_receipts` + 28 tetikleyici (KAPALI doğar).
- **D3a/D3b** eşitleme turu (13 projeksiyon) ve anlıklar; yalnız eşitleme işinde koşar.
- **D4** telefondan gelen sipariş/müşteri için gelen kutusu (`patronCloud.inboxEnabled`, ayrı ayar, KAPALI).
- **D5** buluttan gelen rapor isteğini tüketen iş.
- **Bağlı Cihazlar** (`08da6a4c`): `GET /api/sessions/active` — iptal edilmemiş ve süresi dolmamış oturumların
  kullanıcı/cihaz/uygulama sürümü listesi, salt okuma (`limit` 1–500, varsayılan 200; jti/token dönmez, cihaz
  kimliği yalnız ilk 8 hane). Kapı `admin:settings` YA DA yeni `system:sessions`; izin kataloğa ve Sistem
  Yöneticisi şablonuna eklendi, migration ile kimseye ATANMAZ (atama panelden). Ekran kataloğu: `system/sessions`.
- **Fason anlığı** (`087266f0`): `fason-acik` anlığına `acikTop` + `boyahanedeTop` ve firma başına `acikTop` +
  `kategoriler`; yalnız eşitleme işinde üretilir (eşitleme KAPALIYKEN koşmaz).
- **Cari özeti**: `iade` kaydı, sipariş `acik` bayrağı, müşteri başına özet anlığı (buluttaki
  `GET /api/cari-ozeti/:cariKartId` bunu okur).
- Patron hattı dışında dokunulanlar: `server.ts` (işleri başlat/durdur), `auth.service.ts` ve
  `permission-management.service.ts` (patron teknik kullanıcısı girişsiz ve listede gizli; kapalıyken yalnız
  tek ayar okuması, girişte ≈ +2 ms medyan), `system-setting.service.ts` (anahtar sabitleri), `reserved-settings.ts`.
- **Pakette `dist-web` (tarayıcı paneli) yeniden derlenir**: bu commit'teki panel kodu — müşteri kartında
  "Özet" sekmesi (yalnız mevcut uçları okur), widget'lı anasayfa panosu (mevcut rapor uçlarını okur) ve Sistem →
  Bağlı Cihazlar dahil — tarayıcı panelinde de görünür.

**Yeni ayar anahtarları** (yoksa varsayılan geçerli; hiçbiri migration ile yazılmaz):

| Anahtar | Varsayılan |
|---|---|
| `patronCloud.syncEnabled` | `false` |
| `patronCloud.syncIntervalMinutes` | `5` (1–60) |
| `patronCloud.inboxEnabled` | `false` |
| `patronCloud.inboxIntervalSeconds` | `30` (20–600) |
| `patronCloud.reportIntervalSeconds` | `30` (20–600) |

**Yeni ortam değişkenleri** (`.env`; ikisi de BOŞ = kapalı, kurulumda eklenmez):
`PATRON_CLOUD_URL` (bulut kökeni; boş ya da `kapali` = kapalı) · `PATRON_CLOUD_KEY_FILE` (anahtar dosyasının
mutlak yolu; veri dizininde, repoda değil).

## 3. Sözleşme

- **Kırıldı mı:** HAYIR — yalnız EKLEME: bir yeni uç + bir yeni izin; mevcut uçların alan adı/tipi, parametresi,
  enum ve izinleri aynı.
- **Eski istemci ne yapar:** değişmeden çalışır (yeni ucu çağırmaz; yeni iznin ataması panel 1.3.16'dan
  yapılır); D8 provasında `/api/client-policy/electron` ve `/mobile`
  yanıtları eski ve yeni backend'de aynı.
- **Panel uyumluluğu:** panel **1.3.15 ve 1.3.16**, tablet **1.0.14** ile uyumlu. 1.3.16'nın "Özet" sekmesi ve
  panosu yalnız mevcut uçları çağırır; **Bağlı Cihazlar** ekranı yeni ucu ister — panel 1.3.16 bu backend'den
  SONRA kurulur (2.11.7'ye karşı o ekran 404 alır).
- **`minVersion` dokunuldu mu:** HAYIR (`client-version-policy.ts` değişmedi).

## 4. Migration

- **Var mı:** EVET — 2 migration, yalnız EKLER (mevcut kolon/veri değişmez):
  `20260929152815_patron_bulut_esitleme` (2 tablo, 31 filigran indeksi, 28 tetikleyici — KAPALI doğar) ·
  `20260929180000_bulut_gelen_kutusu_makbuzu` (1 tablo).
- **Toplam migration:** **365** (2.11.7: 363). Kuran `[7/9]`da "365 migrations found" + **2** uygulanan
  migration görmelidir; farklı sayı = yanlış paket ya da yanlış DB → DUR.
- **Ne zaman:** backend DURMUŞKEN (`rolls`/`roll_movements` dahil 32 tabloya kısa ShareLock); `kur.ps1` sırası
  bunu sağlar. Reçete: `docs/ops/PATRON-ESITLEME-KURULUM.md`.
- **Veri yazan adımlar:** yok (yeni tablolar boş doğar; `sync_marks` 0 kalır).
- **Geri alınabilir mi:** migration GERİ ALINMAZ; ama eski paket yeni şemada çalışır (§6).

## 5. Kurulum notu

- **Beklenen kesinti:** ölçülen kısım < 5 sn (`migrate deploy` 2,5 sn + açılış ≈ 1,5 sn); asıl süre pm2
  durdur/başlat ve dosya taşıma — tahmini 1–3 dk (Windows'ta ÖLÇÜLMEDİ).
- **Sıra:** patron bulutu önce güncel (2026-11-13 kuruldu) → bu backend (eşitleme KAPALI) → panel 1.3.16
  (isteğe bağlı) → okuma ayrı bakım işiyle açılır → ≥ 1 hafta sonra yazma.
- **Kurulum yöntemi:** 2.11.7 ile aynı — paket `C:\TeksERP\guncelleme\`e; paketin kendi `kur.ps1` +
  `uzaktan-kos.ps1`i çıkarılır, `C:\TeksERP\kur.ps1` onunla değiştirilir; SYSTEM görevi:
  `uzaktan-kos.ps1 -Betik C:\TeksERP\kur.ps1 -Argumanlar '-Kok C:\TeksERP -Paket {zip} -Zorla'`.
- **Bu sürüme özel:** veri aracı yok; `.env`e yeni satır EKLENMEZ (eşitleme kapalı kalır).
- **Sınırlar (her sürümde geçerli):** `migrate reset`/reseed/DB drop YOK · uygulanmış migration'a dokunma ·
  postgres/node süreçlerini `Stop-Process` ile durdurma, `postgresql-tekserp` servisine dokunma ·
  `C:\TeksERP\pgsql\bin` JUNCTION'dır, recursive SİLİNMEZ · gece yedeği görevi çakışmamalı · elle koşumda
  `-GeriAl` ile `-Zorla` birlikte KULLANMA · başarısız kurulumu TEKRAR DENEME · hata → DUR, insana rapor et.

## 6. Geri alma

Uygulama sorununda: `kur.ps1 -GeriAl` bu kurulumun kenara aldığı `app.eski-*`i (2.11.7) geri koyar; şemaya
dokunulmaz. Sondaki "DB migration'lari GERI ALINMADI" uyarısı BEKLENİR. D8 provasında ölçüldü: eski kod yeni
şemada 1,57 sn'de açıldı, `migrate status` "up to date", salt okuma ve 6 adımlık yazma dizisi eski+eski ile
aynı. Şema sorununda: backend durdurulur, `[3/9]`un `premigrate_` yedeğinden geri yüklenir
(`docs/kurallar/surum-yayin.md` § Migration).

## 7. Doğrulama — kurulumdan sonra rapor edilecekler

- yeni sürüm + `pm2 jlist` (online, restart sayısı); `/health` → `UP/UP 2.12.0`
- `[7/9]`: 2 migration uygulandı; `_prisma_migrations` 365 bitmiş / 0 sorunlu
- psql: `SELECT * FROM patron_sync_status();` → `enabled_triggers = 0` · `total_triggers = 28` ·
  `swallowed_errors = 0`; `SELECT count(*) FROM sync_marks;` → 0
- `backend-err*.log` son satırlar — yeni hata var mı; açılış log'unda patron eşitlemesi için hata yok
- panelde top listesi + müşteri kartı; tabletten bir okutma (normal çalışma)
- tarayıcı panelinde (yönetici) Sistem → Bağlı Cihazlar açılır, en az kendi oturumunu listeler
- ölçülen kesinti

D8 provası (2026-11-12, 2026-11-11 yedeğinin kopyası): 301 GET çağrısının 301'inde HTTP durumu aynı; ortam ve
prova anı alanları maskelenince gövde farkı 0; yazma dizisinde fazladan yazılan tablo yok; performans farkı
gürültü düzeyinde. Sınır: `kur.ps1` ve pm2 Windows'ta koşulmadı; gerçek panel/tablet duman testi yapılmadı.
