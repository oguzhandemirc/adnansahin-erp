-- Üyelik = Electron şifresi, dilim C1 (2026-11-13): hesap FABRİKANIN MALI olur. Fabrika `POST /v1/kullanicilar` ile
-- `patron:giris` izinli kullanıcılarının TAM kümesini gönderir; `accounts`ın fabrika kolonları (kullanici_adi, name,
-- permissions, status, parola_ozeti, kimlik_surumu, closed_at) YALNIZ eşitleme rolünce yazılır (kolon yetkisi
-- `src/lib/db-grants.ts`). Uygulamanın malı olan ikinci etken (TOTP, bulut kilidi) ayrı tabloya (`account_factors`)
-- çıkar; eşitleme rolü ona HİÇ erişemez. VDS sıfırdan kurulur: eski veri taşınmaz.
-- GEÇİCİ UYUMLULUK (C4'e dek): e-posta kimliği (`identities`/`login_routes`/davet) ve eski hesap kolonları DURUR;
-- eski hesap (e-posta, kullanici_adi NULL) bugünkü gibi çalışır. Fabrika hesabı = `kullanici_adi` DOLU.

-- `accounts` FORCE RLS taşır ve göç rolü süper kullanıcı değildir: yabancı anahtar doğrulaması (`account_factors` →
-- `accounts`) politikadan geçer ve kiracı ayarı ister. Kiracısız değer (sıfır UUID) yeter — yeni tablo boştur.
SELECT set_config('app.tesis_id', '00000000-0000-0000-0000-000000000000', false);

-- AlterTable: fabrika kolonları
ALTER TABLE "accounts" ALTER COLUMN "email" DROP NOT NULL;
ALTER TABLE "accounts" ALTER COLUMN "name" TYPE VARCHAR(200);
ALTER TABLE "accounts" ADD COLUMN "kullanici_adi" VARCHAR(50);
ALTER TABLE "accounts" ADD COLUMN "parola_ozeti" VARCHAR(300);
ALTER TABLE "accounts" ADD COLUMN "kimlik_surumu" INTEGER NOT NULL DEFAULT 0;

-- AlterTable: oturum hangi kimlik sürümüyle açıldı (C3: hesabınkinden küçükse oturum geçersiz)
ALTER TABLE "sessions" ADD COLUMN "kimlik_surumu" INTEGER NOT NULL DEFAULT 0;

-- CreateTable: ikinci etken — uygulamanın malı
CREATE TABLE "account_factors" (
    "account_id" UUID NOT NULL,
    "tesis_id" UUID NOT NULL,
    "totp_secret_sealed" VARCHAR(300),
    "totp_last_step" INTEGER,
    "totp_enabled_at" TIMESTAMPTZ,
    "bulut_kilidi" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "account_factors_pkey" PRIMARY KEY ("account_id")
);
CREATE INDEX "account_factors_tesis_id_idx" ON "account_factors"("tesis_id");
ALTER TABLE "account_factors" ADD CONSTRAINT "account_factors_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- CHECK'ler (çift yüklem DB'de de seddelenir)
-- Hesap ya eski e-posta hesabıdır ya fabrika hesabıdır; fabrika hesabının adı küçük harf, telin deseniyle.
ALTER TABLE "accounts" ADD CONSTRAINT "accounts_kimlik_kaynagi_check"
  CHECK ("email" IS NOT NULL OR "kullanici_adi" IS NOT NULL);
ALTER TABLE "accounts" ADD CONSTRAINT "accounts_kullanici_adi_bicimi"
  CHECK ("kullanici_adi" IS NULL OR "kullanici_adi" ~ '^[a-z0-9._-]{1,50}$');
-- Fabrika hesabının durumu yalnız AKTIF/PASIF; AKTIF ⇒ parola özeti; PASIF ⇒ özet YOK (kapanan hesap sır taşımaz).
ALTER TABLE "accounts" ADD CONSTRAINT "accounts_fabrika_durumu_check"
  CHECK ("kullanici_adi" IS NULL OR "status" IN ('AKTIF', 'PASIF'));
ALTER TABLE "accounts" ADD CONSTRAINT "accounts_fabrika_aktif_parola_check"
  CHECK ("kullanici_adi" IS NULL OR "status" <> 'AKTIF' OR "parola_ozeti" IS NOT NULL);
ALTER TABLE "accounts" ADD CONSTRAINT "accounts_pasif_parolasiz_check"
  CHECK ("status" <> 'PASIF' OR "parola_ozeti" IS NULL);
ALTER TABLE "accounts" ADD CONSTRAINT "accounts_parola_yalniz_fabrika_check"
  CHECK ("parola_ozeti" IS NULL OR "kullanici_adi" IS NOT NULL);
ALTER TABLE "accounts" ADD CONSTRAINT "accounts_kimlik_surumu_negatif_degil" CHECK ("kimlik_surumu" >= 0);
-- Eski kural "AKTIF/KILITLI ⇒ kimlik bağı" yalnız eski (e-posta) hesaba uygulanır.
ALTER TABLE "accounts" DROP CONSTRAINT "accounts_active_needs_identity_check";
ALTER TABLE "accounts" ADD CONSTRAINT "accounts_active_needs_identity_check"
  CHECK ("status" NOT IN ('AKTIF', 'KILITLI') OR "identity_id" IS NOT NULL OR "kullanici_adi" IS NOT NULL);

ALTER TABLE "sessions" ADD CONSTRAINT "sessions_kimlik_surumu_negatif_degil" CHECK ("kimlik_surumu" >= 0);

ALTER TABLE "account_factors" ADD CONSTRAINT "account_factors_totp_enabled_check"
  CHECK ("totp_enabled_at" IS NULL OR ("totp_secret_sealed" IS NOT NULL AND "totp_last_step" IS NOT NULL));

-- Kullanıcı adı PASİF olmayan hesaplarda tekildir (giriş araması). Ertelenmiş dışlama: tam küme tek tx'te ad takası
-- (A↔B) yapabilir; denetim COMMIT'te koşar. Kapanan hesap adını tutar ama yer kaplamaz.
ALTER TABLE "accounts" ADD CONSTRAINT "accounts_kullanici_adi_etkin"
  EXCLUDE USING btree ("kullanici_adi" WITH =) WHERE ("kullanici_adi" IS NOT NULL AND "status" <> 'PASIF')
  DEFERRABLE INITIALLY DEFERRED;

-- Fabrika hesabının satırı YALNIZ fabrika kolonlarına yazma yetkisi olan rolce değişir (eşitleme rolü; göç rolü
-- tablo sahibi olarak). Uygulama rolü eski hesap kolonlarına kolon yetkisiyle yazabildiği için (C4'e dek geçici
-- uyumluluk) fabrika hesabında yalnız `last_login_at` (ve `updated_at`) değiştirebilir. Ölçüt rolün `parola_ozeti`
-- UPDATE yetkisidir (rol adı kurulumdan kuruluma değişir; yetkinin tek kaynağı `src/lib/db-grants.ts`).
CREATE FUNCTION "fabrika_hesabi_korumasi"() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF OLD."kullanici_adi" IS NOT NULL
     AND (to_jsonb(NEW) - 'last_login_at' - 'updated_at') IS DISTINCT FROM (to_jsonb(OLD) - 'last_login_at' - 'updated_at')
     AND NOT has_column_privilege('accounts', 'parola_ozeti', 'UPDATE') THEN
    RAISE EXCEPTION 'fabrika hesabı yalnız eşitleme kanalından değişir' USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION "fabrika_hesabi_korumasi"() FROM PUBLIC;
CREATE TRIGGER accounts_fabrika_hesabi_korumasi BEFORE UPDATE ON "accounts"
  FOR EACH ROW EXECUTE FUNCTION "fabrika_hesabi_korumasi"();

-- RLS (kiracı yalıtımı; temel göçle aynı kalıp)
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['account_factors'] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', t);
    EXECUTE format(
      'CREATE POLICY tesis_yalitimi ON %I USING (tesis_id = current_setting(''app.tesis_id'')::uuid) '
      'WITH CHECK (tesis_id = current_setting(''app.tesis_id'')::uuid)', t);
  END LOOP;
END $$;
