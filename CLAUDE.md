# Adnan Şahin ERP — Monorepo Kökü

> **Bu dosya her oturumda yüklenir; yalnız kimliği, sınırları, çekirdek değişmezleri ve alan haritasını taşır.** Alan kuralları `docs/kurallar/<alan>.md`'de (o alana dokunmadan ÖNCE oku), karar hikâyeleri `docs/history/CLAUDE-NOT-ARSIVI.md`'de. Yeniden yazım: 2026-11-12 (önceki sürüm: git `1eadbd75`, 29,6k bayt → hedef ≤ 12k bayt).

## Kimlik

- Bu repo **Adnan Şahin tekstil fabrikasına özel**, TeksERP ana ürününden **bağımsız** bir hattır (kullanıcı kararı 2026-11-12). Fabrika CANLI ve donuk sürümde çalışır: backend 2.11.7 · panel 1.3.15 · tablet 1.0.14.
- Ana ürün reposuna buradan YAZILMAZ; oradan alınan her kopya (kod, kural, tasarım) elle taşınır ve **kaynak commit kimliği** kayda geçer. Ana ürünün yeni modülleri buraya gelmez; "tek gövde çok fabrika", profil ve terfi kanalı düzeni bu repoda GEÇERSİZDİR.
- Repo **PUBLIC**. Tek ana dal `main`; iş `feature/*` → `main`.

| Proje | Stack | Port |
|---|---|---|
| `Teks-Erp/` | Express 5 + Prisma 7 + PostgreSQL backend | 4000 |
| `Electron/` | Electron 42 + React 19 + Vite yönetim paneli (admin frontend buraya yazılır) | 5174 |
| `mobil/` | React Native + Expo 54, Android tablet + telefon — saha | — |

