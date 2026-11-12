---
name: karar-notu
description: Yeni bir karar/saha bulgusu/tasarım kararını belge katmanına doğru yere yazar — tam metin arşive, tek kural satırı alan dosyasına, yalnız her alanda geçerliyse kök CLAUDE.md'ye; ezilen eski kuralı işaretler. "not yaz", "CLAUDE.md'ye ekle", "bunu belgele", "karar notu" dendiğinde kullan.
---

# karar-notu

Kök `CLAUDE.md` her oturumda yüklenir ve boyut kapısı vardır (`scripts/check-docs.mjs`). Hikâye köke ve alan dosyasına GİRMEZ; arşivde durur.

## Üç kat, üç yazım

1. **Arşiv — tam metin:** `docs/history/CLAUDE-NOT-ARSIVI.md` sonuna `## YYYY-MM-DD — Başlık`. İçerik: saha sorusu/ölçüm → karar → gerekçe → kod çapaları (`dosya:satır`) → bekçi → migration/izin/APK gerekiyor mu.
2. **Alan dosyası — TEK kural satırı:** `docs/kurallar/<alan>.md` § Kurallar (ya da araçla yakalanamayan, bedeli ödenmiş bir şeyse § Tuzaklar): `- <emir kipinde tek cümle, kendi başına anlaşılır> [etiket]`. Etiket kuralı neyin zorladığını söyler ve UYDURULMAZ:
   - `[lint]` — ilgili `eslint.config.*` içinde kuralı gördün.
   - `[tip]` — tip sistemi derlemeyi kırar.
   - `[bekçi: <dosya adı>]` — dosya `Teks-Erp/scripts/` (ya da ilgili test dizini) altında `ls` ile var.
   - `[db]` — CHECK / trigger / unique / FK.
   - `[inceleme]` — hiçbir araç zorlamıyor; bu durumda kuralı `docs/kurallar/ZORLANMAYANLAR.md`ye de "nasıl zorlanabilir" önerisiyle ekle.
   Tarih, ölçüm anlatısı, arşiv atfı kural satırına yazılmaz. Alan dosyası yoksa `docs/kurallar/README.md` tablosuna satır + yeni dosya.
3. **Kök `CLAUDE.md` — yalnız her alanda geçerli değişmez:** ilgili bölüme tek satır. Kök büyüyorsa bir şey alan dosyasına inmelidir.

## Eski kural ezildiyse
- Alan dosyasında eski cümleyi SİL; iki cümle yan yana bırakılmaz.
- Arşivdeki eski notun başlığının altına `> ⚠️ **GEÇERSİZ (YYYY-MM-DD)** — … → bkz. <yeni not>` bloğu.
- Kod yorumu hikâye taşıyorsa çapaya indir: `// bkz. arşiv YYYY-MM-DD <başlık>`.

## Teknik desen / reçete / yasak ise
`docs/KOD-KURALLARI.md` (desen, yasak) · `docs/RECETELER.md` ("X eklerken şu N yer") · `docs/SOZLUK.md` (yeni terim) · `docs/standart/` (katman/yazım kuralı).

## Bitirmeden
`node scripts/check-docs.mjs` (ölü link + boyut kapısı) yeşil. Kullanıcıya: nereye ne yazıldı, hangi etiket, hangi eski kural işaretlendi.
