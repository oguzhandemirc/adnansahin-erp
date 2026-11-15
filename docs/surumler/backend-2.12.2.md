# Backend `2.12.2`

**Paket:** `tekserp-backend-20261116_011623-b276031b.zip`
**SHA256:** `83733A5C0F7F29CB360F6FFDB19B2AAFBAE582BDB5A835477A27063A2FBF2B3E`
**Commit:** `b276031b`
**İçerik:** 2.12.1 paketinin (`c329dfac`) bütün içeriği + sonrasında `main`e gelenler: Etkili Destek uçları `/api/destek/*` (`1c4a2a5e`; varsayılan KAPALI) · tarayıcı panelinde destek sayfası, "Sorun bildir" ve okunmamış rozeti (`5dc94576`; destek kapalıyken görünmez) · üç statik bekçi düzeltmesi (`218c3910`; eşitleme kataloğundaki SQL metni yalnız biçim olarak değişti, sorgu aynı) · `DEVICE_REQUIRED` mesajı yol gösterici (bu sürümün commit'i).
**Önceki saha sürümü:** **2.12.1** (kuran, kurulumdan önce `/health` ve `app\PAKET.json` ile 2.12.1 olduğunu ÖLÇER — farklıysa DUR).

Paketleme **`-Surum 2.12.2`** ile koşulur.

## 1. Özet

Küçük, migration'sız sürüm. Yeni olan tek özellik **Etkili Destek** entegrasyonu: panel ve saha uygulaması destek
talebini fabrika backend'i üzerinden Etkili Destek merkezine iletir (giden HTTPS; fabrikaya gelen port açılmaz).
Özellik `.env`'deki iki satıra bağlıdır ve **kurulumdan sonra KAPALI gelir**: satırlar yokken `/api/destek/durum`
`{ etkin: false }` döner, diğer destek uçları 403 `MODULE_DISABLED`, hiçbir dış istek yapılmaz. Açma ayrı ve geri
dönüşlü bir adımdır (§5.1).

Sahada görünür tek değişiklik: tabletten çalışma oturumu açan/yöneten istekte cihaz sunucuda kayıtlı/onaylı değilse
dönen mesaj artık ne yapılacağını söyler — "Bu cihaz sunucuda kayıtlı görünmüyor. Uygulamayı kapatıp yeniden açın;
sorun sürerse yöneticinizden cihazı onaylamasını isteyin." HTTP durumu (400) ve `details.code` (`DEVICE_REQUIRED`) aynı.

Ölçüm (git, `c329dfac` = 2.12.1 `..` bu commit): yeni migration **0** (toplam **367**; `prisma/migrations` değişmedi) ·
yeni HTTP ucu **10** (`/api/destek/*`, hepsi oturum ister, izin kodu yok) · yeni izin kodu **0** · yeni rol şablonu **0** ·
yeni ayar anahtarı **0** · yeni npm paketi **0** (`package.json`da yalnız `version` satırı değişti) ·
`client-version-policy.ts` değişmedi · `deploy/kur.ps1` ve `deploy/uzaktan-kos.ps1` değişmedi.

## 2. Ne değişti

- **Etkili Destek uçları** (`src/routes/destek.routes.ts`, sözleşme `docs/ops/DESTEK-ENTEGRASYONU.md`): durum,
  talep aç / listele / ayrıntı, yanıt yaz, kapat, okundu, okunmamış rozeti, ek bağlantısı ve ek içeriği (vekil).
  Kimlik oturumdan kurulur; firma yöneticisi = `admin:settings` (ya da `*`/`admin:*`) veya sistem hesabı. Talepler
  merkezde durur, backend'de tablo YOK; talep açma/yanıt/kapatma `destek_talepleri` adıyla audit'e düşer (mesaj
  metni ve dosya audit'e girmez). API anahtarı log, hata gövdesi ve audit yükünde yer almaz.
- **Gövde sınırı:** `/api/destek` global 1 MB JSON katmanını atlar; yalnız ekli iki POST ucu kendi 70 MB sınırını
  taşır. Diğer bütün uçların sınırı aynı (1 MB; `/api/import`, `/api/config-bundle` eskisi gibi).
- **Hata mesajı:** `DEVICE_REQUIRED` (çalışma oturumu uçları) yeni metin (§1).
- **Pakette `dist-web` yeniden derlenir:** panel kodu 1.3.17 + destek sayfası (`5dc94576`); destek kapalıyken
  menüde destek girişi ve rozet yoklaması yoktur.

**Yeni ortam değişkenleri** (`.env`; ikisi de BOŞ = kapalı, kurulumda EKLENMEZ): `DESTEK_API_URL` ·
`DESTEK_API_KEY`. Kurumsal proxy varsa `HTTPS_PROXY`/`NO_PROXY` (patron bulutuyla aynı çıkış).

## 3. Sözleşme

- **Kırıldı mı:** HAYIR — yalnız yeni uçlar eklendi; mevcut uç, alan, enum ve izinler aynı. `DEVICE_REQUIRED`
  yanıtında yalnız `message` metni değişti; kod ve HTTP durumu aynı.
- **Eski istemci ne yapar:**
  - **Panel 1.3.15 / 1.3.17 (masaüstü):** destek ucunu hiç çağırmaz; değişmeden çalışır.
  - **Tablet 1.0.14 / 1.0.17:** destek ucunu çağırmaz. `DEVICE_REQUIRED` mesajını sunucudan gelen metin olarak
    gösterir (istemcide metin eşlemesi yok — grep 0); karar kodla verildiği için davranış aynı.
  - **Tarayıcı paneli:** bu paketle birlikte gelir (§2); destek kapalıyken eski ekranlarla aynı.
- **Panel uyumluluğu:** panel **1.3.15, 1.3.17**, tablet **1.0.14, 1.0.17** ile uyumlu.
- **`minVersion` dokunuldu mu:** HAYIR (`client-version-policy.ts` 2.11.7'den beri değişmedi).

## 4. Migration

- **Var mı:** HAYIR — `Teks-Erp/prisma/migrations` 2.12.1 paket commit'i `c329dfac`tan beri değişmedi (`git diff` boş).
- **Toplam migration:** **367**. Kuran `[7/9]`da "367 migrations found" + "No pending migrations to apply"
  görmelidir; farklı sayı ya da uygulanan migration = yanlış paket ya da yanlış DB → DUR.
- **Ne zaman:** —
- **Veri yazan adımlar:** yok.
- **Geri alınabilir mi:** şema değişmediği için `-GeriAl` tam geri dönüştür (§6).

## 5. Kurulum notu

- **Beklenen kesinti:** ≈ 70 sn (Windows provasında bu paketle ölçülen 67,6 ve 70,0 sn; migration yok). Kesintiden
  ÖNCEKİ `[1/9]`–`[3/9]` (paket açma + yedek) ≈ 9 dk, toplam ≈ 11 dk; bu sürede fabrika ÇALIŞIR ve ekranda `[1/9]`
  satırından başka çıktı olmayabilir — kesme.
- **Sıra:** bu backend (destek KAPALI) → doğrulama → destek açma ayrı adım (§5.1, isteğe bağlı) → saha/panel
  sürümleri ayrı onayla.
- **Kurulum yöntemi:** 2.12.1 ile aynı — paket `C:\TeksERP\guncelleme\`e; paketin kendi `kur.ps1` +
  `uzaktan-kos.ps1`i çıkarılır, `C:\TeksERP\kur.ps1` onunla değiştirilir; SYSTEM görevi:
  `uzaktan-kos.ps1 -Betik C:\TeksERP\kur.ps1 -Argumanlar '-Kok C:\TeksERP -Paket {zip} -Zorla'`.
- **Bu sürüme özel:** veri aracı yok; yeni ayar anahtarı yok; kurulum `.env`e DOKUNMAZ (patron bulutu satırları
  yerinde kalır). Patron bulutu eşitlemesi AÇIKKEN kurulur: `[4/9]`te backend durunca eşitleme işleri durur,
  tetikleyiciler DB'de açık kalır (fabrika yazmadığı için işaret birikmez); açılışta işler yeniden başlar.
- **Sınırlar (her sürümde geçerli):** `migrate reset`/reseed/DB drop YOK · uygulanmış migration'a dokunma ·
  postgres/node süreçlerini `Stop-Process` ile durdurma, `postgresql-tekserp` servisine dokunma ·
  `C:\TeksERP\pgsql\bin` JUNCTION'dır, recursive SİLİNMEZ · gece yedeği görevi çakışmamalı · elle koşumda
  `-GeriAl` ile `-Zorla` birlikte KULLANMA · başarısız kurulumu TEKRAR DENEME · hata → DUR, insana rapor et.

### 5.1 Destek açma (ayrı adım, kurulumdan sonra)

1. `.env`in yedeği kısıtlı klasöre alınır (`C:\TeksERP\patron-anahtar\env.yedek-{damga}` — `app\` içine DEĞİL).
2. `.env`in son iki baytı `13,10` mu bakılır (değilse önce boş satır).
3. İki satır eklenir: `DESTEK_API_URL={merkez adresi}` ve `DESTEK_API_KEY={anahtar}`. Anahtar ekrana ve komut
   satırına yazılmaz: geliştirme makinesinden SSH stdin'i ile aktarılır (reçete repo dışındaki prova belgesinde).
4. `pm2 restart` (yönetici SSH oturumundan, `PM2_HOME` ile).
5. Doğrulama: `GET /api/destek/durum` → `{ etkin: true, firmaYoneticisi: … }`; `GET /api/destek/okunmamis` ve
   `GET /api/destek/talepler` → 200 (merkeze salt okuma); log'da anahtar YOK.

**Kapatma:** iki satır silinir (ya da yedek `.env` geri konur) + `pm2 restart` → `durum` `{ etkin: false }`.
Merkez anahtarı reddederse istemci 502 `DESTEK_YAPILANDIRMA` görür; fabrikanın başka hiçbir yolu bu servise uğramaz.

## 6. Geri alma

Uygulama sorununda: `kur.ps1 -GeriAl` bu kurulumun kenara aldığı `app.eski-*`i (2.12.1) geri koyar. Şema aynı
olduğu için 2.12.1 kodu sorunsuz açılır; sondaki "DB migration'lari GERI ALINMADI" uyarısı BEKLENİR (uygulanan yok).
`.env`e destek satırları eklenmişse 2.12.1 onları okumaz (zararsız). Destek sorununda geri alma GEREKMEZ: §5.1
kapatma yeterli.

## 7. Doğrulama — kurulumdan sonra rapor edilecekler

- yeni sürüm + `pm2 ls` (online, restart sayısı, SYSTEM); `/health` → `UP/UP 2.12.2`
- `[7/9]`: "367 migrations found" + uygulanan yok; `_prisma_migrations` 367 bitmiş / 0 sorunlu
- psql: `SELECT * FROM patron_sync_status();` → kurulumdan ÖNCEKİ değerle aynı (canlıda `28 · 28 · 0`)
- kullanıcı / sipariş / top sayıları kurulumdan öncekiyle aynı
- `.env` satır sayısı ve özeti kurulumdan öncekiyle aynı
- `backend-err-*.log` (en yenisi) — yeni hata yok; açılış log'unda patron eşitlemesi işleri yeniden başladı
- oturumla `GET /api/destek/durum` → `{ etkin: false }`; `GET /api/destek/okunmamis` → 403 `MODULE_DISABLED`
- panelde parolayla giriş + sipariş listesi; tabletten PIN ile giriş + bir okutma
- ölçülen kesinti

**Windows provası (2026-11-16, ThinkPad'deki fabrika kopyası, 2.12.1 → bu paket; `.env`de fazladan satır + patron
bulutu satırları, tetikleyiciler AÇIK) — GEÇTİ:**
- Kurulum (`uzaktan-kos.ps1` + `kur.ps1 -Zorla`): 11 dk 7 sn, kesinti 67,6 sn; `[7/9]` "367 migrations found" +
  "No pending migrations to apply"; UP/UP 2.12.2, `_prisma_migrations` 367 / 0.
- Kullanıcı, sipariş, satır, top, müşteri, çuval, sevkiyat ve iş emri sayıları aynı; `patron_sync_status()` önce ve
  sonra `28·28·1`; `.env` SHA256 aynı (fazladan satır yerinde), ACL yalnız Administrators + SYSTEM; pm2 süreci SYSTEM.
- Kapalı hâl: `durum` 200 `{ etkin: false }`, diğer destek uçları 403 `MODULE_DISABLED`, sipariş/top listesi 200.
- Açma (§5.1, anahtar SSH stdin'i ile): restart'tan ≈ 10 sn sonra UP; `durum` `{ etkin: true, firmaYoneticisi: true }`
  (sistem hesabı), `okunmamis` ve `talepler` 200 (canlı merkeze salt okuma); günlüklerde anahtar 0. Talep açan/yazan
  uçlar çağrılmadı. Kapatma (yedek `.env` geri + restart) → `{ etkin: false }`.
- Geri alma (`-GeriAl -Zorla`): 24,6 sn, kesinti 11,1 sn, UP/UP 2.12.1, sayılar ve `.env` aynı. Yeniden kurulum:
  11 dk 5 sn, kesinti 70,0 sn, sonuçlar aynı.
- Sınır: patron bulutu kopyada yoktu (eşitleme işleri `EGRESS_NETWORK` yazdı); fabrikadan destek merkezine çıkış,
  gerçek panel/tablet ile duman testi ölçülmedi. Ayrıntı ve canlı reçetesi: repo dışı `PROVA-2.12.2-2026-11-16.md`.
