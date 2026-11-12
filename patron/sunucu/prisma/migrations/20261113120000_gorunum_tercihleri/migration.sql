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

CREATE UNIQUE INDEX "view_preferences_tesis_id_account_id_key_key" ON "view_preferences"("tesis_id", "account_id", "key");

-- Son sed: uygulama kapısı (anahtar listesi + 4096 bayt) aşılırsa DB de reddeder.
ALTER TABLE "view_preferences" ADD CONSTRAINT "view_preferences_anahtar_bicimi" CHECK ("key" ~ '^[a-z][a-z.-]{0,39}$');
ALTER TABLE "view_preferences" ADD CONSTRAINT "view_preferences_deger_boyutu" CHECK (octet_length("value"::text) <= 8192);

-- RLS — kiracı yalıtımı (tek yazar `src/lib/tenant.ts`); ayarsız bağlantıda sorgu HATA verir (fail-closed).
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['view_preferences'] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', t);
    EXECUTE format(
      'CREATE POLICY tesis_yalitimi ON %I USING (tesis_id = current_setting(''app.tesis_id'')::uuid) '
      'WITH CHECK (tesis_id = current_setting(''app.tesis_id'')::uuid)', t);
  END LOOP;
END $$;

-- Destek rolü kapısı (RESTRICTIVE, yalnız SELECT; izin `destek_ac` kaydından) — diğer tablolarla aynı kural.
DO $$
DECLARE r text := current_database() || '_destek';
BEGIN
  EXECUTE format('CREATE POLICY destek_kapisi ON "view_preferences" AS RESTRICTIVE FOR SELECT TO %I USING (tesis_id = (SELECT public.destek_tesisi()))', r);
END $$;
