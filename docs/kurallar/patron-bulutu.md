# Patron bulutu · eşitleme · imza

Fabrika verisinin patron bulutuna (Adnan'a özel VDS) eşitlenmesi; bağlantıyı hep fabrika başlatır, her istek kurulum anahtarıyla imzalıdır. Kapsadığı kod: `Teks-Erp/src/cloud-sync/` (ön koşul, adres, istemci, tel sözleşmesi), `Teks-Erp/src/lib/cloud-signing/` (istek imzası, anahtar dosyası), `Teks-Erp/scripts/patron-bulut-anahtar.ts`; bulut tarafı `patron/`.

## Kurallar

- Kapatma düğmesi varsayılan KAPALI: eşitleme ancak `PATRON_CLOUD_URL` dolu ∧ `PATRON_CLOUD_KEY_FILE` geçerli anahtar ∧ kurulum kimliği var ∧ `patronCloud.syncEnabled` açıkken çalışır; tek karar yeri `cloud-sync/eligibility.ts`. [bekçi: test_patron_bulut_uygunluk]
- Kapalıyken dış istek de iş kaydı da yoktur; ön koşul kararı adres boşken anahtar dosyasına ve DB'ye dokunmaz (açılış uzlaştırması yalnız tek salt-okuma `patron_sync_status()` yapar). [bekçi: test_patron_bulut_uygunluk]
- İmzalı istek bağlamı (`cloudContext`) yalnız açık ön koşuldan kurulur; ön koşulu atlayan ikinci bir gönderim yolu yazılmaz. [inceleme]
- Bulut istemcisi 60 sn zaman aşımı ve en fazla 2 tekrarla çalışır; yalnız ağ/zaman aşımı/5xx tekrar edilir, 4xx edilmez, saat düzeltmesi aynı bütçeden yer. [bekçi: test_patron_bulut_uygunluk]
- `src/lib/cloud-signing/` altındaki altı protokol dosyası ve `cloud-sync/wire/esitleme.ts` bulutla BAYT-EŞİTTİR; elle değiştirilmez, iki uç birlikte güncellenir ve mühür yenilenir. [bekçi: test_patron_bulut_imza]
- Özel anahtar yalnız 0600 dosyada durur; repoya, log'a, hata mesajına, audit yüküne girmez; izni geniş dosya açılmaz, var olan dosya ezilmez. [bekçi: test_patron_bulut_imza]
- Bulut hesap yapmaz: her türev sayıyı fabrika hesaplar, bulut yalnız saklar ve gösterir. [inceleme]
- Tetikleyici ya da eşitleme hatası fabrikanın yazmasını ASLA durdurmaz; her tetikleyici fonksiyonu `EXCEPTION WHEN OTHERS` ile sarılır ve yutulan hata `sync_mark_error_seq` sayacına düşer (`patron_sync_status().swallowed_errors`). [bekçi: test_db_invariants]
- Eşitleme migration'ı (`20260929152815_patron_bulut_esitleme`) backend DURMUŞKEN uygulanır; reçete `docs/ops/PATRON-ESITLEME-KURULUM.md`. [inceleme]
- Tetikleyiciler KAPALI doğar; açma/kapama yalnız `SELECT patron_sync_set_enabled(true|false)` ile yapılır, elle `ALTER TABLE … ENABLE TRIGGER` yazılmaz. [inceleme]
- Anahtar `LOCK TABLE … NOWAIT` kullanır; açık yazma ya da autovacuum varken 55P03 döner ve çağıran yeniden dener, `NOWAIT` kaldırılmaz. [bekçi: test_db_invariants]
- Eşitleme kataloğu (`cloud-sync/projections.ts` + `catalog-facts.ts`) finans alanı taşımaz: fiyat, tutar, döviz, bakiye kolonu ne tel adı ne kaynak olarak yazılır. [bekçi: test_patron_bulut_esitleme]
- Eşitleme işi yalnız ön koşul açıkken kurulur; kapalıyken zamanlayıcı yoktur ve iş hiçbir yoldan başlatılmaz. [bekçi: test_patron_bulut_esitleme]
- Ayar ↔ tetikleyici ↔ iş uzlaştırması tek yerdedir (`jobs/patron-cloud.jobs.ts`): açarken önce tetikleyiciler, başarırsa iş; kapatırken iş durur ve tetikleyiciler kapanır; açılışta ve her `patronCloud.*` ayar yazımında aynı uzlaştırma koşar. [bekçi: test_patron_bulut_esitleme]
- 55P03 tekrarı sınırlıdır (6 deneme, toplam ≈ 6 sn); Prisma sarmalının kendi kodu (`P2010`) PG kodu sayılmaz, içindeki kod okunur. [bekçi: test_patron_bulut_esitleme]
- Eşitleme hatası istek yolunu etkilemez: tık asla fırlatmaz, hata tek satır log + geri çekilmedir (aralık × 2^n, tavan 60 dk). [bekçi: test_patron_bulut_esitleme]
- Anlık projeksiyon (`cloud-sync/snapshots.ts` + `snapshot-schemas.ts`) finans alanı ve termin/gecikme türevi taşımaz; şeması katıdır, tanımadığı alan gitmez. [bekçi: test_patron_bulut_anliklar]
- Telefon ve panel aynı soruya aynı sayıyı verir: anlık, panelin kullandığı rapor/servisi aynen çağırır, ikinci tanım yazmaz. [bekçi: test_patron_bulut_anliklar]
- Anlık hesabı fabrikanın yazma yoluna yük bindirmez: yalnız eşitleme işinde, aralık başına en çok bir kez, kaynaklar sırayla ve tur başına bir kez hesaplanır; bir anlığın hatası yalnız o anlığı düşürür. [bekçi: test_patron_bulut_anliklar]
- `ozet`in bir bölümünün hatası özeti düşürmez: her bölüm (`ozet.stok` · `ozet.siparis` · `ozet.uretim` · `ozet.sevkiyat` · `ozet.fason`) ayrı kurulur, hatalı bölüm o turda gönderilmez ve tek satır log'a düşer. [bekçi: test_patron_bulut_anliklar]
- `stok-kalem` anlığı panelin "Kalem ve top" sekmesiyle aynı tanımdır: kalemler `getStockKalem`den, toplar aynı raf okumasından gelir; yaş fabrika takvim günüdür, bu yüzden stok değişmedikçe içerik özeti gün içinde sabit kalır. [bekçi: test_patron_bulut_anliklar]
- Kirli-bayrak Proxy'si (ana üründeki `withDirtyTracking`) bilerek taşınmadı: değişiklik en geç bir yoklama aralığı sonra gider. [inceleme]

### Telefondan yazma (gelen kutusu, D4)

- Altın kural: telefondan gelen yeni sipariş/müşteri insan onayı beklemeden işlenir, ama her kapı işlendiği anda GÜNCEL fabrika verisine karşı koşar; ret okunur Türkçe nedenle buluta döner ve kayıt doğmaz. [bekçi: test_patron_bulut_gelen_kutusu]
- `patronCloud.syncEnabled` ve `patronCloud.inboxEnabled` şalterlerini yalnız süperadmin değiştirir (`SUPERADMIN_WRITE_SETTING_KEYS`, ham ayar ucunda izin kapısından sonra ve ayar şifresinden önce): `admin:settings`/`*` taşıyan sistem-dışı hesap 403 `SUPERADMIN_ONLY`; süperadmin yoksa kimse değiştiremez. [bekçi: test_patron_cloud_switch_superadmin]
- Yazma ayrı ayardır: `patronCloud.inboxEnabled` varsayılan KAPALI ve eşitleme açıkken de ayrıca açılır; kapalıyken iş kurulmaz, gelen kutusuna istek gitmez, teknik kullanıcı doğmaz. Aralık `patronCloud.inboxIntervalSeconds` (20–600 sn, varsayılan 30; aralık dışı değer varsayılana düşer). [bekçi: test_patron_bulut_gelen_kutusu]
- Yalnız iki tür işlenir (yeni sipariş · yeni müşteri); tanınmayan tür makbuzsuz retle buluta bildirilir. [bekçi: test_patron_bulut_gelen_kutusu]
- Aynı `mesajId` tek kayıt doğurur: kayıt ile makbuz AYNI tx'te yazılır, 8036 kilidi tx'in ilk ifadesidir ve makbuz `messageId` UNIQUE son seddir; tekrar ya da yarış makbuzdaki sonucu alır. [bekçi: test_patron_bulut_gelen_kutusu]
- Panelin canlı sipariş/müşteri yaratma kodu (`order.service.ts`, `customer.service.ts`, `base.service.ts`, iki route) bu yol için değiştirilmez; telefon yolu `services/patron-inbox/` altındaki kopyadır ve panelle alan alan aynı satırı doğurduğu karşılaştırmayla ölçülür. [bekçi: test_patron_bulut_gelen_kutusu]
- Teknik kullanıcının giriş yöntemi yoktur: `AuthService.issueToken` onu reddeder (parola/PIN/kart 401), izin verilmez, kullanıcı listesinde görünmez, kimliği ham ayar ucuna kapalıdır; yazma kapanınca kullanıcı aktif kalır. [bekçi: test_patron_bulut_gelen_kutusu]
- Telefondan gelen birim fiyat yok sayılır (kalemde fiyat ve toplam boş, makbuz mesajı söyler); finans verisi telefondan alınmaz. [bekçi: test_patron_bulut_gelen_kutusu]
- Benzer adlı müşteri varsa telefon kartı RET alır ("Benzer müşteri var: …"); eşik panelin uyarı yüzeyiyle aynı `findSimilarNames`tir, panel aynı adayda yalnız uyarır — ayrı firma ise kart panelden açılır. [bekçi: test_patron_bulut_gelen_kutusu]
- Telefon yazısının yazarı (bulut hesabı = fabrika kullanıcısı) işlendiği AN güncel fabrika izniyle denetlenir — kullanıcı listesiyle aynı süzgeç (`cloudAuthorHolds`): yok, pasif/silinmiş, teknik kullanıcı ya da `patron:giris` veya türün yazma izni (sipariş `order:write`/`mobile:siparis`, müşteri `customer:write`) yoksa makbuzlu RET `IS_KURALI` "Yetkiniz fabrikada kaldırılmış", kayıt doğmaz. [bekçi: test_patron_bulut_gelen_kutusu]
- Belirsiz hatalı mesaj üç turda makbuzlu "fabrikada işlenemedi" retle kapanır; deneme sayacı süreç belleğindedir ve yeniden başlatma idempotent tekrarla zararsızdır. [bekçi: test_patron_bulut_gelen_kutusu]

### Rapor isteği (D5)

- Rapor fabrikada hesaplanır: patron isteği buluttan çekilir ve panel ucunun çağırdığı servis panelin argümanlarıyla çağrılır (`cloud-sync/remote-reports.ts`); ikinci rapor tanımı yazılmaz. [bekçi: test_patron_bulut_rapor]
- Telefon ve panel aynı rapora aynı sayıyı verir: sonuç panelin `res.json` serileştirmesinden geçer ve panel ucunun `data`sıyla kanonik eşitliği ölçülür. [bekçi: test_patron_bulut_rapor]
- Yalnız `rapor-katalogu`ndaki 6 karne istenebilir; katalog dışı kod `RAPOR_BILINMIYOR`, panelde kapalı rapor `RAPOR_KAPALI`, geçersiz parametre `PARAMETRE_GECERSIZ` RET'iyle döner. [bekçi: test_patron_bulut_rapor]
- Rapor sonucu finans alanı taşımaz: finans adlı her anahtar (iç içe) gönderilmeden önce düşürülür. [bekçi: test_patron_bulut_rapor]
- Aynı anda tek rapor hesaplanır ve rapor başına süre sınırı 60 sn'dir: aşan istek `ZAMAN_ASIMI` alır, o hesap bitmeden yeni rapor başlamaz; 4 MB (gzip) üstü sonuç `SONUC_BUYUK` RET'idir. [bekçi: test_patron_bulut_rapor]
- Rapor işinin ayrı düğmesi yoktur: eşitleme ön koşulu açıkken başlar, kapanınca durur; aralık `patronCloud.reportIntervalSeconds` (20–600 sn, varsayılan 30; aralık dışı değer varsayılana düşer). [bekçi: test_patron_bulut_rapor]

### Cari özeti (M2a)

- Cari özeti fabrikada hesaplanır (`cloud-sync/snapshot-cari-ozeti.ts`, panelin karne servisleri ve `_shipped.ts`); bulut `GET /api/cari-ozeti/:cariKartId` ile saklanan anlıktan o müşterinin girdisini aynen döner, toplamaz (bulut bekçisi `patron/sunucu/scripts/test_cari_ozeti.ts`). [bekçi: test_patron_bulut_cari_ozeti]
- Cari özeti para taşımaz: tutar, fiyat, bakiye, döviz alanı yazılmaz; katı şema tanımadığı alanda mühürde fırlar. [bekçi: test_patron_bulut_cari_ozeti]
- Farklı birimler toplanmaz: sipariş ve açık miktar birim başına ayrı satırdır (`[{birim, miktar}]`). [bekçi: test_patron_bulut_cari_ozeti]
- Sevk BRÜT'tür, iade ayrı sayıdır ve çıkıştan düşülmez; iptal edilen iade sayılmaz. [bekçi: test_patron_bulut_cari_ozeti]
- "Son 12 ay"ın başı fabrika gününe hizalanır; veri değişmedikçe anlığın içerik özeti gün içinde değişmez. [bekçi: test_patron_bulut_cari_ozeti]
- İş emri satırının aşama/fason/müşteri alanları ve `fason-acik` kırılımı ortak okumalardan gelir (`cloud-sync/work-order-facts.ts`: İE'nin topları `whereRollsOfWorkOrders`, Kurşun/Tambur kuyruğu akış panosuyla aynı `production-flow-where.helper`, müşteri `rollupWorkOrderCustomers`, kapanış anı defterden); ikinci tanım yazılmaz. [bekçi: test_patron_bulut_is_emri]
- Tel sözleşmesi yalnız EKLEYEREK genişler: var olan uç, alan, projeksiyon adı değişmez; yeni alan katalog sürümünü artırır. [inceleme]
- Sözleşme genişletmesinde kurulum sırası önce bulut, sonra fabrikadır; eski bulut bilinmeyen projeksiyonu yalnız o girdide reddeder (tur KISMI, düşmez) ama reddedilen kayıt her turda baştan, anlık her aralıkta yeniden gönderilir. [inceleme]

### Patron girişi · doğrulama kodu (bulut `patron/sunucu`)

- Doğrulama kodu (TOTP) isteğe bağlıdır ve hesap başına Profil › Güvenlik'ten açılır; açık hesapta giriş, parola değişimi, hesap silme ve cihaz bağlama kodsuz geçmez. [bekçi: patron/sunucu test_dogrulama_kodu]
- Yanlış parolada doğrulama durumu sızmaz: `DOGRULAMA_KODU_GEREKLI` yalnız doğru paroladan sonra döner, yanlış parola her hesapta aynı 401'dir. [bekçi: patron/sunucu test_dogrulama_kodu]
- Kodunu kaybeden hesabın doğrulaması yalnız satıcı CLI'siyle kapatılır (`tesis.ts dogrulama-kapat --eposta --talep --gerekce`, denetim `DOGRULAMA_KAPATILDI`); uygulamada kurtarma yolu yoktur. [bekçi: patron/sunucu test_dogrulama_kodu]
- Parola asgari 12 karakterdir ve yaygın parola listesindeki parola reddedilir. [bekçi: patron/sunucu test_dogrulama_kodu]
- Giriş sözleşmesi değişince kurulum sırası önce bulut, sonra uygulamadır: yeni uygulama eski bulutta kodsuz giremez. [inceleme]

### Kullanıcı listesi (üyelik = Electron şifresi)

- Buluta yalnız parolası GÜNCEL kural sürümüyle belirlenmiş kullanıcının özeti gider (Y8): `User.passwordPolicyVersion >= PASSWORD_POLICY_VERSION` hem sorguda hem satır yükleminde; sürümü yalnız `newPasswordFields` (yarat · yönetici sıfırla · kendi değiştir · süperadmin kur) günceller, eski parolalı kullanıcı yeniden belirleyene kadar ne girer ne yazar; bulut tarafında `PAROLA_ZAYIF` yanıtı yoktur (kâhin olurdu). [bekçi: test_password_policy_version]
- Telefona yalnız `patron:giris` iznini BİREBİR taşıyan fabrika kullanıcısı girer; `*`/`patron:*` jokeri ve "Admin (Tam Yetki)" şablonu bu izni vermez, panelden kişi kişi atanır. [bekçi: test_patron_bulut_kullanicilar]
- Telefon izni bulutta atanmaz, fabrika izinlerinden türetilir; tablonun tek kaynağı `cloud-sync/user-permission-map.ts`tir ve finans izni türetmez. [bekçi: test_patron_bulut_kullanicilar]
- Süperadmin, sistem ve teknik kullanıcı buluta ASLA gitmez; pasif, silinmiş ve izin penceresi dışındaki kullanıcı kümeden düşer (süzgeç sorguda ve satır yükleminde iki kat). [bekçi: test_patron_bulut_kullanicilar]
- Kullanıcı kaydı açık select'le okunur (`CLOUD_USER_SELECT`); PIN, kart, TOTP sırrı ve oturum sayacı ne okunur ne gider; parola bcrypt özeti olduğu gibi gider. [bekçi: test_patron_bulut_kullanicilar]
- Kullanıcı listesi işi ve `--kuru` aracı log'a, audit'e ve hata özetine yalnız SAYI yazar; parola özeti ve küme özeti basılmaz. [bekçi: test_patron_bulut_kullanicilar]
- Kullanıcı listesi işinin (`jobs/cloud-users.job.ts`) ayrı düğmesi yoktur: eşitleme ön koşulu açıkken başlar, kapanınca durur; her tur önce ön koşulu sorar ve kapalıyken ne DB okur ne istek atar. [bekçi: test_patron_bulut_kullanicilar]
- Liste her gönderimde TAM kümedir: 30 sn'de bir kurulur, özet değiştiyse ya da 10 dk geçtiyse gönderilir; kümede olmayan hesabı bulut kapatır. [bekçi: test_patron_bulut_kullanicilar]
- Bulut hesabı fabrikanın malıdır: hesabın fabrika kolonlarını (kullanıcı adı, ad, izin, durum, mühürlü parola özeti, kimlik sürümü, kapanış) yalnız eşitleme rolü yazar, uygulama rolü yalnız son giriş anını yazar; ikinci etken (`account_factors`) uygulamanındır ve eşitleme rolü ona erişemez. [bekçi: patron/sunucu test_kullanici_esitleme]
- Bulut `POST /v1/kullanicilar` kümesini tek tx'te (ilk ifade 9205 kilidi) uygular: kümede yok → PASİF + parola özeti NULL + oturumlar kapanır; parola özeti değişince (kapanış/yeniden açılış dahil) `kimlik_surumu` +1; özet gövdeyle tutmazsa ya da izin bulut kataloğunda yoksa 400; denetime ve log'a parola özeti ve mühür yazılmaz, log yalnız sayıdır. [bekçi: patron/sunucu test_kullanici_esitleme]
- Telefon girişi fabrika kullanıcı adı + fabrika parolasıyladır (bcrypt, mühür açılır; TOTP isteğe bağlı, `account_factors`ta): bilinmeyen/PASİF/kilitli/yanlış parola AYNI 401 + sahte karşılaştırma + ≥ 500 ms taban; hesap başına 24 sa'te 50 başarısız → 1 sa yeni giriş kilidi (açık oturum sürer); oturum `kimlik_surumu` hesabınkinden farklıysa 401; kullanıcı kümesi 7 günden bayatsa yeni giriş 503 `FABRIKA_BAGLANTISI_YOK`; bulutta `PAROLA_ZAYIF` yanıtı YOKTUR (Y8). [bekçi: patron/sunucu test_giris_fabrika_parolasi]
- Eski bulut (`/v1/kullanicilar` 404) hata değildir: tek satır log + 60 dk geri çekilme; kurulum sırası önce bulut, sonra fabrikadır. [bekçi: test_patron_bulut_kullanicilar]

## Açma reçetesi (bakım penceresinde, kullanıcıya gösterilerek)

1. `.env`: `PATRON_CLOUD_URL=https://<bulut kökeni>` ve `PATRON_CLOUD_KEY_FILE=<mutlak yol>` (dosya veri dizininde, repoda değil).
2. `cd Teks-Erp && npx tsx scripts/patron-bulut-anahtar.ts` — dosya yoksa üretir (0600), varsa okur; `--kurulum=` ve `--acik-anahtar=` değerlerini basar, özel anahtarı basmaz. Bu iki değer bulutta `tesis.ts kurulum-kaydet --kurulum= --acik-anahtar=`e verilir (adımlar ve ölçümler: `docs/ops/PATRON-ESITLEME-KURULUM.md` § 5).
3. Ayar: `PUT /api/admin/settings/patronCloud.syncEnabled` `{"value":"true"}` (YALNIZ süperadmin oturumuyla — `admin:settings` 403 `SUPERADMIN_ONLY` alır; süperadmin ayar şifresinden muaf); geri dönüş aynı ucu `"false"` ile çağırmaktır. Yoklama aralığı `patronCloud.syncIntervalMinutes` (1–60 dk, varsayılan 5; aralık dışı değer varsayılana düşer).
4. Telefondan yazma (okumadan en az bir hafta sonra): `PUT /api/admin/settings/patronCloud.inboxEnabled` `{"value":"true"}`; geri dönüş aynı uç `"false"`. Gelen kutusu aralığı `patronCloud.inboxIntervalSeconds` (20–600 sn, varsayılan 30). Adımlar: `docs/ops/PATRON-ESITLEME-KURULUM.md` § 6.

## Tuzaklar

- Windows'ta dosya izin bitleri NTFS ACL'yi yansıtmaz; orada 0600 denetimi atlanır ve koruma anahtar dizininin ACL'sidir.
- Üretim akışının "Depo" kolonu binadaki BÜTÜN `WAREHOUSE` topunu (çuvaldakiler dahil) sayar; stok karnesinin "Bitmiş"i yalnız çuvala/sevkiyata girmemiş serbest stoktur — iki ayrı kavramdır, birini ötekine eşitleme; ayrımı etiket taşır.
- Bulut hizmeti süresizdir: lisans sınıfı, modül hakkı, abonelik bitişi ve hizmet aşaması yoktur; fabrika kanalı kapısı kurulum kaydı + açık anahtar + aktifliktir (bulut bekçileri `test_disa_aktarma` §1–§2, `test_esitleme_idempotency` §5j–§5l).
- Kurulum kimliği keşif kimliğiyle aynıdır (`system.installationId`); boot işi üretir — araç onu yalnız okur, DB'ye yazmaz.

## Bekçiler

Backend: `test_patron_bulut_imza` · `test_patron_bulut_kullanicilar` · `test_patron_cloud_switch_superadmin` · `test_password_policy_version` · `test_patron_bulut_uygunluk` · `test_patron_bulut_esitleme` · `test_patron_bulut_anliklar` · `test_patron_bulut_gelen_kutusu` · `test_patron_bulut_rapor` · `test_patron_bulut_cari_ozeti` · `test_patron_bulut_is_emri` · `test_feature_flag_contract` · `test_token_replay_bogaz` · `test_snapshot_kolonlari` · `test_db_invariants`

Bulut (`patron/sunucu/scripts/`, koşucu `npx tsx scripts/run-all-tests.ts`, `_test` DB): `test_dogrulama_kodu` (doğrulama kodu isteğe bağlı · açıkken zorunlu · sızıntı yok · CLI kapatma) · `test_cari_ozeti` · `test_disa_aktarma` · `test_patron_kapilari` · `test_rls_sizinti` ve dizindeki diğer `test_*.ts`.

Gerçek veri provası bekçi değildir, yalnız yerel prova/test veritabanında koşar: `Teks-Erp/scripts/prova_patron_esitleme.ts` (28 tetikleyicinin kapalı doğması, hata yutma, anahtar davranışı, süreler).

Rapor isteği hacim ölçümü bekçi değildir, yalnız yerel `_prova`/`_test` veritabanında koşar: `Teks-Erp/scripts/olcum_patron_bulut_rapor.ts` (6 karne × süre, boyut, panel eşitliği, yük altında panel sorgusu gecikmesi).

İş emri projeksiyonu ölçümü bekçi değildir, yalnız yerel `_prova`/`_test` veritabanında koşar: `Teks-Erp/scripts/olcum_patron_is_emri.ts` (tasarım sayıları ↔ kurucu, satır/anlık boyutu; `--ornek=` repo dışına örnek yazar).

Uçtan uca eşitleme ölçümü de bekçi değildir, yalnız yerel `_prova`/`_test` veritabanı ve `127.0.0.1` bulutuyla koşar: `Teks-Erp/scripts/olcum_patron_esitleme_uctan_uca.ts` (ilk TAM, sayım eşleşmesi, artımlı, bulut kapalı/açık, kapatma).

Kaynak (ana ürün `lib/license/protocol/`, `cloud-sync/`, `lib/http-egress.ts`), kaynak commit kimliği ve ana üründen farklar: arşiv notu 2026-11-12 "Patron bulutu D1".