Eklenecek (henüz yok): patron bulut sunucusu (Node, Adnan'a özel VDS) ve patron mobil uygulaması (iPhone + Android).

## Dokunulmazlar

- **`adnan-yedek` dalı** (backend 2.11.7'nin dokunulmamış hâli, GitHub'da kilitli): üstüne commit/push yok.
- **Canlı sipariş ve müşteri yaratma kodu** değiştirilmez; telefondan gelen kayıt için YANINA ayrı yol yazılır (kod tekrarı kabul).
- **Fabrikaya gelen port açılmaz**; bağlantıyı hep fabrika başlatır.
- **Sır repoya girmez:** VDS adresi, anahtar, parola, keystore, `.env`, `_devir/`; süperadmin parolası/PIN/TOTP ve `quickPin` hiçbir yüzeyden (log, sürüm notu, audit yükü) sızmaz.
- **Canlı sunucuda her komut ÖNCE kullanıcıya gösterilir**; her canlı adım önce Adnan'ın GÜNCEL yedeğinde prova edilir.

## Patron hattı değişmezleri

- **Kapatma düğmesi varsayılan KAPALI** (tetikleyiciler dahil): kapalıyken dış istek yok, iş kaydı yok, backend bugünküyle aynı davranır.
- **Tetikleyici hatası fabrikanın yazmasını ASLA durdurmaz.**
- **ALTIN KURAL:** telefondan yazmada insan onayı/denetim ekranı yoktur, kayıt doğrudan işlenir; ama telefon bayat veriyle iş yapamaz — fabrika TEK OTORİTE, kaydı işlerken güncel veriye karşı doğrular (ret + neden), çift gönderim tek kayıttır (`mesajId = clientToken`).
- **Bulut hesap yapmaz;** her türev sayıyı fabrika hesaplar.
- **Önce okuma canlıya,** yazma en az bir hafta sorunsuz izlemeden sonra; geri dönüş tek ayardır.
- Yeni API/uygulama tasarlanmaz, mevcut patron sözleşmesine uyulur; bu kopyada sözleşme sürümü SABİT.

## Kapsam

- **VAR:** okuma — sipariş, depo/stok (ürün + renk + depo özeti), sevkiyat/irsaliye, üretim, cari, eski 8 rapor · yazma — YALNIZ yeni sipariş + yeni müşteri · cari özeti (mobil + panel) · bildirim tercihi kullanıcı profilinde.
- **YOK:** yapılandırma yazması · finans verisi · lisans altyapısı · Rust · dokuma · ana ürünün yeni modülleri · TestFlight/APK ara adımı.
- Dokuma/tezgah ve finans kodu ile tabloları canlıda durur, modülleri kapalıdır ve tabloları boştur (ölçüldü 2026-11-12); kod silinmez, genişletilmez.

## Üretim akışı

```
Stok (Roll) → İş Emri → KK1 (RAW_QC) → [opsiyonel Fason] → Kurşun + KK2 (PROCESS_QC) → Tambur →
  Depo (RollStatus.WAREHOUSE) → Çuval (Sack; müşteri opsiyonel, rezerv YOK) → Sevkiyat (PLANNED → DISPATCHED)
```

Her adım istasyon kataloğu + rota şablonundan kurulur; rotanın SON adımı topu finalize eder; depo istasyon değil bekleme statüsüdür.

## Çekirdek değişmezler

### Veri ve defter
- **Gerçek veri korunur:** `migrate reset` / reseed / toplu `DELETE` YASAK; migration geri alınamaz (rollback = yedekten restore); toplu düzeltme script'i dry-run varsayılan, `--apply` öncesi etkilenen her kaydı listeler.
- Her modelde UUID PK + `createdAt`/`updatedAt`; her `DateTime` `@db.Timestamptz`; fabrika günü Europe/Istanbul, tek kaynak `src/constants/time.ts`.
- **Defter-öncelikli:** durum tablosu "şu an ne"yi, defter "ne oldu"yu tutar ve "ne oldu" asla değişmez. Yalnız soft delete; geri alma ileri kaydı ne siler ne değiştirir, TERS KAYIT yazar. Ayrıntı ve hard delete'in iki sınıfı: `docs/kurallar/defter.md`.
- Her CUD → `AuditService.log()` (best-effort, tx DIŞINDA); audit yalnız ayak izidir, ondan karar/sayı/durum türetilmez.
- Sevk rakamı her yüzeyde BRÜT; iade ayrı belgeyle kapanır; storno ≠ iade.
- Yıkıcı işlemde backend preview ucu döner, arayüz etkilenen HER kaydı listeler. Validation mesajları Türkçe; i18n kurulmaz.

### Eşzamanlılık
- Durum geçişi ATOMİK CLAIM: `updateMany WHERE {id, beklenen-durum}` + `count===0 → 409`; `findUnique→if→update` YASAK; `tx.*` çağrıları `Promise.all` ile paralelleştirilmez.
- Advisory kilit tx'in İLK ifadesidir; her uzayın tek sahibi vardır (envanter `helpers/period-guard.helper.ts`, ayrıntı `docs/standart/ESZAMANLILIK.md`); PG 40P01/40001 → 409 "tekrar deneyin".
- **İdempotency:** kayıt yaratan uç `clientToken @unique` taşır; istemci token'ı mantıksal deneme başına bir kez üretir; replay tek boğazdan geçer (`helpers/token-replay.helper.ts`).

### Tek kaynak ve sözleşme
- Aynı soruyu cevaplayan koşul TEK helper'da yaşar; elle kopya yasak. Liste + cursor + özet şeridi tek where'den doğar, süzme SUNUCUDA.
- Enum'a değer, bayrak, route+izin eklemek reçeteli iştir (`docs/RECETELER.md`).
- İstek gövdesini elle kuran istemci katmanı sessiz bir allowlist'tir; alan iki uçta da sözleşmeye eklenir. `BaseController` modelinde yeni skaler kolon aynı anda yeni YAZILABİLİR alandır — istenmiyorsa açıkça kapat.
- Numara doğuşta materyalize edilir, render'da biçimlenmez (`docs/kurallar/defter.md`).
- FAIL-CLOSED varsayılan: tanınmayan kapsam 400, kapalı modül 403 `MODULE_DISABLED`; hata kodu `details.code` altında (`body.code` hep undefined).
- Yeni davranış bayrağının varsayılanı = BUGÜNKÜ davranış, ve bu ÖLÇÜLMEDEN yazılmaz.
- İş emri yalnız üretimi yönetir; top↔sipariş satırı bağı YOKTUR, karşılama `SackAllocation` ile sevk anında.

### Süreç ve donanım
- Backend TEK process: `pkill -f "tsx src/server.ts"` YASAK (yalnız kendi PID'in), ikinci Node süreci yasak. Seri port / donanım polling backend'e girmez.
- **Yeni npm paketi kullanıcı onayı olmadan eklenmez.**

## Yasaklar — kısa liste (tam liste `docs/KOD-KURALLARI.md`)

- `migrate reset` · düz `migrate dev` (yalnız `--create-only`) · reseed · toplu `DELETE` · `pkill -f tsx` · ikinci Node süreci.
- `findUnique→if→update` · `tx.*` + `Promise.all` · `notIn: []` · `batchNumber` ile lookup/sıralama · `toLocaleUpperCase("tr")`.
- Route/controller'da `prisma` import · `body.code` okumak · yeni izin kodu için migration.
- `adnan-yedek`e yazmak · ana ürün reposuna yazmak · public repoya sır · kullanıcıya gösterilmemiş canlı komut.

## Alan dizini — dokunmadan önce oku (`docs/kurallar/`)

| Dosya | Kapsar |
|---|---|
| `defter.md` | defter · ters kayıt · hard delete · numara serisi · mükerrer/ana veri arşivi · sebep kataloğu |
| `sevkiyat.md` | çuval · sevkiyat · brüt · storno/iade · parti (Batch) · yarı mamul |
| `fason.md` | fason sevk/kabul/kalan · kartela |
| `is-emri.md` | iş emri · sipariş bağı · rota · renk/özellik · kalite istasyon yeteneği |
| `kk1.md` | KK1 · idempotency · mükerrer tuzağı · kurşun planlama/bypass |
| `tambur.md` | tambur finalize/kesim/geri alma · top düzeltme/iptal/fire · refakat kartı |
| `belge-etiket.md` | irsaliye · belge şablonu · top/çuval etiketi · yazdırma |
| `raporlar.md` | raporlar · karneler · filtre · liste · arama |
| `yetki-izin.md` | izin kataloğu · rol · süperadmin · ayar şifresi · modül bayrakları |
| `surum-yayin.md` | sürüm notu · panel/tablet yayını · backend paketi · kurulum · migration |
| `genel.md` | audit · hata sözleşmesi · uzak erişim · keşif · cihaz/donanım |
| `patron-bulutu.md` | patron bulutu eşitlemesi · kapatma düğmesi · istek imzası · anahtar dosyası |
| `ZORLANMAYANLAR.md` | hiçbir araçla zorlanmayan kurallar ve kapı önerileri |

Eski sürümler ve kapsam dışı `dokuma.md`/`finans.md` yalnız başvuru için `docs/history/kurallar-2026-09/` altında. Gelen kutusu ve patron uygulaması kuralları kod kopyasıyla birlikte `patron-bulutu.md`ye yazılacak.

## Çalışma düzeni

- **Kod:** yazan Opus, ölçüm/inceleme Fable; her dilimde önce PLAN (senaryo → dilim → kabul testi), sonra kod; tek dilim ≤ ~120K bağlam, ≤ 10–15 dosya. Kullanıcı "başla" demeden uygulama kodu yazılmaz.
- **Test:** ajan yalnız kendi alanının bekçilerini koşar (`cd Teks-Erp && npx tsx scripts/run-all-tests.ts <ad-parçası>`, harita `Teks-Erp/docs/BEKCI-HARITASI.md`); tam paket CI'da (GitHub, `main`). Yeni bekçi negatif sondayla, cırcır iki sondayla yazılır (`docs/RECETELER.md`).
- **Veritabanı:** bu klonda `.env` ve test DB'si kurulu değil; ana ürün reposunun dev DB'si FABRİKA VERİSİDİR, bağlanılmaz. Oturum kendi `_test` DB'sini açar.
- **Commit kapısı:** `node scripts/hooks-kur.mjs` (bir kez). Kapı dışı ağır koşum `node scripts/agir-is.mjs -- <komut>`. Kaçış `TEKSERP_HOOK_SKIP=1` yalnız kullanıcı onayıyla.
- **Git:** push ve GitHub ayarı yalnız kullanıcı isteyince; commit mesajı İngilizce conventional.
- **Belge disiplini:** yeni karar notu arşive (`docs/history/CLAUDE-NOT-ARSIVI.md`), ilgili alan dosyasına TEK kural satırı; bu dosyaya yalnız her alanda geçerli değişmez girer. İptal edilen kuralın cümlesi silinir.
- **Dosya döken tarama** ana bağlama değil alt ajana verilir; iş kapanınca oturum `/clear` ile tazelenir.

## Dağıtım

- **Sıra:** bulut ayakta → bakım penceresinde backend paketi (eşitleme KAPALI) → okuma aç → ≥ 1 hafta izle → yazma aç. Backend ÖNCE, panel + tablet sonra.
- **Sürüm:** sürüm notu yazılmadan sürüm çıkmaz (taslağı Claude yazar; tek kaynak `surum-notlari.json`). Terfi kapısı ve hazırlık kanalı YOK; fabrikaya yayın yalnız kullanıcının o sürüm için açık onayıyla. Müşteri kodu her derleme ve yayın komutunda argümandan (`adnansahin`), kanal kimlikleri `deploy/kanallar.json`. Reçete: `docs/kurallar/surum-yayin.md`.
- **Patron uygulaması:** Adnan Şahin'e özel ad/simge; doğrudan mağazaya açık yayın, Apple reddederse listelenmeyen yayın.
- **Alt projeler:** `Teks-Erp/CLAUDE.md`, `Electron/CLAUDE.md`, `mobil/CLAUDE.md`. Kod standardı `docs/standart/README.md`, sözlük `docs/SOZLUK.md`, geliştirme döngüsü `docs/GELISTIRME-DONGUSU.md`.
