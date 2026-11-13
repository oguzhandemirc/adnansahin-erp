# deploy/patron — Adnan Şahin patron bulutu (VDS, tek tesis, yalnız API)

Sunucu adresi, alan adı, parola ve anahtarlar bu repoya GİRMEZ; yalnız VDS'te `/opt/adnan/` altında durur.
VDS'te panel/web arayüzü YOKTUR: yönetim SSH + CLI'dir. Sıfırdan kurulum adımları (sunucu sertleştirmesi dahil):
`tekserp-yedek/adnansahin/belgeler/VDS-SIFIRDAN-KURULUM.md` (repo dışı).

| Dosya | VDS'teki yeri |
|---|---|
| `compose.yaml` · `db-init/10-goc-rolu.sh` | `/opt/adnan/patron/` (birebir) |
| `proxy/compose.yaml` · `proxy/caddy/Caddyfile` · `proxy/caddy/patron.caddy` | `/opt/adnan/proxy/` (birebir) |
| `yedekle.sh` | `/opt/adnan/yedek/yedekle.sh` (birebir; `adnan-yedek.timer` 03:30) |
| `Dockerfile` · `patron-baslat.sh` · `imaj-derle.sh` | imaj derleme (geliştirici makinesi) |

Kapsayıcılar: `caddy` (proje `proxy`; 80/443 + 443/udp, ağ `adnan-ag` — ağı bu proje kurar) · `patron-api` (4620, ağlar
`patron_ic` + `adnan-ag`, port yayını YOK) · `patron-db` (postgres:17, yalnız `patron_ic`, internal). Hepsi kök FS salt
okunur, yetenekleri düşük (Caddy'de yalnız `NET_BIND_SERVICE`), `no-new-privileges`, bellek/pid tavanlı; api/db root
değil (10001 · 70); dış imajlar özetle sabit. Bekçi `patron/sunucu/scripts/test_compose_sirlari.ts` §4.

DB rolleri: önyükleme süper kullanıcısı (`POSTGRES_USER`, parolası `sirlar/db_kok_parolasi`; yalnız kapsayıcı içi
yerel soket — yedek) · göç rolü `patron_goc` (tablo sahibi, süper kullanıcı DEĞİL; ilk açılışta `db-init` kurar) ·
`patron_uygulama` / `patron_esitleme` (NOBYPASSRLS; `db-rolleri` kurar). Sunucu tablo sahibi ya da RLS'i atlayabilen
rolle KALKMAZ.

Sırlar `/opt/adnan/patron/sirlar/`, HEPSİ root:10001 0440 (db kapsayıcısı ek grup 10001 ile yalnız kendine bağlanan iki
sırrı okur): `db_kok_parolasi` · `goc_parolasi` · `uygulama_parolasi` · `esitleme_parolasi` (yalnız harf/rakam) ·
isteğe bağlı `guvenlik_telegram_bot_token` / `guvenlik_telegram_chat_id`. TOTP sarma
anahtarı `anahtarlar/patron-totp.key` (10001 0600). `.env` (0600, PAROLA TAŞIMAZ): `POSTGRES_USER`, `POSTGRES_DB`,
`PATRON_IMAJ`, `ADNAN_AG_ALT_AGI`; `proxy/.env`: `PATRON_ALAN_ADI`, `ACME_EPOSTA`, `ADNAN_AG_ALT_AGI` (aynı değer).

## İlk kurulum (bir kez)

1. İmaj: `deploy/patron/imaj-derle.sh --kaydet=/tmp/adnan-patron.tar.gz` → `gunzip -c /tmp/adnan-patron.tar.gz | ssh <vds> docker load`
   (kayıt deposu YOK). `.env`te `PATRON_IMAJ=adnan-patron:<sha>`.
   TOTP sarma anahtarı (birim salt okunur; sunucu üretemez, yoksa api `EROFS` ile açılmaz):
   `openssl rand 32 | basenc --base64url | tr -d '=\n' | sudo tee /opt/adnan/patron/anahtarlar/patron-totp.key >/dev/null`
   → `sudo chown 10001:10001 …/patron-totp.key && sudo chmod 0600 …/patron-totp.key`. Kaybı = TOTP sırları çözülmez; `yedekle.sh` almaz, kasaya ayrıca kopyala.
2. `cd /opt/adnan/proxy && docker compose up -d` (ağ `adnan-ag` + Caddy; sertifika ilk istekte alınır).
3. `cd /opt/adnan/patron && docker compose --profile goc run --rm goc` (db ilk kez açılır → `patron_goc` kurulur →
   `migrate deploy` → `db-rolleri`).
4. `docker compose up -d api` → `docker ps` sağlıklı; `curl -fsS https://<alan>/saglik`.
5. Tesis + fabrika kaydı (CLI, aşağıda). Hesaplar fabrikadan gelir (üyelik = Electron şifresi): panelde kullanıcıya
   `patron:giris` atanır, eşitleme açıkken kullanıcı listesi `POST /v1/kullanicilar` ile ≤ 10 dk'da buluta düşer.

## Tesis CLI'si (tek tesis; tesis kimliği komutlarda verilmez)

```bash
R="docker compose --profile goc run --rm goc node dist-cli/scripts/tesis.js"
$R tesis-ac --ad="Adnan Şahin"                                  # kimlik üretilir; yeniden koşum adı günceller
$R kurulum-kaydet --kurulum=<fabrika kurulum uuid> --acik-anahtar=<Ed25519 x>   # fabrikada patron-bulut-anahtar.ts çıktısı
$R durum                                                         # tesis + kurulum kayıtları (sırsız)
```

Kurulum kaydı olmadan (ya da `--pasif` kayıtta) `/v1/*` fabrika eşitlemesi 401/403 alır, telefondan yazma 403
`PATRON_BULUT_KAPALI` döner. Lisans sınıfı, modül, bitiş tarihi YOKTUR (bulut süresiz).

Bulutta davet, hesap yaratma, parola değişimi ve hesap silme YOKTUR: hesap, ad, izin ve parola fabrikada değişir;
kullanıcıyı fabrikada pasifleştirmek bulut hesabını kapatır. Eski `sirlar/tesis_rol_anahtari` dosyası artık okunmaz
(silinebilir).

## Acil durum (gerekçe denetime yazılır; kullanıcı adı çıktıya basılmaz)

```bash
$R kullanici-kilitle --kullanici=<ad> --gerekce="<neden>" [--talep=<no>]   # fabrika kapalıyken de: giriş 401, açık oturumlar kapanır
$R kullanici-ac --kullanici=<ad> [--gerekce="<neden>"]                      # bulut kilidi + kaba kuvvet kilidi kalkar
$R dogrulama-kapat --kullanici=<ad> --gerekce="<neden>" [--talep=<no>]     # telefon kaybı: TOTP kapanır, parola kalır
$R kullanici-yeniden-iste [--gerekce="<neden>"]                             # sır anahtarı kaybı: sonraki fabrika gönderimine dek yeni giriş 503
```

Kalıcı kapatma ve parola sıfırlama fabrikada (panel) yapılır.

## Giriş akışı

- `POST /api/oturum/ac` `{kullaniciAdi, parola}` (fabrika kullanıcı adı + fabrika parolası): doğrulama kodu kapalı
  hesapta oturum hemen açılır. Kullanıcı listesi 7 günden bayatsa yeni giriş 503 `FABRIKA_BAGLANTISI_YOK`.
- Kodu AÇIK hesapta kod yoksa YALNIZ doğru paroladan sonra 401 `DOGRULAMA_KODU_GEREKLI` döner; uygulama kod alanını
  açar ve `{kullaniciAdi, parola, totp}` ile yeniden dener. Yanlış parola her hesapta aynı 401'dir (durum sızmaz).
- Kilit: hesap + kaynak başına 5 yanlış denemede 15 dk (süreç belleğinde; yeniden başlatma sıfırlar); hesap başına
  24 sa'te 50 başarısız → 1 sa yeni giriş kilidi (DB'de; `kullanici-ac` sıfırlar).
