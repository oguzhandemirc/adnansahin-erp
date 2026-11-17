-- Bildirim köprüsü (2026-11-17, D4; kullanıcı kararı: `POST /v1/bildirimler` sözleşme istisnası). Bu göç yalnız EKLER:
--   · `notifications.origin`: `bulut` (bulutun kendi türettiği, bugünkü satırların hepsi) · `fabrika` (fabrikanın teslimi).
--   · `notifications.factory_delivery_id`: fabrikanın teslim kimliği; tesis içinde tekil (NULL'lar serbest).
--   · `notifications.read_at`: okundu anı (telefon ya da fabrika); `read_synced_at`: fabrikanın bu okunduyu bildiği an.
-- Backfill yok: mevcut satırlar `bulut` + okunmamış + bağsız kalır (bugünkü davranış). Yetkiler `src/lib/db-grants.ts`
-- (eşitleme rolü bu kolonları yazar) — `scripts/db-rolleri.ts` göçten sonra koşar.

ALTER TABLE "notifications" ADD COLUMN "origin" VARCHAR(10) NOT NULL DEFAULT 'bulut';
ALTER TABLE "notifications" ADD COLUMN "factory_delivery_id" UUID;
ALTER TABLE "notifications" ADD COLUMN "read_at" TIMESTAMPTZ;
ALTER TABLE "notifications" ADD COLUMN "read_synced_at" TIMESTAMPTZ;

ALTER TABLE "notifications" ADD CONSTRAINT "notifications_origin_check" CHECK ("origin" IN ('bulut', 'fabrika'));
-- Fabrika kaynaklı satır her zaman bağlıdır (bulutun kendi satırı sonradan bağlanabilir).
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_origin_bag_check" CHECK ("origin" <> 'fabrika' OR "factory_delivery_id" IS NOT NULL);
-- Teyit yalnız okunmuş satırda olur.
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_read_synced_check" CHECK ("read_synced_at" IS NULL OR "read_at" IS NOT NULL);

CREATE UNIQUE INDEX "notifications_tesis_id_factory_delivery_id_key" ON "notifications"("tesis_id", "factory_delivery_id");
