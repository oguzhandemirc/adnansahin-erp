# Patron bulutu · eşitleme · imza

Fabrika verisinin patron bulutuna (Adnan'a özel VDS) eşitlenmesi; bağlantıyı hep fabrika başlatır, her istek kurulum anahtarıyla imzalıdır. Kapsadığı kod: `Teks-Erp/src/cloud-sync/` (ön koşul, adres, istemci, tel sözleşmesi), `Teks-Erp/src/lib/cloud-signing/` (istek imzası, anahtar dosyası), `Teks-Erp/scripts/patron-bulut-anahtar.ts`; bulut tarafı `patron/`.

## Kurallar

- Kapatma düğmesi varsayılan KAPALI: eşitleme ancak `PATRON_CLOUD_URL` dolu ∧ `PATRON_CLOUD_KEY_FILE` geçerli anahtar ∧ kurulum kimliği var ∧ `patronCloud.syncEnabled` açıkken çalışır; tek karar yeri `cloud-sync/eligibility.ts`. [bekçi: test_patron_bulut_uygunluk]
- Kapalıyken dış istek de iş kaydı da yoktur; ön koşul kararı adres boşken anahtar dosyasına ve DB'ye dokunmaz (açılış uzlaştırması yalnız tek salt-okuma `patron_sync_status()` yapar). [bekçi: test_patron_bulut_uygunluk]
- İmzalı istek bağlamı (`cloudContext`) yalnız açık ön koşuldan kurulur; ön koşulu atlayan ikinci bir gönderim yolu yazılmaz. [inceleme]
- Bulut istemcisi 60 sn zaman aşımı ve en fazla 2 tekrarla çalışır; yalnız ağ/zaman aşımı/5xx tekrar edilir, 4xx edilmez, saat düzeltmesi aynı bütçeden yer. [bekçi: test_patron_bulut_uygunluk]
- `src/lib/cloud-signing/` altındaki altı protokol dosyası ve `cloud-sync/wire/esitleme.ts` bulutla BAYT-EŞİTTİR; elle değiştirilmez, iki uç birlikte güncellenir ve mühür yenilenir. [bekçi: test_patron_bulut_imza]
- Özel anahtar yalnız 0600 dosyada durur; repoya, log'a, hata mesajına, audit yüküne girmez; izni geniş dosya açılmaz, var olan dosya ezilmez. [bekçi: test_patron_bulut_imza]
- Bulut hesap yapmaz: her türev sayıyı fabrika hesaplar, bulut yalnız saklar ve gösterir. [inceleme]
- Tetikleyici ya da eşitleme hatası fabrikanın yazmasını ASLA durdurmaz; her tetikleyici fonksiyonu `EXCEPTION WHEN OTHERS` ile sarılır ve yutulan hata `sync_mark_error_seq` sayacına düşer (`patron_sync_status().swallowed_errors`). [bekçi: test_db_invariants]
- Eşitleme migration'ı (`20260929152815_patron_bulut_esitleme`) backend DURMUŞKEN uygulanır; reçete `docs/ops/PATRON-ESITLEME-KURULUM.md`. [inceleme]
- Tetikleyiciler KAPALI doğar; açma/kapama yalnız `SELECT patron_sync_set_enabled(true|false)` ile yapılır, elle `ALTER TABLE … ENABLE TRIGGER` yazılmaz. [inceleme]
- Anahtar `LOCK TABLE … NOWAIT` kullanır; açık yazma ya da autovacuum varken 55P03 döner ve çağıran yeniden dener, `NOWAIT` kaldırılmaz. [bekçi: test_db_invariants]
- Eşitleme kataloğu (`cloud-sync/projections.ts` + `catalog-facts.ts`) finans alanı taşımaz: fiyat, tutar, döviz, bakiye kolonu ne tel adı ne kaynak olarak yazılır. [bekçi: test_patron_bulut_esitleme]
- Eşitleme işi yalnız ön koşul açıkken kurulur; kapalıyken zamanlayıcı yoktur ve iş hiçbir yoldan başlatılmaz. [bekçi: test_patron_bulut_esitleme]
- Ayar ↔ tetikleyici ↔ iş uzlaştırması tek yerdedir (`jobs/patron-cloud.jobs.ts`): açarken önce tetikleyiciler, başarırsa iş; kapatırken iş durur ve tetikleyiciler kapanır; açılışta ve her `patronCloud.*` ayar yazımında aynı uzlaştırma koşar. [bekçi: test_patron_bulut_esitleme]
- 55P03 tekrarı sınırlıdır (6 deneme, toplam ≈ 6 sn); Prisma sarmalının kendi kodu (`P2010`) PG kodu sayılmaz, içindeki kod okunur. [bekçi: test_patron_bulut_esitleme]
- Eşitleme hatası istek yolunu etkilemez: tık asla fırlatmaz, hata tek satır log + geri çekilmedir (aralık × 2^n, tavan 60 dk). [bekçi: test_patron_bulut_esitleme]
- Kirli-bayrak Proxy'si (ana üründeki `withDirtyTracking`) bilerek taşınmadı: değişiklik en geç bir yoklama aralığı sonra gider. [inceleme]

## Açma reçetesi (bakım penceresinde, kullanıcıya gösterilerek)

1. `.env`: `PATRON_CLOUD_URL=https://<bulut kökeni>` ve `PATRON_CLOUD_KEY_FILE=<mutlak yol>` (dosya veri dizininde, repoda değil).
2. `cd Teks-Erp && npx tsx scripts/patron-bulut-anahtar.ts` — dosya yoksa üretir (0600), varsa okur; `--kurulum=` ve `--acik-anahtar=` değerlerini basar, özel anahtarı basmaz. Bu iki değer bulutta `tesis.ts kurulum-kaydet --bitis=yok`a verilir (`yok` = süresiz hak; adımlar, bitiş notu ve ölçümler: `docs/ops/PATRON-ESITLEME-KURULUM.md` § 5).
3. Ayar: `PUT /api/admin/settings/patronCloud.syncEnabled` `{"value":"true"}` (admin:settings + ayar şifresi); geri dönüş aynı ucu `"false"` ile çağırmaktır. Yoklama aralığı `patronCloud.syncIntervalMinutes` (1–60 dk, varsayılan 5; aralık dışı değer varsayılana düşer).

## Tuzaklar

- Windows'ta dosya izin bitleri NTFS ACL'yi yansıtmaz; orada 0600 denetimi atlanır ve koruma anahtar dizininin ACL'sidir.
- Bulutta `kurulum-kaydet --bitis=yok` süresiz haktır (uzak tarih yazılır); NULL bitiş "hak dondu" demektir ve CLI onu yazmaz (bulut bekçisi `patron/sunucu/scripts/test_hizmet_sonu.ts` §1j–o).
- Kurulum kimliği keşif kimliğiyle aynıdır (`system.installationId`); boot işi üretir — araç onu yalnız okur, DB'ye yazmaz.

## Bekçiler

Backend: `test_patron_bulut_imza` · `test_patron_bulut_uygunluk` · `test_patron_bulut_esitleme` · `test_feature_flag_contract` · `test_db_invariants`

Gerçek veri provası bekçi değildir, yalnız yerel prova/test veritabanında koşar: `Teks-Erp/scripts/prova_patron_esitleme.ts` (28 tetikleyicinin kapalı doğması, hata yutma, anahtar davranışı, süreler).

Uçtan uca eşitleme ölçümü de bekçi değildir, yalnız yerel `_prova`/`_test` veritabanı ve `127.0.0.1` bulutuyla koşar: `Teks-Erp/scripts/olcum_patron_esitleme_uctan_uca.ts` (ilk TAM, sayım eşleşmesi, artımlı, bulut kapalı/açık, kapatma).

Kaynak (ana ürün `lib/license/protocol/`, `cloud-sync/`, `lib/http-egress.ts`), kaynak commit kimliği ve ana üründen farklar: arşiv notu 2026-11-12 "Patron bulutu D1".
