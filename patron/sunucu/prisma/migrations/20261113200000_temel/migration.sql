-- =============================================================================
-- Patron bulutu — TEMEL şema (Adnan Şahin, TEK TESİS, TEK VERİTABANI; 2026-11-13 ayıklaması D4).
-- VDS sıfırdan kurulduğu için eski çok tesisli zincir (tesis başına DB, merkez yönlendirme kataloğu, destek rolü,
-- tesis imhası) bu tek göçe İNDİRİLDİ; eski DB düzeninden göç YOKTUR. Rol ayrımı ve RLS aynen:
-- Bölümler: ① tablolar · ② indeksler + yabancı anahtarlar · ③ CHECK'ler + tetikleyiciler · ④ RLS.
-- Rol ve yetkiler migration'da DEĞİL: roller küme düzeyindedir → `scripts/db-rolleri.ts` (uygulama + eşitleme rolü,
-- NOSUPERUSER NOBYPASSRLS; yetkiler tek kaynak `src/lib/db-grants.ts`; her `migrate deploy`dan sonra koşar).
-- `tesis_id` kolonları ve `tesis_yalitimi` politikası ŞİMDİLİK kalır (kimlik dilimi söker); tek satırlı `facilities`.
-- =============================================================================

-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "LicenseClass" AS ENUM ('URETIM', 'TEST', 'DR', 'DEMO', 'BAYI', 'BARINDIRILAN');

-- CreateEnum
CREATE TYPE "FacilityStatus" AS ENUM ('AKTIF', 'PASIF');

-- CreateEnum
CREATE TYPE "InstallationSource" AS ENUM ('KAYIT', 'SATICI');

-- CreateEnum
CREATE TYPE "IdentityStatus" AS ENUM ('DAVETLI', 'AKTIF', 'PASIF');

-- CreateEnum
CREATE TYPE "AccountStatus" AS ENUM ('DAVETLI', 'AKTIF', 'KILITLI', 'PASIF');

-- CreateEnum
CREATE TYPE "SessionCloseReason" AS ENUM ('CIKIS', 'SURE_DOLDU', 'HESAP_KAPANDI', 'SIFIRLAMA');

-- CreateEnum
CREATE TYPE "InboxKind" AS ENUM ('SIPARIS', 'CARI');

-- CreateEnum
CREATE TYPE "InboxStatus" AS ENUM ('BEKLIYOR', 'ISLENIYOR', 'ISLENDI', 'REDDEDILDI', 'IPTAL');

-- CreateEnum
CREATE TYPE "ReportStatus" AS ENUM ('BEKLIYOR', 'HESAPLANIYOR', 'HAZIR', 'HATA', 'IPTAL');

-- CreateEnum
CREATE TYPE "DevicePlatform" AS ENUM ('IOS', 'ANDROID', 'WEB');

-- CreateEnum
CREATE TYPE "NotificationStatus" AS ENUM ('BEKLIYOR', 'GONDERILIYOR', 'GONDERILDI', 'BASARISIZ', 'ATLANDI');

-- =============================================================================
-- ① TABLOLAR
-- =============================================================================

-- Kurulum → tesis (değişmez; kiracı verisi değil ⇒ RLS taşımaz).
CREATE TABLE "installation_routes" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "kurulum_id" UUID NOT NULL,
    "tesis_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "installation_routes_pkey" PRIMARY KEY ("id")
);

-- Bulut kimliği: e-posta yalnız anahtarlı özetle + parola + isteğe bağlı TOTP (kiracı verisi değil ⇒ RLS taşımaz).
CREATE TABLE "identities" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "email_digest" VARCHAR(64) NOT NULL,
    "password_hash" VARCHAR(200),
    "totp_secret_sealed" VARCHAR(300),
    "totp_last_step" INTEGER,
    "totp_enabled_at" TIMESTAMPTZ,
    "status" "IdentityStatus" NOT NULL DEFAULT 'DAVETLI',
    "closed_at" TIMESTAMPTZ,
    "identity_purged_at" TIMESTAMPTZ,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "identities_pkey" PRIMARY KEY ("id")
);

