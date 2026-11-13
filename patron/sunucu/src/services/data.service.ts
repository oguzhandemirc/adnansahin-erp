// VERİ API'si — projeksiyon okuma; İZİN SÜZMESİ SUNUCUDA, iki katmanda: (1) uygulama kapısı — hesap
// projeksiyonun izin kümesini taşımıyorsa 403; (2) RLS — tx `app.projeksiyonlar`ı hesabın okuyabildiği
// adlarla açar, izinsiz alt satır (`.kisisel`) DB düzeyinde görünmez (sol birleşimde NULL).
// Bulut hesap yapmaz: satır fabrikanın hesapladığı hâliyle döner; süzgeç yalnız saklı alan eşitliği.
import { Prisma } from "@prisma/client";
import type { SessionContext } from "../auth/session.service";
import { projectionDef, type ProjectionDef } from "../catalog/projections";
import { badRequest, forbidden, notFound } from "../lib/errors";
import { foldSql, searchCondition } from "../lib/search";
import { NO_TENANT, withTesis } from "../lib/tenant";
import { ARAMA_AZAMI, LIST_ID_FILTER_KEYS, LIST_ID_FILTERS, LIST_MEMBER_FILTER_KEYS, LIST_MEMBER_FILTERS, LIST_SEARCH, LIST_SORT, SUZGEC_AZAMI, type CustomerSummary, type ListFilterOption, type ListSortDir, type ListSortKind, type CustomerSummaryResponse, type FacilityStatus, type ListCapabilities, type ListIdFilterKey, type ListMemberFilterKey, type Page, type ProjectionRecord, type Snapshot } from "../wire/api";
import type { CloudContext } from "./context";
import { loadServiceFacts, serviceState } from "./service-lifecycle";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function readableDef(s: SessionContext, name: string, kind: "KAYIT" | "ANLIK"): ProjectionDef {
  const def = projectionDef(name);
  if (!def || def.subRow) throw notFound("Projeksiyon");
  if ((kind === "ANLIK") !== (def.root.kind === "ANLIK")) throw notFound("Projeksiyon");
  if (!def.permissions.every((p) => s.permissions.has(p))) throw forbidden("Bu veriyi görme yetkiniz yok");
  return def;
}

/** Hesabın görebildiği alt satırlar (uygulama kapısı; RLS aynı kararı DB'de verir). */
export function visibleSubRows(s: SessionContext, def: ProjectionDef): { kisisel: boolean } {
  return { kisisel: (def.root.subRows ?? []).includes("kisisel") && s.projections.includes(`${def.name}.kisisel`) };
}

export interface ListQuery {
  readonly cursor?: string;
  readonly limit: number;
  readonly durum?: string;
  /** Kimlik süzgeçleri (`LIST_ID_FILTERS` beyanı); beyansız projeksiyonda 400. */
  readonly kimlik?: Partial<Readonly<Record<ListIdFilterKey | ListMemberFilterKey, string>>>;
  /** Seçici araması (`LIST_SEARCH`teki projeksiyonlar); imleç aynı terimle devam eder. */
  readonly ara?: string;
  /** Virgüllü süzgeç değerleri (grup başına en çok bir). */
  readonly suzgec?: string;
  /** Sıralama (`LIST_SORT` beyanı); yoksa `sort_at` azalan. */
  readonly sirala?: string;
  readonly yon?: ListSortDir;
}

