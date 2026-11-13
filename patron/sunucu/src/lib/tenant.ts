// KİRACI KAPSAMI — `app.*` oturum ayarlarının ve tx açışının TEK YAZARI (sözleşme §9.2–9.3).
// Her DB işi burada açılan bir tx'te koşar (tek veritabanı; `lib/tesis-db.ts`) ve İLK ifadesi tek bir SELECT'tir:
//   set_config('app.tesis_id', …, true) + set_config('app.projeksiyonlar', …, true)
//   + öteki arama anahtarlarının SIFIRLANMASI + (varsa) advisory kilit.
// `true` = SET LOCAL: tx bitince değer düşer (havuzlu bağlantıda sızmaz). Kapsamsız sorgu RLS'te HATA verir.
// Ön-kiracı aramaları (oturum özeti, kurulum kimliği, fabrika kullanıcı adı) tek anahtarlı SELECT kipinde koşar
// (kiracı = sıfır UUID). Kurulum yönü (`installation_routes`) kiracı verisi değildir: `withCentral` (kiracısız tx + kilit).
import { Prisma } from "@prisma/client";
import type { Tx } from "./db";
import { LOCK_NAMESPACES, type LockSpec } from "./locks";
import type { TesisDbRouter } from "./tesis-db";

/** Kiracısız kiplerin `app.tesis_id` değeri: geçerli UUID ama hiçbir tesis değil. */
export const NO_TENANT = "00000000-0000-0000-0000-000000000000";

const LOOKUP_KEYS = ["app.oturum_ozeti", "app.kurulum_id", "app.bakim", "app.kullanici_adi"] as const;
type LookupKey = (typeof LOOKUP_KEYS)[number];

export interface TenantScope {
  readonly tesisId: string;
  /** Bu tx'te okunabilecek projeksiyon adları (RLS alan izni). Boş = hiçbiri; `*` YASAK. */
  readonly projections?: readonly string[];
  readonly lock?: LockSpec;
  /** Uzun iş (eşitleme paketi) için tx zaman aşımı. */
  readonly timeoutMs?: number;
}

/** Oturum belirteci tesis ön eki taşır (özet belirtecin TAMAMINDAN); biçimsiz ön ek sorgusuz null. */
export type Lookup =
  | { readonly kind: "oturum"; readonly value: string; readonly tesisId: string }
  | { readonly kind: "kurulum"; readonly value: string }
  /** Fabrika hesabı girişi (C3): normalleşmiş kullanıcı adı; politika `kullanici_arama` yalnız birebir adı gösterir. */
  | { readonly kind: "kullanici"; readonly value: string };

