-- Üyelik = Electron şifresi, dilim C3 (2026-11-14): bulut girişi fabrika hesabına karşı (kullanıcı adı + fabrika
-- parolası, bcrypt; isteğe bağlı TOTP `account_factors`ta). Bu göç yalnız EKLER:
--   · `account_factors`: hesap başına küresel başarısız giriş sayacı (sabit 24 sa pencere) + geçici bulut kilidi bitişi
--     (kaba kuvvet tavanı; kaynak kilidi `login-throttle.ts` bellekte ayrıca durur). Uygulama rolünün malı.
--   · `sync_state.kullanici_son_esitleme`: fabrikanın son kullanıcı kümesi gönderimi (`POST /v1/kullanicilar`; eşitleme
--     rolü yazar). Bayatlık tavanını aşınca yeni giriş 503 `FABRIKA_BAGLANTISI_YOK`. NULL = hiç gönderilmedi (giriş yok).
--   · `kullanici_arama` politikası: ön-kiracı giriş araması (`app.kullanici_adi`) — yalnız adı birebir tutan fabrika
--     hesabının satırı görünür (oturum/davet aramasıyla aynı kalıp; değer başka her tx'te boş dizeye sıfırlanır).

ALTER TABLE "account_factors" ADD COLUMN "basarisiz_sayisi" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "account_factors" ADD COLUMN "basarisiz_pencere" TIMESTAMPTZ;
ALTER TABLE "account_factors" ADD COLUMN "gecici_kilit_bitis" TIMESTAMPTZ;
ALTER TABLE "account_factors" ADD CONSTRAINT "account_factors_basarisiz_sayisi_check"
  CHECK ("basarisiz_sayisi" >= 0 AND ("basarisiz_sayisi" = 0 OR "basarisiz_pencere" IS NOT NULL));

ALTER TABLE "sync_state" ADD COLUMN "kullanici_son_esitleme" TIMESTAMPTZ;

CREATE POLICY kullanici_arama ON "accounts" FOR SELECT
  USING ("kullanici_adi" IS NOT NULL AND "kullanici_adi" = current_setting('app.kullanici_adi', true));