/** `ara`/`suzgec` koşulları: arama beyanı olmayan listede ya da tanınmayan süzgeçte 400 (fail-closed). */
function searchFilters(name: string, q: ListQuery): Prisma.Sql[] {
  if (q.ara === undefined && q.suzgec === undefined) return [];
  const spec = Object.hasOwn(LIST_SEARCH, name) ? LIST_SEARCH[name] : undefined;
  if (!spec) throw badRequest("Bu listede arama yok");
  const out: Prisma.Sql[] = [];
  if (q.ara !== undefined) {
    if (q.ara.length > ARAMA_AZAMI) throw badRequest(`Arama en çok ${ARAMA_AZAMI} karakter`);
    out.push(searchCondition(spec.alanlar, q.ara));
  }
  if (q.suzgec !== undefined) {
    // Seçenek → grup: ana süzgeç `""`, ek gruplar kendi anahtarıyla; aynı gruptan iki değer anlamsız (400).
    const groups = new Map<string, { group: string; opt: ListFilterOption }>();
    for (const o of spec.suzgec?.secenekler ?? []) groups.set(o.deger, { group: "", opt: o });
    for (const g of spec.ekSuzgecler ?? []) for (const o of g.secenekler) groups.set(o.deger, { group: g.anahtar, opt: o });
    const values = q.suzgec.split(",");
    if (values.length > SUZGEC_AZAMI) throw badRequest(`En çok ${SUZGEC_AZAMI} süzgeç`);
    const used = new Set<string>();
    for (const v of values) {
      const hit = groups.get(v);
      if (!hit) throw badRequest(`Tanınmayan süzgeç: ${v}`);
      if (used.has(hit.group)) throw badRequest("Aynı süzgeç grubundan tek seçim");
      used.add(hit.group);
      out.push(Prisma.sql`AND (r.data->${hit.opt.alan}) = ${JSON.stringify(hit.opt.esit)}::jsonb`);
    }
  }
  return out;
}

/** Literal ifade: `projection_rows_cari_idx` (`data->>'cariKartId'`) parametreli anahtarla eşleşmez. */
const ID_FIELD_SQL: Readonly<Record<ListIdFilterKey, Prisma.Sql>> = {
  cariKartId: Prisma.sql`r.data->>'cariKartId'`,
  siparisId: Prisma.sql`r.data->>'siparisId'`,
  urunId: Prisma.sql`r.data->>'urunId'`,
};

/** Literal dizi alanı (projeksiyon → `LIST_MEMBER_FILTERS` beyanı); dizi değilse `@>` eşleşmez. */
const MEMBER_FIELD_SQL: Readonly<Record<string, Prisma.Sql>> = {
  cariKartIdleri: Prisma.sql`r.data->'cariKartIdleri'`,
  siparisIdleri: Prisma.sql`r.data->'siparisIdleri'`,
  fasonFirmaIdleri: Prisma.sql`r.data->'fasonFirmaIdleri'`,
};

/** Kimlik süzgeçleri: anahtar projeksiyonun (eşitlik ya da üyelik) beyanında değilse ya da değer UUID değilse 400 (fail-closed). */
function idFilters(name: string, q: ListQuery): Prisma.Sql[] {
  const out: Prisma.Sql[] = [];
  for (const key of new Set<ListIdFilterKey | ListMemberFilterKey>([...LIST_ID_FILTER_KEYS, ...LIST_MEMBER_FILTER_KEYS])) {
    const v = q.kimlik?.[key];
    if (v === undefined) continue;
    const esit = (LIST_ID_FILTERS as Partial<Record<string, readonly string[]>>)[key]?.includes(name) === true;
    const uyelik = (LIST_MEMBER_FILTERS as Partial<Record<string, Readonly<Record<string, string>>>>)[key]?.[name];
    if (!esit && uyelik === undefined) throw badRequest(`Bu listede ${key} süzgeci yok`);
    if (!UUID.test(v)) throw badRequest(`${key} biçimsiz`);
    if (esit) out.push(Prisma.sql`AND ${ID_FIELD_SQL[key as ListIdFilterKey]} = ${v.toLowerCase()}`);
    else out.push(Prisma.sql`AND (${MEMBER_FIELD_SQL[uyelik!]}) @> jsonb_build_array(${v.toLowerCase()}::text)`);
  }
  return out;
}

/** İstemcinin özellik kapısı: eski sunucu bu alanı göndermez, tanımadığı parametreyi de yok sayar. */
export const LIST_CAPABILITIES: ListCapabilities = {
  kimlikSuzgecleri: LIST_ID_FILTERS,
  aranabilir: Object.keys(LIST_SEARCH),
  siralama: Object.fromEntries(Object.entries(LIST_SORT).map(([p, f]) => [p, Object.keys(f)])),
  uyelikSuzgecleri: Object.fromEntries(Object.entries(LIST_MEMBER_FILTERS).map(([k, p]) => [k, Object.keys(p)])),
};

