// LİSTE DEĞER + TARİH SÜZGEÇLERİ (2026-11-20) — `?secim=` (değer/dizi üyeliği) ve `?aralik=` (fabrika günü aralığı).
// Bulut hesap yapmaz: yalnız saklı alanı karşılaştırır (metin eşitliği, dizi üyeliği, gün karşılaştırması). Beyan
// `wire/api.ts` `LIST_VALUE_FILTERS` / `LIST_DATE_RANGES`; beyansız alan, biçimsiz değer FAIL-CLOSED 400.
import { Prisma } from "@prisma/client";
import { badRequest } from "../lib/errors";
import { DEFAULT_FACILITY_TIMEZONE } from "../lib/facility-clock";
import { LIST_DATE_RANGES, LIST_VALUE_FILTERS, SECIM_AZAMI } from "../wire/api";

/** JSON nesnesi parametresi: biçimsiz / nesne olmayan / boş nesne 400 (fail-closed). */
function jsonObject(raw: string, ad: string): Record<string, unknown> {
  let v: unknown;
  try {
    v = JSON.parse(raw);
  } catch {
    throw badRequest(`${ad} biçimsiz`);
  }
  if (typeof v !== "object" || v === null || Array.isArray(v) || Object.keys(v).length === 0) throw badRequest(`${ad} biçimsiz`);
  return v as Record<string, unknown>;
}

/** Dizi ise kendisi, metin/sayı ise tek öğeli dizi, diğeri boş: alan türü ne olursa olsun SQL hatası vermez. */
export const elementsSql = (alan: string): Prisma.Sql => Prisma.sql`jsonb_array_elements_text(CASE jsonb_typeof(r.data->${alan})
  WHEN 'array' THEN r.data->${alan} WHEN 'string' THEN jsonb_build_array(r.data->${alan}) WHEN 'number' THEN jsonb_build_array(r.data->${alan}) ELSE '[]'::jsonb END)`;

/** `secim` (değer süzgeci): beyansız alan, boş/aşırı değer listesi, metin olmayan değer 400. */
export function valueFilters(name: string, raw: string | undefined): Prisma.Sql[] {
  if (raw === undefined) return [];
  if (raw.length > SECIM_AZAMI.metin) throw badRequest("Süzgeç seçimi çok uzun");
  const beyan = Object.hasOwn(LIST_VALUE_FILTERS, name) ? LIST_VALUE_FILTERS[name]! : [];
  const out: Prisma.Sql[] = [];
  for (const [alan, degerler] of Object.entries(jsonObject(raw, "secim"))) {
    const f = beyan.find((x) => x.alan === alan);
    if (!f) throw badRequest(`Bu listede ${alan} süzgeci yok`);
    if (!Array.isArray(degerler) || degerler.length === 0 || degerler.length > SECIM_AZAMI.deger) throw badRequest(`${alan}: 1–${SECIM_AZAMI.deger} değer`);
    if (!degerler.every((d): d is string => typeof d === "string" && d.length > 0 && d.length <= SECIM_AZAMI.uzunluk)) throw badRequest(`${alan}: değer metin olmalı`);
    const liste = Prisma.join([...new Set(degerler)]);
    out.push(f.dizi
      ? Prisma.sql`AND EXISTS (SELECT 1 FROM ${elementsSql(alan)} AS e(v) WHERE e.v IN (${liste}))`
      : Prisma.sql`AND (r.data->>${alan}) IN (${liste})`);
  }
  return out;
}

const GUN = /^(\d{4})-(\d{2})-(\d{2})$/;

/** Takvimde var olan `YYYY-MM-DD` mi (2026-02-30 değil). */
function gecerliGun(v: string): boolean {
  const m = GUN.exec(v);
  if (!m) return false;
  const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
  return d.toISOString().slice(0, 10) === v;
}

/** Kayıttaki tarih alanının FABRİKA GÜNÜ: `YYYY-MM-DD` aynen, ISO an Europe/Istanbul'da güne; başka biçim NULL (aralığa girmez). */
function factoryDaySql(alan: string): Prisma.Sql {
  const x = Prisma.sql`(r.data->>${alan})`;
  return Prisma.sql`(CASE WHEN ${x} ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' THEN ${x}::date
    WHEN ${x} ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9:.]+(Z|[+-][0-9]{2}(:?[0-9]{2})?)$' THEN (${x}::timestamptz AT TIME ZONE ${DEFAULT_FACILITY_TIMEZONE})::date END)`;
}

/** `aralik` (tarih süzgeci): beyansız alan, biçimsiz/olmayan gün, iki ucu boş, ters aralık 400. */
export function dateFilters(name: string, raw: string | undefined): Prisma.Sql[] {
  if (raw === undefined) return [];
  if (raw.length > 400) throw badRequest("Tarih aralığı biçimsiz");
  const beyan = Object.hasOwn(LIST_DATE_RANGES, name) ? LIST_DATE_RANGES[name]! : [];
  const out: Prisma.Sql[] = [];
  for (const [alan, ar] of Object.entries(jsonObject(raw, "aralik"))) {
    if (!beyan.some((x) => x.alan === alan)) throw badRequest(`Bu listede ${alan} tarih süzgeci yok`);
    if (!Array.isArray(ar) || ar.length !== 2) throw badRequest(`${alan}: [başlangıç, bitiş] olmalı`);
    const [bas, son] = ar as unknown[];
    const uc = (v: unknown): v is string | null => v === null || (typeof v === "string" && gecerliGun(v));
    if (!uc(bas) || !uc(son) || (bas === null && son === null)) throw badRequest(`${alan}: tarih YYYY-AA-GG olmalı`);
    if (bas !== null && son !== null && bas > son) throw badRequest(`${alan}: başlangıç bitişten sonra`);
    const gun = factoryDaySql(alan);
    if (bas !== null) out.push(Prisma.sql`AND ${gun} >= ${bas}::date`);
    if (son !== null) out.push(Prisma.sql`AND ${gun} <= ${son}::date`);
  }
  return out;
}
