// Bekçi verisinin temizliği — TEK veritabanı (Adnan, tek tesis). YALNIZ `_test` DB'sinde (fabrika verisi sınıfı
// ASLA): bekçinin kendi rastgele tesisinin satırları (`temizleTesisSatirlari`) ya da koşucunun tur başı süpürmesi
// (`supurTestVerisi`: çöken bekçinin artığı). Göç rolüyle; RLS FORCE süper kullanıcı olmayan sahibe de uygulandığı
// için silme tesis kapsamında (`app.tesis_id`) koşar.
import { Client } from "pg";
import { CLOUD_TABLES, ROUTING_TABLES } from "../../src/lib/db-grants";
import { ident } from "../../src/lib/db-roles";
import { PG_SESSION_OPTIONS } from "../../src/lib/pg-session";

export function testDatabase(gocUrl: string): string {
  const db = decodeURIComponent(new URL(gocUrl).pathname.replace(/^\//, ""));
  if (!db.endsWith("_test") || db.startsWith("tekserp_fabrika_")) throw new Error(`Temizlik yalnız _test DB'sinde: ${db}`);
  return db;
}

/** Yabancı anahtar sırası: çocuk önce, `facilities` en son. */
const SON = ["accounts", "installations", "facilities"];
export const TESIS_SILME_SIRASI: readonly string[] = [...CLOUD_TABLES.filter((t) => !SON.includes(t)), ...SON];

async function withClient<T>(gocUrl: string, fn: (c: Client) => Promise<T>): Promise<T> {
  testDatabase(gocUrl);
  const c = new Client({ connectionString: gocUrl, options: PG_SESSION_OPTIONS });
  await c.connect();
  try {
    return await fn(c);
  } finally {
    await c.end();
  }
}

/** Tek bekçi tesisinin bütün satırları (kiracı tabloları + kurulum yönü + hesaplar). */
export async function temizleTesisSatirlari(gocUrl: string, tesisId: string): Promise<void> {
  await withClient(gocUrl, async (c) => {
    await c.query("BEGIN");
    try {
      await c.query("SELECT set_config('app.tesis_id', $1, true), set_config('app.projeksiyonlar', '', true)", [tesisId]);
      for (const t of TESIS_SILME_SIRASI) {
        // Alan izni RESTRICTIVE politikası satır okuyan DELETE'e de uygulanır: projeksiyon adları kapsama açılır.
        if (t === "projection_rows" || t === "report_results") {
          await c.query(`SELECT set_config('app.projeksiyonlar', coalesce((SELECT string_agg(DISTINCT projection, ',') FROM ${ident(t)} WHERE tesis_id = $1::uuid), ''), true)`, [tesisId]);
        }
        await c.query(`DELETE FROM ${ident(t)} WHERE tesis_id = $1::uuid`, [tesisId]);
      }
      await c.query("COMMIT");
    } catch (err) {
      await c.query("ROLLBACK");
      throw err;
    }
  });
}

/** Koşucunun tur başı süpürmesi: `_test` DB'sindeki bütün bekçi verisi (yönlendirme tabloları dahil). Silinen tesis sayısını döner. */
export async function supurTestVerisi(gocUrl: string): Promise<number> {
  return withClient(gocUrl, async (c) => {
    await c.query("BEGIN");
    try {
      await c.query("SELECT set_config('app.bakim', 'evet', true), set_config('app.tesis_id', '00000000-0000-0000-0000-000000000000', true)");
      const tesisler = (await c.query<{ tesis_id: string }>("SELECT tesis_id FROM facilities")).rows.map((r) => r.tesis_id);
      await c.query("COMMIT");
      for (const t of tesisler) await temizleTesisSatirlari(gocUrl, t);
      for (const t of ROUTING_TABLES) await c.query(`DELETE FROM ${ident(t)}`);
      return tesisler.length;
    } catch (err) {
      await c.query("ROLLBACK").catch(() => undefined);
      throw err;
    }
  });
}
