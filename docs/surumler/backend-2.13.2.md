# Backend `2.13.2`

**Paket:** `(paketleme yazar)`
**SHA256:** `(paketleme yazar)`
**Commit:** `(paketleme yazar)`
**İçerik:** 2.13.1 paketinin bütün içeriği + patron telefonuna giden çuval verisinde sevk partisi (ad · kod · durum), ambalaj no ve topların üretim parti no'su (kullanıcı isteği 2026-11-20). Panel kodunda değişiklik yok.
**Önceki saha sürümü:** **2.13.1** (kuran, kurulumdan önce `/health` ve `app\PAKET.json` ile 2.13.1 ve 371 migration olduğunu ÖLÇER — farklıysa DUR).

Paketleme **`-Surum 2.13.2`** ile koşulur.

## 1. Özet

Migration'sız küçük sürüm. Kullanıcı (2026-11-20): "çuvala özel ad mı, parti no mu veriyorlardı … onu da telefonda
görmemiz lazım; çuval ve çuvalın içeriği filtrelenebilir ve aranabilir olsun". Canlıda ölçülen (salt okuma):
`packing.groupMode = sevk-partisi`; 1879 çuvalın 1483'ü bir sevk partisinde (`PackingGroup`: operatörün verdiği ad ya da
sistemin `P-n`i, kalıcı kod `PRT-YYMM-NNNN`, OPEN/CLOSED) ve ambalaj no (`Sack.packageNo`) taşıyor; topların üretim
partisi ayrı (`Batch.batchNumber`, P54…P59). Bu sürüm üç alanı patron verisine EKLER (mevcut alanlar aynen):

- **`cuval-deposu` anlığı** (Çuvallar ekranı): çuval satırına `partiAdi` · `partiKodu` · `partiDurumu` (OPEN/CLOSED) ·
  `ambalajNo` · `depo` (depo adı); çuvaldaki top satırına `parti` (üretim parti no).
- **`sevkiyat-icerigi` KAYDI** (sevkiyat ayrıntısının çuvalları): çuval satırına `ambalajNo` + aynı üç parti alanı; top
  satırlarına (çuvaldaki ve çuvalsız) `parti`.
- **`cuval` KAYDI:** mevcut `partiId`/`ambalajNo` yanına `partiAdi` · `partiKodu` · `partiDurumu`.

Partisiz çuvalda parti alanları `null`. Üretim parti no YALNIZ gösterilir (benzersiz değildir; kimlik/sıra olarak
kullanılmaz). Sevk partisinin tek okuyucusu `cloud-sync/packing-lot-facts.ts`.

## 2. Ne değişti

- `src/cloud-sync/packing-lot-facts.ts` (yeni): `loadPackingLots` + `partiOf` — üç yüzeyin ortak okuyucusu.
- `src/cloud-sync/catalog-facts.ts`: `cuval` katalog 1 → 2 (üç türev + `packing_groups` kaynağı: parti yeniden
  adlandırılınca/kapanınca/açılınca partinin çuvalları yeniden gider); `sevkiyat-icerigi` 1 → 2 (`packing_groups`
  kaynağı: çuvalları o sevkiyatta olan içerikler yeniden gider).
- `src/cloud-sync/derived.ts` (`cuval` türeticisi), `shipment-content.ts` (çuval/top ek kolon okuması),
  `snapshot-cuval-deposu.ts` + `snapshot-schemas.ts` (katı tel şeması), `projections.ts` (dışlama gerekçesi).
- `package.json` sürüm 2.13.2. Bekçiler: `test_patron_bulut_sevkiyat_icerigi` §7, `test_patron_bulut_anliklar` §3c.

## 3. Sözleşme

- **Kırıldı mı:** HAYIR — yalnız alan EKLENDİ; uç, projeksiyon adı, izin, enum değişmedi.
- **Eski istemci ne yapar:** patron uygulamasının eski sürümü yeni alanları görmezden gelir; panel/tablet etkilenmez.
  Yeni uygulama alan yoksa (fabrika 2.13.1) parti sütununu boş veri yüzünden gizler, süzgeci çizmez.
