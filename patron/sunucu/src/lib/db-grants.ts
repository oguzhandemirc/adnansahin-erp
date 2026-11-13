// ROL YETKİLERİ — tek kaynak (`scripts/db-rolleri.ts` uygular; bekçiler `test_rls_sizinti` · `test_tek_veritabani`
// ölçer). Tek veritabanı (Adnan, tek tesis): üç rol aynı DB'de — göç (tablo sahibi; yalnız migration + CLI) ve iki
// çalışma rolü, ikisi de NOSUPERUSER NOBYPASSRLS ve tablo sahibi DEĞİL (RLS ikisine de uygulanır):
//   · uygulama (hesap API'si): projeksiyonu ve eşitleme tablolarını YALNIZ OKUR — API katmanındaki bir
//     hata fabrikanın verisini yazamaz ya da taklit edemez. Hesap satırına YAZAMAZ (yalnız son giriş anı).
//   · eşitleme (fabrika kanalı + bakım): hesabın FABRİKA kolonlarının (kullanici_adi · name · permissions · status ·
//     parola_ozeti · kimlik_surumu · closed_at) TEK yazarıdır (`POST /v1/kullanicilar`, kolon düzeyi); uygulamanın malı
//     olan ikinci etkene (`account_factors`) ve oturum belirtecine ULAŞAMAZ. Oturumda yalnız kapatma kolonlarını yazar
//     (hesap kapanınca/parola değişince). Kurulum yönünü yazar. Kapanıştan 30 gün sonra adı tombstone'a çeken bakım
//     adımı da bu roldedir (`maintenance.ts` `purgeClosedIdentities`; kolon `identity_purged_at`).
//   · Uygulama rolü `accounts`ı okur; satırda YALNIZ `last_login_at` yazar (eski e-posta üyeliği C4'te söküldü; göç
//     tetikleyicisi `fabrika_hesabi_korumasi` ikinci sedde).
// Migration yeni tablo eklerse buraya satırı AYNI dilimde girer (girmezse iki rol de erişemez: fail-closed).
export type Privilege = "SELECT" | "INSERT" | "UPDATE" | "DELETE";
/** Kolon düzeyi yetki: tablo düzeyindekine EK, yalnız adı geçen kolonlarda (aynı yetki iki düzeyde birden verilmez). */
export type ColumnGrants = Readonly<Record<string, Readonly<Partial<Record<"SELECT" | "INSERT" | "UPDATE", readonly string[]>>>>>;

export const APP_GRANTS: Readonly<Record<string, readonly Privilege[]>> = {
  facilities: ["SELECT"],
  installations: ["SELECT"],
  // INSERT/UPDATE yalnız kolon düzeyinde (APP_COLUMN_GRANTS): fabrika kolonları HARİÇ.
  accounts: ["SELECT"],
  // İkinci etken (TOTP · bulut kilidi): uygulamanın malı; satır soft değil, hesap kalır, etken kapatılır (NULL).
  account_factors: ["SELECT", "INSERT", "UPDATE"],
  sessions: ["SELECT", "INSERT", "UPDATE", "DELETE"],
  // UPDATE tablo düzeyinde YOK: yalnız `summary` kolonunda (APP_COLUMN_GRANTS) — bakımın IP alanı silmesi.
  account_audit: ["SELECT", "INSERT", "DELETE"],
  operation_receipts: ["SELECT", "INSERT", "DELETE"],
  inbox_messages: ["SELECT", "INSERT", "UPDATE", "DELETE"],
  report_requests: ["SELECT", "INSERT", "UPDATE", "DELETE"],
  report_results: ["SELECT"],
  push_devices: ["SELECT", "INSERT", "UPDATE", "DELETE"],
  notification_defaults: ["SELECT", "INSERT", "UPDATE"],
  notification_preferences: ["SELECT", "INSERT", "UPDATE"],
  // Görünüm tercihi (kullanıcı tercihi): silinmez, "varsayılana dön" varsayılan değeri yazar.
  view_preferences: ["SELECT", "INSERT", "UPDATE"],
  notifications: ["SELECT", "INSERT", "UPDATE", "DELETE"],
  projection_rows: ["SELECT"],
  sync_state: ["SELECT"],
};

/** Fabrikanın yazdığı hesap kolonları — yalnız eşitleme rolü (`SYNC_COLUMN_GRANTS`); uygulama rolüne VERİLMEZ. */
export const FACTORY_ACCOUNT_COLUMNS: readonly string[] = ["kullanici_adi", "name", "permissions", "status", "parola_ozeti", "kimlik_surumu", "closed_at"];

