// FABRİKA KULLANICI KÜMESİ — `POST /v1/kullanicilar` (üyelik = Electron şifresi, C2). Hesap FABRİKANIN malıdır:
// fabrika `patron:giris` izinli kullanıcılarının TAM kümesini gönderir; bulut eşitleme ROLÜYLE (kolon yetkisi
// `lib/db-grants.ts` `SYNC_COLUMN_GRANTS.accounts`) uygular:
//   · kümede olup bulutta olmayan → EKLENİR (id = fabrika `users.id`, AKTİF);
//   · ad / kullanıcı adı / izin / parola özeti farklı ya da PASİF → GÜNCELLENİR (AKTİF; kapanış silinir);
//   · bulutta olup kümede olmayan → KAPATILIR (PASİF + parola özeti NULL + kapanış anı + oturumlar düşer).
// Parola özeti değişince (kapanış ve yeniden açılış dahil) `kimlik_surumu` +1 ve açık oturumlar kapanır (C3 ayrıca
// sürümü karşılaştırır). Özet SecretBox ile mühürlenir (sınıf `parola`, AAD = hesap id); değişim tespiti mührü AÇARAK
// yapılır (mühür her seferinde farklıdır). Tek tx, İLK ifadesi 9205 `KULLANICI_ESITLEME` kilidi; satır başına atomik
// claim (`kimlik_surumu` beklenen değer). Denetim tx DIŞINDA, satır başına (özet ve mühür ASLA yazılmaz); log
// yalnız SAYI. Uygulama rolünün bu kolonlara yazma yetkisi yoktur (bekçi `test_kullanici_esitleme`). Her kabul edilen
// gönderim `facilities.kullanici_son_esitleme`yi damgalar (C3 bayatlık tavanı, `auth/factory-login.ts`).
import { createHash } from "node:crypto";
import { Prisma, type AccountStatus } from "@prisma/client";
import { invalidAssignments } from "../catalog/permissions";
import { recordAuditMany, type AuditEntry } from "../lib/audit";
import type { Tx } from "../lib/db";
import { CloudError, badRequest, retryConflict } from "../lib/errors";
import { withTesis } from "../lib/tenant";
import type { CloudUser, UsersPushRequest, UsersPushResponse } from "../wire/esitleme";
import type { CloudContext } from "./context";

/** Uzun küme (≤ 1.000 kullanıcı) için tx tavanı. */
const TX_TIMEOUT_MS = 30_000;

interface Existing {
  readonly id: string;
  readonly kullaniciAdi: string;
  readonly name: string;
  readonly permissions: string[];
  readonly status: AccountStatus;
  readonly passwordSealed: string | null;
  readonly identityVersion: number;
}

type Field = "kullaniciAdi" | "ad" | "izinler" | "parola" | "durum";

interface Change {
  readonly id: string;
  readonly event: "HESAP_EKLENDI" | "HESAP_GUNCELLENDI" | "HESAP_KAPATILDI";
  readonly fields: readonly Field[];
  readonly permissions?: readonly string[];
}

/** Tel sözleşmesindeki özet: `sha256(JSON.stringify(kullanicilar))` — ayrıştırılmış gövdeden yeniden hesaplanır. */
export function usersDigest(users: UsersPushRequest["kullanicilar"]): string {
  return createHash("sha256").update(JSON.stringify(users)).digest("hex");
}

const sortedUnique = (xs: readonly string[]): string[] => [...new Set(xs)].sort();
const sameList = (a: readonly string[], b: readonly string[]): boolean => a.length === b.length && a.every((x, i) => x === b[i]);

/** Tek tx'in bağlamı (yardımcıların ortak argümanı). */
interface Apply {
  readonly ctx: CloudContext;
  readonly tx: Tx;
  readonly tesisId: string;
  readonly nowMs: number;
}

async function closeOpenSessions(a: Apply, accountIds: readonly string[], reason: "HESAP_KAPANDI" | "SIFIRLAMA"): Promise<void> {
  if (accountIds.length === 0) return;
  await a.tx.session.updateMany({ where: { tesisId: a.tesisId, accountId: { in: [...accountIds] }, closedAt: null }, data: { closedAt: new Date(a.nowMs), closeReason: reason } });
}

