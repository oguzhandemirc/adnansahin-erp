-- Y8 (güvenlik denetimi 2026-11-13): parolanın hangi kural sürümüyle belirlendiği.
-- Yalnız EKLER: `users.passwordPolicyVersion` INTEGER NOT NULL DEFAULT 0. Mevcut her
-- satır 0 doğar = "yeni kuralla belirlenmemiş"; patron bulutuna yalnız güncel sürümlü
-- parola özeti gider, yani eski parolalar kullanıcı/yönetici yeniden belirleyene kadar
-- buluta ÇIKMAZ. Veri dönüştürmez, kilit süresi sabit (varsayılanlı ADD COLUMN, PG 11+
-- tabloyu yeniden yazmaz).
-- `migrate dev --create-only` çıktısındaki iki DEFERRABLE FK `DropForeignKey` satırı
-- (rolls/swatches `*_sackId_shipmentId_consistency_fkey`) ELLE SİLİNDİ.
-- İdempotent ([DB-23]): ikinci koşum no-op.

ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "passwordPolicyVersion" INTEGER NOT NULL DEFAULT 0;
