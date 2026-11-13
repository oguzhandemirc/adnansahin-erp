// ROL YETKİLERİ — tek kaynak (`scripts/db-rolleri.ts` uygular; bekçiler `test_rls_sizinti` · `test_tek_veritabani`
// ölçer). Tek veritabanı (Adnan, tek tesis): üç rol aynı DB'de — göç (tablo sahibi; yalnız migration + CLI) ve iki
// çalışma rolü, ikisi de NOSUPERUSER NOBYPASSRLS ve tablo sahibi DEĞİL (RLS ikisine de uygulanır):
//   · uygulama (hesap API'si): projeksiyonu ve eşitleme tablolarını YALNIZ OKUR — API katmanındaki bir
//     hata fabrikanın verisini yazamaz ya da taklit edemez. Kimlik (`identities`) ve üyelik (`login_routes`)
//     tablolarının tek çalışma yazarıdır.
//   · eşitleme (fabrika kanalı + bakım): hesap tablolarına dokunamaz — kanal katmanındaki bir hata
//     hesap/oturum/parola/kimlik satırına ulaşamaz; tek istisna gelen kutusu claim'inin yazar sorgusu: `accounts`ta
//     yalnız kimlik · tesis · durum · izin kolonları (kolon düzeyi SELECT). Kurulum yönünü yazar, bayat üyeliği siler.
// Migration yeni tablo eklerse buraya satırı AYNI dilimde girer (girmezse iki rol de erişemez: fail-closed).
export type Privilege = "SELECT" | "INSERT" | "UPDATE" | "DELETE";
/** Kolon düzeyi yetki: tablo düzeyindekine EK, yalnız adı geçen kolonlarda (aynı yetki iki düzeyde birden verilmez). */
export type ColumnGrants = Readonly<Record<string, Readonly<Partial<Record<"SELECT" | "INSERT" | "UPDATE", readonly string[]>>>>>;

export const APP_GRANTS: Readonly<Record<string, readonly Privilege[]>> = {
  facilities: ["SELECT"],
  installations: ["SELECT"],
  accounts: ["SELECT", "INSERT", "UPDATE"],
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

export const APP_COLUMN_GRANTS: ColumnGrants = {
  // Yaşa göre silinen alan (`maintenance.ts` `AGED_FIELDS`: giriş olayının IP'si); olay, aktör, zaman yazılamaz.
  account_audit: { UPDATE: ["summary"] },
  // Kimlik silmesi makbuz yanıtındaki ad/e-postayı tombstone'a çevirir (`maintenance.ts` `purgeClosedIdentities`);
  // makbuzun kimliği, eylemi ve gövde özeti yazılamaz (tekrar kapısı onlara dayanır).
  operation_receipts: { UPDATE: ["response"] },
};

export const SYNC_COLUMN_GRANTS: ColumnGrants = {
  // Gelen kutusu claim'i yazarın GÜNCEL durumunu ve yazma iznini sorar (`inbox.service.ts` `authorEligibleSql`);
  // e-posta, ad, parola/TOTP/davet sırları OKUNAMAZ — kanal katmanı hesap kimliğine ulaşmaz.
  accounts: { SELECT: ["id", "tesis_id", "status", "permissions"] },
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
  // Kurulum yönü (ilk yazan bağlar, bağ değişmez) + bayat üyelik budaması; kimliğe (`identities`) ERİŞEMEZ.
  installation_routes: ["SELECT", "INSERT"],
  login_routes: ["SELECT", "DELETE"],
};

/** Şemadaki bütün uygulama tabloları (bekçi: şema ↔ bu liste birebir). */
export const CLOUD_TABLES: readonly string[] = [
  "facilities",
  "installations",
  "accounts",
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
