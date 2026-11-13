-- Üyelik = Electron şifresi, dilim C4 (2026-11-14): ESKİ E-POSTA ÜYELİĞİNİN SÖKÜMÜ. Bulut hesabı YALNIZ fabrika
-- hesabıdır (`POST /v1/kullanicilar`): e-posta kimliği (`identities`), giriş dizini (`login_routes`), davet sırrı ve
-- hesabın e-posta/kimlik bağı/davet/oluşturan kolonları düşer. VDS SIFIRDAN kurulur: eski satır taşınmaz; bu göç eski
-- (e-posta) hesap satırı bulursa `kullanici_adi NOT NULL` adımında DURUR (sessiz silme yok).
--   · Bayatlık damgası (`kullanici_son_esitleme`) `sync_state`ten `facilities`e taşınır: tesis satırı `tesis-ac` ile
--     doğar, bu yüzden ilk kullanıcı kümesi eşitleme paketinden ÖNCE gelse de damga bırakır (C3'teki ilk giriş 503'ü
--     kalkar). Eski damga taşınmaz: ilk gönderime (≤ 10 dk) dek yeni giriş 503 kalır (fail-closed).

-- Davet araması politikası davet sırrı kolonuna bağlıdır; kolondan önce düşer.
DROP POLICY IF EXISTS davet_arama ON "accounts";

-- Kimlik + giriş dizini (kiracı verisi değil; RLS taşımaz)
DROP TABLE "login_routes";
DROP TABLE "identities";
DROP TYPE "IdentityStatus";

-- Eski hesap kuralları (e-posta / kimlik bağı / davet)
ALTER TABLE "accounts" DROP CONSTRAINT IF EXISTS "accounts_kimlik_kaynagi_check";
ALTER TABLE "accounts" DROP CONSTRAINT IF EXISTS "accounts_active_needs_identity_check";
ALTER TABLE "accounts" DROP CONSTRAINT IF EXISTS "accounts_purged_no_secret_check";
ALTER TABLE "accounts" DROP CONSTRAINT IF EXISTS "accounts_invite_only_when_invited_check";
ALTER TABLE "accounts" DROP CONSTRAINT IF EXISTS "accounts_email_normalized_check";
ALTER TABLE "accounts" DROP CONSTRAINT IF EXISTS "accounts_fabrika_durumu_check";
ALTER TABLE "accounts" DROP CONSTRAINT IF EXISTS "accounts_fabrika_aktif_parola_check";
ALTER TABLE "accounts" DROP CONSTRAINT IF EXISTS "accounts_parola_yalniz_fabrika_check";
DROP INDEX IF EXISTS "accounts_email_etkin_key";
DROP INDEX IF EXISTS "accounts_tesis_email_key";
DROP INDEX IF EXISTS "accounts_email_idx";
DROP INDEX IF EXISTS "accounts_invite_token_hash_key";

ALTER TABLE "accounts" DROP COLUMN "email";
ALTER TABLE "accounts" DROP COLUMN "identity_id";
ALTER TABLE "accounts" DROP COLUMN "invite_token_hash";
ALTER TABLE "accounts" DROP COLUMN "invite_expires_at";
ALTER TABLE "accounts" DROP COLUMN "created_by_id";

-- Her hesap fabrika hesabıdır: kullanıcı adı dolu, durum yalnız AKTIF/PASIF (enum değerleri DAVETLI/KILITLI tipte
-- kalır — tip yeniden kurulmaz; CHECK yeter). AKTIF ⇒ parola özeti; PASIF ⇒ özet yok (C1 CHECK'i durur).
ALTER TABLE "accounts" ALTER COLUMN "kullanici_adi" SET NOT NULL;
ALTER TABLE "accounts" ALTER COLUMN "status" SET DEFAULT 'AKTIF';
ALTER TABLE "accounts" ADD CONSTRAINT "accounts_durum_check" CHECK ("status" IN ('AKTIF', 'PASIF'));
ALTER TABLE "accounts" ADD CONSTRAINT "accounts_aktif_parola_check" CHECK ("status" <> 'AKTIF' OR "parola_ozeti" IS NOT NULL);
-- Kimliği silinmiş (kapanıştan 30 gün sonra tombstone) hesap PASİF'tir; fabrika yeniden açarsa damga AYNI ifadede düşer.
ALTER TABLE "accounts" ADD CONSTRAINT "accounts_kimligi_silinmis_pasif_check" CHECK ("identity_purged_at" IS NULL OR "status" = 'PASIF');

-- Bayatlık damgası tesise taşınır (eşitleme rolü `facilities`i tablo düzeyinde günceller).
ALTER TABLE "facilities" ADD COLUMN "kullanici_son_esitleme" TIMESTAMPTZ;
ALTER TABLE "sync_state" DROP COLUMN "kullanici_son_esitleme";
