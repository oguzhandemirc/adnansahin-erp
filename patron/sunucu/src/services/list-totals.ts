// LİSTE TOPLAMI + SEÇENEKLERİ (2026-11-20) — veri tablosunun alt şeridi ve süzgeç seçenekleri. Toplam, listeyle AYNI
// where'den (`listFilters`) doğar ve yalnız fabrikanın satır başına verdiği sayıları toplar (yeni türev yok); seçenekler
// beyanlı alanların kümedeki tekil değerleridir. İzin ve RLS listeyle aynı (`readableDef` + `withTesis`).
import { Prisma } from "@prisma/client";
import type { SessionContext } from "../auth/session.service";
import type { ProjectionDef } from "../catalog/projections";
import { badRequest } from "../lib/errors";
import { foldSql } from "../lib/search";
import { withTesis } from "../lib/tenant";
import { LIST_TOTALS, LIST_VALUE_FILTERS, SECENEK_AZAMI, type ListOptions, type ListTotals } from "../wire/api";
import type { CloudContext } from "./context";
import { listFilters, NUMERIC, readableDef, type ListFilterQuery } from "./data.service";
import { elementsSql } from "./list-filters";

const projectionScope = (s: SessionContext, def: ProjectionDef): Prisma.Sql =>
  Prisma.sql`r.tesis_id = ${s.tesisId}::uuid AND r.projection = ${def.name} AND r.deleted_at IS NULL`;

/**
 * Süzülen kümenin sayısı + fabrikanın satır başına verdiği sayıların TOPLAMI (`LIST_TOTALS`); beyansız projeksiyonda 400.
 * Sayı olmayan değer toplama girmez; toplam kesin ondalık metindir.
 */
export async function listTotals(ctx: CloudContext, s: SessionContext, name: string, q: ListFilterQuery): Promise<ListTotals> {
  const def = readableDef(s, name, "KAYIT");
  const alanlar = Object.hasOwn(LIST_TOTALS, def.name) ? LIST_TOTALS[def.name]! : null;
  if (!alanlar) throw badRequest("Bu listede toplam yok");
  const filters = listFilters(def.name, q);
  const sums = alanlar.map((a, i) => {
    const t = Prisma.sql`NULLIF(r.data->>${a}, '')`;
    return Prisma.sql`, (SUM(CASE WHEN ${t} ~ ${NUMERIC} THEN ${t}::numeric END))::text AS ${Prisma.raw(`t${i}`)}`;
  });
  const rows = await withTesis(ctx.app, { tesisId: s.tesisId, projections: s.projections }, (tx) =>
    tx.$queryRaw<Record<string, unknown>[]>(Prisma.sql`
      SELECT count(*)::int AS adet${sums.length > 0 ? Prisma.join(sums, "") : Prisma.empty}
        FROM projection_rows r
       WHERE ${projectionScope(s, def)} ${filters.length > 0 ? Prisma.join(filters, " ") : Prisma.empty}`),
  );
  const row = rows[0] ?? {};
  return { adet: Number(row.adet ?? 0), toplamlar: Object.fromEntries(alanlar.map((a, i) => [a, (row[`t${i}`] as string | null | undefined) ?? null])) };
}

/** Değer süzgeci seçenekleri: beyanlı her alanın kümedeki tekil değerleri (süzgeçsiz; silinen satır hariç). */
export async function listOptions(ctx: CloudContext, s: SessionContext, name: string): Promise<ListOptions> {
  const def = readableDef(s, name, "KAYIT");
  const alanlar = Object.hasOwn(LIST_VALUE_FILTERS, def.name) ? LIST_VALUE_FILTERS[def.name]! : null;
  if (!alanlar) throw badRequest("Bu listede değer süzgeci yok");
  const out: Record<string, { degerler: string[]; kesildi: boolean }> = {};
  await withTesis(ctx.app, { tesisId: s.tesisId, projections: s.projections }, async (tx) => {
    // tx çağrıları sırayla (Promise.all YASAK).
    for (const f of alanlar) {
      const rows = await tx.$queryRaw<{ v: string }[]>(Prisma.sql`
        SELECT d.v FROM (SELECT DISTINCT e.v FROM projection_rows r CROSS JOIN LATERAL ${elementsSql(f.alan)} AS e(v)
                          WHERE ${projectionScope(s, def)} AND e.v IS NOT NULL AND e.v <> '') d
         ORDER BY ${foldSql(Prisma.sql`d.v`)}, d.v COLLATE "C"
         LIMIT ${SECENEK_AZAMI + 1}`);
      out[f.alan] = { degerler: rows.slice(0, SECENEK_AZAMI).map((x) => x.v), kesildi: rows.length > SECENEK_AZAMI };
    }
  });
  return { alanlar: out };
}
