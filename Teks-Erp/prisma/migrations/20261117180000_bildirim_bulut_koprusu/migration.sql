-- Bildirim bulut köprüsü (2.13.0, D4) — `notification_deliveries`e iki damga + tarama indeksi, ADDITIVE.
-- Backfill yok: mevcut teslimler NULL kalır; köprü yalnız son pencere (2 saat) içinde doğan teslimleri gönderir ⇒
-- açılışta eski teslimler buluta yağmaz. Şalterler (`patronCloud.syncEnabled`, `notifications.enabled`) kapalıyken
-- kolonlar hiç yazılmaz.

-- AlterTable
ALTER TABLE "notification_deliveries" ADD COLUMN "cloudSentAt" TIMESTAMPTZ,
ADD COLUMN "cloudReadSentAt" TIMESTAMPTZ;

-- CreateIndex
CREATE INDEX "notification_deliveries_cloudSentAt_createdAt_idx" ON "notification_deliveries"("cloudSentAt", "createdAt");
