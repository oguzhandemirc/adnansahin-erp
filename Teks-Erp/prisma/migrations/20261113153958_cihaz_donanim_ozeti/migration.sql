-- Cihaz kalıcı donanım özeti (2026-11-13; ana ürün PR #116 (D1) taşıması, sadeleşmiş).
-- `migrate diff` çıktısından iki DEFERRABLE composite FK'nın DropForeignKey satırları SİLİNDİ
-- (bilinen tuzak, VERITABANI-MIGRATION [DB-21]). Elle koşulabilir: IF NOT EXISTS.
-- Kolonlar NULL; mevcut satırlara dokunulmaz (backfill yok). Düz UNIQUE: NULL'lar ayrık.

-- AlterTable
ALTER TABLE "devices" ADD COLUMN IF NOT EXISTS "hwDigest" VARCHAR(64),
ADD COLUMN IF NOT EXISTS "hwSource" VARCHAR(24);

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "devices_hwDigest_key" ON "devices"("hwDigest");
