// OTURUM — belirteç, oturum çözümü, çıkış ve giriş ortak yardımcıları. Giriş YALNIZ fabrika hesabıdır
// (`factory-login.ts`: kullanıcı adı + fabrika parolası + isteğe bağlı TOTP; üyelik = Electron şifresi). Eski e-posta
// kimliği, davet ve tesis geçişi C4'te söküldü: hesap fabrikanın malıdır, bulutta parola değişimi ve hesap silme YOK.
// Hata yanıtı TEK (401, aynı ileti) — bilinmeyen ad, kapalı hesap, yanlış faktör ve kilit ayırt edilmez; başarısız
// her dal yanıt süre tabanına bekletilir.
import { createHash, randomBytes } from "node:crypto";
import type { Account } from "@prisma/client";
import type { FacilityChoice } from "../wire/api";
import { effectivePermissions, type CloudPermission } from "../catalog/permissions";
import { readableProjections } from "../catalog/projections";
import { readableReportProjections } from "../catalog/reports";
import { accountActor, recordAudit } from "../lib/audit";
import { CloudError } from "../lib/errors";
import { withLookup, withTesis } from "../lib/tenant";
import type { CloudContext } from "../services/context";

/** Oturum belirteci: `<tesis kimliği 22 hane base64url>.<rastgele 43>`; özet belirtecin TAMAMINDAN. */
export const TOKEN_PATTERN = /^[A-Za-z0-9_-]{22}\.[A-Za-z0-9_-]{43}$/;
const TOUCH_INTERVAL_MS = 60_000;

export interface SessionContext {
  readonly sessionId: string;
  readonly tesisId: string;
  readonly accountId: string;
  readonly accountName: string;
  /** Fabrika hesabının kullanıcı adı (küçük harf; giriş bununla). */
  readonly kullaniciAdi: string;
  readonly permissions: ReadonlySet<CloudPermission>;
  /** RLS alan izni: hesabın okuyabileceği projeksiyon adları (rapor sonuçları dahil). */
  readonly projections: readonly string[];
  /** Oturumun azami ömrü. */
  readonly expiresAt: Date;
}

export function tokenDigest(token: string): string {
  return createHash("sha256").update(token, "utf8").digest("hex");
}

/** Belirteç ön eki tesisi taşır: istek doğru tesise yönlenir; ön eki değiştirilmiş belirteç hiçbir satırla eşleşmez. */
export function newToken(tesisId: string): { token: string; digest: string } {
  const prefix = Buffer.from(tesisId.replace(/-/g, ""), "hex").toString("base64url");
  if (prefix.length !== 22) throw new Error("Belirteç ön eki için tesis kimliği UUID olmalı");
  const token = `${prefix}.${randomBytes(32).toString("base64url")}`;
  return { token, digest: tokenDigest(token) };
}

