-- Bildirim atama aynası + telefondan tercih isteği (D5, 2026-11-17). Bu göç yalnız EKLER:
--   · `notification_factory_mirrors`: hesap başına TEK satır — fabrikanın gönderdiği ATANMIŞ türler (`kinds`, JSON dizi
--     `[{tur, kapali}]`) + tercih yetkisi. Bulut hesap yapmaz: ayar formu bunu GÖSTERİR. Yazarı eşitleme rolü
--     (`POST /v1/bildirimler` `atamalar`); budanmaz (hesap başına tek satır).
--   · `notification_pref_requests`: (hesap, tür) başına TEK satır — telefonda istenen son durum (`muted`) + istek kimliği.
--     Yeni istek satırı yeniden açar (yeni `request_id`, `acked_at` NULL); fabrika teyit edince `acked_at` damgalanır.
--     Silinmez (küme hesap × tür ile sınırlı). Karar FABRİKANINDIR; satır yalnız isteği taşır.

CREATE TABLE "notification_factory_mirrors" (
    "id" UUID NOT NULL,
    "tesis_id" UUID NOT NULL,
    "account_id" UUID NOT NULL,
    "can_change" BOOLEAN NOT NULL,
    "kinds" JSONB NOT NULL,
    "mirrored_at" TIMESTAMPTZ NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,
    CONSTRAINT "notification_factory_mirrors_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "notification_factory_mirrors_tesis_id_account_id_key" ON "notification_factory_mirrors"("tesis_id", "account_id");
ALTER TABLE "notification_factory_mirrors" ADD CONSTRAINT "notification_factory_mirrors_kinds_check" CHECK (jsonb_typeof("kinds") = 'array');

CREATE TABLE "notification_pref_requests" (
    "id" UUID NOT NULL,
    "tesis_id" UUID NOT NULL,
    "account_id" UUID NOT NULL,
    "kind" VARCHAR(40) NOT NULL,
    "muted" BOOLEAN NOT NULL,
    "request_id" UUID NOT NULL,
    "requested_at" TIMESTAMPTZ NOT NULL,
    "acked_at" TIMESTAMPTZ,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,
    CONSTRAINT "notification_pref_requests_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "notification_pref_requests_tesis_id_account_id_kind_key" ON "notification_pref_requests"("tesis_id", "account_id", "kind");
CREATE UNIQUE INDEX "notification_pref_requests_tesis_id_request_id_key" ON "notification_pref_requests"("tesis_id", "request_id");
CREATE INDEX "notification_pref_requests_tesis_id_acked_at_idx" ON "notification_pref_requests"("tesis_id", "acked_at");

-- RLS: temel göçün kalıbıyla (bekçi `test_rls_sizinti` §1d bu listeyi okur).
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'notification_factory_mirrors',
    'notification_pref_requests'
  ] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', t);
    EXECUTE format(
      'CREATE POLICY tesis_yalitimi ON %I USING (tesis_id = current_setting(''app.tesis_id'')::uuid) '
      'WITH CHECK (tesis_id = current_setting(''app.tesis_id'')::uuid)', t);
  END LOOP;
END $$;
