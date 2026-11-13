// ROL VE YETKİ UYGULAMA MEKANİĞİ — `scripts/db-rolleri.ts` çağırır (yetki BEYANI `db-grants.ts`te). Hepsi göç
// rolüyle (tablo sahibi) ve idempotent.
// Parola çıktıya/günlüğe YAZILMAZ: hata iletisi rol adını taşır, parolayı taşımaz.
import type { Client } from "pg";
import { CLOUD_TABLES, type ColumnGrants, type Privilege } from "./db-grants";

export const ident = (s: string): string => `"${s.replace(/"/g, '""')}"`;
export const literal = (s: string): string => `'${s.replace(/'/g, "''")}'`;

const ROLE_ATTRS = "LOGIN NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE NOINHERIT";

/** Çalışma rolü: yoksa CREATE, varsa ALTER (özellikler + parola hizalanır). */
export async function ensureLoginRole(client: Client, name: string, password: string): Promise<void> {
  const exists = await client.query("SELECT 1 FROM pg_roles WHERE rolname = $1", [name]);
  const verb = exists.rowCount === 0 ? "CREATE" : "ALTER";
  try {
    await client.query(`${verb} ROLE ${ident(name)} WITH ${ROLE_ATTRS} PASSWORD ${literal(password)}`);
  } catch (err) {
    // 42710 = yarışta öteki taraf az önce kurdu; ALTER ile hizala.
    if ((err as { code?: string }).code !== "42710") throw new Error(`${name} rolü kurulamadı (${(err as { code?: string }).code ?? "?"})`);
    await client.query(`ALTER ROLE ${ident(name)} WITH ${ROLE_ATTRS} PASSWORD ${literal(password)}`);
  }
}

/** Tablo REVOKE'u kolon yetkilerini de geri alır (PG) ⇒ beyandan düşen yetki DB'de kalmaz. */
export async function grantAll(client: Client, role: string, grants: Readonly<Record<string, readonly Privilege[]>>, columnGrants: ColumnGrants): Promise<void> {
  await client.query(`REVOKE ALL ON ALL TABLES IN SCHEMA public FROM ${ident(role)}`);
  await client.query(`GRANT USAGE ON SCHEMA public TO ${ident(role)}`);
  for (const [table, privileges] of Object.entries(grants)) {
    if (!CLOUD_TABLES.includes(table)) throw new Error(`Yetki listesinde bilinmeyen tablo: ${table}`);
    await client.query(`GRANT ${privileges.join(", ")} ON ${ident(table)} TO ${ident(role)}`);
  }
  for (const [table, byPrivilege] of Object.entries(columnGrants)) {
    if (!CLOUD_TABLES.includes(table)) throw new Error(`Kolon yetki listesinde bilinmeyen tablo: ${table}`);
    for (const [privilege, columns] of Object.entries(byPrivilege)) {
      if (!columns || columns.length === 0) continue;
      if (grants[table]?.includes(privilege as Privilege)) throw new Error(`${table}: ${privilege} hem tablo hem kolon düzeyinde beyanlı`);
      await client.query(`GRANT ${privilege} (${columns.map(ident).join(", ")}) ON ${ident(table)} TO ${ident(role)}`);
    }
  }
}