/** Belirtecin tesis kimliği (biçimsizse null). */
export function tokenTesis(token: string): string | null {
  if (!TOKEN_PATTERN.test(token)) return null;
  const hex = Buffer.from(token.slice(0, 22), "base64url").toString("hex");
  if (hex.length !== 32) return null;
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

export function sessionProjections(permissions: ReadonlySet<CloudPermission>): string[] {
  return [...readableProjections(permissions), ...readableReportProjections(permissions)];
}

/** Açık hesapta kod eksik — YALNIZ doğru paroladan sonra (ve kilitli değilken) döner. */
export const codeRequired = (status: 400 | 401): CloudError => new CloudError(status, "DOGRULAMA_KODU_GEREKLI", "Doğrulama kodu gerekli");

const loginFailed = (): CloudError => new CloudError(401, "GIRIS_BASARISIZ", "Kullanıcı adı, parola ya da doğrulama kodu hatalı");

/** Hassas işlemde (doğrulamayı açma/kapama) yanlış parola ya da kod. */
export const wrongFactors = (): CloudError => new CloudError(400, "GIRIS_BASARISIZ", "Mevcut parola ya da doğrulama kodu hatalı");

/** Başarısız girişin en kısa yanıt süresi (gerçek saat): DB'ye yazan dal ile yazmayan dal süreden ayırt edilmesin. */
export const LOGIN_FAILURE_FLOOR_MS = 500;

export async function failAfterFloor(startedMs: number): Promise<never> {
  const wait = LOGIN_FAILURE_FLOOR_MS - (Date.now() - startedMs);
  if (wait > 0) await new Promise((r) => setTimeout(r, wait));
  throw loginFailed();
}

/** Giriş olayının istemci adresi — hesap güvenlik kaydına girer, 30 gün sonra alan silinir (`maintenance.ts` `AGED_FIELDS`). */
export const ipSummary = (ip: string | null): { ip?: string } => (ip && ip !== "?" ? { ip: ip.slice(0, 64) } : {});

export interface OpenedSession {
  readonly token: string;
  readonly session: SessionContext;
  readonly expiresAt: Date;
  readonly facilities: FacilityChoice[];
}

export function contextOf(account: Account, sessionId: string, expiresAt: Date): SessionContext {
  const permissions = effectivePermissions(account.permissions);
  return {
    sessionId,
    tesisId: account.tesisId,
    accountId: account.id,
    accountName: account.name,
    kullaniciAdi: account.kullaniciAdi,
    permissions,
    projections: sessionProjections(permissions),
    expiresAt,
  };
}

/**
 * Bearer belirtecinden oturum: kapalı · süresi dolmuş · hesap AKTİF değil → null. Oturumun açıldığı `kimlik_surumu`
 * hesabınkiyle AYNI olmalı (fabrikada parola değişti/hesap kapandı → 401) ve bulut kilidi kapalı.
 */
export async function resolveSession(ctx: CloudContext, token: string | undefined): Promise<SessionContext | null> {
  const tesisId = token ? tokenTesis(token) : null;
  if (!token || !tesisId) return null;
  const nowMs = ctx.now();
  const digest = tokenDigest(token);
  const row = await withLookup(ctx.app, { kind: "oturum", value: digest, tesisId }, (tx) => tx.session.findUnique({ where: { tokenHash: digest } }));
  if (!row || row.closedAt || row.tesisId !== tesisId) return null;
  return withTesis(ctx.app, { tesisId: row.tesisId }, async (tx) => {
    const idleLimit = row.lastUsedAt.getTime() + ctx.config.OTURUM_BOSTA_SAAT * 3_600_000;
    if (row.expiresAt.getTime() <= nowMs || idleLimit <= nowMs) {
      await tx.session.updateMany({ where: { id: row.id, closedAt: null }, data: { closedAt: new Date(nowMs), closeReason: "SURE_DOLDU" } });
      return null;
    }
    const account = await tx.account.findUnique({ where: { id: row.accountId }, include: { factors: { select: { cloudLock: true } } } });
    if (!account || account.status !== "AKTIF") return null;
    if (row.identityVersion !== account.identityVersion || account.factors?.cloudLock === true) return null;
    if (nowMs - row.lastUsedAt.getTime() > TOUCH_INTERVAL_MS) {
      await tx.session.updateMany({ where: { id: row.id, closedAt: null }, data: { lastUsedAt: new Date(nowMs) } });
    }
    return contextOf(account, row.id, row.expiresAt);
  });
}

/** Fabrika hesabının tek tesisi (tesis geçişi yok; tel `LoginResponse.tesisler` ve `GET /oturum` için). */
export async function factoryFacilityChoices(ctx: CloudContext, tesisId: string): Promise<FacilityChoice[]> {
  const f = await withTesis(ctx.app, { tesisId }, (tx) => tx.facility.findUnique({ where: { tesisId }, select: { name: true } }));
  return f ? [{ id: tesisId, ad: f.name, hizmet: "ACIK" }] : [];
}

/** Çıkış: etkin oturum; `all` ile hesabın bütün açık oturumları. */
export async function logout(ctx: CloudContext, s: SessionContext, g: { all?: boolean } = {}): Promise<void> {
  const nowMs = ctx.now();
  const closed = await withTesis(ctx.app, { tesisId: s.tesisId }, (tx) =>
    tx.session.updateMany({ where: { id: s.sessionId, closedAt: null }, data: { closedAt: new Date(nowMs), closeReason: "CIKIS" } }),
  );
  if (closed.count > 0) await recordAudit(ctx.app, { tesisId: s.tesisId, actor: accountActor(s.accountId), event: "CIKIS", entity: "Account", entityId: s.accountId });
  if (!g.all) return;
  const rest = await withTesis(ctx.app, { tesisId: s.tesisId }, (tx) =>
    tx.session.updateMany({ where: { tesisId: s.tesisId, accountId: s.accountId, closedAt: null }, data: { closedAt: new Date(nowMs), closeReason: "CIKIS" } }),
  );
  if (rest.count > 0) await recordAudit(ctx.app, { tesisId: s.tesisId, actor: accountActor(s.accountId), event: "CIKIS", entity: "Account", entityId: s.accountId, summary: { kapsam: "HEPSI", oturum: rest.count } });
}
