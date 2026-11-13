// HESAP API'si (`/api/*`) — patron uygulaması (iOS/Android/web) buna konuşur; UYGULAMA ROLÜYLE.
// Rota TABLOSU veridir: her rota kimlik beyanı (`ACIK` | `OTURUM`) + yazmada işlem kimliği beyanı
// taşır; izin kararı servistedir (sunucu süzer, istemci yalnız gizler). Taşıma: `Authorization:
// Bearer` (çerez YOK → CSRF yüzeyi yok); yazma yalnız application/json. Bekçi: test_patron_kapilari.
import express, { type NextFunction, type Request, type Response, type Router } from "express";
import { z } from "zod";
import { loginFactoryAccount } from "../auth/factory-login";
import { logout, resolveSession, type OpenedSession, type SessionContext } from "../auth/session.service";
import { CloudError, badRequest } from "../lib/errors";
import type { CloudContext } from "../services/context";
import { LIST_ID_FILTER_KEYS, LIST_MEMBER_FILTER_KEYS, LIST_SORT_DIRS, type ListSortDir, type LoginResponse } from "../wire/api";
import { facilityStatus, getCustomerSummary, getProjectionRecord, getSnapshot, listProjection } from "../services/data.service";
import { deactivateDevice, listDevices, registerDevice } from "../services/device.service";
import { requestSnapshotRefresh } from "../services/doorbell";
import { cancelInbox, createInboxMessage, getInbox, listInbox } from "../services/inbox.service";
import { cancelReportRequest, createReportRequest, getReportRequest, listReportRequests } from "../services/report.service";
import { Token, body, page, param, s, sendFile, text, uuidCursor, written, type ApiCall, type ApiRouteDef } from "./api-route-kit";
import { CHANGE_ROUTES } from "./change-routes";
import { EXPORT_ROUTES } from "./export-routes";
import { OptionalCode, OWN_FACTOR_ROUTES } from "./own-factor-routes";
import { NOTIFICATION_ROUTES } from "./notification-routes";
import { VIEW_PREF_ROUTES } from "./view-pref-routes";
import { clientAddress, invalidTokenGate, rateLimit } from "./rate-limit";

export type { ApiCall, ApiRouteDef } from "./api-route-kit";

const PROJECTION = "projeksiyon";

/** `yon` yalnız `artan`/`azalan`; başka değer 400 (fail-closed). */
function sortDir(v: string | undefined): ListSortDir | undefined {
  if (v === undefined) return undefined;
  if (!(LIST_SORT_DIRS as readonly string[]).includes(v)) throw badRequest("yon artan ya da azalan");
  return v as ListSortDir;
}

/** Giriş gövdesi: fabrika kullanıcı adı + fabrika parolası (tel `LoginRequest`). Katı: `eposta` ve öteki alanlar 400. */
const LoginBody = z.strictObject({ kullaniciAdi: z.string().min(1).max(100), parola: z.string().min(1).max(200), totp: OptionalCode, istemci: z.enum(["mobil", "web"]).optional() });

const loginResponse = (r: OpenedSession): LoginResponse => ({
  belirtec: r.token,
  bitis: r.expiresAt.toISOString(),
  hesap: { id: r.session.accountId, ad: r.session.accountName, kullaniciAdi: r.session.kullaniciAdi, izinler: [...r.session.permissions].sort() },
  tesisId: r.session.tesisId,
  tesisler: r.facilities,
});

