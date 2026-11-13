-- Ayıklama D5 (2026-11-13): Adnan bulutu tek tesisli ve süresizdir — hizmet aşaması (açık → 90 gün salt okuma →
-- kapalı), lisans sınıfı, modül hakkı, abonelik bitişi, devir ve satıcı önbelleği kolonları kalkar. VDS bu sürümle
-- SIFIRDAN kurulur (veri taşıma yok); kolonları okuyan kod aynı dilimde silindi. Kurulum kapısı: kayıt + açık
-- anahtar + `active`.

-- AlterTable
ALTER TABLE "facilities" DROP COLUMN "service_ended_at";

-- AlterTable
ALTER TABLE "installations" DROP COLUMN "cloud_until",
DROP COLUMN "handed_over",
DROP COLUMN "license_class",
DROP COLUMN "modules",
DROP COLUMN "refreshed_at",
DROP COLUMN "source";

-- DropEnum
DROP TYPE "InstallationSource";

-- DropEnum
DROP TYPE "LicenseClass";
