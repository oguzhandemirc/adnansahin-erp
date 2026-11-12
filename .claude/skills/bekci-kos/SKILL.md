---
name: bekci-kos
description: Bir değişiklikten sonra hangi bekçilerin (scripts/test_*.ts, vitest, jest) koşulacağını bulur ve koşturur; sonucu çıkış koduyla yorumlar. "testleri koş", "bekçileri çalıştır", "bu değişiklik neyi kırar" dendiğinde ve her kod değişikliğinin sonunda kullan.
---

# bekci-kos

Harita: `Teks-Erp/docs/BEKCI-HARITASI.md` (alan → dosya + ne ölçüyor). Her alan dosyasının (`docs/kurallar/<alan>.md`) sonunda o alanın bekçi listesi var.

## Adımlar

1. **Alanı belirle:** dokunduğun dosyalar hangi alana giriyor (servis/route/ekran adı → `docs/kurallar/README.md` tablosu). Birden çok alan olabilir.
2. **Listeyi çıkar:** alan dosyasının "Bekçiler" bölümü + haritada `grep -n "<servis-adı>" Teks-Erp/docs/BEKCI-HARITASI.md`.
3. **Veritabanını denetle:** DB isteyen bekçi yalnız oturumun KENDİ `_test` veritabanına yazar (yerel olmayan `DATABASE_URL`de koşucu durur). Bu klonda `.env` ve test DB'si yoktur; oturumun `_test` DB'si yoksa DB isteyen bekçi KOŞULAMAZ — uydurma, atlama gizleme: raporda "koşulamadı: DB yok" diye listele. Fabrika verisine ve başka repoların DB'sine ASLA bağlanma.
4. **Koş (backend):** `cd Teks-Erp && npx tsx scripts/run-all-tests.ts <ad-parçası>` — tek testte tip kapısı atlanır; birden çok test için ad parçalarını ayrı ayrı koş. Ağır koşum `node scripts/agir-is.mjs -- <komut>` ile. Tam paket (`npm test`) CI'da koşar, ajan koşmaz.
5. **Koş (istemci):** `cd Electron && npx vitest run <yol>` · `cd mobil && npx jest <yol>` (DB istemez).
6. **Hüküm ÇIKIŞ KODUNDAN:** `echo $?` — 0 geçti. Çıktıdaki "temiz" metnine değil koda bak (tsc boruda renkli basar). `=== Sonuç: N geçti, M başarısız, K atlandı ===` satırını raporla; atlanan kontrol yeşil sayılmaz.
7. **Kırmızı ise:** önce bekçinin ne ölçtüğünü oku (dosya başlığı); kırmızı üç şey olabilir — kod hatası · iş kararı bekleyen veri · bekçinin kör noktası. Bekçiyi daraltarak yeşile çekme.
8. **Yeni bekçi yazdıysan:** negatif sonda zorunlu — korunan davranışı bilerek boz, KIRMIZI verdiğini gör, geri al. Standart: `docs/standart/TEST-VE-DERLEME-BEKCI.md`, prosedür `docs/RECETELER.md` § bekçi.

## Kullanıcıya rapor
Koşulan dosyalar · çıkış kodları · kırmızıysa ilk hata satırı · DB yokluğundan koşulamayanlar. "Test koşmadım" ise açıkça söyle.