export const API_ROUTES: readonly ApiRouteDef[] = [
  // ---- açık (oturumsuz) ----
  {
    method: "post",
    path: "/oturum/ac",
    auth: "ACIK",
    kimlik: { muaf: "oturum doğumu; tekrar yeni oturum açar (eski oturum süresiyle kapanır)" },
    handler: async (c) => {
      const b = body(c, LoginBody);
      const r = await loginFactoryAccount(c.ctx, { username: b.kullaniciAdi, password: b.parola, totp: b.totp, client: b.istemci ?? null, ip: clientAddress(c.req, c.ctx.config) });
      return { data: loginResponse(r) };
    },
  },
  // ---- oturum ----
  { method: "get", path: "/oturum", auth: "OTURUM", kimlik: "OKUMA", handler: async (c) => ({ data: await facilityStatus(c.ctx, s(c)) }) },
  {
    method: "post",
    path: "/oturum/kapat",
    auth: "OTURUM",
    kimlik: { muaf: "oturum kapatma atomik claim; tekrarı etkisiz" },
    handler: async (c) => {
      const b = body(c, z.strictObject({ hepsi: z.boolean().optional() }));
      await logout(c.ctx, s(c), { all: b.hepsi === true });
      return { data: null };
    },
  },
  ...OWN_FACTOR_ROUTES,
  ...VIEW_PREF_ROUTES,
  // ---- veri ----
  {
    method: "get",
    path: `/veri/:${PROJECTION}`,
    auth: "OTURUM",
    kimlik: "OKUMA",
    handler: async (c) => {
      const { cursor, limit } = page(c);
      return { data: await listProjection(c.ctx, s(c), String(c.req.params[PROJECTION]), { cursor, limit, durum: text(c, "durum", 40), kimlik: Object.fromEntries([...new Set([...LIST_ID_FILTER_KEYS, ...LIST_MEMBER_FILTER_KEYS])].map((k) => [k, text(c, k, 40)])), ara: text(c, "ara", 200), suzgec: text(c, "suzgec", 120), sirala: text(c, "sirala", 40), yon: sortDir(text(c, "yon", 10)) }) };
    },
  },
  { method: "get", path: `/veri/:${PROJECTION}/:id`, auth: "OTURUM", kimlik: "OKUMA", handler: async (c) => ({ data: await getProjectionRecord(c.ctx, s(c), String(c.req.params[PROJECTION]), String(c.req.params.id)) }) },
  // Ekran açıkken tazeleme: `ozet` zili (§14 S47); içerik taşımaz, tesis başına 30 sn'de bir.
  { method: "post", path: "/tazele", auth: "OTURUM", kimlik: { muaf: "zil içerik taşımaz; tekrar yalnız fazladan anlık tur yaptırır (§6.5)" }, handler: async (c) => ({ data: requestSnapshotRefresh(c.ctx.doorbell, s(c).tesisId, c.ctx.now()) }) },
  { method: "get", path: `/anlik/:${PROJECTION}`, auth: "OTURUM", kimlik: "OKUMA", handler: async (c) => ({ data: await getSnapshot(c.ctx, s(c), String(c.req.params[PROJECTION])) }) },
  // M2a: cari özeti — `cari-ozeti` anlığından tek müşteri (izin anlığınkiyle aynı: `bulut:siparis:oku`).
  { method: "get", path: "/cari-ozeti/:cariKartId", auth: "OTURUM", kimlik: "OKUMA", handler: async (c) => ({ data: await getCustomerSummary(c.ctx, s(c), String(c.req.params.cariKartId)) }) },
  ...CHANGE_ROUTES,
  // ---- gelen kutusu ----
  {
    method: "post",
    path: "/gelen-kutusu",
    auth: "OTURUM",
    kimlik: "ISLEM_KIMLIGI",
    handler: async (c) => {
      const b = body(c, z.strictObject({ mesajId: Token, tur: z.enum(["SIPARIS", "CARI"]), govde: z.unknown() }));
      return written(await createInboxMessage(c.ctx, s(c), b));
    },
  },
  {
    method: "get",
    path: "/gelen-kutusu",
    auth: "OTURUM",
    kimlik: "OKUMA",
    handler: async (c) => {
      const { cursor, limit } = page(c);
      const durum = text(c, "durum", 20);
      const parsed = durum === undefined ? undefined : z.enum(["BEKLIYOR", "ISLENIYOR", "ISLENDI", "REDDEDILDI", "IPTAL"]).safeParse(durum);
      if (parsed && !parsed.success) throw badRequest(`Tanınmayan durum: ${durum}`);
      return { data: await listInbox(c.ctx, s(c), { durum: parsed?.data, cursor: uuidCursor(cursor), limit }) };
    },
  },
  { method: "get", path: "/gelen-kutusu/:mesajId", auth: "OTURUM", kimlik: "OKUMA", handler: async (c) => ({ data: await getInbox(c.ctx, s(c), param(c, "mesajId")) }) },
  {
    method: "post",
    path: "/gelen-kutusu/:mesajId/iptal",
    auth: "OTURUM",
    kimlik: { muaf: "atomik claim BEKLIYOR → IPTAL; zaten iptalse aynı sonuç" },
    handler: async (c) => ({ data: await cancelInbox(c.ctx, s(c), param(c, "mesajId")) }),
  },
  // ---- rapor isteği ----
  {
    method: "post",
    path: "/raporlar",
    auth: "OTURUM",
    kimlik: "ISLEM_KIMLIGI",
    handler: async (c) => {
      const b = body(c, z.strictObject({ clientToken: Token, raporAnahtari: z.string().min(3).max(120), parametreler: z.record(z.string(), z.unknown()).default({}) }));
      return written(await createReportRequest(c.ctx, s(c), b));
    },
  },
  {
    method: "get",
    path: "/raporlar",
    auth: "OTURUM",
    kimlik: "OKUMA",
    handler: async (c) => {
      const { cursor, limit } = page(c);
      return { data: await listReportRequests(c.ctx, s(c), { cursor: uuidCursor(cursor), limit }) };
    },
  },
  { method: "get", path: "/raporlar/:id", auth: "OTURUM", kimlik: "OKUMA", handler: async (c) => ({ data: await getReportRequest(c.ctx, s(c), param(c, "id")) }) },
  {
    method: "post",
    path: "/raporlar/:id/iptal",
    auth: "OTURUM",
    kimlik: { muaf: "atomik claim BEKLIYOR → IPTAL; zaten iptalse aynı sonuç" },
    handler: async (c) => ({ data: await cancelReportRequest(c.ctx, s(c), param(c, "id")) }),
  },
  // ---- bildirim cihazı ----
  {
    method: "post",
    path: "/cihazlar",
    auth: "OTURUM",
    kimlik: { muaf: "push belirteci doğal kimliktir (tesis + belirteç özeti TEKİL); tekrar aynı satırı günceller" },
    handler: async (c) => {
      const b = body(c, z.strictObject({ platform: z.enum(["ios", "android", "web"]), belirtec: z.string().min(8).max(4096), ad: z.string().trim().min(1).max(120).optional() }));
      return { status: 201, data: await registerDevice(c.ctx, s(c), { platform: b.platform, token: b.belirtec, ...(b.ad ? { ad: b.ad } : {}) }) };
    },
  },
  { method: "get", path: "/cihazlar", auth: "OTURUM", kimlik: "OKUMA", handler: async (c) => ({ data: await listDevices(c.ctx, s(c)) }) },
  {
    method: "post",
    path: "/cihazlar/:id/kaldir",
    auth: "OTURUM",
    kimlik: { muaf: "atomik claim active → pasif; tekrarı aynı sonuç" },
    handler: async (c) => ({ data: await deactivateDevice(c.ctx, s(c), param(c, "id")) }),
  },
  ...NOTIFICATION_ROUTES,
  ...EXPORT_ROUTES,
];