-- Üyelik (giriş dizini): kimlik → (tesis, hesap) (kiracı verisi değil ⇒ RLS taşımaz).
CREATE TABLE "login_routes" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tesis_id" UUID NOT NULL,
    "account_id" UUID NOT NULL,
    "identity_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "login_routes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "facilities" (
    "tesis_id" UUID NOT NULL,
    "name" VARCHAR(200) NOT NULL,
    "retention_months" INTEGER DEFAULT 13,
    "status" "FacilityStatus" NOT NULL DEFAULT 'AKTIF',
    "service_ended_at" TIMESTAMPTZ,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "facilities_pkey" PRIMARY KEY ("tesis_id")
);

-- CreateTable
CREATE TABLE "installations" (
    "id" UUID NOT NULL,
    "tesis_id" UUID NOT NULL,
    "kurulum_id" UUID NOT NULL,
    "public_key_x" VARCHAR(43),
    "key_id" VARCHAR(47),
    "license_class" "LicenseClass" NOT NULL,
    "modules" TEXT[],
    "cloud_until" TIMESTAMPTZ,
    "handed_over" BOOLEAN NOT NULL DEFAULT false,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "source" "InstallationSource" NOT NULL,
    "refreshed_at" TIMESTAMPTZ NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "installations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "accounts" (
    "id" UUID NOT NULL,
    "tesis_id" UUID NOT NULL,
    "email" VARCHAR(254) NOT NULL,
    "name" VARCHAR(120) NOT NULL,
    "permissions" TEXT[],
    "status" "AccountStatus" NOT NULL DEFAULT 'DAVETLI',
    "invite_token_hash" VARCHAR(64),
    "invite_expires_at" TIMESTAMPTZ,
    "last_login_at" TIMESTAMPTZ,
    "created_by_id" UUID,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,
    "closed_at" TIMESTAMPTZ,
    "identity_purged_at" TIMESTAMPTZ,
    "identity_id" UUID,

    CONSTRAINT "accounts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sessions" (
    "id" UUID NOT NULL,
    "tesis_id" UUID NOT NULL,
    "account_id" UUID NOT NULL,
    "token_hash" VARCHAR(64) NOT NULL,
    "client" VARCHAR(20),
    "last_used_at" TIMESTAMPTZ NOT NULL,
    "expires_at" TIMESTAMPTZ NOT NULL,
    "closed_at" TIMESTAMPTZ,
    "close_reason" "SessionCloseReason",
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "account_audit" (
    "id" UUID NOT NULL,
    "tesis_id" UUID NOT NULL,
    "actor" VARCHAR(120) NOT NULL,
    "event" VARCHAR(60) NOT NULL,
    "entity" VARCHAR(60) NOT NULL,
    "entity_id" VARCHAR(80),
    "summary" JSONB,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "account_audit_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "operation_receipts" (
    "id" UUID NOT NULL,
    "tesis_id" UUID NOT NULL,
    "client_token" UUID NOT NULL,
    "account_id" UUID NOT NULL,
    "action" VARCHAR(60) NOT NULL,
    "body_digest" VARCHAR(64) NOT NULL,
    "response_status" INTEGER NOT NULL,
    "response" JSONB NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "operation_receipts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "inbox_messages" (
    "id" UUID NOT NULL,
    "tesis_id" UUID NOT NULL,
    "message_id" UUID NOT NULL,
    "kind" "InboxKind" NOT NULL,
    "body" JSONB NOT NULL,
    "account_id" UUID NOT NULL,
    "account_name" VARCHAR(120) NOT NULL,
    "status" "InboxStatus" NOT NULL DEFAULT 'BEKLIYOR',
    "owner_installation_id" UUID,
    "claim_until" TIMESTAMPTZ,
    "claim_count" INTEGER NOT NULL DEFAULT 0,
    "result" JSONB,
    "processed_at" TIMESTAMPTZ,
    "cancelled_at" TIMESTAMPTZ,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "inbox_messages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "report_requests" (
    "id" UUID NOT NULL,
    "tesis_id" UUID NOT NULL,
    "account_id" UUID NOT NULL,
    "report_key" VARCHAR(80) NOT NULL,
    "family" VARCHAR(40) NOT NULL,
    "params" JSONB NOT NULL,
    "params_digest" VARCHAR(64) NOT NULL,
    "status" "ReportStatus" NOT NULL DEFAULT 'BEKLIYOR',
    "owner_installation_id" UUID,
    "claim_until" TIMESTAMPTZ,
    "claim_count" INTEGER NOT NULL DEFAULT 0,
    "result_id" UUID,
    "error_code" VARCHAR(60),
    "completed_at" TIMESTAMPTZ,
    "cancelled_at" TIMESTAMPTZ,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "report_requests_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "report_results" (
    "id" UUID NOT NULL,
    "tesis_id" UUID NOT NULL,
    "report_key" VARCHAR(80) NOT NULL,
    "projection" VARCHAR(80) NOT NULL,
    "params_digest" VARCHAR(64) NOT NULL,
    "data" JSONB NOT NULL,
    "computed_at" TIMESTAMPTZ NOT NULL,
    "source_horizon" TIMESTAMPTZ,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "report_results_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "push_devices" (
    "id" UUID NOT NULL,
    "tesis_id" UUID NOT NULL,
    "account_id" UUID NOT NULL,
    "platform" "DevicePlatform" NOT NULL,
    "token" VARCHAR(4096) NOT NULL,
    "token_hash" VARCHAR(64) NOT NULL,
    "name" VARCHAR(120),
    "active" BOOLEAN NOT NULL DEFAULT true,
    "last_seen_at" TIMESTAMPTZ NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "push_devices_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notification_defaults" (
    "tesis_id" UUID NOT NULL,
    "settings" JSONB NOT NULL,
    "updated_by_id" UUID,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "notification_defaults_pkey" PRIMARY KEY ("tesis_id")
);

-- CreateTable
CREATE TABLE "notification_preferences" (
    "id" UUID NOT NULL,
    "tesis_id" UUID NOT NULL,
    "account_id" UUID NOT NULL,
    "settings" JSONB,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "notification_preferences_pkey" PRIMARY KEY ("id")
);

-- Görünüm tercihleri (veri tablosu): hesabın sütun · sıralama · süzgeç seçimi; anahtar beyaz listeli, değer boyut sınırlı.
CREATE TABLE "view_preferences" (
    "id" UUID NOT NULL,
    "tesis_id" UUID NOT NULL,
    "account_id" UUID NOT NULL,
    "key" TEXT NOT NULL,
    "value" JSONB NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "view_preferences_pkey" PRIMARY KEY ("id")
);

-- Bildirim kuyruğu + gönderim kaydı (telemetri).
CREATE TABLE "notifications" (
    "id" UUID NOT NULL,
    "tesis_id" UUID NOT NULL,
    "account_id" UUID NOT NULL,
    "kind" VARCHAR(40) NOT NULL,
    "dedup_key" VARCHAR(200) NOT NULL,
    "title" VARCHAR(120) NOT NULL,
    "body" VARCHAR(500) NOT NULL,
    "route" VARCHAR(200),
    "status" "NotificationStatus" NOT NULL DEFAULT 'BEKLIYOR',
    "skip_reason" VARCHAR(40),
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "next_attempt_at" TIMESTAMPTZ NOT NULL,
    "claim_until" TIMESTAMPTZ,
    "sent_at" TIMESTAMPTZ,
    "last_error" VARCHAR(60),
    "deliveries" JSONB,
    "receipt_due_at" TIMESTAMPTZ,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "notifications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "projection_rows" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tesis_id" UUID NOT NULL,
    "projection" VARCHAR(80) NOT NULL,
    "record_id" UUID NOT NULL,
    "data" JSONB NOT NULL,
    "version_at" TIMESTAMPTZ NOT NULL,
    "deleted_at" TIMESTAMPTZ,
    "retention_at" TIMESTAMPTZ,
    "sort_at" TIMESTAMPTZ NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "projection_rows_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sync_watermarks" (
    "id" UUID NOT NULL,
    "tesis_id" UUID NOT NULL,
    "projection" VARCHAR(80) NOT NULL,
    "watermark_t" TIMESTAMPTZ NOT NULL,
    "watermark_k" VARCHAR(120) NOT NULL,
    "catalog_version" INTEGER NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "sync_watermarks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "package_receipts" (
    "id" UUID NOT NULL,
    "tesis_id" UUID NOT NULL,
    "package_id" UUID NOT NULL,
    "installation_id" UUID NOT NULL,
    "body_digest" VARCHAR(64) NOT NULL,
    "response" JSONB NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "package_receipts_pkey" PRIMARY KEY ("id")
);

-- Değişim sayacı (`change_counter`): yalnız uzun yoklamaya "değişti" der, iş hesabı değildir.
CREATE TABLE "sync_state" (
    "tesis_id" UUID NOT NULL,
    "last_package_at" TIMESTAMPTZ NOT NULL,
    "last_installation_id" UUID NOT NULL,
    "contract_version" INTEGER NOT NULL,
    "app_version" VARCHAR(40),
    "horizon" TIMESTAMPTZ NOT NULL,
    "horizon_changed_at" TIMESTAMPTZ NOT NULL,
    "contract_warning" VARCHAR(40),
    "change_counter" BIGINT NOT NULL DEFAULT 0,
    "changed_projections" JSONB NOT NULL DEFAULT '[]',
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "sync_state_pkey" PRIMARY KEY ("tesis_id")
);

-- CreateTable
CREATE TABLE "full_sync_runs" (
    "id" UUID NOT NULL,
    "tesis_id" UUID NOT NULL,
    "projection" VARCHAR(80) NOT NULL,
    "started_at" TIMESTAMPTZ NOT NULL,
    "total_parts" INTEGER NOT NULL,
    "received_parts" INTEGER[],
    "completed_at" TIMESTAMPTZ,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "full_sync_runs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "request_nonces" (
    "id" UUID NOT NULL,
    "tesis_id" UUID NOT NULL,
    "installation_id" UUID NOT NULL,
    "nonce" VARCHAR(64) NOT NULL,
    "expires_at" TIMESTAMPTZ NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "request_nonces_pkey" PRIMARY KEY ("id")
);

-- =============================================================================
-- ② İNDEKSLER + YABANCI ANAHTARLAR
-- =============================================================================

CREATE UNIQUE INDEX "installation_routes_kurulum_id_key" ON "installation_routes"("kurulum_id");
CREATE INDEX "installation_routes_tesis_id_idx" ON "installation_routes"("tesis_id");
CREATE UNIQUE INDEX "identities_email_digest_key" ON "identities"("email_digest");
CREATE UNIQUE INDEX "login_routes_account_id_key" ON "login_routes"("account_id");
CREATE INDEX "login_routes_tesis_id_idx" ON "login_routes"("tesis_id");
CREATE UNIQUE INDEX "login_routes_identity_id_tesis_id_key" ON "login_routes"("identity_id", "tesis_id");
CREATE UNIQUE INDEX "installations_kurulum_id_key" ON "installations"("kurulum_id");
CREATE INDEX "installations_tesis_id_idx" ON "installations"("tesis_id");
CREATE UNIQUE INDEX "accounts_invite_token_hash_key" ON "accounts"("invite_token_hash");
CREATE INDEX "accounts_tesis_id_idx" ON "accounts"("tesis_id");
CREATE INDEX "accounts_email_idx" ON "accounts" ("email");
CREATE UNIQUE INDEX "sessions_token_hash_key" ON "sessions"("token_hash");
CREATE INDEX "sessions_tesis_id_account_id_idx" ON "sessions"("tesis_id", "account_id");
CREATE INDEX "account_audit_tesis_id_created_at_idx" ON "account_audit"("tesis_id", "created_at");
CREATE UNIQUE INDEX "operation_receipts_tesis_id_client_token_key" ON "operation_receipts"("tesis_id", "client_token");
CREATE INDEX "inbox_messages_tesis_id_status_created_at_idx" ON "inbox_messages"("tesis_id", "status", "created_at");
CREATE UNIQUE INDEX "inbox_messages_tesis_id_message_id_key" ON "inbox_messages"("tesis_id", "message_id");
CREATE INDEX "report_requests_tesis_id_status_created_at_idx" ON "report_requests"("tesis_id", "status", "created_at");
CREATE INDEX "report_results_tesis_id_report_key_params_digest_computed_a_idx" ON "report_results"("tesis_id", "report_key", "params_digest", "computed_at");
CREATE INDEX "push_devices_tesis_id_account_id_idx" ON "push_devices"("tesis_id", "account_id");
CREATE UNIQUE INDEX "push_devices_tesis_id_token_hash_key" ON "push_devices"("tesis_id", "token_hash");
CREATE UNIQUE INDEX "notification_preferences_tesis_id_account_id_key" ON "notification_preferences"("tesis_id", "account_id");
CREATE UNIQUE INDEX "view_preferences_tesis_id_account_id_key_key" ON "view_preferences"("tesis_id", "account_id", "key");
CREATE INDEX "notifications_tesis_id_status_next_attempt_at_idx" ON "notifications"("tesis_id", "status", "next_attempt_at");
CREATE INDEX "notifications_tesis_id_account_id_created_at_idx" ON "notifications"("tesis_id", "account_id", "created_at");
CREATE UNIQUE INDEX "notifications_tesis_id_account_id_dedup_key_key" ON "notifications"("tesis_id", "account_id", "dedup_key");
CREATE INDEX "notifications_tesis_id_receipt_due_at_idx" ON "notifications"("tesis_id", "receipt_due_at");
CREATE INDEX "projection_rows_tesis_id_projection_sort_at_record_id_idx" ON "projection_rows"("tesis_id", "projection", "sort_at", "record_id");
CREATE UNIQUE INDEX "projection_rows_tesis_id_projection_record_id_key" ON "projection_rows"("tesis_id", "projection", "record_id");
CREATE UNIQUE INDEX "sync_watermarks_tesis_id_projection_key" ON "sync_watermarks"("tesis_id", "projection");
CREATE UNIQUE INDEX "package_receipts_tesis_id_package_id_key" ON "package_receipts"("tesis_id", "package_id");
CREATE UNIQUE INDEX "full_sync_runs_tesis_id_projection_started_at_key" ON "full_sync_runs"("tesis_id", "projection", "started_at");
CREATE UNIQUE INDEX "request_nonces_installation_id_nonce_key" ON "request_nonces"("installation_id", "nonce");

-- E-posta tekilliği yalnız ETKİN hesapta (AKTIF · KILITLI); aynı tesiste PASİF olmayan iki hesap aynı e-postayı taşıyamaz.
-- Prisma kısmi indeksi şemada tanımaz (fark üretmez).
CREATE UNIQUE INDEX "accounts_email_etkin_key" ON "accounts" ("email") WHERE "status" IN ('AKTIF', 'KILITLI');
CREATE UNIQUE INDEX "accounts_tesis_email_key" ON "accounts" ("tesis_id", "email") WHERE "status" <> 'PASIF';
-- Kimlik silme işinin taraması: kapanmış, kimliği henüz silinmemiş hesaplar.
CREATE INDEX "accounts_kimlik_silme_idx" ON "accounts" ("tesis_id", "closed_at") WHERE "identity_purged_at" IS NULL AND "closed_at" IS NOT NULL;
-- Liste süzgeçlerinin ifade indeksleri (her biri bir ekran sorgusuna bağlıdır: durum · cari).
CREATE INDEX "projection_rows_durum_idx" ON "projection_rows" ("tesis_id", "projection", (("data"->>'durum'))) WHERE "deleted_at" IS NULL;
CREATE INDEX "projection_rows_cari_idx" ON "projection_rows" ("tesis_id", "projection", (("data"->>'cariKartId'))) WHERE "deleted_at" IS NULL;

ALTER TABLE "login_routes" ADD CONSTRAINT "login_routes_identity_id_fkey" FOREIGN KEY ("identity_id") REFERENCES "identities"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "installations" ADD CONSTRAINT "installations_tesis_id_fkey" FOREIGN KEY ("tesis_id") REFERENCES "facilities"("tesis_id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "accounts" ADD CONSTRAINT "accounts_tesis_id_fkey" FOREIGN KEY ("tesis_id") REFERENCES "facilities"("tesis_id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- =============================================================================
-- ③ CHECK'ler (çift yüklem: durum ↔ damga iki yazar için de DB seddi) + tetikleyiciler
-- =============================================================================

ALTER TABLE "identities" ADD CONSTRAINT "identities_ozet_bicimi" CHECK ("email_digest" ~ '^[0-9a-f]{64}$');
-- AKTİF kimlik parolasız doğamaz; açık doğrulama (TOTP) sırsız ve onaysız (son adımsız) olamaz.
ALTER TABLE "identities" ADD CONSTRAINT "identities_active_needs_password_check"
  CHECK ("status" <> 'AKTIF' OR "password_hash" IS NOT NULL);
ALTER TABLE "identities" ADD CONSTRAINT "identities_totp_enabled_check"
  CHECK ("totp_enabled_at" IS NULL OR ("totp_secret_sealed" IS NOT NULL AND "totp_last_step" IS NOT NULL));
ALTER TABLE "identities" ADD CONSTRAINT "identities_closed_pair_check"
  CHECK (("status" = 'PASIF') = ("closed_at" IS NOT NULL));
ALTER TABLE "identities" ADD CONSTRAINT "identities_purged_no_secret_check"
  CHECK ("identity_purged_at" IS NULL OR ("status" = 'PASIF' AND "password_hash" IS NULL AND "totp_secret_sealed" IS NULL));

ALTER TABLE "facilities" ADD CONSTRAINT "facilities_retention_months_check"
  CHECK ("retention_months" IS NULL OR "retention_months" IN (3, 13, 25));

ALTER TABLE "accounts" ADD CONSTRAINT "accounts_invite_only_when_invited_check"
  CHECK (("invite_token_hash" IS NULL) OR "status" = 'DAVETLI');
ALTER TABLE "accounts" ADD CONSTRAINT "accounts_email_normalized_check"
  CHECK ("email" = lower("email") AND length("email") >= 3 AND position('@' in "email") > 1);
-- PASIF ⇔ kapanış anı; etkin hesap kimliksiz olamaz; kimliği silinmiş hesap PASİF, davetsiz ve kimlik bağsızdır.
ALTER TABLE "accounts" ADD CONSTRAINT "accounts_closed_pair_check"
  CHECK (("status" = 'PASIF') = ("closed_at" IS NOT NULL));
ALTER TABLE "accounts" ADD CONSTRAINT "accounts_active_needs_identity_check"
  CHECK ("status" NOT IN ('AKTIF', 'KILITLI') OR "identity_id" IS NOT NULL);
ALTER TABLE "accounts" ADD CONSTRAINT "accounts_purged_no_secret_check"
  CHECK ("identity_purged_at" IS NULL OR ("status" = 'PASIF' AND "invite_token_hash" IS NULL AND "identity_id" IS NULL));

ALTER TABLE "sessions" ADD CONSTRAINT "sessions_close_pair_check"
  CHECK (("closed_at" IS NULL) = ("close_reason" IS NULL));

ALTER TABLE "inbox_messages" ADD CONSTRAINT "inbox_messages_claim_pair_check"
  CHECK (("status" = 'ISLENIYOR') = ("claim_until" IS NOT NULL AND "owner_installation_id" IS NOT NULL));
ALTER TABLE "inbox_messages" ADD CONSTRAINT "inbox_messages_cancel_pair_check"
  CHECK (("status" = 'IPTAL') = ("cancelled_at" IS NOT NULL));
ALTER TABLE "inbox_messages" ADD CONSTRAINT "inbox_messages_processed_pair_check"
  CHECK (("status" IN ('ISLENDI', 'REDDEDILDI')) = ("processed_at" IS NOT NULL AND "result" IS NOT NULL));

ALTER TABLE "report_requests" ADD CONSTRAINT "report_requests_claim_pair_check"
  CHECK (("status" = 'HESAPLANIYOR') = ("claim_until" IS NOT NULL AND "owner_installation_id" IS NOT NULL));
ALTER TABLE "report_requests" ADD CONSTRAINT "report_requests_ready_pair_check"
  CHECK (("status" = 'HAZIR') = ("result_id" IS NOT NULL));
ALTER TABLE "report_requests" ADD CONSTRAINT "report_requests_cancel_pair_check"
  CHECK (("status" = 'IPTAL') = ("cancelled_at" IS NOT NULL));
ALTER TABLE "report_requests" ADD CONSTRAINT "report_requests_error_pair_check"
  CHECK (("status" = 'HATA') = ("error_code" IS NOT NULL));

ALTER TABLE "notifications" ADD CONSTRAINT "notifications_gonderildi_damgali"
  CHECK (("status" = 'GONDERILDI') = ("sent_at" IS NOT NULL));
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_atlandi_gerekceli"
  CHECK (("status" = 'ATLANDI') = ("skip_reason" IS NOT NULL));
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_claim_yalniz_gonderiliyor"
  CHECK (("status" = 'GONDERILIYOR') = ("claim_until" IS NOT NULL));
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_deneme_negatif_degil" CHECK ("attempts" >= 0);

-- Son sed: uygulama kapısı (anahtar listesi + 4096 bayt) aşılırsa DB de reddeder.
ALTER TABLE "view_preferences" ADD CONSTRAINT "view_preferences_anahtar_bicimi" CHECK ("key" ~ '^[a-z][a-z.-]{0,39}$');
ALTER TABLE "view_preferences" ADD CONSTRAINT "view_preferences_deger_boyutu" CHECK (octet_length("value"::text) <= 8192);

ALTER TABLE "projection_rows" ADD CONSTRAINT "projection_rows_projection_name_check"
  CHECK ("projection" ~ '^[a-z][a-z0-9-]*(\.[a-z][a-z0-9-]*)?$');
ALTER TABLE "report_results" ADD CONSTRAINT "report_results_projection_name_check"
  CHECK ("projection" ~ '^rapor\.[a-z][a-z0-9-]*$');

-- Kurulum → tesis bağı DEĞİŞMEZ: tesisi başka tesise çeviren UPDATE reddedilir (yönlendirme sızıntısı sınıfı).
CREATE FUNCTION "kurulum_yonu_degismez"() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.tesis_id <> OLD.tesis_id OR NEW.kurulum_id <> OLD.kurulum_id THEN
    RAISE EXCEPTION 'installation_routes: kurulum → tesis bağı değiştirilemez' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION "kurulum_yonu_degismez"() FROM PUBLIC;
CREATE TRIGGER installation_routes_degismez BEFORE UPDATE ON "installation_routes"
  FOR EACH ROW EXECUTE FUNCTION "kurulum_yonu_degismez"();

-- =============================================================================
-- ④ ROW LEVEL SECURITY — kiracı yalıtımı (§9.2) + alan izni (§9.3)
-- `app.tesis_id` HER istek tx'inin İLK ifadesinde `set_config(…, true)` ile yazılır (tek yazar
-- `src/lib/tenant.ts`). Ayarlanmamış (`current_setting` hata) ya da sıfırlanmış (`''::uuid` hata)
-- bağlantıda sorgu HATA verir ⇒ fail-closed, SIFIR satır. FORCE: tablo sahibi de politikaya tabi.
-- Tanımlı ön-kiracı aramaları (SELECT-yalnız, tek anahtar): oturum özeti · davet özeti · kurulum kimliği ·
-- bakım listesi — bu kiplerde `app.tesis_id` sıfır UUID'dir (kiracı YOK). Kimlik tabloları (`identities`,
-- `login_routes`, `installation_routes`) kiracı verisi değildir, RLS taşımaz; yalnız yetkiyle korunur.
-- =============================================================================

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'facilities', 'installations', 'accounts', 'sessions', 'account_audit', 'operation_receipts',
    'inbox_messages', 'report_requests', 'report_results', 'push_devices', 'notification_defaults',
    'notification_preferences', 'view_preferences', 'notifications', 'projection_rows', 'sync_watermarks',
    'package_receipts', 'sync_state', 'full_sync_runs', 'request_nonces'
  ] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', t);
    EXECUTE format(
      'CREATE POLICY tesis_yalitimi ON %I USING (tesis_id = current_setting(''app.tesis_id'')::uuid) '
      'WITH CHECK (tesis_id = current_setting(''app.tesis_id'')::uuid)', t);
  END LOOP;
END $$;

CREATE POLICY bakim_listesi ON "facilities" FOR SELECT
  USING (current_setting('app.bakim', true) = 'evet');
CREATE POLICY kurulum_arama ON "installations" FOR SELECT
  USING ("kurulum_id"::text = current_setting('app.kurulum_id', true));
CREATE POLICY davet_arama ON "accounts" FOR SELECT
  USING ("invite_token_hash" = current_setting('app.davet_ozeti', true));
CREATE POLICY oturum_arama ON "sessions" FOR SELECT
  USING ("token_hash" = current_setting('app.oturum_ozeti', true));

-- Alan izni: hesabın izinlerinden türeyen projeksiyon adları (`sipariş görür, tutar görmez`).
-- RESTRICTIVE → tesis politikasıyla VE'lenir; FOR SELECT, satır okuyan UPDATE/DELETE/ON CONFLICT'e de uygulanır.
CREATE POLICY izinli_projeksiyon ON "projection_rows" AS RESTRICTIVE FOR SELECT
  USING ("projection" = ANY (string_to_array(current_setting('app.projeksiyonlar'), ',')));
CREATE POLICY izinli_projeksiyon ON "report_results" AS RESTRICTIVE FOR SELECT
  USING ("projection" = ANY (string_to_array(current_setting('app.projeksiyonlar'), ',')));
