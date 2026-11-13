#!/bin/sh
# patron-db İLK açılışında (boş veri hacmi) bir kez koşar — postgres imajının /docker-entrypoint-initdb.d kancası.
# Göç rolü `patron_goc`: tablo SAHİBİ ama süper kullanıcı DEĞİL (güvenlik denetimi D13): NOSUPERUSER NOBYPASSRLS
# NOCREATEDB, yalnız CREATEROLE (db-rolleri.ts çalışma rollerini kurar/parolasını hizalar). DB ve `public` şeması
# ona devredilir. Önyükleme süper kullanıcısı (POSTGRES_USER) yalnız kapsayıcı içi yerel sokette kalır (yedek).
# Parola docker sırrından okunur (yalnız harf/rakam); ortama ve günlüğe girmez.
set -eu
P="$(tr -d '\r\n' < /run/secrets/goc_parolasi)"
case "$P" in *[!0-9A-Za-z]*|"") echo "[patron-db] goc_parolasi boş ya da yalnız harf/rakam değil" >&2; exit 1 ;; esac
psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" -v p="$P" -v db="$POSTGRES_DB" <<'SQL'
CREATE ROLE patron_goc LOGIN NOSUPERUSER NOBYPASSRLS NOCREATEDB CREATEROLE NOINHERIT PASSWORD :'p';
ALTER DATABASE :"db" OWNER TO patron_goc;
ALTER SCHEMA public OWNER TO patron_goc;
SQL
echo "[patron-db] göç rolü patron_goc kuruldu (süper kullanıcı değil)"
