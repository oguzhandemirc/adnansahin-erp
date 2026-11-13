# patron/sunucu — Adnan Şahin patron bulutu sunucusu

> Kök `CLAUDE.md` çekirdeği burada da AYNEN geçerlidir (defter, atomik claim, kilit tx'in ilk ifadesi, fail-closed, `details.code`, TR mesaj, sır hijyeni, audit yalnız ayak izi). Sözleşme ana ürün `design/PATRON-BULUTU-ESITLEME.md` (docs, TeksERP@19aa48a9; bu repoda yok); alan kuralları ana ürün `kurallar/patron-bulutu.md` (docs, TeksERP@19aa48a9; bu repoda yok); anlatım, tam ayrıntı (katman tablosu, DB rolleri, budama), komut ve ortam `patron/sunucu/MIMARI.md`; bekçiler `Teks-Erp/docs/BEKCI-HARITASI.md` § patron-bulutu.

## Amaç

Patronun buluttaki OKUMA KOPYASI ve TEK yazma kanalı. **Bulut hesap yapmaz, fabrika tek yazardır:** fabrika projeksiyonları imzalı paketle gönderir; bulut saklar, izinle süzer, gösterir. Yazma bir MESAJdır: gelen kutusuna düşer, fabrika çeker ve kendi servis yolundan yazar. Patron uygulaması yalnız bu sunucunun `/api/*`sine konuşur.

## Katmanlar

- **Protokol** `src/lisans-protokol/`: yalnız istek imzasının 6 dosyası (`ortak jws belgeler belge-turleri parmak-izi istek`) — `Teks-Erp/src/lib/cloud-signing/` ile BAYT-EŞİT; burada düzenlenmez (bekçi `test_patron_kapilari` §7). Lisans/güncelleme kısımları Adnan'da yok.
- **Tel şeması** `src/wire/esitleme.ts`: istek KATI, yanıt GEVŞEK.
- **Katalog** `src/catalog/`: izin (süper yetki YOK) · projeksiyon → izin · rapor → izin; eşlenmeyen ad RED. Finans, teklif, maliyet ve dokuma yüzeyi YOKTUR (projeksiyon, `.finans` alt satırı, izin, `MUHASEBE` şablonu, rapor anahtarı, çek/cari kilidi/yedek bildirimi): fabrika bunları göndermez; gelirse girdi `PROJEKSIYON_BILINMIYOR`/`ALAN_SINIFI_IHLALI` ile RED. Raporlar yalnız fabrikanın `REMOTE_REPORTS` 6 karnesi.
- **Kiracı** `src/lib/tenant.ts`: `app.*` ayarlarının TEK yazarı; her tx'in İLK ifadesi tek SELECT'te ayar + (varsa) advisory kilit.
- **Servis**: durum geçişi atomik claim; claim kuyruğu `FOR UPDATE SKIP LOCKED` CTE; işlem kimliği tek boğaz `lib/idempotency.ts`.
- **HTTP**: tek dinleyici — `/v1/*` fabrika kanalı (kurulum imzalı, boyut tavanlı) + `/api/*` hesap API'si (Bearer, rota tablosu veridir).
- **Şema**: her tabloda `tesis_id` + RLS ENABLE + FORCE; çift yüklem DB CHECK ile de seddelenir.
- **Değişim akışı** `services/change-feed.ts` + `GET /api/degisim?since=&bekle=` (`http/change-routes.ts`): `sync_state.change_counter` YALNIZ paket tx'inde (9201 altında), veri kabul edildiyse +1; hub süreç içidir (halka 64, `notify` COMMIT'ten sonra), yanıt içerik taşımaz, ≤ 25 sn, adlar oturumun okuyabildiği projeksiyonlarla süzülür (bekçi `test_degisim_sayaci`).

## Tek DB, tek tesis — roller