const NUMERIC = "^-?[0-9]+(\\.[0-9]+)?$";

/** Sıralama anahtarı: boş değer (yok · JSON null · boş metin · sayı olmayan) SQL NULL'dur ve HEP sonda kalır. */
function sortKeySql(field: string, kind: ListSortKind): Prisma.Sql {
  const text = Prisma.sql`NULLIF(r.data->>${field}, '')`;
  if (kind === "sayi") return Prisma.sql`(CASE WHEN ${text} ~ ${NUMERIC} THEN ${text}::numeric END)`;
  if (kind === "metin") return foldSql(text);
  return Prisma.sql`(${text} COLLATE "C")`;
}

export interface SortSpec {
  readonly field: string;
  readonly kind: ListSortKind;
  readonly dir: ListSortDir;
}

/** `sirala`/`yon`: beyansız alan ya da tek başına `yon` 400 (fail-closed); ikisi de yoksa null (eski sıra). */
export function sortSpec(name: string, q: Pick<ListQuery, "sirala" | "yon">): SortSpec | null {
  if (q.sirala === undefined) {
    if (q.yon !== undefined) throw badRequest("yon yalnız sirala ile");
    return null;
  }
  const fields = Object.hasOwn(LIST_SORT, name) ? LIST_SORT[name]! : {};
  const kind = Object.hasOwn(fields, q.sirala) ? fields[q.sirala] : undefined;
  if (!kind) throw badRequest(`Bu listede ${q.sirala} sıralaması yok`);
  return { field: q.sirala, kind, dir: q.yon ?? "artan" };
}

/** Sıralı imleç: `[anahtar metni | null, kayıt kimliği]` (anahtar SQL'de aynı türe geri çevrilir). */
function decodeSortCursor(cursor: string): { key: string | null; id: string } {
  try {
    const [key, id] = JSON.parse(Buffer.from(cursor, "base64url").toString("utf8")) as [unknown, string];
    if ((key !== null && typeof key !== "string") || !UUID.test(id)) throw new Error("biçim");
    return { key, id };
  } catch {
    throw badRequest("İmleç biçimsiz");
  }
}

const encodeSortCursor = (key: string | null, id: string): string => Buffer.from(JSON.stringify([key, id])).toString("base64url");

/** Anahtar metni parametre olarak aynı türe döner (sayı `numeric`; katlanmış metin zaten katlı, "C" ile karşılaştırılır). */
function keyParam(key: string, kind: ListSortKind): Prisma.Sql {
  if (kind === "sayi") return Prisma.sql`${key}::numeric`;
  return Prisma.sql`(${key}::text COLLATE "C")`;
}

/** Sıralı imleç koşulu: (boş mu, anahtar yönlü, kimlik yönlü) sırasında imlecin ardından gelenler. */
function sortCursorFilter(sort: SortSpec, c: { key: string | null; id: string }): Prisma.Sql {
  const k = sortKeySql(sort.field, sort.kind);
  const cmp = sort.dir === "artan" ? Prisma.sql`>` : Prisma.sql`<`;
  if (c.key === null) return Prisma.sql`AND ${k} IS NULL AND r.record_id ${cmp} ${c.id}::uuid`;
  const p = keyParam(c.key, sort.kind);
  return Prisma.sql`AND (${k} IS NULL OR ${k} ${cmp} ${p} OR (${k} = ${p} AND r.record_id ${cmp} ${c.id}::uuid))`;
}

function sortOrderSql(sort: SortSpec | null): Prisma.Sql {
  if (!sort) return Prisma.sql`r.sort_at DESC, r.record_id DESC`;
  const d = sort.dir === "artan" ? Prisma.sql`ASC` : Prisma.sql`DESC`;
  return Prisma.sql`${sortKeySql(sort.field, sort.kind)} ${d} NULLS LAST, r.record_id ${d}`;
}

function decodeCursor(cursor: string): { sortAt: Date; id: string } {
  try {
    const [t, id] = JSON.parse(Buffer.from(cursor, "base64url").toString("utf8")) as [string, string];
    const sortAt = new Date(t);
    if (!Number.isFinite(sortAt.getTime()) || !UUID.test(id)) throw new Error("biçim");
    return { sortAt, id };
  } catch {
    throw badRequest("İmleç biçimsiz");
  }
}