- **`minVersion` dokunuldu mu:** HAYIR.

## 4. Migration

- **Var mı:** HAYIR (toplam **371**, 2.13.1 ile aynı). Kuran "371 migrations found" + "No pending migrations to apply"
  görmelidir; farklı sayı = yanlış paket ya da yanlış DB → DUR.
- **Ne zaman:** —
- **Veri yazan adımlar:** yok. Eşitleme tetikleyicileri değişmedi (`packing_groups` filigranı `updatedAt` ile okunur).
- **Geri alınabilir mi:** EVET — şema değişmediği için `-GeriAl` 2.13.1 koduna tam döner.

## 5. Kurulum notu

- **Beklenen kesinti:** ≈ 70 sn (migration yok).
- **KURULUM SIRASI:** bulut imajı GEREKMEZ, sıra serbest (yalnız fabrika). Ölçüldü 2026-11-20: yeni projeksiyon adı yok
  (bulut kataloğu `katalog-ozeti.json` yalnız ad/izin/saklama alanı taşır, alan listesi taşımaz), satırlar ve anlıklar
  bulutta şemasız jsonb; katalog sürümü artışını bulut zaten tanır (`KATALOG_SURUMU` → TAM ister, `sync-apply.ts`).
  `cuval` ve `sevkiyat` listelerinin bulut arama/süzgeç beyanı (`LIST_SEARCH`) bu alanlara dayanmaz; değişmedi.
- **Kurulum yöntemi:** 2.13.1 ile aynı (paketin kendi `kur.ps1` + `uzaktan-kos.ps1`i).
- **Bu sürüme özel:** yeni ayar anahtarı yok; `.env`e DOKUNMAZ.
- **İlk eşitleme turu:** iki katalog artışı (`cuval` 2, `sevkiyat-icerigi` 2) kurulumdan sonraki ilk turda bu iki
  projeksiyonu bir kez TAM gönderir. `sevkiyat-icerigi` ağır satırdır (birim 100 kök); TAM gönderim saklama penceresindeki
  sevkiyat sayısı kadar sürer — provada süre ölçülür.
- **Sınırlar (her sürümde geçerli):** `migrate reset`/reseed/DB drop YOK · uygulanmış migration'a dokunma ·
  postgres/node süreçlerini `Stop-Process` ile durdurma · `C:\TeksERP\pgsql\bin` JUNCTION'dır, recursive SİLİNMEZ ·
  `-GeriAl` ile `-Zorla` birlikte KULLANMA (elle, etkileşimli koşum) · başarısız kurulumu TEKRAR DENEME · hata → DUR, insana rapor et.

## 6. Geri alma

`kur.ps1 -GeriAl` 2.13.1'i geri koyar; uzaktan (görev üzerinden) koşumda onay sorusu asılı kaldığı için çalışan biçim
`-GeriAl -Zorla`dır (2.13.1 provasında ölçüldü). Geri dönüşte telefona parti alanları gelmez (uygulama sütunu gizler);
bulut eski satırları bir sonraki değişikliğe kadar yeni alanlarla saklar — zararsız.

## 7. Doğrulama — kurulumdan sonra rapor edilecekler

- yeni sürüm + `pm2 ls`; `/health` → `UP/UP 2.13.2`; 371 migration, bekleyen yok
- eşitleme turu log'unda `cuval` ve `sevkiyat-icerigi` TAM gönderiminin bittiği, hata satırı yok
- uygulamada Çuvallar ekranında Parti sütunu (ör. `DNZ-084`) ve Parti süzgeci; sevkiyat ayrıntısında çuvalın partisi
- `backend-err-*.log` (en yenisi) — yeni hata yok
- ölçülen kesinti
