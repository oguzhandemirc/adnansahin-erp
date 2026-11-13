// Kişinin KENDİ ikinci etkeni: iki adımlı doğrulama (TOTP, İSTEĞE BAĞLI; `auth/factory-factors.ts`) — hesap API'si
// tablosunun parçası (`API_ROUTES`e yayılır). Parola fabrikanındır: bulutta parola değişimi ve hesap silme YOK (C4).
import { z } from "zod";
import { beginFactoryTwoFactor, confirmFactoryTwoFactor, disableFactoryTwoFactor, factoryTwoFactorStatus } from "../auth/factory-factors";
import { body, s, type ApiRouteDef } from "./api-route-kit";
import { clientAddress } from "./rate-limit";

/** Doğrulama kodu İSTEĞE BAĞLI: yalnız açık hesapta denetlenir; boş dize "yok" sayılır (eski istemci boş gönderebilir). */
export const OptionalCode = z.string().max(12).optional().transform((v) => (v ? v : undefined));

export const OWN_FACTOR_ROUTES: readonly ApiRouteDef[] = [
  { method: "get", path: "/oturum/dogrulama", auth: "OTURUM", kimlik: "OKUMA", handler: async (c) => ({ data: await factoryTwoFactorStatus(c.ctx, s(c)) }) },
  {
    method: "post",
    path: "/oturum/dogrulama/baslat",
    auth: "OTURUM",
    kimlik: { muaf: "tekrar başlatma önceki ONAYSIZ sırrı değiştirir; açıkken 409" },
    handler: async (c) => {
      const b = body(c, z.strictObject({ parola: z.string().min(1).max(200) }));
      return { data: await beginFactoryTwoFactor(c.ctx, s(c), { password: b.parola, ip: clientAddress(c.req, c.ctx.config) }) };
    },
  },
  {
    method: "post",
    path: "/oturum/dogrulama/onay",
    auth: "OTURUM",
    kimlik: { muaf: "onay atomik claim (kapalı → açık); tekrar 409" },
    handler: async (c) => {
      const b = body(c, z.strictObject({ totp: z.string().min(1).max(12) }));
      return { data: await confirmFactoryTwoFactor(c.ctx, s(c), { totp: b.totp }) };
    },
  },
  {
    method: "post",
    path: "/oturum/dogrulama/kapat",
    auth: "OTURUM",
    kimlik: { muaf: "parola + TOTP adımı tekrar oynatmayı keser; kapatma atomik claim, tekrar 409" },
    handler: async (c) => {
      const b = body(c, z.strictObject({ parola: z.string().min(1).max(200), totp: OptionalCode }));
      return { data: await disableFactoryTwoFactor(c.ctx, s(c), { password: b.parola, totp: b.totp, ip: clientAddress(c.req, c.ctx.config) }) };
    },
  },
];