const encodeCursor = (sortAt: Date, id: string): string => Buffer.from(JSON.stringify([sortAt.toISOString(), id])).toString("base64url");

export interface Row {
  record_id: string;
  data: unknown;
  version_at: Date;
  sort_at: Date;
  /** Yalnız sıralı listede: sıralama anahtarının metni (imleç için). */
  sort_key?: string | null;
  kisisel: unknown;
}

export function rowView(r: Row, sub: { kisisel: boolean }): ProjectionRecord {
  return {
    id: r.record_id,
    kayit: r.data,
    ...(sub.kisisel ? { kisisel: r.kisisel ?? null } : {}),
    surum: r.version_at.toISOString(),
  };
}

/** Kök + (izinliyse) alt satırlar tek sorguda; imleç `(sort_at, record_id)` azalan (liste ve dışa aktarma aynı sıra). */
export function selectRows(s: SessionContext, def: ProjectionDef, q: { readonly where: Prisma.Sql; readonly limit: number; readonly sort?: SortSpec | null }): Prisma.Sql {
  const { where, limit, sort = null } = q;
  const key = sort ? Prisma.sql`, (${sortKeySql(sort.field, sort.kind)})::text AS sort_key` : Prisma.empty;
  return Prisma.sql`
    SELECT r.record_id, r.data, r.version_at, r.sort_at, k.data AS kisisel${key}
      FROM projection_rows r
      LEFT JOIN projection_rows k ON k.tesis_id = r.tesis_id AND k.projection = ${`${def.name}.kisisel`} AND k.record_id = r.record_id AND k.deleted_at IS NULL
     WHERE r.tesis_id = ${s.tesisId}::uuid AND r.projection = ${def.name} AND r.deleted_at IS NULL ${where}
     ORDER BY ${sortOrderSql(sort)}
     LIMIT ${limit}`;
}

export async function listProjection(ctx: CloudContext, s: SessionContext, name: string, q: ListQuery): Promise<Page<ProjectionRecord>> {
  const def = readableDef(s, name, "KAYIT");
  if (q.durum !== undefined && !/^[A-Z][A-Z0-9_]{0,39}$/.test(q.durum)) throw badRequest("durum biçimsiz");
  const filters: Prisma.Sql[] = [...idFilters(def.name, q), ...searchFilters(def.name, q)];
  if (q.durum) filters.push(Prisma.sql`AND r.data->>'durum' = ${q.durum}`);
  const sort = sortSpec(def.name, q);
  if (q.cursor && sort) filters.push(sortCursorFilter(sort, decodeSortCursor(q.cursor)));
  else if (q.cursor) {
    const c = decodeCursor(q.cursor);
    filters.push(Prisma.sql`AND (r.sort_at, r.record_id) < (${c.sortAt}::timestamptz, ${c.id}::uuid)`);
  }
  const sub = visibleSubRows(s, def);
  const rows = await withTesis(ctx.app, { tesisId: s.tesisId, projections: s.projections }, (tx) =>
    tx.$queryRaw<Row[]>(selectRows(s, def, { where: filters.length > 0 ? Prisma.join(filters, " ") : Prisma.empty, limit: q.limit + 1, sort })),
  );
  const page = rows.slice(0, q.limit);
  const last = page[page.length - 1];
  const next = rows.length > q.limit && last ? (sort ? encodeSortCursor(last.sort_key ?? null, last.record_id) : encodeCursor(last.sort_at, last.record_id)) : null;
  return { kayitlar: page.map((r) => rowView(r, sub)), sonraki: next };
}

export async function getProjectionRecord(ctx: CloudContext, s: SessionContext, name: string, id: string) {
  const def = readableDef(s, name, "KAYIT");
  if (!UUID.test(id)) throw notFound("Kayıt");
  const sub = visibleSubRows(s, def);
  const rows = await withTesis(ctx.app, { tesisId: s.tesisId, projections: s.projections }, (tx) =>
    tx.$queryRaw<Row[]>(selectRows(s, def, { where: Prisma.sql`AND r.record_id = ${id}::uuid`, limit: 1 })),
  );
  if (!rows[0]) throw notFound("Kayıt");
  return rowView(rows[0], sub);
}

