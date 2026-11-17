# Backend `2.12.4`

**Paket:** `(paketleme yazar)`
**SHA256:** `(paketleme yazar)`
**Commit:** `(paketleme yazar)`
**İçerik:** 2.12.3 paketinin (`2bdae04a`) bütün içeriği + patron Stok ekranı için "top kimin, nerede" alanları (`stok-kalem` anlığı: etiket müşterisi · çuval no · çuval carisi; çuvaldaki bitmiş toplar ayrı dizi + sayısı/metresi) + patron "Çuvallar" ekranı için yeni `cuval-deposu` anlığı. Panel kodunda değişiklik yok (2.12.3'ten bu yana `Electron/src` altında yalnız `surum-notlari.json` kopyası değişti; `dist-web` yine yeniden derlenir).
**Önceki saha sürümü:** **2.12.3** (kuran, kurulumdan önce `/health` ve `app\PAKET.json` ile 2.12.3 olduğunu ÖLÇER — farklıysa DUR).

Paketleme **`-Surum 2.12.4`** ile koşulur.

## 1. Özet

Migration'sız, yalnız okuma yapan küçük sürüm. İki iş: patron uygulamasının Stok › "Top bazında" görünümü bitmiş
topun KİME ait ve NEREDE olduğunu gösterebilsin; patron uygulamasının yeni SALT İZLEME "Çuvallar" ekranı
sevk edilmemiş çuvalları (kimin kaç çuvalı, çuvalda ne var) görebilsin.

- Her topa (raf + çuval) üç alan: **etiket müşterisi** (`Roll.labelCustomerId → Customer.name`; basılmış etiketin
  izi — emanet `ownerCustomerId` ve iş emri müşterisi KULLANILMAZ) · **çuval no** (`Roll.sackId → Sack.sackNo`) ·
  **çuval carisi** (`Sack.customerId → Customer.name`).
- Çuvaldaki bitmiş toplar (çuvala girmiş, kamyona çıkmamış `WAREHOUSE`/`A1_STOCK`; sevkiyata atanmış çuval dahil)
  raf listesine KARIŞMAZ: `bitmis.cuvaldakiToplar` ayrı dizisi + fabrikanın saydığı `cuvaldaTop`/`cuvaldaMetre`.
  Raf rakamları (stok karnesi, kalem satırları, ölü stok, serbest stok) DEĞİŞMEZ.
- Yeni ANLIK **`cuval-deposu`** (izin `bulut:sevkiyat:oku`): panelin Paketleme/Çuvallar ekranının varsayılan kapsamı
  (`resolveScopeOr()` = havuzdaki + PLANNED sevkiyata atanmış çuval; DISPATCHED gelmez), çuval başına top/metre
  panel listesiyle aynı `loadSackContentTotals`, içerik `PRESENT_ROLL_WHERE`. Özet (çuval · top · metre · brüt kg ·
  tartılı çuval · sevke atanan) ve cari dökümü FABRİKADA toplanır.

Ölçüm (git, `2bdae04a` = 2.12.3 `..` bu commit): yeni migration **0** (toplam **369**) · yeni HTTP ucu **0** · yeni
izin kodu **0** · yeni rol şablonu **0** · yeni ayar anahtarı **0** · yeni ortam değişkeni **0** · yeni npm paketi
**0** (`package.json`da yalnız `version`) · `client-version-policy.ts` değişmedi · `deploy/` altında backend kurulum
betikleri (`kur.ps1`, `uzaktan-kos.ps1`) değişmedi.

## 2. Ne değişti

- **Rapor servisi** (`services/reports/stock-scorecard.report.service.ts`): raf okuması ortak `loadCells`e alındı,
  `loadShelfCells` süzgeci AYNEN korundu; yeni `loadSackedFinishedCells` (bitmiş + `sackId` dolu).
  `loadShelfRollExtras` sorgusuna üç LEFT JOIN (`customers` ×2, `sacks`).
- **Kalem servisi** (`services/reports/stock-kalem.report.service.ts`): top satırına `labelCustomerName`, `sackNo`,
  `sackCustomerName` (panelin `GET /api/reports/inventory/scorecard/kalem/toplar` yanıtına da ek alan olarak düşer — panel okumaz);
  yeni `getSackedFinishedRolls` (sayı · metre · toplar, kalemin görünen alanlarıyla).
- **Patron anlığı** (`cloud-sync/snapshot-stok-kalem.ts`, katı şema `snapshot-schemas.ts`): top alanları
  `etiketMusteri` · `cuvalNo` · `cuvalCari`; bitmiş bölüme `cuvaldaTop` · `cuvaldaMetre` · `cuvaldakiToplar`
  (her eleman top alanları + `urun` · `en` · `renk` · `kat`).
- **Yeni anlık** `cloud-sync/snapshot-cuval-deposu.ts` (`buildSackDepotData`; katı şema `cuval-deposu`, projeksiyon
  listesi `projections.ts`, yönlendirme `snapshots.ts`). Tel: `ozet{cuval,top,metre,kg|null,tartiliCuval,sevkeAtanan}` ·
  `cariler[{cariKartId|null,ad,cuval,top,metre,kg|null}]` · `cuvallar[{id,cuvalNo,cariKartId,cari,sube,durum
  DEPODA|SEVKE_ATANDI,sevkiyatNo,kg,top,metre,olusturulma,toplar[{id,topNo,urun,renk,en,kat,kalite,metre,kg,
  etiketMusteri,etiketFarkli}]}]`. Finans alanı yok. `services/sack-search.service.ts`te `resolveScopeOr` yalnız
  `export` edildi (davranış aynı).
- **Pakette `dist-web` yeniden derlenir:** panel kodu 2.12.3 paketindekiyle aynı.

## 3. Sözleşme

- **Kırıldı mı:** HAYIR — `stok-kalem`e yalnız alan EKLENDİ (anlık içerik bulutta opak saklanır) ve yeni anlık
  `cuval-deposu` EKLENDİ. Yeni anlığın adı bulut kataloğunda olmalıdır (`patron/sunucu/src/catalog/projections.ts`,
  `katalog-ozeti.json`): **ÖNCE bulut kataloğu, SONRA fabrika.** Ters sırada eski bulut bilinmeyen `cuval-deposu`
  girdisini reddeder: tur KISMI olur (öteki anlıklar ve olgular işlenir, eşitleme düşmez) ama anlık her aralıkta
  yeniden gönderilir ve log'da ret görünür; bulut güncellenince kendiliğinden düzelir.
- **Eski istemci ne yapar:**
  - **Panel 1.3.15–1.3.18 (masaüstü):** stok kalem top listesindeki ek alanları yok sayar.
  - **Tablet 1.0.14–1.0.22:** etkilenmez (bu uçları kullanmaz).
  - **Patron uygulaması (yeni alanları okumayan):** yok sayar. Yeni uygulama eski (2.12.3) fabrikaya karşı sütunları
    "—" gösterir, çuval süzgeci ve kartı çizmez. "Çuvallar" ekranı 2.12.3 fabrikada (anlık yok) "Çuval listesi fabrika
    güncellemesinden sonra görünür" boş durumunu gösterir, çökmez.
- **Panel uyumluluğu:** panel **1.3.15–1.3.18**, tablet **1.0.14–1.0.22** ile uyumlu.
- **`minVersion` dokunuldu mu:** HAYIR (`client-version-policy.ts` 2.11.7'den beri değişmedi).

## 4. Migration

- **Var mı:** HAYIR (toplam **369**, 2.12.3 ile aynı). Kuran `[7/9]`da "369 migrations found" + "No pending
  migrations to apply" görmelidir; farklı sayı = yanlış paket ya da yanlış DB → DUR.
- **Ne zaman:** —
- **Veri yazan adımlar:** yok (değişiklik yalnız okuma sorgusudur).
- **Geri alınabilir mi:** EVET — şema değişmediği için `-GeriAl` 2.12.3 koduna tam döner.

## 5. Kurulum notu

- **Beklenen kesinti:** ≈ 70 sn (migration yok). Kesintiden ÖNCEKİ `[1/9]`–`[3/9]` (paket açma + yedek) ≈ 9 dk; bu
  sürede fabrika ÇALIŞIR.
- **KURULUM SIRASI:** **1)** patron bulutu kataloğu (`cuval-deposu` girdisi; bulut sunucusu güncellenir) → **2)** bu
  backend → doğrulama (§7). Ters sırada eski bulut yeni anlığı reddeder (§3). Patron uygulamasının yeni sürümü ayrı
  yayınlanır; uygulama ile fabrika arasında sıra serbesttir (eski fabrikada ekran boş durum gösterir).
