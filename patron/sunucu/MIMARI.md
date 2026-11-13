# patron/sunucu — mimari ve ayrıntı

> `patron/sunucu/CLAUDE.md`'den 2026-10-03'te taşınan açıklayıcı metin: runbook atfı, komutlar, ortam değişkenleri. Oturum açılışında yüklenmez. Kurallar `patron/sunucu/CLAUDE.md`'de ve ana ürün `kurallar/patron-bulutu.md` (docs, TeksERP@19aa48a9; bu repoda yok) § Bulut sunucusu (`patron/sunucu`), § Bildirimler (B5) ile § Patron sunucusu — alt-alan kuralları'nda kalır (Kurulum kaydı · Hizmet aşaması · Hesaplar · Bildirimler bölümlerinin eski metni uç, runbook ve bekçi atıflarıyla birlikte TAM hâliyle orada), burada tekrarlanmaz. Başlıklar eski CLAUDE.md bölüm başlıklarıyla aynıdır.

## Katmanlar

- **Servis** (`src/services/` · `src/auth/`): İş kuralı + tx.

## Tek DB, tek tesis — üç rol

- Adnan bulutu TEK veritabanı ve TEK tesislidir (ayıklama D4, 2026-11-13): tesis başına DB, merkez yönlendirme kataloğu, hazırlayıcı, imha ve destek rolü YOKTUR. `tesis-ac` kayıtlı başka tesis varken 409 `DURUM_CAKISMASI` verir. Bekçi `test_tek_veritabani`.
- Hizmet SÜRESİZDİR (ayıklama D5, 2026-11-13): hizmet aşaması (salt okuma / kapalı), lisans sınıfı, modül hakkı, abonelik bitişi ve devir YOKTUR; tel sözleşmesindeki `hizmet` alanı sabit `{asama: ACIK, bitis: null, saltOkunurBitis: null}` döner. Fabrika kanalı kapısı = kurulum kaydı + açık anahtar + `active`; pasif kayıtta `/v1` 403 `KURULUM_IPTAL`, hesap yazmaları (gelen kutusu, rapor isteği) 403 `PATRON_BULUT_KAPALI`. Bekçiler `test_disa_aktarma` §1–§2, `test_esitleme_idempotency` §5j–§5l.
- Göç rolü SÜPER KULLANICI DEĞİLDİR (ayıklama D6, 2026-11-13): üretimde `patron_goc` (`deploy/patron/db-init/10-goc-rolu.sh`); `db-roles.ts` süper kullanıcı gerektiren rol özelliklerini ALTER etmez, okuyarak doğrular. Sunucu RLS'i atlayabilen rolle de, tablo SAHİBİ rolle de KALKMAZ (`db.ts` `roleBypassesRls`; bekçi `test_rls_sizinti` §7a). `/api` geneli IP başına `API_HIZ_DK` (600/dk) + geçersiz Bearer kapısı `OTURUM_RED_HIZ_DK` (30/dk, aşılınca DB'ye inmeden 429); kenar hız sınırı Caddy'de değil sunucudadır (bekçi `test_api_hiz_siniri`).

## Komutlar

```bash
cd patron/sunucu
npx prisma migrate deploy && npx prisma generate && npx tsx scripts/db-rolleri.ts   # migrate dev/reset YASAK
npx tsx scripts/tesis.ts tesis-ac --ad="Adnan Şahin" [--tesis=<uuid>] [--saklama=13|3|25|tumu]   # kimlik verilmezse üretilir; tek tesis
npx tsx scripts/tesis.ts durum                                       # tesis + kurulum kayıtları (sırsız)
npx tsx scripts/tesis.ts kurulum-kaydet --kurulum=<uuid> --acik-anahtar=<x> [--pasif]   # fabrikanın patron-bulut-anahtar.ts çıktısı
npx tsx scripts/tesis.ts yonetici-davet --eposta=<e-posta> --ad="Ad Soyad"   # davet belirteci BİR KEZ basılır
npx tsx scripts/tesis.ts yonetici-yeniden-davet --eposta=<e-posta> [--zorla --talep=<no> --gerekce="…"]   # aktif yönetici varken yalnız zorlamayla
npx tsx scripts/tesis.ts kimlik-sifirla --eposta=<e-posta> --zorla --talep=<no> --gerekce="…"   # kayıp parola: sırlar silinir, izinler korunarak yeni davet
npx tsx scripts/tesis.ts dogrulama-kapat --eposta=<e-posta> --talep=<no> --gerekce="…"   # doğrulama kodunu (TOTP) kapatır; TEK kurtarma yolu, e-posta basılmaz
npx tsx scripts/tesis.ts ozet-yenile [--apply]   # giriş dizini anahtarı değişince kimlik e-posta özetleri; kuru koşum varsayılan
npm run typecheck:scripts && npm run lint        # commit kapısı altıncı proje olarak aynısını ölçer (tip + eslint + lint-baseline.json tavanı)
node ../../scripts/agir-is.mjs -- npx tsx scripts/run-all-tests.ts [ad-parçası]   # yalnız *_test DB
```

