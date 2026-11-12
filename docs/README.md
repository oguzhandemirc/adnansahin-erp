# Doküman Haritası — Adnan Şahin ERP

Kanonik kaynak **kod + `CLAUDE.md` dosyaları**dır. Belge katmanı üç kattır: her oturumda yüklenen kök `CLAUDE.md` (kimlik, dokunulmazlar, çekirdek değişmezler), alana dokununca okunan kural dosyaları (`docs/kurallar/`), istenince okunan hikâye/gerekçe (`docs/history/`). Bu repo yalnız Adnan Şahin fabrikasına aittir; tek dağıtım kanalı `adnansahin`.

## Nereye bakılır

| İhtiyaç | Dosya |
|---|---|
| Kimlik, dokunulmazlar, her alanda geçerli değişmezler, alan dizini | kök `CLAUDE.md` |
| Bir alanın bugün geçerli kuralları + bekçileri | `docs/kurallar/<alan>.md` (dizin: `docs/kurallar/README.md`) |
| Araçla zorlanmayan kuralların listesi | `docs/kurallar/ZORLANMAYANLAR.md` |
| Teknik desenler (F221, atomik claim, Zod↔mutationFn, `details.code`…), yorum politikası, yasak listesi | `docs/KOD-KURALLARI.md` |
| Rutin yazım konvansiyonları (servis, model, sayfa, ekran; boyut tavanı, kütüphane seçimi, test kadansı) | `docs/standart/` (giriş: `docs/standart/README.md`) |
| "X eklerken şu yerleri güncelle" (bayrak, enum, route+izin, migration, bekçi, Electron sayfası, mobil ekran, sürüm) | `docs/RECETELER.md` |
| Yerel geliştirme (env, test DB, tek bekçi, sunucu) | `docs/GELISTIRME-DONGUSU.md` |
| Alan → bekçi (test) haritası | `Teks-Erp/docs/BEKCI-HARITASI.md` |
| Domain terimleri | `docs/SOZLUK.md` |
| Alt proje çalışma düzeni | `Teks-Erp/CLAUDE.md` · `Electron/CLAUDE.md` · `mobil/CLAUDE.md` |
| Karar notlarının tam metni, gerekçe, ölçüm | `docs/history/CLAUDE-NOT-ARSIVI.md` (ezilen notlar `⚠️ GEÇERSİZ/KISMEN` bloğu taşır) |
| Derin mimari referans | `Teks-Erp/ARCHITECTURE.md` (§7–§10 canlı; envanter sayıları bayat) |

## Alan kural dosyaları (`docs/kurallar/`)

| Dosya | Kapsam |
|---|---|
| `defter.md` | Defter · ters kayıt · hard delete · numaralandırma · mükerrer/nameFold · sebep katalogları |
| `sevkiyat.md` | Sevkiyat · çuval · brüt · storno/iade · parti · yarı mamul |
| `fason.md` | Fason · kartela |
| `is-emri.md` | İş emri · sipariş bağı · rota · renk · özellik · kalite |
| `kk1.md` | KK1 · idempotency · kurşun |
| `tambur.md` | Tambur · finalize · kesim · top düzeltme/iptal/fire · refakat kartı |
| `belge-etiket.md` | Belge · etiket · şablon |
| `raporlar.md` | Raporlar · karneler · filtre · liste · arama |
| `yetki-izin.md` | Yetki · izin · rol · süperadmin · ayar şifresi · modül bayrakları |
| `surum-yayin.md` | Sürüm · yayın · deploy · kurulum · migration |
| `genel.md` | Genel · uzak erişim · keşif · cihaz · ağ |

Eski (29 dosyalık, ana üründen devralınan) sürümler başvuru için `docs/history/kurallar-2026-09/` altındadır; dokuma ve finans kuralları yalnız orada durur (bu fabrikada kapsam dışı). `docs/KOD-KURALLARI.md`'nin kısaltılmadan önceki hâli: `docs/history/KOD-KURALLARI-2026-09.md`.

## Klasörler