export async function getSnapshot(ctx: CloudContext, s: SessionContext, name: string): Promise<Snapshot> {
  const def = readableDef(s, name, "ANLIK");
  const row = await withTesis(ctx.app, { tesisId: s.tesisId, projections: s.projections }, (tx) =>
    tx.projectionRow.findUnique({ where: { tesisId_projection_recordId: { tesisId: s.tesisId, projection: def.name, recordId: NO_TENANT } } }),
  );
  if (!row || row.deletedAt) throw notFound("Anlık görüntü");
  return { projeksiyon: def.name, veri: row.data, surum: row.versionAt.toISOString() };
}

/**
 * Cari özeti (M2a): `cari-ozeti` anlığından TEK müşterinin girdisi. Bulut hesap yapmaz — jsonb yolundan yalnız
 * o anahtarı seçer; girdi yoksa `ozet: null` (müşterinin hareketi yok), anlık hiç gelmediyse 404.
 */
export async function getCustomerSummary(ctx: CloudContext, s: SessionContext, cariKartId: string): Promise<CustomerSummaryResponse> {
  const def = readableDef(s, "cari-ozeti", "ANLIK");
  if (!UUID.test(cariKartId)) throw badRequest("cariKartId biçimsiz");
  const id = cariKartId.toLowerCase();
  const rows = await withTesis(ctx.app, { tesisId: s.tesisId, projections: s.projections }, (tx) =>
    tx.$queryRaw<{ ozet: unknown; baslangic: string | null; version_at: Date }[]>(Prisma.sql`
      SELECT r.data->'cariler'->${id} AS ozet, r.data->>'son12AyBaslangic' AS baslangic, r.version_at
        FROM projection_rows r
       WHERE r.tesis_id = ${s.tesisId}::uuid AND r.projection = ${def.name} AND r.record_id = ${NO_TENANT}::uuid AND r.deleted_at IS NULL`),
  );
  const row = rows[0];
  if (!row) throw notFound("Anlık görüntü");
  return { cariKartId: id, son12AyBaslangic: row.baslangic, ozet: (row.ozet ?? null) as CustomerSummary | null, surum: row.version_at.toISOString() };
}

/** Ekranın üst şeridi: tesis adı · son eşitleme · sözleşme uyarısı · takılan ufuk · görülebilir projeksiyonlar · hizmet aşaması. */
export async function facilityStatus(ctx: CloudContext, s: SessionContext): Promise<FacilityStatus> {
  const nowMs = ctx.now();
  const { facility, state, facts } = await withTesis(ctx.app, { tesisId: s.tesisId }, async (tx) => ({
    facility: await tx.facility.findUnique({ where: { tesisId: s.tesisId } }),
    state: await tx.syncState.findUnique({ where: { tesisId: s.tesisId } }),
    facts: await loadServiceFacts(tx, s.tesisId),
  }));
  const stuckMs = state ? nowMs - state.horizonChangedAt.getTime() : 0;
  const service = facts ? serviceState(facts, nowMs) : { phase: "KAPALI" as const, endedAt: null, readOnlyUntil: null };
  return {
    tesis: { id: s.tesisId, ad: facility?.name ?? null, saklamaAy: facility?.retentionMonths ?? null },
    hesap: { id: s.accountId, ad: s.accountName, eposta: s.email, izinler: [...s.permissions].sort() },
    projeksiyonlar: s.projections,
    esitleme: state
      ? {
          sonEsitleme: state.lastPackageAt.toISOString(),
          ufuk: state.horizon.toISOString(),
          ufukTakildi: stuckMs > 15 * 60_000 && nowMs - state.lastPackageAt.getTime() < stuckMs,
          sozlesmeUyarisi: state.contractWarning,
          fabrikaSurumu: state.appVersion,
        }
      : null,
    hizmet: { asama: service.phase, bitis: service.endedAt?.toISOString() ?? null, saltOkunurBitis: service.readOnlyUntil?.toISOString() ?? null },
    liste: LIST_CAPABILITIES,
  };
}
