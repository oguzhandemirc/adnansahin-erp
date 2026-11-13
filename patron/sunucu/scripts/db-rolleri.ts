// =============================================================================
// DB ROLLERİ — uygulama + eşitleme rolünü kurar/hizalar ve yetkilerini `src/lib/db-grants.ts`ten verir (tek
// veritabanı: kiracı + kimlik tabloları aynı DB'de; tablo + kolon düzeyi).
//   npx tsx scripts/db-rolleri.ts            (her `prisma migrate deploy`dan SONRA; idempotent)
// Roller KÜME düzeyindedir, migration'a girmez. Ad + parola çalışma URL'lerinden (`DATABASE_URL`,
// `ESITLEME_DATABASE_URL`) okunur, işlemi GÖÇ rolü (`GOC_DATABASE_URL`, tablo sahibi) yapar.
// İki çalışma rolü: LOGIN NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE; DB'ye bağlanma PUBLIC'ten
// geri alınır (REVOKE CONNECT). Parola çıktıya/loga YAZILMAZ. Destek rolü YOKTUR (Adnan'da satıcı yok).
// =============================================================================
import { Client } from "pg";
import { loadEnvFile } from "../src/lib/env";
import { APP_COLUMN_GRANTS, APP_GRANTS, SYNC_COLUMN_GRANTS, SYNC_GRANTS } from "../src/lib/db-grants";
import { ensureLoginRole, grantAll, ident } from "../src/lib/db-roles";

const ROLE_NAME = /^[a-z_][a-z0-9_]{0,62}$/;
const DATABASE_NAME = /^[a-z_][a-z0-9_]{0,62}$/;

export interface RoleSpec {
  readonly name: string;
  readonly password: string;
}

export function roleFromUrl(url: string, label: string): RoleSpec {
  const u = new URL(url);
  const name = decodeURIComponent(u.username);
  const password = decodeURIComponent(u.password);
  if (!ROLE_NAME.test(name)) throw new Error(`${label}: rol adı biçimsiz (küçük harf, rakam, _)`);
  if (password.length < 16) throw new Error(`${label}: rol parolası en az 16 karakter olmalı`);
  return { name, password };
}

export function databaseName(url: string): string {
  return decodeURIComponent(new URL(url).pathname.replace(/^\//, ""));
}

export async function applyRoles(env: NodeJS.ProcessEnv = process.env): Promise<{ app: string; sync: string; database: string }> {
  const goc = env.GOC_DATABASE_URL;
  if (!goc || !env.DATABASE_URL || !env.ESITLEME_DATABASE_URL) throw new Error("GOC_DATABASE_URL, DATABASE_URL ve ESITLEME_DATABASE_URL zorunlu");
  const database = databaseName(goc);
  if (!DATABASE_NAME.test(database)) throw new Error("GOC_DATABASE_URL: veritabanı adı biçimsiz (küçük harf, rakam, _)");
  if (database.startsWith("tekserp_fabrika_")) throw new Error("Fabrika verisi sınıfındaki DB'ye rol kurulmaz");
  for (const u of [env.DATABASE_URL, env.ESITLEME_DATABASE_URL]) {
    if (databaseName(u) !== database) throw new Error("Çalışma URL'leri göç URL'iyle AYNI veritabanını göstermeli");
  }
  const app = roleFromUrl(env.DATABASE_URL, "DATABASE_URL");
  const sync = roleFromUrl(env.ESITLEME_DATABASE_URL, "ESITLEME_DATABASE_URL");
  const owner = decodeURIComponent(new URL(goc).username);
  if (app.name === sync.name || app.name === owner || sync.name === owner) throw new Error("Göç, uygulama ve eşitleme rolleri üç AYRI rol olmalı");
  const client = new Client({ connectionString: goc });
  await client.connect();
  try {
    await ensureLoginRole(client, app.name, app.password);
    await ensureLoginRole(client, sync.name, sync.password);
    await client.query(`REVOKE CONNECT ON DATABASE ${ident(database)} FROM PUBLIC`);
    await client.query(`GRANT CONNECT ON DATABASE ${ident(database)} TO ${ident(app.name)}, ${ident(sync.name)}`);
    await grantAll(client, app.name, APP_GRANTS, APP_COLUMN_GRANTS);
    await grantAll(client, sync.name, SYNC_GRANTS, SYNC_COLUMN_GRANTS);
  } finally {
    await client.end();
  }
  return { app: app.name, sync: sync.name, database };
}

if (require.main === module) {
  loadEnvFile();
  applyRoles()
    .then((r) => {
      console.log(`✅ roller hizalandı — DB ${r.database} · uygulama ${r.app} · eşitleme ${r.sync}`);
      process.exit(0);
    })
    .catch((err: Error) => {
      console.error(`⛔ ${err.message}`);
      process.exit(1);
    });
}