interface NewAccount {
  readonly id: string;
  readonly tesisId: string;
  readonly kullaniciAdi: string;
  readonly name: string;
  readonly permissions: string[];
  readonly passwordSealed: string;
}

/**
 * Ekleme AÇIK kolon listesiyle: Prisma `createMany` modelin BÜTÜN kolonlarını (DEFAULT ile de olsa) listeler ve eşitleme
 * rolünün kolon yetkisi (`SYNC_COLUMN_GRANTS.accounts.INSERT`) dışındaki `email` · `created_at` vb. için reddedilir.
 */
async function insertAccounts(a: Apply, rows: readonly NewAccount[]): Promise<void> {
  if (rows.length === 0) return;
  const now = new Date(a.nowMs);
  const values = rows.map(
    (r) => Prisma.sql`(${r.id}::uuid, ${r.tesisId}::uuid, ${r.kullaniciAdi}, ${r.name}, ${r.permissions}::text[], 'AKTIF'::"AccountStatus", ${r.passwordSealed}, ${now})`,
  );
  await a.tx.$executeRaw(
    Prisma.sql`INSERT INTO accounts (id, tesis_id, kullanici_adi, name, permissions, status, parola_ozeti, updated_at) VALUES ${Prisma.join(values)}`,
  );
}

/** ① Kapat: fabrika hesabı olup kümede olmayan (PASİF olan zaten kapalı) — atomik claim, oturumlar düşer. */
async function closeMissing(a: Apply, rows: readonly Existing[], incoming: ReadonlySet<string>): Promise<Change[]> {
  const toClose = rows.filter((r) => !incoming.has(r.id) && r.status !== "PASIF");
  for (const r of toClose) {
    const c = await a.tx.account.updateMany({
      where: { id: r.id, tesisId: a.tesisId, status: r.status, identityVersion: r.identityVersion },
      data: { status: "PASIF", passwordSealed: null, closedAt: new Date(a.nowMs), identityVersion: { increment: 1 } },
    });
    if (c.count === 0) throw retryConflict();
  }
  await closeOpenSessions(a, toClose.map((r) => r.id), "HESAP_KAPANDI");
  return toClose.map((r) => ({ id: r.id, event: "HESAP_KAPATILDI", fields: ["durum", "parola"] }));
}

/** Var olan hesabın farkı (alan adları). Parola farkı mührü AÇARAK ölçülür; açılamayan mühür = değişmiş. */
function diffOf(a: Apply, prev: Existing, u: CloudUser, next: { readonly kullaniciAdi: string; readonly permissions: readonly string[] }): Field[] {
  const { kullaniciAdi, permissions } = next;
  const opened = prev.passwordSealed ? a.ctx.secrets.open(prev.passwordSealed, prev.id, "parola") : null;
  const fields: Field[] = [];
  if (prev.kullaniciAdi !== kullaniciAdi) fields.push("kullaniciAdi");
  if (prev.name !== u.ad) fields.push("ad");
  if (!sameList(sortedUnique(prev.permissions), permissions)) fields.push("izinler");
  if (opened !== u.parolaOzeti) fields.push("parola");
  if (prev.status !== "AKTIF") fields.push("durum");
  return fields;
}

