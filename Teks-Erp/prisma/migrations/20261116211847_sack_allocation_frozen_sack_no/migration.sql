-- =============================================================================
-- SackAllocation DONUK ÇUVAL NUMARASI (2026-11-17) — boş çuval silinebilsin
-- =============================================================================
-- Canlı hata: bir kez sevkiyata girip çıkmış boş çuval silinemiyordu. `clearShipmentAllocationsTx`
-- tahsisi silmez damgalar (K2, 20260914020000); damgalı satır `sack_allocations_sackId_fkey`
-- (ON DELETE RESTRICT) ile çuvala bağlı kaldığı için `tx.sack.delete` P2003 veriyordu.
--
-- Karar: geçmiş satır SİLİNMEZ; çuval sert silinince bağı tek boğazda koparılır
-- (`detachSackAllocationHistoryTx`, sackId → NULL) ve satır çuvalı DONUK `sackNo` ile söyler
-- (emsal `swatch_events.sackNo`). FK RESTRICT olarak KALIR: başka bir silme yolu bağı
-- sessizce koparamaz. Etkin (clearedAt NULL) satırın çuvalı hep vardır (CHECK).
--
-- ⚠️ DEFERRABLE composite FK'lar (rolls/swatches sackId_shipmentId_consistency) BU DOSYADA DÜŞÜRÜLMEZ
-- (`migrate dev --create-only` çıktısındaki iki DropForeignKey satırı silindi).
-- Tekrar koşulabilir: IF NOT EXISTS / NULL-süzgeçli backfill / adıyla düşür-kur CHECK.
-- Mevcut veride her satırın sackId'si dolu → iki CHECK de boşta doğrulanır (expand, contract yok).

-- AlterTable (expand)
ALTER TABLE "sack_allocations" ADD COLUMN IF NOT EXISTS "sackNo" VARCHAR(64);
ALTER TABLE "sack_allocations" ALTER COLUMN "sackId" DROP NOT NULL;

-- Backfill: bugünkü her satıra çuvalının numarası (çuval numarası doğuşta yazılır, değişmez).
UPDATE "sack_allocations" sa
   SET "sackNo" = s."sackNo"
  FROM "sacks" s
 WHERE s.id = sa."sackId"
   AND sa."sackNo" IS NULL;

-- Şema-dışı CHECK'ler (envanter: scripts/test_db_invariants.ts)
--  ① etkin tahsisin çuvalı vardır — bağ yalnız damgalı satırda kopabilir
--  ② bağı kopmuş satır çuval numarasını taşır
ALTER TABLE "sack_allocations" DROP CONSTRAINT IF EXISTS "sack_allocations_active_has_sack";
ALTER TABLE "sack_allocations" ADD CONSTRAINT "sack_allocations_active_has_sack"
  CHECK ("sackId" IS NOT NULL OR "clearedAt" IS NOT NULL) NOT VALID;
ALTER TABLE "sack_allocations" VALIDATE CONSTRAINT "sack_allocations_active_has_sack";

ALTER TABLE "sack_allocations" DROP CONSTRAINT IF EXISTS "sack_allocations_detached_has_no";
ALTER TABLE "sack_allocations" ADD CONSTRAINT "sack_allocations_detached_has_no"
  CHECK ("sackId" IS NOT NULL OR "sackNo" IS NOT NULL) NOT VALID;
ALTER TABLE "sack_allocations" VALIDATE CONSTRAINT "sack_allocations_detached_has_no";

-- Doğrulama: numarasız satır kalmadıysa sessiz; kaldıysa (yalnız yetim veri) NOTICE — deploy düşmez.
DO $$
DECLARE n bigint;
BEGIN
  SELECT count(*) INTO n FROM "sack_allocations" WHERE "sackNo" IS NULL;
  IF n > 0 THEN
    RAISE NOTICE 'sack_allocations: % satırda sackNo doldurulamadı', n;
  END IF;
END $$;
