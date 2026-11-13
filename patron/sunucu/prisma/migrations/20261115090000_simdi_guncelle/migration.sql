-- "Şimdi güncelle" (2026-11-13, kullanıcı kararı: sözleşme yalnız bu özellik için genişler). Bu göç yalnız EKLER:
--   · `sync_requests`: tesis başına TEK satır — `pending_at` bekleyen işaret (NULL = yok), `accepted_at` son KABUL
--     edilen isteğin anı (60 sn penceresi). Uygulama rolü işaret AÇAR, eşitleme rolü `/v1/rapor/al` yanıtında
--     TÜKETİR (atomik claim: `pending_at IS NOT NULL` ⇒ NULL). İçerik/veri taşımaz; budanmaz (tesis başına tek satır).

CREATE TABLE "sync_requests" (
    "id" UUID NOT NULL,
    "tesis_id" UUID NOT NULL,
    "pending_at" TIMESTAMPTZ,
    "accepted_at" TIMESTAMPTZ,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,
    CONSTRAINT "sync_requests_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "sync_requests_tesis_id_key" ON "sync_requests"("tesis_id");
ALTER TABLE "sync_requests" ADD CONSTRAINT "sync_requests_tesis_id_fkey" FOREIGN KEY ("tesis_id") REFERENCES "facilities"("tesis_id") ON DELETE RESTRICT ON UPDATE CASCADE;
-- Bekleyen işaret yalnız kabul edilmiş bir istekten doğar.
ALTER TABLE "sync_requests" ADD CONSTRAINT "sync_requests_pending_pair_check" CHECK ("pending_at" IS NULL OR "accepted_at" IS NOT NULL);

-- RLS: temel göçün kalıbıyla (bekçi `test_rls_sizinti` §1d bu listeyi okur).
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'sync_requests'
  ] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', t);
    EXECUTE format(
      'CREATE POLICY tesis_yalitimi ON %I USING (tesis_id = current_setting(''app.tesis_id'')::uuid) '
      'WITH CHECK (tesis_id = current_setting(''app.tesis_id'')::uuid)', t);
  END LOOP;
END $$;
