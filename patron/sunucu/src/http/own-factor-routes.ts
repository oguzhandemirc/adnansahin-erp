// Kişinin KENDİ faktörleri: parola değişimi · hesabını silme · iki adımlı doğrulama (TOTP, İSTEĞE BAĞLI) — hesap API'si
// tablosunun parçası (`API_ROUTES`e yayılır).
import { z } from "zod";
import { changeOwnPassword } from "../auth/session.service";
import { beginTwoFactor, confirmTwoFactor, disableTwoFactor, twoFactorStatus } from "../auth/two-factor.service";
import { deleteOwnAccount } from "../services/account-self-delete";
import { body, s, type ApiRouteDef } from "./api-route-kit";
import { clientAddress } from "./rate-limit";

/** Doğrulama kodu İSTEĞE BAĞLI: yalnız açık hesapta denetlenir; boş dize "yok" sayılır (eski istemci boş gönderebilir). */
export const OptionalCode = z.string().max(12).optional().transform((v) => (v ? v : undefined));

export const OWN_FACTOR_ROUTES: readonly ApiRouteDef[] = [
  {
    method: "post",
    path: "/oturum/parola",
    auth: "OTURUM",
    kimlik: { muaf: "mevcut parola değişir (tekrar eski parolayla 400); açıksa TOTP adımı tekrar oynatmayı keser" },
    handler: async (c) => {
      const b = body(c, z.strictObject({ mevcutParola: z.string().min(1).max(200), yeniParola: z.string().min(1).max(200), totp: OptionalCode }));
      await changeOwnPassword(c.ctx, s(c), { current: b.mevcutParola, next: b.yeniParola, totp: b.totp, ip: clientAddress(c.req, c.ctx.config) });
      return { data: null };
    },
  },
  {
    method: "post",
    path: "/oturum/hesap-sil",
    auth: "OTURUM",
    kimlik: { muaf: "parola (+ açıksa TOTP adımı) tekrar oynatmayı keser; başarıdan sonra bütün oturumlar kapalı, tekrar 401 (etkisiz)" },
    handler: async (c) => {
      const b = body(c, z.strictObject({ parola: z.string().min(1).max(200), totp: OptionalCode }));
      return { data: await deleteOwnAccount(c.ctx, s(c), { password: b.parola, totp: b.totp, ip: clientAddress(c.req, c.ctx.config) }) };
    },
  },
  { method: "get", path: "/oturum/dogrulama", auth: "OTURUM", kimlik: "OKUMA", handler: async (c) => ({ data: await twoFactorStatus(c.ctx, s(c)) }) },
  {
    method: "post",
    path: "/oturum/dogrulama/baslat",
    auth: "OTURUM",
    kimlik: { muaf: "tekrar başlatma önceki ONAYSIZ sırrı değiştirir; açıkken 409" },
    handler: async (c) => {
      const b = body(c, z.strictObject({ parola: z.string().min(1).max(200) }));
      return { data: await beginTwoFactor(c.ctx, s(c), { password: b.parola, ip: clientAddress(c.req, c.ctx.config) }) };
    },
  },
  {
    method: "post",
    path: "/oturum/dogrulama/onay",
    auth: "OTURUM",
    kimlik: { muaf: "onay atomik claim (kapalı → açık); tekrar 409" },
    handler: async (c) => {
      const b = body(c, z.strictObject({ totp: z.string().min(1).max(12) }));
      return { data: await confirmTwoFactor(c.ctx, s(c), { totp: b.totp }) };
    },
  },
  {
    method: "post",
    path: "/oturum/dogrulama/kapat",
    auth: "OTURUM",
    kimlik: { muaf: "parola + TOTP adımı tekrar oynatmayı keser; kapatma atomik claim, tekrar 409" },
    handler: async (c) => {
      const b = body(c, z.strictObject({ parola: z.string().min(1).max(200), totp: OptionalCode }));
      return { data: await disableTwoFactor(c.ctx, s(c), { password: b.parola, totp: b.totp, ip: clientAddress(c.req, c.ctx.config) }) };
    },
  },
];
