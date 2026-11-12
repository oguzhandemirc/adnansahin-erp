#!/usr/bin/env bash
# Günlük patron yedeği — VDS /opt/adnan/yedek/yedekle.sh bu dosyanın birebir kopyasıdır (systemd adnan-yedek.timer).
# patron-db'deki BÜTÜN kullanıcı veritabanlarını (merkez `patron` + tesis başına `patron_t…`) tek tek alır:
# pg_dump -> gzip -> /opt/adnan/yedek/dosyalar/<db>-<damga>.sql.gz, 14 gün saklanır.
# Bir DB başarısız olsa da diğerleri alınır; sonda hata varsa çıkış 1 (timer kırmızı görünsün).
# Geri yükleme: rolleri göç kapsayıcısı yeniden kurar (`--no-owner`); ayrıntı deploy/patron/README.md.
set -euo pipefail
umask 077
HEDEF=/opt/adnan/yedek/dosyalar
DAMGA=$(date +%Y%m%d-%H%M%S)
HATA=0

DBLER=$(docker exec patron-db sh -c 'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -AtX -c "SELECT datname FROM pg_database WHERE NOT datistemplate AND datname <> '"'"'postgres'"'"' ORDER BY 1"')
[ -n "$DBLER" ] || { echo "⛔ veritabanı listesi boş" >&2; exit 1; }

for DB in $DBLER; do
  case "$DB" in *[!a-z0-9_]*) echo "⛔ beklenmeyen DB adı atlandı: $DB" >&2; HATA=1; continue ;; esac
  DOSYA="$HEDEF/$DB-$DAMGA.sql.gz"
  if docker exec patron-db sh -c "pg_dump -U \"\$POSTGRES_USER\" -d '$DB' --no-owner" | gzip -9 > "$DOSYA.tmp" \
     && gzip -t "$DOSYA.tmp"; then
    mv "$DOSYA.tmp" "$DOSYA"
    echo "yedek tamam: $DOSYA ($(stat -c %s "$DOSYA") bayt)"
  else
    rm -f "$DOSYA.tmp"
    echo "⛔ yedek alınamadı: $DB" >&2
    HATA=1
  fi
done

find "$HEDEF" -name "*.sql.gz" -mtime +14 -delete
find "$HEDEF" -name "*.tmp" -mmin +120 -delete
exit "$HATA"