export const APP_COLUMN_GRANTS: ColumnGrants = {
  // Hesap fabrikanın malıdır (C4): uygulama rolü hesap DOĞURAMAZ, yalnız giriş anını yazar.
  accounts: { UPDATE: ["last_login_at", "updated_at"] },
  // Yaşa göre silinen alan (`maintenance.ts` `AGED_FIELDS`: giriş olayının IP'si); olay, aktör, zaman yazılamaz.
  account_audit: { UPDATE: ["summary"] },
  // Kimlik silmesi makbuz yanıtındaki ad/e-postayı tombstone'a çevirir (`maintenance.ts` `purgeClosedIdentities`);
  // makbuzun kimliği, eylemi ve gövde özeti yazılamaz (tekrar kapısı onlara dayanır).
  operation_receipts: { UPDATE: ["response"] },
};

export const SYNC_COLUMN_GRANTS: ColumnGrants = {
  // Gelen kutusu claim'i yazarın GÜNCEL durumunu ve yazma iznini sorar (`inbox.service.ts` `authorEligibleSql`);
  // TOTP sırrı (`account_factors`) ve son giriş OKUNAMAZ — kanal katmanı ikinci etkene ulaşmaz.
  // Kullanıcı kümesi (`services/user-sync.service.ts`) kendi yazdığı kolonları okur (değişim tespiti; mühürlü özet
  // SecretBox ile açılır); RETURNING'li yazım yoktur. `identity_purged_at`: bakımın kimlik silmesi + yeniden açılış.
  accounts: {
    SELECT: ["id", "tesis_id", "status", "permissions", "kullanici_adi", "name", "parola_ozeti", "kimlik_surumu", "closed_at", "identity_purged_at"],
    INSERT: ["id", "tesis_id", "kullanici_adi", "name", "permissions", "status", "parola_ozeti", "kimlik_surumu", "closed_at", "updated_at"],
    UPDATE: ["kullanici_adi", "name", "permissions", "status", "parola_ozeti", "kimlik_surumu", "closed_at", "identity_purged_at", "updated_at"],
  },
  // Hesap kapanınca / parola değişince açık oturumlar kapanır; belirteç özeti ve istemci OKUNAMAZ.
  sessions: { SELECT: ["id", "tesis_id", "account_id", "closed_at"], UPDATE: ["closed_at", "close_reason", "updated_at"] },
};

export const SYNC_GRANTS: Readonly<Record<string, readonly Privilege[]>> = {
  facilities: ["SELECT", "INSERT", "UPDATE"],
  installations: ["SELECT", "INSERT", "UPDATE"],
  inbox_messages: ["SELECT", "UPDATE"],
  report_requests: ["SELECT", "UPDATE"],
  report_results: ["SELECT", "INSERT", "DELETE"],
  projection_rows: ["SELECT", "INSERT", "UPDATE", "DELETE"],
  sync_watermarks: ["SELECT", "INSERT", "UPDATE"],
  package_receipts: ["SELECT", "INSERT", "DELETE"],
  sync_state: ["SELECT", "INSERT", "UPDATE"],
  full_sync_runs: ["SELECT", "INSERT", "UPDATE", "DELETE"],
  request_nonces: ["SELECT", "INSERT", "DELETE"],
  // Kullanıcı kümesinin ayak izi (yalnız EKLER; okuyamaz — `lib/audit.ts` RETURNING'siz yazar).
  account_audit: ["INSERT"],
  // Kurulum yönü (ilk yazan bağlar, bağ değişmez).
  installation_routes: ["SELECT", "INSERT"],
};

/** Şemadaki bütün uygulama tabloları (bekçi: şema ↔ bu liste birebir). */
export const CLOUD_TABLES: readonly string[] = [
  "facilities",
  "installations",
  "accounts",
  "account_factors",
  "sessions",
  "account_audit",
  "operation_receipts",
  "inbox_messages",
  "report_requests",
  "report_results",
  "push_devices",
  "notification_defaults",
  "notification_preferences",
  "view_preferences",
  "notifications",
  "projection_rows",
  "sync_watermarks",
  "package_receipts",
  "sync_state",
  "full_sync_runs",
  "request_nonces",
  "installation_routes",
];

/** Kiracı verisi OLMAYAN tablolar: RLS TAŞIMAZ, yalnız rol yetkisiyle korunur (kurulum yönü). */
export const ROUTING_TABLES: readonly string[] = ["installation_routes"];