const LOOKUP_GUC: Readonly<Record<Lookup["kind"], LookupKey>> = {
  oturum: "app.oturum_ozeti",
  kurulum: "app.kurulum_id",
  kullanici: "app.kullanici_adi",
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function projectionList(projections: readonly string[] | undefined): string {
  const list = projections ?? [];
  for (const p of list) {
    if (p === "*" || p.includes(",")) throw new Error(`Geçersiz projeksiyon adı kapsamda: ${p}`);
  }
  return list.join(",");
}

function settings(tesisId: string, projections: string, set: Partial<Record<LookupKey, string>>): Prisma.Sql {
  const parts: Prisma.Sql[] = [
    Prisma.sql`set_config('app.tesis_id', ${tesisId}, true)`,
    Prisma.sql`set_config('app.projeksiyonlar', ${projections}, true)`,
  ];
  for (const k of LOOKUP_KEYS) parts.push(Prisma.sql`set_config(${k}, ${set[k] ?? ""}, true)`);
  return Prisma.join(parts, ", ");
}

function lockExpression(lock: LockSpec | undefined): Prisma.Sql {
  if (!lock) return Prisma.sql`NULL::boolean AS kilit`;
  const ns = LOCK_NAMESPACES[lock.name];
  return lock.mode === "try"
    ? Prisma.sql`pg_try_advisory_xact_lock(${ns}::int4, hashtext(${lock.key})) AS kilit`
    : Prisma.sql`(pg_advisory_xact_lock(${ns}::int4, hashtext(${lock.key})) IS NOT NULL) AS kilit`;
}

/** İlk ifade: ayarlar + kilit TEK SELECT'te. */
interface ScopeSettings {
  readonly tesisId: string;
  readonly projections: string;
  readonly set: Partial<Record<LookupKey, string>>;
  readonly lock?: LockSpec;
}

async function openScope(tx: Tx, g: ScopeSettings): Promise<boolean> {
  const rows = await tx.$queryRaw<{ kilit: boolean | null }[]>(Prisma.sql`SELECT ${settings(g.tesisId, g.projections, g.set)}, ${lockExpression(g.lock)}`);
  return rows[0]?.kilit !== false;
}

export class LockBusyError extends Error {
  constructor(readonly lock: LockSpec) {
    super(`Kilit dolu: ${lock.name}`);
    Object.setPrototypeOf(this, LockBusyError.prototype);
  }
}

/** Kiracı kapsamı: ilk ifade kiracı + alan izni + kilit. `try` kilidi doluysa LockBusyError. */
export async function withTesis<T>(router: TesisDbRouter, scope: TenantScope, fn: (tx: Tx) => Promise<T>): Promise<T> {
  if (!UUID.test(scope.tesisId) || scope.tesisId === NO_TENANT) throw new Error("Kiracı kapsamı geçersiz tesis kimliğiyle açılamaz");
  const tesisId = scope.tesisId.toLowerCase();
  const projections = projectionList(scope.projections);
  return router.prisma.$transaction(
    async (tx) => {
      const acquired = await openScope(tx, { tesisId, projections, set: {}, lock: scope.lock });
      if (!acquired && scope.lock) throw new LockBusyError(scope.lock);
      return fn(tx);
    },
    scope.timeoutMs ? { timeout: scope.timeoutMs } : undefined,
  );
}

/**
 * Ön-kiracı tek anahtarlı arama (SELECT-yalnız politikalar); kiracı ayarı sıfır UUID. Oturum belirtecinin
 * tesis ön eki biçimsizse sorgusuz null (uydurma belirteç hiçbir satırla eşleşmez).
 */
export async function withLookup<T>(router: TesisDbRouter, lookup: Lookup, fn: (tx: Tx) => Promise<T>): Promise<T | null> {
  if (!lookup.value) throw new Error("Boş arama anahtarı");
  if (lookup.kind === "oturum" && (!UUID.test(lookup.tesisId) || lookup.tesisId === NO_TENANT)) return null;
  return router.prisma.$transaction(async (tx) => {
    await openScope(tx, { tesisId: NO_TENANT, projections: "", set: { [LOOKUP_GUC[lookup.kind]]: lookup.value } });
    return fn(tx);
  });
}

/** Bakım/bildirim döngüsünün tesis listesi (`bakim_listesi` politikası; tek tesiste tek satır). */
export async function listReadyFacilities(router: TesisDbRouter): Promise<string[]> {
  return router.prisma.$transaction(async (tx) => {
    await openScope(tx, { tesisId: NO_TENANT, projections: "", set: { "app.bakim": "evet" } });
    const rows = await tx.facility.findMany({ select: { tesisId: true }, orderBy: { tesisId: "asc" } });
    return rows.map((r) => r.tesisId);
  });
}

/** Kiracısız tx (kurulum yönü `installation_routes`): ilk ifade varsa advisory kilit. */
export async function withCentral<T>(router: TesisDbRouter, g: { readonly lock?: LockSpec }, fn: (tx: Tx) => Promise<T>): Promise<T> {
  return router.prisma.$transaction(async (tx) => {
    const acquired = await openScope(tx, { tesisId: NO_TENANT, projections: "", set: {}, lock: g.lock });
    if (!acquired && g.lock) throw new LockBusyError(g.lock);
    return fn(tx);
  });
}