| Klasör | İçerik | Güncellik |
|---|---|---|
| `kurallar/` | Alan kural dosyaları (yukarıdaki tablo) | Canlı |
| `standart/` | Kod yazım standardı (giriş `standart/README.md`, dosya listesi orada). Olay-türevi kural değil, RUTİN konvansiyon | Canlı |
| `design/` | Domain tasarımları (dizinin kendisi listedir). Ana üründen devralındı; dokuma/devere/finans/SaaS tasarımları bu fabrikada kapsam dışıdır, yalnız başvurudur | Başvuru |
| `ops/` | Deploy/runbook/kurulum reçeteleri — yalnız tekrar koşulan olanlar | Operasyonel |
| `surumler/` | Sürüm belgeleri: backend paket künyeleri (`backend-<sürüm>.md`, şablon `SABLON.md`, bekçi `test_surum_belgesi`) ve sürüm notu taslakları (maddelerin kaynağı kökteki `surum-notlari.json`) | Canlı |
| `qa/` | Manuel kabul senaryoları | Bakımlı |
| `history/` | Arşiv (salt-okunur): karar notları tam metni, tek-seferlik deploy/devir notları, tamamlanmış planlar, eski incelemeler, eski kural sürümleri | Donmuş; sayılar/satır referansları bayat |

> Dizin tablolarına dosya SAYISI yazılmaz — sayıyı ölçen kapı yoksa bayatlar; okuyucu güncel sayıyı dizinden alır.

> **Kural:** Tek seferlik bir belge (deploy notu, devir notu, tamamlanmış plan) işi bitince `history/`e taşınır — `design/` ve `ops/` yalnız bugün okunacak belgeleri taşır.

## Yeni karar notu nasıl yazılır

1. Tam metin `docs/history/CLAUDE-NOT-ARSIVI.md`'ye (tarih başlığıyla).
2. İlgili `docs/kurallar/<alan>.md`'ye TEK kural satırı (emir kipi, zorlama etiketi).
3. Her alanda geçerli bir değişmezse kök `CLAUDE.md` § Çekirdek değişmezler'e tek satır.
4. Bir kural iptal edilince eski cümle silinir, arşivdeki nota `⚠️ GEÇERSİZ` bloğu konur.

## `.claude/` harness

- `.claude/rules/<alan>.md` — yol kapsamlı (`paths:`) İNCE işaretçiler: eşleşen dosyaya dokunulunca "önce `docs/kurallar/<alan>.md` oku" der. Kural buraya YAZILMAZ; `paths` olmayan bir rules dosyası her oturumda yüklenir.
- `.claude/skills/` — proje skill'leri (alt projelerin kendi skill'leri `Electron/.claude/skills/`).
- `scripts/claude-hooks/bash-guard.mjs` — PreToolUse kapısı: yasak komutları (sunucu süreçlerini toplu öldürme, `migrate reset|dev`, `db push`, WHERE'siz `DELETE`, `TRUNCATE/DROP`, `push --force`, ham `build:win`, elle `gradlew`) engeller; `git commit`te `scripts/hooks/pre-commit.mjs`i çağırır (tip · lint · lint tavanı · hızlı testler). Git'in kendi kapısı kuruluysa (`node scripts/hooks-kur.mjs`) susar. Kaçış yalnız kullanıcı kararıyla `TEKSERP_HOOK_SKIP=1` ya da `--no-verify`. ⚠️ Kapı komut METNİNE bakar: yasak dizeyi içeren bir açıklama/heredoc bile engellenir — böyle metni Edit/Write ile yaz.

## Bayatlık bekçisi (CI)

`scripts/check-docs.mjs` (`cd Teks-Erp && npm run check:docs`): ölü doküman-link **GATE**; kaldırılmış-sembol atfı advisory; **belge boyut tavanı GATE** (kök `CLAUDE.md` ≤ 12 KB, alt `CLAUDE.md`'ler ≤ 8 KB, `docs/standart/*.md` ≤ 24 KB; standart dosyaları taranarak bulunur, yeni dosya tavansız doğmaz). Bir sembol kaldırıldığında `REMOVED_SYMBOLS`'e ekle.
