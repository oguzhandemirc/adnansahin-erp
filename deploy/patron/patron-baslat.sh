#!/bin/sh
# Patron konteyner girişi: DB URL'lerini ve anahtar yollarını docker SECRET dosyalarından kurar,
# komutu çalıştırır — sırlar imaj yapılandırmasına ve `docker inspect`e girmez. Rol (PATRON_ROL) hangi sırların
# okunacağını belirler; her rol YALNIZ kendi sırlarını okur ve hepsini ZORUNLU sayar (en az yetki) — tek istisna
# güvenlik bildirimi sırları (guvenlik_telegram_*): İSTEĞE BAĞLI, okunamazsa kanal KAPALI:
#   sunucu  → uygulama + eşitleme parolası · tesis rol anahtarı (giriş dizini anahtarı; ad eski düzenden)
#   goc     → göç (patron_goc, süper kullanıcı DEĞİL) + uygulama + eşitleme parolası · tesis rol anahtarı
#             (migrate deploy · db-rolleri · tesis CLI'si)
# ROL TABLOSU test_compose_sirlari §2'nin tek kaynağıdır: compose'un `secrets:` listesi bununla birebir eşleşmeli.
# Parolalar URL güvenli olmalı (onaltılık üretilir; runbook §3). Ortamda hazır verilen değer sırrın yerine geçer.
set -eu

S=/run/secrets
DB="${DB_HOST:-patron-db}:5432/${DB_ADI:-patron}?schema=public"

rol_sirlari() {
  case "$1" in
    sunucu) echo "uygulama_parolasi esitleme_parolasi tesis_rol_anahtari guvenlik_telegram_bot_token guvenlik_telegram_chat_id" ;;
    goc) echo "goc_parolasi uygulama_parolasi esitleme_parolasi tesis_rol_anahtari" ;;
    *) return 1 ;;
  esac
}

sir_var() {
  if [ ! -r "$S/$1" ]; then
    echo "[patron] sır okunamıyor: $S/$1 (rol $ROL; compose secrets listesi, SIR_GID grubu ve 0440 izni?)" >&2
    exit 1
  fi
}

# İsteğe bağlı sır: okunamazsa uyarı basar ve 1 döner (açılış sürer).
istege_bagli_sir() {
  [ -r "$S/$1" ] && return 0
  echo "[patron] uyarı: $S/$1 okunamıyor — bu kanal KAPALI" >&2
  return 1
}

parola() {
  sir_var "$1"
  p="$(tr -d '\r\n' < "$S/$1")"
  case "$p" in
    *[!0-9A-Za-z]*|"") echo "[patron] $1 boş ya da URL güvenli değil (yalnız harf/rakam)" >&2; exit 1 ;;
  esac
  printf '%s' "$p"
}

ROL="${PATRON_ROL:-sunucu}"
SIRLAR="$(rol_sirlari "$ROL")" || { echo "[patron] tanınmayan PATRON_ROL: $ROL (sunucu|goc)" >&2; exit 1; }

for sir in $SIRLAR; do
  case "$sir" in
    uygulama_parolasi)
      if [ -z "${DATABASE_URL:-}" ]; then
        DATABASE_URL="postgresql://patron_uygulama:$(parola uygulama_parolasi)@$DB"
        export DATABASE_URL
      fi ;;
    esitleme_parolasi)
      if [ -z "${ESITLEME_DATABASE_URL:-}" ]; then
        ESITLEME_DATABASE_URL="postgresql://patron_esitleme:$(parola esitleme_parolasi)@$DB"
        export ESITLEME_DATABASE_URL
      fi ;;
    goc_parolasi)
      if [ -z "${GOC_DATABASE_URL:-}" ]; then
        GOC_DATABASE_URL="postgresql://patron_goc:$(parola goc_parolasi)@$DB"
        export GOC_DATABASE_URL
      fi ;;
    tesis_rol_anahtari)
      # Yolu verilir; anahtarın kendisi ortama girmez.
      if [ -z "${TESIS_ROL_ANAHTARI_DOSYASI:-}" ]; then
        sir_var tesis_rol_anahtari
        TESIS_ROL_ANAHTARI_DOSYASI="$S/tesis_rol_anahtari"
        export TESIS_ROL_ANAHTARI_DOSYASI
      fi ;;
    guvenlik_telegram_bot_token)
      # Güvenlik bildirimi (B3) İSTEĞE BAĞLI: sır okunamazsa yol verilmez → kanal KAPALI, sunucu yine açılır.
      if [ -z "${GUVENLIK_TELEGRAM_BOT_TOKEN_DOSYASI:-}" ]; then
        if istege_bagli_sir guvenlik_telegram_bot_token; then
          GUVENLIK_TELEGRAM_BOT_TOKEN_DOSYASI="$S/guvenlik_telegram_bot_token"
          export GUVENLIK_TELEGRAM_BOT_TOKEN_DOSYASI
        fi
      fi ;;
    guvenlik_telegram_chat_id)
      if [ -z "${GUVENLIK_TELEGRAM_CHAT_ID_DOSYASI:-}" ]; then
        if istege_bagli_sir guvenlik_telegram_chat_id; then
          GUVENLIK_TELEGRAM_CHAT_ID_DOSYASI="$S/guvenlik_telegram_chat_id"
          export GUVENLIK_TELEGRAM_CHAT_ID_DOSYASI
        fi
      fi ;;
    *) echo "[patron] rol tablosunda tanınmayan sır: $sir" >&2; exit 1 ;;
  esac
done

exec "$@"
