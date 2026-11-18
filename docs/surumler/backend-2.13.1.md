# Backend `2.13.1`

**Paket:** `(paketleme yazar)`
**SHA256:** `(paketleme yazar)`
**Commit:** `(paketleme yazar)`
**İçerik:** 2.13.0 paketinin bütün içeriği + bildirim metinlerinde miktar (saha kusuru 2026-11-18). Panel kodunda değişiklik yok.
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
- **KURULUM SIRASI:** serbest — bulut ve patron uygulamasıyla sıra bağı yok (yalnız metin içeriği değişti).
- **Kurulum yöntemi:** 2.13.0 ile aynı (paketin kendi `kur.ps1` + `uzaktan-kos.ps1`i).
- **Bu sürüme özel:** yeni ayar anahtarı yok; `.env`e DOKUNMAZ; `notifications.enabled` değeri korunur.
- **Sınırlar (her sürümde geçerli):** `migrate reset`/reseed/DB drop YOK · uygulanmış migration'a dokunma ·
  postgres/node süreçlerini `Stop-Process` ile durdurma · `C:\TeksERP\pgsql\bin` JUNCTION'dır, recursive SİLİNMEZ ·
  `-GeriAl` ile `-Zorla` birlikte KULLANMA · başarısız kurulumu TEKRAR DENEME · hata → DUR, insana rapor et.

## 6. Geri alma

`kur.ps1 -GeriAl` 2.13.0'ı geri koyar; bildirim metinleri yeniden miktarsız olur, başka fark yok.

## 7. Doğrulama — kurulumdan sonra rapor edilecekler

- yeni sürüm + `pm2 ls`; `/health` → `UP/UP 2.13.1`; 371 migration, bekleyen yok
- panelden deneme siparişi gerekmez: bir sonraki gerçek siparişin bildirim metninde `· 1.203 m` biçiminde toplam (psql salt okuma:
  `SELECT body FROM notification_events ORDER BY "createdAt" DESC LIMIT 3;`)
- `backend-err-*.log` (en yenisi) — yeni hata yok
- ölçülen kesinti
