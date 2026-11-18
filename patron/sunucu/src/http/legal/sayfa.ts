// Oturumsuz statik hukuk sayfaları (gizlilik politikası, 2026-11-18): `/gizlilik` (TR, asıl) · `/privacy` (EN) ·
// `/hesap-silme` (Google Play hesap silme bağlantısı; iki dilli kısa sayfa). Yalnız GET/HEAD; başka yöntem 405.
// Gövde açılışta BİR KEZ kurulur (süreler yapılandırmadan, budamayla aynı kaynaktan): istekte DB'ye, oturuma, kişisel
// ya da iş verisine dokunulmaz; sır, dış kaynak, izleyici ve betik yok. CSS satır içidir ve CSP'de özetiyle izinlidir —
// Caddy `guvenlik` parçası CSP'yi yalnız yanıt taşımıyorsa koyar (`?Content-Security-Policy`). Hız sınırı IP başına
// `API_HIZ_DK` (kendi kovası). Bekçi `scripts/test_gizlilik_sayfasi.ts`.
import type { Express, Request, Response } from "express";
import type { CloudConfig } from "../../config";
import { rateLimit } from "../rate-limit";
import { gizlilikTr } from "./gizlilik-tr";
import { hesapSilme } from "./hesap-silme";
import { PAGE_CSP, legalFactsOf, type LegalFacts } from "./ortak";
import { privacyEn } from "./privacy-en";

export const LEGAL_PATHS = ["/gizlilik", "/privacy", "/hesap-silme"] as const;

const PAGES: Record<(typeof LEGAL_PATHS)[number], (f: LegalFacts) => string> = {
  "/gizlilik": gizlilikTr,
  "/privacy": privacyEn,
  "/hesap-silme": hesapSilme,
};

function setPageHeaders(res: Response): void {
  res.set({
    "Content-Type": "text/html; charset=utf-8",
    "Cache-Control": "public, max-age=3600",
    "Content-Security-Policy": PAGE_CSP,
    "X-Content-Type-Options": "nosniff",
    "Referrer-Policy": "no-referrer",
    "X-Frame-Options": "DENY",
  });
}

/** Sayfa uçlarını bağlar (`createApp`, `/v1` ve `/api`den önce). Gövdeler açılışta bir kez üretilir. */
export function mountLegalPages(app: Express, config: CloudConfig): void {
  const facts = legalFactsOf(config);
  const limit = rateLimit({ perMinute: config.API_HIZ_DK, config });
  for (const p of LEGAL_PATHS) {
    const html = PAGES[p](facts);
    app.get(p, limit, (_req: Request, res: Response) => {
      setPageHeaders(res);
      res.status(200).send(html);
    });
    app.all(p, (_req: Request, res: Response) => {
      res.set("Allow", "GET, HEAD").status(405).json({ success: false, message: "Bu adres yalnız okunur", details: { code: "YONTEM_DESTEKLENMIYOR" } });
    });
  }
}