function bearer(req: Request): string | undefined {
  const h = req.get("authorization");
  if (!h) return undefined;
  const m = /^Bearer ([A-Za-z0-9_-]{22}\.[A-Za-z0-9_-]{43})$/.exec(h.trim());
  return m?.[1];
}

function noStore(_req: Request, res: Response, next: NextFunction): void {
  res.set({ "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff", "Referrer-Policy": "no-referrer" });
  next();
}

function jsonOnlyWrites(req: Request, _res: Response, next: NextFunction): void {
  if (req.method !== "GET" && req.method !== "HEAD" && !req.is("application/json")) throw badRequest("Yazma istekleri application/json gövde taşımalı");
  next();
}

export function createApiRouter(ctx: CloudContext): Router {
  const router = express.Router();
  router.use(noStore);
  router.use(rateLimit({ perMinute: ctx.config.API_HIZ_DK, config: ctx.config }));
  router.use(jsonOnlyWrites);
  router.use(express.json({ limit: "256kb", strict: true }));
  const loginLimit = rateLimit({ perMinute: ctx.config.GIRIS_HIZ_DK, config: ctx.config });
  const tokenGate = invalidTokenGate({ perMinute: ctx.config.OTURUM_RED_HIZ_DK, config: ctx.config });
  for (const def of API_ROUTES) {
    const guards = def.auth === "ACIK" ? [loginLimit] : [];
    router[def.method](def.path, ...guards, async (req: Request, res: Response) => {
      let session: SessionContext | null = null;
      if (def.auth === "OTURUM") {
        if (tokenGate.blocked(req, res)) return;
        session = await resolveSession(ctx, bearer(req));
        if (!session) {
          tokenGate.failed(req);
          throw new CloudError(401, "OTURUM_YOK", "Oturum yok ya da süresi doldu; yeniden giriş yapın");
        }
      }
      const r = await def.handler({ ctx, req, session });
      if ("file" in r) return sendFile(res, r.file);
      if (r.replayed) res.set("Idempotent-Replay", "true");
      res.status(r.status ?? 200).json({ success: true, data: r.data });
    });
  }
  return router;
}
