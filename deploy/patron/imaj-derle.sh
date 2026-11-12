#!/usr/bin/env bash
# Adnan Şahin patron sunucusu imajını HEAD'den derler: adnan-patron:<kısa sha>.
# Bağlam yalnız commit'li kaynaktır (git archive) — çalışma ağacındaki .env, node_modules, anahtar girmez.
# Kirli ağaçta durur (imaj etiketi commit'i yalan söylemesin).
#   deploy/patron/imaj-derle.sh [--platform=linux/amd64] [--kaydet=<dosya.tar.gz>]
# VDS'e taşıma: gunzip -c <dosya> | ssh <vds> docker load   (kayıt deposuna push YOK)
set -euo pipefail

PLATFORM=linux/amd64
KAYDET=""
for a in "$@"; do
  case "$a" in
    --platform=*) PLATFORM="${a#*=}" ;;
    --kaydet=*) KAYDET="${a#*=}" ;;
    *) echo "tanınmayan argüman: $a" >&2; exit 2 ;;
  esac
done

KOK="$(git -C "$(dirname "$0")" rev-parse --show-toplevel)"
if [ -n "$(git -C "$KOK" status --porcelain -- patron/sunucu deploy/patron)" ]; then
  echo "⛔ patron/sunucu ya da deploy/patron commit'siz değişiklik taşıyor; önce commit" >&2
  exit 1
fi
SHA="$(git -C "$KOK" rev-parse --short=12 HEAD)"
ETIKET="adnan-patron:$SHA"

BAGLAM="$(mktemp -d)"
trap 'rm -rf "$BAGLAM"' EXIT
git -C "$KOK" archive HEAD patron/sunucu deploy/patron/patron-baslat.sh deploy/patron/Dockerfile | tar -x -C "$BAGLAM"
mv "$BAGLAM/patron/sunucu" "$BAGLAM/sunucu"
mv "$BAGLAM/deploy/patron/patron-baslat.sh" "$BAGLAM/deploy/patron/Dockerfile" "$BAGLAM/"
rm -rf "$BAGLAM/patron" "$BAGLAM/deploy"

docker build --platform "$PLATFORM" --target sunucu -f "$BAGLAM/Dockerfile" -t "$ETIKET" "$BAGLAM"
echo "✅ $ETIKET ($PLATFORM)"

if [ -n "$KAYDET" ]; then
  docker save "$ETIKET" | gzip -1 > "$KAYDET"
  echo "✅ kaydedildi: $KAYDET ($(wc -c < "$KAYDET") bayt)"
fi
