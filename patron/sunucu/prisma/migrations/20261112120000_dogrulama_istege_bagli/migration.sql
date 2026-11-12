-- DOĞRULAMA KODU (TOTP) İSTEĞE BAĞLI (kullanıcı kararı 2026-11-12): AKTİF kimlik yalnız parola ister; TOTP kimliğin
-- kendi seçimidir ve `totp_enabled_at` doluyken her girişte zorunludur. Kurulumu süren sır (onaysız) açık SAYILMAZ.
-- Bugün sırrı + son adımı olan her kimlik AÇIK kalır (sessizce kapatma yok).
ALTER TABLE "identities" ADD COLUMN "totp_enabled_at" TIMESTAMPTZ;

UPDATE "identities" SET "totp_enabled_at" = "updated_at"
 WHERE "totp_secret_sealed" IS NOT NULL AND "totp_last_step" IS NOT NULL;

ALTER TABLE "identities" DROP CONSTRAINT "identities_active_needs_totp_check";

ALTER TABLE "identities" ADD CONSTRAINT "identities_active_needs_password_check"
  CHECK ("status" <> 'AKTIF' OR "password_hash" IS NOT NULL);

-- Açık doğrulama sırsız ve onaysız (son adımsız) olamaz.
ALTER TABLE "identities" ADD CONSTRAINT "identities_totp_enabled_check"
  CHECK ("totp_enabled_at" IS NULL OR ("totp_secret_sealed" IS NOT NULL AND "totp_last_step" IS NOT NULL));
