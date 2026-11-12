# Patron bulutu · eşitleme · imza

Fabrika verisinin patron bulutuna (Adnan'a özel VDS) eşitlenmesi; bağlantıyı hep fabrika başlatır, her istek kurulum anahtarıyla imzalıdır. Kapsadığı kod: `Teks-Erp/src/cloud-sync/` (ön koşul, adres, istemci, tel sözleşmesi), `Teks-Erp/src/lib/cloud-signing/` (istek imzası, anahtar dosyası), `Teks-Erp/scripts/patron-bulut-anahtar.ts`; bulut tarafı `patron/`.

## Kurallar

- Kapatma düğmesi varsayılan KAPALI: eşitleme ancak `PATRON_CLOUD_URL` dolu ∧ `PATRON_CLOUD_KEY_FILE` geçerli anahtar ∧ kurulum kimliği var ∧ `patronCloud.syncEnabled` açıkken çalışır; tek karar yeri `cloud-sync/eligibility.ts`. [bekçi: test_patron_bulut_uygunluk]
- Kapalıyken dış istek de iş kaydı da yoktur; adres boşken anahtar dosyasına ve DB'ye bile dokunulmaz. [bekçi: test_patron_bulut_uygunluk]
- İmzalı istek bağlamı (`cloudContext`) yalnız açık ön koşuldan kurulur; ön koşulu atlayan ikinci bir gönderim yolu yazılmaz. [inceleme]
- Bulut istemcisi 60 sn zaman aşımı ve en fazla 2 tekrarla çalışır; yalnız ağ/zaman aşımı/5xx tekrar edilir, 4xx edilmez, saat düzeltmesi aynı bütçeden yer. [bekçi: test_patron_bulut_uygunluk]
- `src/lib/cloud-signing/` altındaki altı protokol dosyası ve `cloud-sync/wire/esitleme.ts` bulutla BAYT-EŞİTTİR; elle değiştirilmez, iki uç birlikte güncellenir ve mühür yenilenir. [bekçi: test_patron_bulut_imza]
- Özel anahtar yalnız 0600 dosyada durur; repoya, log'a, hata mesajına, audit yüküne girmez; izni geniş dosya açılmaz, var olan dosya ezilmez. [bekçi: test_patron_bulut_imza]
- Bulut hesap yapmaz: her türev sayıyı fabrika hesaplar, bulut yalnız saklar ve gösterir. [inceleme]
- Tetikleyici ya da eşitleme hatası fabrikanın yazmasını ASLA durdurmaz; hata eşitlemede kalır, fabrika işlemine yükselmez. [inceleme]

## Açma reçetesi (bakım penceresinde, kullanıcıya gösterilerek)

1. `.env`: `PATRON_CLOUD_URL=https://<bulut kökeni>` ve `PATRON_CLOUD_KEY_FILE=<mutlak yol>` (dosya veri dizininde, repoda değil).
2. `cd Teks-Erp && npx tsx scripts/patron-bulut-anahtar.ts` — dosya yoksa üretir (0600), varsa okur; `--kurulum=` ve `--acik-anahtar=` değerlerini basar, özel anahtarı basmaz. Bu iki değer bulutta `tesis.ts kurulum-kaydet`e verilir.
3. Ayar: `PUT /api/admin/settings/patronCloud.syncEnabled` `{"value":"true"}` (admin:settings + ayar şifresi); geri dönüş aynı ucu `"false"` ile çağırmaktır. Yoklama aralığı `patronCloud.syncIntervalMinutes` (1–60 dk, varsayılan 5; aralık dışı değer varsayılana düşer).

## Tuzaklar

- Windows'ta dosya izin bitleri NTFS ACL'yi yansıtmaz; orada 0600 denetimi atlanır ve koruma anahtar dizininin ACL'sidir.
- Kurulum kimliği keşif kimliğiyle aynıdır (`system.installationId`); boot işi üretir — araç onu yalnız okur, DB'ye yazmaz.

## Bekçiler

Backend: `test_patron_bulut_imza` · `test_patron_bulut_uygunluk` · `test_feature_flag_contract`

Kaynak (ana ürün `lib/license/protocol/`, `cloud-sync/`, `lib/http-egress.ts`), kaynak commit kimliği ve ana üründen farklar: arşiv notu 2026-11-12 "Patron bulutu D1".