/** ② Güncelle / ekle. Parola değişen hesabın kimlik sürümü +1 ve açık oturumları SIFIRLAMA ile kapanır. */
async function upsertIncoming(a: Apply, users: readonly CloudUser[], byId: ReadonlyMap<string, Existing>): Promise<Change[]> {
  const out: Change[] = [];
  const toCreate: NewAccount[] = [];
  const passwordChanged: string[] = [];
  for (const u of users) {
    const kullaniciAdi = u.kullaniciAdi.toLowerCase();
    const permissions = sortedUnique(u.izinler);
    const prev = byId.get(u.id);
    if (!prev) {
      toCreate.push({ id: u.id, tesisId: a.tesisId, kullaniciAdi, name: u.ad, permissions, passwordSealed: a.ctx.secrets.seal(u.parolaOzeti, u.id, "parola") });
      out.push({ id: u.id, event: "HESAP_EKLENDI", fields: [], permissions });
      continue;
    }
    const fields = diffOf(a, prev, u, { kullaniciAdi, permissions });
    if (fields.length === 0) continue;
    const newPassword = fields.includes("parola");
    const c = await a.tx.account.updateMany({
      where: { id: prev.id, tesisId: a.tesisId, identityVersion: prev.identityVersion },
      data: {
        kullaniciAdi,
        name: u.ad,
        permissions,
        status: "AKTIF",
        closedAt: null,
        // Kimliği silinmiş (kapanıştan 30 gün sonra tombstone) hesap yeniden açılırsa damga AYNI ifadede düşer (CHECK).
        identityPurgedAt: null,
        ...(newPassword ? { passwordSealed: a.ctx.secrets.seal(u.parolaOzeti, u.id, "parola"), identityVersion: { increment: 1 } } : {}),
      },
    });
    if (c.count === 0) throw retryConflict();
    if (newPassword) passwordChanged.push(prev.id);
    out.push({ id: prev.id, event: "HESAP_GUNCELLENDI", fields, ...(fields.includes("izinler") ? { permissions } : {}) });
  }
  await closeOpenSessions(a, passwordChanged, "SIFIRLAMA");
  await insertAccounts(a, toCreate);
  return out;
}

export async function applyUserSet(
  ctx: CloudContext,
  caller: { readonly tesisId: string; readonly installation: { readonly installationId: string } },
  input: UsersPushRequest,
  nowMs: number,
): Promise<UsersPushResponse> {
  if (usersDigest(input.kullanicilar) !== input.ozet) throw badRequest("Kullanıcı listesi özeti gövdeyle tutmuyor");
  const unknown = sortedUnique(input.kullanicilar.flatMap((u) => invalidAssignments(u.izinler)));
  if (unknown.length > 0) throw badRequest(`Bilinmeyen bulut izni: ${unknown.join(", ")}`);
  const tesisId = caller.tesisId;
  const incomingIds = input.kullanicilar.map((u) => u.id);

  const changes = await withTesis(ctx.sync, { tesisId, lock: { name: "KULLANICI_ESITLEME", key: tesisId }, timeoutMs: TX_TIMEOUT_MS }, async (tx) => {
    const a: Apply = { ctx, tx, tesisId, nowMs };
    const rows: Existing[] = await tx.account.findMany({
      where: { tesisId },
      select: { id: true, kullaniciAdi: true, name: true, permissions: true, status: true, passwordSealed: true, identityVersion: true },
    });
    const closed = await closeMissing(a, rows, new Set(incomingIds));
    const upserted = await upsertIncoming(a, input.kullanicilar, new Map(rows.map((r) => [r.id, r])));
    // Bayatlık damgası (C3 giriş tavanı): AYNI tx'te, tesis satırında (C4: `tesis-ac` ile doğar; ilk küme eşitleme
    // paketinden önce gelse de damgalar — ilk girişte bekleme yok).
    const stamped = await tx.facility.updateMany({ where: { tesisId }, data: { usersPushedAt: new Date(nowMs) } });
    if (stamped.count !== 1) throw new CloudError(409, "DURUM_CAKISMASI", "Tesis kaydı bulunamadı; kullanıcı listesi damgalanamadı");
    return [...closed, ...upserted];
  });

  const actor = `fabrika:${caller.installation.installationId}`;
  const entries: AuditEntry[] = changes.map((c) => ({
    tesisId,
    actor,
    event: c.event,
    entity: "Account",
    entityId: c.id,
    summary: { kaynak: "fabrika", ...(c.fields.length > 0 ? { alanlar: [...c.fields] } : {}), ...(c.permissions ? { izinler: [...c.permissions] } : {}) },
  }));
  await recordAuditMany(ctx.sync, tesisId, entries);
  const count = (e: Change["event"]): number => changes.filter((c) => c.event === e).length;
  const res = { v: 1 as const, ozet: input.ozet, eklenen: count("HESAP_EKLENDI"), guncellenen: count("HESAP_GUNCELLENDI"), kapatilan: count("HESAP_KAPATILDI") };
  console.log(`[patron] kullanıcı kümesi: ${input.kullanicilar.length} kullanıcı · eklenen ${res.eklenen} · güncellenen ${res.guncellenen} · kapatılan ${res.kapatilan}`);
  return res;
}
