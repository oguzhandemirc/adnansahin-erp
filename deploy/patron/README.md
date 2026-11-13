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
`tesis_rol_anahtari` (giriş dizini anahtarı, 32 bayt base64url) · isteğe bağlı `guvenlik_telegram_bot_token` / `guvenlik_telegram_chat_id`. TOTP sarma
anahtarı `anahtarlar/patron-totp.key` (10001 0600). `.env` (0600, PAROLA TAŞIMAZ): `POSTGRES_USER`, `POSTGRES_DB`,
`PATRON_IMAJ`, `ADNAN_AG_ALT_AGI`; `proxy/.env`: `PATRON_ALAN_ADI`, `ACME_EPOSTA`, `ADNAN_AG_ALT_AGI` (aynı değer).

## İlk kurulum (bir kez)

1. İmaj: `deploy/patron/imaj-derle.sh --kaydet=/tmp/adnan-patron.tar.gz` → `gunzip -c /tmp/adnan-patron.tar.gz | ssh <vds> docker load`
   (kayıt deposu YOK). `.env`te `PATRON_IMAJ=adnan-patron:<sha>`.
2. `cd /opt/adnan/proxy && docker compose up -d` (ağ `adnan-ag` + Caddy; sertifika ilk istekte alınır).
3. `cd /opt/adnan/patron && docker compose --profile goc run --rm goc` (db ilk kez açılır → `patron_goc` kurulur →
   `migrate deploy` → `db-rolleri`).
4. `docker compose up -d api` → `docker ps` sağlıklı; `curl -fsS https://<alan>/saglik`.
5. Tesis + fabrika kaydı + ilk yönetici (CLI, aşağıda).

## Tesis CLI'si (tek tesis; tesis kimliği komutlarda verilmez)

```bash
R="docker compose --profile goc run --rm goc node dist-cli/scripts/tesis.js"
$R tesis-ac --ad="Adnan Şahin"                                  # kimlik üretilir; yeniden koşum adı günceller
$R kurulum-kaydet --kurulum=<fabrika kurulum uuid> --acik-anahtar=<Ed25519 x>   # fabrikada patron-bulut-anahtar.ts çıktısı
$R durum                                                         # tesis + kurulum kayıtları (sırsız)
$R yonetici-davet --eposta=<e-posta> --ad="<Ad Soyad>" > /root/davet.txt && chmod 600 /root/davet.txt   # belirteç BİR KEZ
```

Kurulum kaydı olmadan (ya da `--pasif` kayıtta) `/v1/*` fabrika eşitlemesi 401/403 alır, telefondan yazma 403
`PATRON_BULUT_KAPALI` döner. Lisans sınıfı, modül, bitiş tarihi YOKTUR (bulut süresiz).

İlk yöneticinin daveti `/api/davet/incele → kabul (parola)` ile tamamlanır, hesap hemen AKTİF olur. Kimlik modeli
ayrı dilimde ("Electron şifresi") değişecek; o dilime dek davet yolu geçerli.

## Kurtarma (her biri talep no + gerekçe ister, bulut denetimine yazılır; e-postayı çıktıyla paylaşma)

```bash
$R dogrulama-kapat --eposta=<e-posta> --talep=<no> --gerekce="<neden>"            # telefon kaybı: TOTP kapanır, parola kalır
$R kimlik-sifirla --eposta=<e-posta> --zorla --talep=<no> --gerekce="<neden>"      # kayıp parola: yeni davet, izinler korunur
$R yonetici-yeniden-davet --eposta=<e-posta> [--zorla --talep=<no> --gerekce="…"]  # yönetici kalmadı: yönetici olarak yeniden davet
$R ozet-yenile [--apply]                                                           # giriş dizini anahtarı değişti
```

## Giriş akışı

- `POST /api/oturum/ac` `{eposta, parola}`: doğrulama kodu kapalı hesapta oturum hemen açılır.
- Kodu AÇIK hesapta kod yoksa YALNIZ doğru paroladan sonra 401 `DOGRULAMA_KODU_GEREKLI` döner; uygulama kod alanını
  açar ve `{eposta, parola, totp}` ile yeniden dener. Yanlış parola her hesapta aynı 401'dir (durum sızmaz).
- Kilit: hesap + kaynak başına 5 yanlış denemede 15 dk (süreç belleğinde; yeniden başlatma sıfırlar).
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
