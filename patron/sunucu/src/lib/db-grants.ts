// ROL YETKİLERİ — tek kaynak (`scripts/db-rolleri.ts` uygular; bekçiler `test_rls_sizinti` · `test_tek_veritabani`
// ölçer). Tek veritabanı (Adnan, tek tesis): üç rol aynı DB'de — göç (tablo sahibi; yalnız migration + CLI) ve iki
// çalışma rolü, ikisi de NOSUPERUSER NOBYPASSRLS ve tablo sahibi DEĞİL (RLS ikisine de uygulanır):
//   · uygulama (hesap API'si): projeksiyonu ve eşitleme tablolarını YALNIZ OKUR — API katmanındaki bir
//     hata fabrikanın verisini yazamaz ya da taklit edemez. Kimlik (`identities`) ve üyelik (`login_routes`)
//     tablolarının tek çalışma yazarıdır.
//   · eşitleme (fabrika kanalı + bakım): hesabın FABRİKA kolonlarının (kullanici_adi · name · permissions · status ·
//     parola_ozeti · kimlik_surumu · closed_at) TEK yazarıdır (`POST /v1/kullanicilar`, kolon düzeyi); uygulamanın malı
//     olan ikinci etkene (`account_factors`), e-posta kimliğine, davet sırrına ve oturum belirtecine ULAŞAMAZ. Oturumda
//     yalnız kapatma kolonlarını yazar (hesap kapanınca/parola değişince). Kurulum yönünü yazar, bayat üyeliği siler.
//   · Uygulama rolü `accounts`ı okur; YALNIZ eski (e-posta) hesap kolonlarına yazar (C4'e dek geçici uyumluluk) —
//     fabrika kolonlarına yazamaz, fabrika hesabının satırında yalnız `last_login_at` değişir (göç tetikleyicisi).
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
  // Kimlik + üyelik (kiracı verisi değil, RLS yok): davet yazar, giriş doğrular, bakım kapatır/siler (kimlik soft).
  login_routes: ["SELECT", "INSERT", "UPDATE", "DELETE"],
  identities: ["SELECT", "INSERT", "UPDATE"],
};

/** Fabrikanın yazdığı hesap kolonları — yalnız eşitleme rolü (`SYNC_COLUMN_GRANTS`); uygulama rolüne VERİLMEZ. */
export const FACTORY_ACCOUNT_COLUMNS: readonly string[] = ["kullanici_adi", "name", "permissions", "status", "parola_ozeti", "kimlik_surumu", "closed_at"];

export const APP_COLUMN_GRANTS: ColumnGrants = {
  // GEÇİCİ UYUMLULUK (C4'te daralır): eski e-posta hesabının yaşam döngüsü (davet · izin · kilit · pasif · kimlik silme)
  // bu kolonlarla sürer. `name/permissions/status/closed_at` eski hesap içindir; fabrika hesabının satırını göç
  // tetikleyicisi (`fabrika_hesabi_korumasi`) korur. `kullanici_adi`, `parola_ozeti`, `kimlik_surumu` HİÇ yok.
  accounts: {
    INSERT: ["id", "tesis_id", "email", "name", "permissions", "status", "invite_token_hash", "invite_expires_at", "created_by_id", "identity_id", "created_at", "updated_at"],
    UPDATE: ["email", "name", "permissions", "status", "invite_token_hash", "invite_expires_at", "last_login_at", "closed_at", "identity_purged_at", "identity_id", "updated_at"],
  },
  // Yaşa göre silinen alan (`maintenance.ts` `AGED_FIELDS`: giriş olayının IP'si); olay, aktör, zaman yazılamaz.
  account_audit: { UPDATE: ["summary"] },
  // Kimlik silmesi makbuz yanıtındaki ad/e-postayı tombstone'a çevirir (`maintenance.ts` `purgeClosedIdentities`);
  // makbuzun kimliği, eylemi ve gövde özeti yazılamaz (tekrar kapısı onlara dayanır).
  operation_receipts: { UPDATE: ["response"] },
};

export const SYNC_COLUMN_GRANTS: ColumnGrants = {
  // Gelen kutusu claim'i yazarın GÜNCEL durumunu ve yazma iznini sorar (`inbox.service.ts` `authorEligibleSql`);
  // e-posta, ad, parola/TOTP/davet sırları OKUNAMAZ — kanal katmanı hesap kimliğine ulaşmaz.
  // Kullanıcı kümesi (`services/user-sync.service.ts`) kendi yazdığı kolonları okur (değişim tespiti; mühürlü özet
  // SecretBox ile açılır). E-posta, kimlik bağı, davet sırrı, son giriş OKUNAMAZ; RETURNING'li yazım yoktur.
  accounts: {
    SELECT: ["id", "tesis_id", "status", "permissions", "kullanici_adi", "name", "parola_ozeti", "kimlik_surumu", "closed_at"],
    INSERT: ["id", "tesis_id", "kullanici_adi", "name", "permissions", "status", "parola_ozeti", "kimlik_surumu", "closed_at", "updated_at"],
    UPDATE: ["kullanici_adi", "name", "permissions", "status", "parola_ozeti", "kimlik_surumu", "closed_at", "updated_at"],
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
  // Kurulum yönü (ilk yazan bağlar, bağ değişmez) + bayat üyelik budaması; kimliğe (`identities`) ERİŞEMEZ.
  installation_routes: ["SELECT", "INSERT"],
  login_routes: ["SELECT", "DELETE"],
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
  "login_routes",
  "identities",
];

/** Kiracı verisi OLMAYAN tablolar: RLS TAŞIMAZ, yalnız rol yetkisiyle korunur (kimlik + kurulum yönü). */
export const ROUTING_TABLES: readonly string[] = ["installation_routes", "login_routes", "identities"];
