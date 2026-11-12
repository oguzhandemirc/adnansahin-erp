# Patron eşitleme migration'ı — fabrika kurulumu

İki migration: `20260929152815_patron_bulut_esitleme` (2 tablo, 31 filigran indeksi, 28 tetikleyici) + `20260929180000_bulut_gelen_kutusu_makbuzu` (1 tablo). Yalnız EKLER; mevcut kolon/veri değişmez. Tetikleyiciler KAPALI doğar — bu kurulum eşitlemeyi AÇMAZ. Kurallar: `docs/kurallar/patron-bulutu.md`.

## Ön koşullar
- Bu iki migration'ı taşıyan backend paketi sunucuda, `.env` yerinde.
- Vardiya dışı pencere: tabletten ve panelden yazma yok.
- Diskte en az bir tam yedek kadar boş yer.

## 1. Yedek
`kur.ps1` adım [3/9] `premigrate_` yedeğini alır; dosyanın oluştuğunu ve boyutunun sıfır olmadığını gör. Geri dönüşün tek yolu bu yedektir.

## 2. Backend'i durdur → migration → başlat
`kur.ps1` sırayla: [4/9] pm2 durdurur → [7/9] `migrate deploy` → [8/9] pm2 başlatır → [9/9] sağlık kontrolü. Adımlardan biri kırmızıysa durulur, sonraki adıma elle geçilmez.

Backend durmuşken uygulanır: migration `rolls`/`roll_movements` dahil 32 tabloya kısa ShareLock alır; açık yazma tx'i onu bekletir. Başladıktan sonra eşitleme KAPALI kalır; açma ayrı bir bakım işidir (`patron-bulutu.md` § Açma reçetesi).

## 3. Doğrulama (psql, salt okuma)
```sql
SELECT * FROM patron_sync_status();
-- beklenen: enabled_triggers = 0 · total_triggers = 28 · swallowed_errors = 0

SELECT count(*) FROM pg_trigger t JOIN pg_proc p ON p.oid = t.tgfoid
 WHERE p.proname LIKE 'sync_mark_%' AND NOT t.tgisinternal;
-- beklenen: 28

SELECT count(*) FROM sync_marks;
-- beklenen: 0

SELECT migration_name, finished_at FROM _prisma_migrations
 WHERE migration_name IN ('20260929152815_patron_bulut_esitleme',
                          '20260929180000_bulut_gelen_kutusu_makbuzu');
-- beklenen: 2 satır, finished_at dolu
```
Ardından panelde top listesi açılır, tabletten bir okutma yapılır (normal çalışma).

## 4. Geri dönüş
- Uygulama sorunu: eski backend paketi bu şemayla çalışır (ölçüldü: okuma sonuçları birebir, tetikleyiciler kapalıyken sıfır çağrı) — yalnız paketi geri koy, şemaya dokunma.
- Şema sorunu: migration geri alınmaz; backend durdurulur, 1. adımdaki yedekten geri yüklenir (`docs/kurallar/surum-yayin.md` § Migration).

## Ölçülen süreler (yerel prova, ~23,5 bin top)
- Migration SQL'i < 1 sn (89–169 ms + 9–17 ms; süreç dahil 1,0–1,8 sn); en uzun tablo kilidi ≈ 91 ms (yüklü makinede 129 ms).
- Asıl süre yedek + backend'i durdurup başlatmaktır.
- Kapalıyken yazma maliyeti: tetikleyici 0; fark yalnız yeni filigran indeksi bakımı (5000 topluk toplu güncelleme 398 → 414 ms).