- TEK veritabanı, TEK tesis: kiracı ve kimlik/yönlendirme tabloları aynı DB'de; tesis başına DB, merkez kataloğu, hazırlayıcı, imha ve destek rolü YOK. `tesis-ac` ikinci tesisi 409 ile reddeder (bekçi `test_tek_veritabani`). Bağlantı nesnesi `lib/tesis-db.ts`.
- Göç rolü tablo sahibidir; sunucu bu rolle BAĞLANMAZ. Uygulama ve eşitleme rolleri NOBYPASSRLS (ad + parola `.env` URL'lerinde); yetkiler tek kaynak `src/lib/db-grants.ts` — yeni tablonun yetkisi AYNI dilimde girer. Sunucu RLS'i atlayabilen rolle ve tablo sahibi rolle KALKMAZ; göç rolü süper kullanıcı DEĞİLDİR (D6). `/api` hız sınırı sunucuda: `API_HIZ_DK` + `OTURUM_RED_HIZ_DK`.
- `app.tesis_id` ayarsız bağlantıda sorgu HATA verir (fail-closed); `*` projeksiyon YASAK.

## Advisory kilit envanteri (patron DB'si — backend 80xx ve satıcı 91xx'ten bağımsız)

Kilit tx'in İLK ifadesidir ve kiracı ayarıyla AYNI SELECT'te alınır (`lib/tenant.ts`); bir tx tek kilit alır. Tek tanım `src/lib/locks.ts` `LOCK_NAMESPACES`; tablo onunla birebir (bekçi `scripts/test_patron_kapilari.ts` §1).

| Uzay | Ad | Kapsam |
|---|---|---|
| 9201 | `PACKAGE` | tesis başına eşitleme paketi — `try`: doluysa 409 `PAKET_ISLENIYOR` |
| 9202 | `ACCOUNT_ADMIN` | tesis başına uygulamanın hesap verisi (kapanan hesabın kimlik silmesi — uygulama adımı) |
| 9203 | `CLIENT_TOKEN` | (tesis, işlem kimliği) başına tekrarlar sıraya girer |
| 9205 | `KULLANICI_ESITLEME` | tesis başına fabrika kullanıcı kümesi (`POST /v1/kullanicilar`: ekle · güncelle · kapat) |

## Alt-alan kuralları — dokunmadan önce oku

ana ürün `kurallar/patron-bulutu.md` (docs, TeksERP@19aa48a9; bu repoda yok) § Patron sunucusu — Kurulum kaydı · Hesaplar · Bildirimler (B5). Hizmet aşaması Adnan'da YOK (süresiz; `hizmet` alanı sabit ACIK — `MIMARI.md`).

## Budama beyanı (telemetri + okuma kopyası)

- Yaşa göre silinen tablolar YALNIZ `src/services/maintenance.ts` `PRUNED_TABLES`; yaşa göre silinen ALAN YALNIZ `AGED_FIELDS` (bekçi `test_patron_kapilari` §4, §8 iki yönlü). Hiçbiri fabrikanın defteri değildir; iş kararı bunlardan okunmaz; başka her silme yasak; hesap ve cihaz soft.
- İstemci adresi yalnız HTTP katmanında okunur, kalıcı olarak yalnız beyanlı alanda ve süreyle tutulur.
- Kapanan hesabın kimliği süre sonunda tombstone'a çekilir; satır, kimlik, durum, izin ve makbuz kalır.
- Audit istisnaları beyanlı sınıflardır (fabrika kanalı · bakım · oturum dokunuşu); hesap işlemleri `account_audit`e düşer.
- Süreler ve tam metin `MIMARI.md`.

## Komutlar

```bash
cd patron/sunucu
npx prisma migrate deploy && npx prisma generate && npx tsx scripts/db-rolleri.ts   # migrate dev/reset YASAK
npm run typecheck:scripts && npm run lint
node ../../scripts/agir-is.mjs -- npx tsx scripts/run-all-tests.ts [ad-parçası]   # yalnız *_test DB
```

`.env` repoya girmez (0600): `GOC_DATABASE_URL` · `DATABASE_URL` · `ESITLEME_DATABASE_URL` — üçü aynı `_test` DB'yi üç ayrı rolle gösterir (`tekserp_fabrika_*` ASLA). Tam liste `MIMARI.md` § Komutlar.
