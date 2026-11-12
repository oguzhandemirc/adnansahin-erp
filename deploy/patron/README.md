# deploy/patron — Adnan Şahin patron bulutu (VDS)

Sunucu adresi, parola ve anahtarlar bu repoya GİRMEZ; yalnız VDS'te `/opt/adnan/patron/` altında durur.
VDS'teki genel düzen `/opt/adnan/DUZEN.md`'de.

| Dosya | VDS'teki yeri |
|---|---|
| `compose.yaml` | `/opt/adnan/patron/compose.yaml` (birebir) |
| `Caddyfile.patron` | `/opt/adnan/proxy/Caddyfile` içindeki patron bloğu (alan adı orada yazılı) |
| `yedekle.sh` | `/opt/adnan/yedek/yedekle.sh` (birebir; `adnan-yedek.timer` 03:30) |
| `Dockerfile` · `patron-baslat.sh` · `imaj-derle.sh` | imaj derleme (geliştirici makinesi) |

Kapsayıcılar: `caddy` (80/443, ağ `adnan-ag`) · `patron-api` (4620, ağlar `patron_ic` + `adnan-ag`, port yayını YOK) ·
`patron-db` (postgres:17, yalnız `patron_ic`, internal). Sırlar `sirlar/` (root:10001 0440), TOTP sarma anahtarı
`anahtarlar/patron-totp.key` (10001 0600); `.env` (0600): `POSTGRES_*`, `PATRON_IMAJ`, `ADNAN_AG_ALT_AGI`.

## İlk kurulum (bir kez)

1. VDS'te `/opt/adnan/patron/`: `.env`, `sirlar/*`, `anahtarlar/patron-totp.key` üret (yalnız harf/rakam parolalar).
2. İmaj: `deploy/patron/imaj-derle.sh --kaydet=/tmp/adnan-patron.tar.gz` → `gunzip -c /tmp/adnan-patron.tar.gz | ssh adnan-vds docker load`
   (kayıt deposu YOK). `.env`te `PATRON_IMAJ=adnan-patron:<sha>`.
3. `compose.yaml`ı kopyala; `cd /opt/adnan/patron && docker compose --profile goc run --rm goc` (göç + roller + tesis DB göçü).
4. `docker compose up -d api` → `docker ps` sağlıklı.
5. Caddy patron bloğu `Caddyfile.patron` ile aynı; dosyayı YERİNDE düzenle (bind mount tek dosya: yeni inode kapsayıcıya
   görünmez), `docker exec caddy caddy validate --config /etc/caddy/Caddyfile` → `docker exec caddy caddy reload --config /etc/caddy/Caddyfile`.
6. Tesis: `docker compose --profile goc run --rm goc node dist-cli/scripts/tesis.js tesis-ac --tesis=<uuid> --ad="Adnan Şahin"`.
7. İlk yönetici: `… tesis.js yonetici-davet --tesis=<uuid> --eposta=<e-posta> --ad="…"` — belirteç BİR KEZ basılır, ekrana
   değil 0600 dosyaya yönlendir; davet `/api/davet/incele → kabul (parola) → onay (TOTP)` ile tamamlanır.

## Fabrika kaydı (`kurulum-kaydet`) — fabrikanın açık anahtarı gelince

```bash
cd /opt/adnan/patron && docker compose --profile goc run --rm goc node dist-cli/scripts/tesis.js kurulum-kaydet \
  --tesis=<tesis uuid> --kurulum=<fabrika kurulum uuid> --acik-anahtar=<Ed25519 açık anahtar> \
  --sinif=URETIM --moduller=patron-bulut,production.enabled --bitis=yok
```

Bu kayıt olmadan `/v1/*` (fabrika eşitlemesi) her isteği 401 ile reddeder.

## Güncelleme

1. Commit → `imaj-derle.sh --kaydet=…` → `docker load` (eski imaj SİLİNMEZ; geri alma için kalır).
2. Göç öncesi elle yedek: `/opt/adnan/yedek/yedekle.sh`.
3. `.env`te `PATRON_IMAJ`ı yeni etikete çevir; göç varsa `docker compose --profile goc run --rm goc`.
4. `docker compose up -d api` → `docker ps` (healthy) + `curl -s https://<alan>/saglik`.

## Geri alma

- Göç YOKSA: `.env`te `PATRON_IMAJ`ı önceki etikete çevir → `docker compose up -d api`.
- Göç VARSA: göç geri alınmaz; önceki imaja dönmek için DB'yi göç öncesi yedekten geri yükle
  (`docker compose stop api` → DB'leri yeniden yarat → `gunzip -c <db>-<damga>.sql.gz | docker exec -i patron-db psql -U patron -d <db>`
  → `docker compose --profile goc run --rm goc` (eski imajla roller) → `up -d api`).
- Acil kapatma: Caddy patron bloğunda `reverse_proxy` yerine `respond "Hazırlanıyor" 503` → reload.