- Hız sınırları (IP başına, sunucuda): `/api` geneli 600/dk · geçersiz belirteç 30/dk (aşılınca oturumlu istekler DB'ye
  inmeden 429) · giriş 20/dk · `/v1` 600/dk. Kenarda (Caddy) yalnız `/api`, `/v1`, `/saglik` geçer; gerisi 404.

## Güncelleme

1. Commit → `imaj-derle.sh --kaydet=…` → `docker load` (eski imaj SİLİNMEZ; geri alma için kalır).
2. Göç öncesi elle yedek: `/opt/adnan/yedek/yedekle.sh`.
3. `.env`te `PATRON_IMAJ`ı yeni etikete çevir; göç varsa `docker compose --profile goc run --rm goc`.
4. `docker compose up -d api` → `docker ps` (healthy) + `curl -s https://<alan>/saglik`.
5. Caddy yapılandırması: `/opt/adnan/proxy/caddy/` dizinindeki dosyayı düzenle (dizin bağlıdır) →
   `docker exec caddy caddy validate --config /etc/caddy/Caddyfile` → `docker exec caddy caddy reload --config /etc/caddy/Caddyfile`.

## Geri alma

- Göç YOKSA: `.env`te `PATRON_IMAJ`ı önceki etikete çevir → `docker compose up -d api`.
- Göç VARSA: göç geri alınmaz; önceki imaja dönmek için DB'yi göç öncesi yedekten geri yükle:
  `docker compose stop api` → `docker exec -i patron-db sh -c 'dropdb -U "$POSTGRES_USER" "$POSTGRES_DB" && createdb -U "$POSTGRES_USER" -O patron_goc "$POSTGRES_DB"'`
  → `gunzip -c <db>-<damga>.sql.gz | docker exec -i patron-db sh -c 'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB"'`
  (şifreli yedekte önce `age -d -i <özel anahtar>` geliştirici makinesinde) → `docker compose --profile goc run --rm goc`
  (eski imajla roller + sahiplik) → `up -d api`. Her komut ÖNCE kullanıcıya gösterilir.
- Acil kapatma: `proxy/caddy/patron.caddy`de `reverse_proxy` yerine `respond "Hazırlanıyor" 503` → reload.