- **Kurulum yöntemi:** 2.12.3 ile aynı — paket `C:\TeksERP\guncelleme\`e; paketin kendi `kur.ps1` + `uzaktan-kos.ps1`i
  çıkarılır, `C:\TeksERP\kur.ps1` onunla değiştirilir; SYSTEM görevi:
  `uzaktan-kos.ps1 -Betik C:\TeksERP\kur.ps1 -Argumanlar '-Kok C:\TeksERP -Paket {zip} -Zorla'`.
- **Bu sürüme özel:** veri aracı yok; yeni ayar anahtarı yok; kurulum `.env`e DOKUNMAZ. Patron bulutu eşitlemesi
  açıkken kurulur (2.12.3 ile aynı davranış). Kurulumdan sonraki ilk anlık turunda `stok-kalem` içerik özeti değişir
  ve anlık bir kez yeniden gider (beklenen); `cuval-deposu` ilk kez gider.
- **Sınırlar (her sürümde geçerli):** `migrate reset`/reseed/DB drop YOK · uygulanmış migration'a dokunma ·
  postgres/node süreçlerini `Stop-Process` ile durdurma, `postgresql-tekserp` servisine dokunma ·
  `C:\TeksERP\pgsql\bin` JUNCTION'dır, recursive SİLİNMEZ · gece yedeği görevi çakışmamalı · elle koşumda
  `-GeriAl` ile `-Zorla` birlikte KULLANMA · başarısız kurulumu TEKRAR DENEME · hata → DUR, insana rapor et.

## 6. Geri alma

Uygulama sorununda: `kur.ps1 -GeriAl` bu kurulumun kenara aldığı `app.eski-*`i (2.12.3) geri koyar. Migration
olmadığı için şema farkı yoktur. Geri dönüşte patron uygulaması yeni alanları alamaz: top sütunları "—", çuval
süzgeci ve "Çuvalda · Açıkta" kartı çizilmez; "Çuvallar" ekranı bulutta kalan son `cuval-deposu` anlığını
gösterir (güncellenmez). Bulut kataloğundaki girdi geri alınmaz (girdi gelmezse zararsızdır).

## 7. Doğrulama — kurulumdan sonra rapor edilecekler

- yeni sürüm + `pm2 ls` (online, restart sayısı, SYSTEM); `/health` → `UP/UP 2.12.4`
- `[7/9]`: "369 migrations found" + bekleyen migration yok; `_prisma_migrations` 369 bitmiş / 0 sorunlu
- psql (salt okuma) — çuvaldaki bitmiş top sayısı; patron uygulamasının "Çuvalda" kartıyla aynı olmalı:
  `SELECT count(*), sum("currentQty") FROM rolls WHERE status::text IN ('WAREHOUSE','A1_STOCK') AND "sackId" IS NOT NULL;`
- psql: `SELECT * FROM patron_sync_status();` → kurulumdan ÖNCEKİ değerle aynı
- kullanıcı / sipariş / top / çuval / sevkiyat sayıları kurulumdan öncekiyle aynı
- `.env` satır sayısı ve özeti kurulumdan öncekiyle aynı
- `backend-err-*.log` (en yenisi) — yeni hata yok; açılış log'unda patron eşitlemesi işleri yeniden başladı; sonraki
  anlık turunda `stok-kalem` ve `cuval-deposu` hatası yok (bulut ret yok)
- psql (salt okuma) — sevk edilmemiş çuval sayısı; patron "Çuvallar" ekranının Çuval kartı ve panel Paketleme/Çuvallar
  listesiyle aynı olmalı (bekçi §3b'nin bağımsız sorgusu):
  `SELECT count(*) FROM sacks s LEFT JOIN shipments sh ON sh.id = s."shipmentId" WHERE s."shipmentId" IS NULL OR sh.status::text = 'PLANNED';`
- panelde parolayla giriş + Stok & Ölü Stok › Kalem bazında (rakamlar kurulumdan öncekiyle aynı); tabletten PIN ile giriş
- ölçülen kesinti
