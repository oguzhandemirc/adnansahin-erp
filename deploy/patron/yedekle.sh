#!/usr/bin/env bash
# Günlük patron yedeği — VDS /opt/adnan/yedek/yedekle.sh bu dosyanın birebir kopyasıdır (systemd adnan-yedek.timer).
# Tek veritabanı (POSTGRES_DB): pg_dump (kapsayıcı içi yerel soket, önyükleme kullanıcısı) -> gzip -> gzip -t ->
# /opt/adnan/yedek/dosyalar/<db>-<damga>.sql.gz; 14 gün saklanır. Geri yükleme: README § Geri alma.
# İSTEĞE BAĞLI (güvenlik denetimi O7; dosyalar yoksa davranış bugünküyle aynı):
#   /opt/adnan/yedek/age-alici.txt  varsa döküm `age` ile bu açık anahtara ŞİFRELENİR (.sql.gz.age), düz kopya
#                                   diskte KALMAZ. Özel anahtar VDS'te DURMAZ (geliştirici makinesinde/kasada).
#   /opt/adnan/yedek/uzak-hedef.txt varsa (tek satır `kullanici@makine:/dizin`) dosya rsync+ssh ile makine dışına
#                                   kopyalanır; anahtar /root/.ssh/adnan-yedek (yalnız o hedefe, salt yazma önerilir).
# Hata varsa çıkış 1 (timer kırmızı görünsün).
set -euo pipefail
umask 077
KOK=/opt/adnan/yedek
HEDEF=$KOK/dosyalar
DAMGA=$(date +%Y%m%d-%H%M%S)

DB=$(docker exec patron-db sh -c 'printf %s "$POSTGRES_DB"')
case "$DB" in ""|*[!a-z0-9_]*) echo "⛔ beklenmeyen DB adı: '$DB'" >&2; exit 1 ;; esac
DOSYA="$HEDEF/$DB-$DAMGA.sql.gz"

if ! docker exec patron-db sh -c "pg_dump -U \"\$POSTGRES_USER\" -d '$DB' --no-owner" | gzip -9 > "$DOSYA.tmp" || ! gzip -t "$DOSYA.tmp"; then
  rm -f "$DOSYA.tmp"
  echo "⛔ yedek alınamadı: $DB" >&2
  exit 1
fi

if [ -s "$KOK/age-alici.txt" ]; then
  command -v age >/dev/null || { rm -f "$DOSYA.tmp"; echo "⛔ age-alici.txt var ama age kurulu değil (apt install age)" >&2; exit 1; }
  age -R "$KOK/age-alici.txt" -o "$DOSYA.age.tmp" "$DOSYA.tmp"
  rm -f "$DOSYA.tmp"
  DOSYA="$DOSYA.age"
  mv "$DOSYA.tmp" "$DOSYA"
else
  mv "$DOSYA.tmp" "$DOSYA"
fi
echo "yedek tamam: $DOSYA ($(stat -c %s "$DOSYA") bayt)"

if [ -s "$KOK/uzak-hedef.txt" ]; then
  UZAK=$(head -n1 "$KOK/uzak-hedef.txt" | tr -d '\r\n')
  if rsync -a -e "ssh -i /root/.ssh/adnan-yedek -o BatchMode=yes -o StrictHostKeyChecking=yes" "$DOSYA" "$UZAK/"; then
    echo "makine dışı kopya tamam"
  else
    echo "⛔ makine dışı kopya başarısız" >&2
    find "$HEDEF" -name "*.tmp" -mmin +120 -delete
    exit 1
  fi
fi

find "$HEDEF" \( -name "*.sql.gz" -o -name "*.sql.gz.age" \) -mtime +14 -delete
find "$HEDEF" -name "*.tmp" -mmin +120 -delete
