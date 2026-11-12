-- Patron bulutu gelen kutusu makbuzu. Yalnız EKLER: yeni iki enum + ekleme-yalnız tablo.
-- Kaynak: TeksERP ana ürünü 19aa48a9533f783e0d48a6728ba7eff37c77cbb2, aynı adlı migration.
-- Ana üründen FARKI: her ifade idempotent yazıldı ([DB-23]; ikinci koşum no-op).
-- Tablo boş doğar; mevcut hiçbir tabloya dokunmaz. (`migrate dev` DEFERRABLE iki FK'yı
-- düşürmek ister; o satırlar yazılmadı.)

DO $inbox_enum$
BEGIN
  CREATE TYPE "CloudInboxKind" AS ENUM ('SIPARIS', 'CARI');
EXCEPTION WHEN duplicate_object THEN NULL;
END $inbox_enum$;

DO $inbox_outcome$
BEGIN
  CREATE TYPE "CloudInboxOutcome" AS ENUM ('ISLENDI', 'REDDEDILDI');
EXCEPTION WHEN duplicate_object THEN NULL;
END $inbox_outcome$;

CREATE TABLE IF NOT EXISTS "cloud_inbox_receipts" (
    "id" UUID NOT NULL,
    "messageId" UUID NOT NULL,
    "kind" "CloudInboxKind" NOT NULL,
    "outcome" "CloudInboxOutcome" NOT NULL,
    "entityId" UUID,
    "cloudAccountId" UUID NOT NULL,
    "cloudAccountName" VARCHAR(200) NOT NULL,
    "payloadDigest" VARCHAR(64) NOT NULL,
    "result" JSONB NOT NULL,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "cloud_inbox_receipts_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "cloud_inbox_receipts_messageId_key" ON "cloud_inbox_receipts"("messageId");

-- Çift yüklem: işlenen mesaj varlık taşır, reddedilen taşımaz.
DO $inbox_chk$
BEGIN
  ALTER TABLE "cloud_inbox_receipts" ADD CONSTRAINT "cloud_inbox_receipts_outcome_entity_chk"
    CHECK (("outcome" = 'ISLENDI' AND "entityId" IS NOT NULL) OR ("outcome" = 'REDDEDILDI' AND "entityId" IS NULL));
EXCEPTION WHEN duplicate_object THEN NULL;
END $inbox_chk$;