`.env` (repoya girmez, 0600): `GOC_DATABASE_URL` · `DATABASE_URL` (uygulama rolü) · `ESITLEME_DATABASE_URL` (eşitleme rolü) — üçü AYNI `_test` DB'yi, ÜÇ AYRI rolle gösterir (`tekserp_fabrika_*` ASLA) · `ANAHTAR_DIZINI` · `PORT` (varsayılan 4620); isteğe bağlılar `.env.example`te. Bekçiler `scripts/test_*.ts`; harita `Teks-Erp/docs/BEKCI-HARITASI.md` § patron-bulutu. CI'da ayrı "Patron sunucusu" job'ı (PG 16, `migrate deploy`, roller, lint + tavan + tip + kapı kapsamı + bekçi koşucusu).

## CLAUDE.md'den taşınan ayrıntı (2026-10-12 kısaltma turu)

> `CLAUDE.md` yalnız kısaltılmış kural cümlesini taşır; aşağıdaki katman tablosu ve budama beyanı o dosyanın 2026-10-12 öncesi metninin kelimesi kelimesine aynısıdır; roller bölümü D4'te (2026-11-13) tek DB'ye göre yeniden yazıldı.

### Katman tablosu (tam)

| Katman | Yer | Kural |
|---|---|---|
| Protokol | `src/lisans-protokol/` | `Teks-Erp/src/lib/license/protocol/` klasörünün **BAYT-EŞİT aynası**; burada düzenlenmez (bekçi ana ürün `scripts/test_lisans_protokol_aynasi.ts` (Teks-Erp, TeksERP@19aa48a9; bu repoda yok) + `test_patron_kapilari` §7) |
| Tel şeması | `src/wire/esitleme.ts` | Paket zarfı, gelen kutusu/rapor istek-yanıtları, mesaj gövdeleri, satıcı iç API yanıtı — istek KATI, yanıt GEVŞEK. Sözleşme §6–§8 |
| Katalog | `src/catalog/` | İzin kataloğu (`permissions.ts`, süper yetki YOK, `bulut:oturum` örtük) · projeksiyon → izin eşlemesi (`projections.ts`; alt satır yalnız `.kisisel` — finans/teklif/maliyet projeksiyonu, `.finans` alt satırı ve finans izinleri Adnan'da YOK, fabrika göndermez; kökte yasak alan; saklama tarihi alanı; ebeveyn) · rapor anahtarı → izin (`reports.ts`; rapor BAŞINA, fabrikanın `REMOTE_REPORTS`iyle birebir; sonuç RLS adı `rapor.<aile>-<ad>`; audit ve kişi adlı rapor buluttan istenemez). Eşlenmeyen ad RED |
| Kiracı | `src/lib/tenant.ts` | `app.*` oturum ayarlarının TEK yazarı: her tx'in İLK ifadesi tek SELECT'te `set_config(tesis) + set_config(projeksiyonlar) + arama anahtarlarını sıfırla + (varsa) advisory kilit`. Kipler: `withTesis` · `withLookup` (giriş e-postası · oturum özeti · davet özeti · kurulum kimliği; kiracı = sıfır UUID) · `withMaintenanceList` |
| Servis | `src/services/` · `src/auth/` | Durum geçişi atomik claim; claim kuyruğu `WITH … FOR UPDATE SKIP LOCKED` CTE (IN-altsorgu LIMIT'i aşar — ölçüldü); işlem kimliği tek boğaz `lib/idempotency.ts` |
| HTTP | `src/http/` | Tek dinleyici: `/v1/*` fabrika kanalı (kurulum imzalı, HAM gövde ≤ 4 MB, gzip açılır ≤ 32 MB; eşitleme rolü) + `/api/*` hesap API'si (Bearer oturum, yazma yalnız JSON; uygulama rolü; rota TABLOSU veridir) |
| Şema | `prisma/` | Model/kolon İngilizce snake_case, kod değerleri Türkçe; her tabloda `tesis_id` + RLS ENABLE + FORCE (migration SQL); CHECK'ler çift yüklemi DB'de de sedder (AKTİF hesap parolasız, doğrulaması açık hesap sırsız doğamaz; doğrulama kodu isteğe bağlı) |

### Tek DB — roller (tam metin)

- **Tek veritabanı** (`DATABASE_URL`ın veritabanı): kiracı tabloları (`tesis_id` + RLS ENABLE + FORCE + `tesis_yalitimi`) ile yönlendirme/kimlik tabloları (`installation_routes` · `login_routes` · `identities`; `db-grants.ts` `ROUTING_TABLES`) AYNI DB'dedir. Tek şema, tek göç zinciri (temel göç `20261113200000_temel`; VDS sıfırdan kurulduğu için eski çok-DB zinciri squash edildi). Bağlantı nesnesi `lib/tesis-db.ts` (`TesisDbRouter` adı çağrı yerleri değişmesin diye korunur; içi tek `Database`).
- **Göç rolü** (`GOC_DATABASE_URL`, tablo sahibi): `prisma migrate deploy` + `scripts/db-rolleri.ts` + satıcı CLI'si. Sunucu bu rolle BAĞLANMAZ.
- **Uygulama** (`DATABASE_URL`) ve **eşitleme** (`ESITLEME_DATABASE_URL`) rolleri: LOGIN NOSUPERUSER NOBYPASSRLS, tablo sahibi değil; ad + parola URL'den okunur, `db-rolleri.ts` kurar/hizalar (parola çıktıya yazılmaz). Yetkileri tek kaynak `src/lib/db-grants.ts` (tablo + `*_COLUMN_GRANTS` kolon düzeyi) — uygulama rolü projeksiyona YAZAMAZ; eşitleme rolü `identities`e ve `account_factors`a ERİŞEMEZ, hesabın uygulama kolonlarını (e-posta, kimlik bağı, davet, son giriş) ve oturum belirtecini OKUYAMAZ.
- **Hesap fabrikanın malıdır** (üyelik C1, 2026-11-13; göç `20261113220000_uyelik_fabrika_hesabi`): fabrika hesabı (`kullanici_adi` dolu; id = fabrika `users.id`) kolonlarını (`kullanici_adi · name · permissions · status · parola_ozeti · kimlik_surumu · closed_at`) YALNIZ eşitleme rolü yazar (`FACTORY_ACCOUNT_COLUMNS`); uygulama rolü okur ve bu satırda yalnız `last_login_at` değiştirir (tetikleyici `fabrika_hesabi_korumasi`, ölçüt rolün `parola_ozeti` UPDATE yetkisi). `parola_ozeti` fabrikanın bcrypt özetidir, SecretBox ile mühürlü (sınıf `parola`, AAD = hesap id); PASİF ⇒ NULL. İkinci etken (TOTP, `bulut_kilidi`) `account_factors`tadır — uygulamanın malı. Etkin kullanıcı adı tekil (ertelenmiş dışlama: takas tek tx'te geçer). GEÇİCİ UYUMLULUK (C4'e dek): eski e-posta hesabı (`identities`/`login_routes`/davet) kolon yetkisiyle sürer; kapanan fabrika hesabı kimlik silme tikinin dışındadır. Bekçi `test_kullanici_esitleme`.
- **Fabrika kullanıcı kümesi** (üyelik C2): `POST /v1/kullanicilar` (`services/user-sync.service.ts`, eşitleme rolü) TAM kümeyi uygular — tel özetini gövdeden yeniden hesaplar (tutmazsa 400), bilinmeyen bulut izni 400; tek tx, ilk ifade 9205 `KULLANICI_ESITLEME`; önce kapatma (PASİF + özet NULL + kapanış + oturum `HESAP_KAPANDI`), sonra güncelleme (satır başına `kimlik_surumu` claim'i; parola farkı mühür AÇILARAK ölçülür, fark varsa yeni mühür + sürüm +1 + oturum `SIFIRLAMA`), en son açık kolon listeli INSERT (Prisma `createMany` kolon yetkisine takılır). Denetim tx dışında `HESAP_EKLENDI/GUNCELLENDI/KAPATILDI` (alan adları + izinler; özet/mühür yok), log tek satır sayı. Bulut kapanan hesabın push cihazlarına dokunmaz (eşitleme rolünün yetkisi yok; C3/C4). Sunucu açılışta rolleri ölçer: RLS'i atlayabilen rolle KALKMAZ.
- `app.tesis_id` ayarsız/sıfırlanmış bağlantıda sorgu HATA verir (fail-closed) ve RLS + `app.projeksiyonlar` RESTRICTIVE politikası geçerlidir ("sipariş görür, tutar görmez"); `*` projeksiyon YASAK. Yeni tablonun yetkisi `db-grants.ts`e AYNI dilimde girer — girmezse roller erişemez.
- **Giriş dizini anahtarı** (`ANAHTAR_DIZINI/patron-tesis-db.key`; üretimde `TESIS_ROL_ANAHTARI_DOSYASI`): yalnız kimlik e-posta özetinin HMAC anahtarıdır (ad eski düzenden kalır; rol parolası türetmez). Değişirse `tesis.ts ozet-yenile`.
- `tesis_id` kolonu ve `tesis_yalitimi` RLS'i ile `login_routes`/`installation_routes` şimdilik KALIR; kimlik dilimi söker.

### Budama beyanı — tam metin

Yaşa göre silinen tablolar YALNIZ `src/services/maintenance.ts` `PRUNED_TABLES` (bekçi `test_patron_kapilari` §4 iki yönlü ölçer): `projection_rows` (tesisin saklama süresi — 3 · 13 · 25 ay · tümü, varsayılan 13 — kökü düşen kaydın alt satırı ve kalemiyle; 7 günden eski mezar taşı) · `request_nonces` · `package_receipts` · `full_sync_runs` · `report_results` · `report_requests` · `inbox_messages` (sonuçlanmış; asıl kayıt fabrikada) · `sessions` · `operation_receipts` · `account_audit` (ayak izi: başarısız giriş 90 gün, diğerleri 730 gün) · `notifications` (sonuçlanmış bildirim, `BILDIRIM_SAKLAMA_GUN` = 90) · `push_devices` + `sessions` (kimliği silinen hesabınki). Hiçbiri fabrikanın defteri değildir; iş kararı bunlardan okunmaz. Başka her silme yasak; hesap soft (durum; PASIF terminal) ve cihaz soft (`active`).

**Yaşa göre silinen ALAN** (satır kalır) YALNIZ `maintenance.ts` `AGED_FIELDS` (bekçi `test_patron_kapilari` §8 iki yönlü): giriş olaylarının istemci adresi `account_audit.summary.ip` → 30 gün (`IP_RETENTION_DAYS`, koddadır; Ek-6/A §2.4 erişim/IP kaydı). Uygulama IP'yi başka hiçbir yerde saklamaz: erişim günlüğü satırı `[patron] <yöntem> <yol> <durum> <ms>`dir (IP ve sorgu dizgisi yok), hız sınırı adresi bellekte 60 sn tutar, giriş kilidi hesap + kaynak çiftini yalnız süreç anahtarlı özetle `KILIT_DK` boyunca bellekte tutar; istemci adresi yalnız HTTP katmanında (`http/rate-limit.ts` `clientAddress`) okunur. Uygulama rolünün `account_audit` UPDATE yetkisi tablo düzeyinde YOKTUR: yalnız `summary` kolonunda (kolon düzeyi, `APP_COLUMN_GRANTS`) ve yalnız bu alan silmesi içindir — olay, aktör, zaman yazılamaz (bekçi `test_rls_sizinti` §5d · `test_patron_kapilari` §8g).

**Kapanan hesabın kimliği (Ek-6/A §2.5):** PASIF geçişi kapanış anını (`accounts.closed_at`) AYNI claim'de yazar (CHECK: PASIF ⇔ dolu); bakım tiki (`purgeClosedIdentities`, `IDENTITY_PURGE_DAYS` = 30, koddadır) kapanıştan 30 gün sonra, `ACCOUNT_ADMIN` kilidiyle ve hesap başına atomik claim'le ad/e-postayı tombstone'a (`Silinmiş hesap #<8>` · `silinmis-<id>@hesap.invalid`), parola/TOTP/davet/kilit sayaçlarını NULL'a çeker, oturumları ve cihaz anahtarlarını siler, gelen kutusu yazar adını ve işlem makbuzlarının yanıtındaki kimlik alanlarını (hesap görünümünün ad/e-postası, gelen kutusu yazar adı) tombstone yapar — makbuz, işlem kimliği ve gövde özeti KALIR, aynı işlem kimliği tombstone'lu saklı yanıtı alır (uygulama rolü makbuzda yalnız `response` kolonunu güncelleyebilir; başka yazan `test_patron_kapilari` §8e'de kırmızı); satır, kimlik, durum ve izinler kalır (CHECK: kimliği silinmiş hesap sır taşımaz). Arşivdeki hesap düzenlenemez (409). Ayak izi `HESAP_KIMLIGI_SILINDI` (kategori + sayı; kimlik içeriği yok).

Audit istisnaları (beyanlı sınıflar): fabrika kanalı yazımları (paket makbuzu kendi kaydıdır — sistem işi) · bakım işi (sistem işi) · oturum dokunuşu (telemetri). Hesap CUD'u, davet, giriş/çıkış, gelen kutusu/rapor yazımı/iptali, cihaz kaydı `account_audit`e düşer.
