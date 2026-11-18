// Tek dinleyici, iki yüzey: `/v1/*` fabrika kanalı (kurulum imzalı; eşitleme rolü) + `/api/*` hesap
// API'si (Bearer oturum; uygulama rolü). Web/panel arayüzü YOK (kullanıcı kararı 2026-11-13: bulut yalnız
// telefon uygulamasına ve fabrikanın eşitlemesine hizmet eden API). Public `/saglik` yalnız {success:true} döner;
// public hukuk sayfaları `legal/sayfa.ts` (statik HTML, oturumsuz).
import express, { type Express } from "express";
import { z } from "zod";
import type { CloudContext } from "../services/context";
import { createApiRouter } from "./api-routes";
import { WEBHOOK_PATH, supportWebhookHandlers } from "./destek-routes";
import { accessLog, errorHandler, notFoundHandler } from "./error-handler";
import { createFactoryRouter } from "./factory-routes";
import { mountLegalPages } from "./legal/sayfa";

// Doğrulama iletileri kullanıcıya gider (TR-only): zod'un varsayılan İngilizcesi yerine TR yerel ayarı.
z.config(z.locales.tr());

export function createApp(ctx: CloudContext): Express {
  const app = express();
  app.disable("x-powered-by");
  app.set("etag", false);
  app.use(accessLog);
  app.get("/saglik", (_req, res) => {
    res.set("Cache-Control", "no-store").json({ success: true });
  });
  // Oturumsuz statik hukuk sayfaları (gizlilik · privacy · hesap-silme): yalnız GET/HEAD, kişisel/iş verisi dönmez.
  mountLegalPages(app, ctx.config);
  app.use("/v1", createFactoryRouter(ctx));
  // Etkili Destek webhook'u: oturumsuz, HAM gövde (imza) — /api yönlendiricisinin JSON ayrıştırıcısından ÖNCE.
  app.post(WEBHOOK_PATH, ...supportWebhookHandlers(ctx));
  app.use("/api", createApiRouter(ctx));
  app.use(notFoundHandler);
  app.use(errorHandler);
  return app;
}
