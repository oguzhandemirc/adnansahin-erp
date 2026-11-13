// =============================================================================
// Patron bulutu KULLANICI LİSTESİ — telefona giriş izni olan fabrika kullanıcılarının TAM kümesi (dışa aktarım)
// =============================================================================
// Kim gider: aktif ∧ silinmemiş ∧ süperadmin DEĞİL ∧ teknik kullanıcı DEĞİL ∧ etkin izinlerinde `patron:giris`
// BİREBİR (`AuthService.getEffectivePermissions` — süreli iznin penceresi tek kaynaktan). Ne gider: açık select
// (`CLOUD_USER_SELECT`) — PIN, kart, TOTP sırrı, oturum sayacı OKUNMAZ bile. Süzgeç iki katlıdır: sorgu (`where`) ve
// satır yüklemi (`isCloudUserCandidate`); biri bozulsa öteki tutar, bekçi ikisini ayrı ölçer. Log/audit/hata özeti
// yazmaz: çağıran yalnız sayıyı görür.
// =============================================================================
import { createHash } from "node:crypto";
import type { Prisma } from "@prisma/client";
import prisma from "../lib/prisma";
import { AuthService } from "../services/auth.service";
import { readPatronCloudUserId } from "../services/helpers/patron-cloud-user.helper";
import { deriveCloudPermissions, hasPatronLogin, PATRON_LOGIN_PERMISSION } from "./user-permission-map";
import { CloudUserSchema, type CloudUser } from "./wire";

/** Okunan TEK alan kümesi — genişletmek bir sözleşme kararıdır (bekçi anahtar kümesini birebir ölçer). */
export const CLOUD_USER_SELECT = { id: true, username: true, fullName: true, passwordHash: true, isActive: true, deletedAt: true, isSystemAccount: true } as const;
export type CloudUserRow = Prisma.UserGetPayload<{ select: typeof CLOUD_USER_SELECT }>;

/** Aday sorgusu: giriş izni satırı olan (pencereye bakılmaz — etkin izin ayrıca sorulur) insan kullanıcılar. */
export function cloudUserCandidateWhere(technicalUserId: string | null): Prisma.UserWhereInput {
  return {
    isActive: true,
    deletedAt: null,
    isSystemAccount: false,
    ...(technicalUserId ? { id: { not: technicalUserId } } : {}),
    permissions: { some: { permission: { code: PATRON_LOGIN_PERMISSION } } },
  };
}

/** Satır yüklemi — sorgudan bağımsız ikinci sed. */
export function isCloudUserCandidate(row: CloudUserRow, technicalUserId: string | null, effective: readonly string[]): boolean {
  return row.isActive && row.deletedAt === null && !row.isSystemAccount && row.id !== technicalUserId && hasPatronLogin(effective);
}

/** Satır → tel kaydı (katı şemadan geçer; geçmeyen null — ör. tele sığmayan kullanıcı adı). */
export function toCloudUser(row: CloudUserRow, effective: readonly string[]): CloudUser | null {
  const r = CloudUserSchema.safeParse({ id: row.id, kullaniciAdi: row.username, ad: row.fullName, parolaOzeti: row.passwordHash, izinler: deriveCloudPermissions(effective) });
  return r.success ? r.data : null;
}

/** Tel sözleşmesindeki özet: `sha256(JSON.stringify(kullanicilar))`, dizi `id`ye göre sıralı. */
export function cloudUsersDigest(users: readonly CloudUser[]): string {
  return createHash("sha256").update(JSON.stringify(users)).digest("hex");
}

export interface CloudUserSet {
  readonly users: readonly CloudUser[];
  readonly digest: string;
  /** Giriş izni olup tele sığmayan (şema dışı) kullanıcı sayısı — kimlik değil, sayı. */
  readonly invalid: number;
}

/** TAM kümeyi kurar (sıralı). Salt okur. */
export async function collectCloudUsers(): Promise<CloudUserSet> {
  const technicalUserId = await readPatronCloudUserId();
  const rows = await prisma.user.findMany({ where: cloudUserCandidateWhere(technicalUserId), select: CLOUD_USER_SELECT, orderBy: { id: "asc" } });
  const users: CloudUser[] = [];
  let invalid = 0;
  for (const row of rows) {
    const effective = await AuthService.getEffectivePermissions(row.id);
    if (!isCloudUserCandidate(row, technicalUserId, effective)) continue;
    const u = toCloudUser(row, effective);
    if (u) users.push(u);
    else invalid++;
  }
  return { users, digest: cloudUsersDigest(users), invalid };
}

/**
 * Telefon yazısının yazarı (bulut hesabı = fabrika kullanıcısı) BUGÜN hâlâ bu bulut iznini taşıyor mu? Kümeyle AYNI
 * süzgeç ve türetme; kullanıcı yoksa, pasif/silinmiş/süperadmin/teknikse ya da izin geri alınmışsa false.
 */
export async function cloudAuthorHolds(userId: string, cloudPermission: string): Promise<boolean> {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(userId)) return false;
  const technicalUserId = await readPatronCloudUserId();
  const row = await prisma.user.findFirst({ where: { ...cloudUserCandidateWhere(technicalUserId), id: userId }, select: CLOUD_USER_SELECT });
  if (!row || row.id === technicalUserId) return false;
  const effective = await AuthService.getEffectivePermissions(row.id);
  return isCloudUserCandidate(row, technicalUserId, effective) && deriveCloudPermissions(effective).includes(cloudPermission);
}
