// =============================================================================
// GÖVDE LİMİTLERİ — TEK KAYNAK (2026-08-29 / BULGU-T1-045)
// =============================================================================
// `app.ts` global `express.json({ limit: "1mb" })` katmanını TÜM router'lardan
// ÖNCE mount ediyor. Bu yüzden içe aktarım router'ının kendi 10 MB'lık
// `express.json` katmanı HİÇ KOŞMUYORDU: 2 MB'lık (~6.000 satır) bir müşteri
// CSV'si global katmanda 413'e düşüyor, ekran "10.000 satır" vaat ederken
// operatör 6.000 satırı yükleyemiyor ve doğru sebep hiçbir yerde yazmıyordu.
//
// Çözüm: global katman bu yolları PARSE ETMEZ (aşağıdaki liste), router kendi
// büyük katmanıyla parse eder. Yolları ayrı ayrı iki yerde yazmak bu hatanın
// ikinci sürümünü üretir — o yüzden liste burada, ve `test_body_limits.ts`
// mekanik olarak doğrular: 10 MB'lık kendi parser'ını taşıyan HER router'ın
// mount ön eki burada olmalı, buradaki her ön ek de gerçekten mount edilmiş
// olmalı (iki yönlü — ölü girdi de gerçek bir açığı gizler).
// =============================================================================

/**
 * Global (1 MB) JSON katmanının ATLAYACAĞI mount ön ekleri.
 * `/api/destek`: destek talebi ekleri JSON içinde base64 gelir (5 × 10 MB); router
 * kendi `SUPPORT_BODY_LIMIT` katmanını YALNIZ ekli iki POST ucunda taşır.
 */
export const BUYUK_GOVDE_YOLLARI = ["/api/import", "/api/config-bundle", "/api/destek"] as const;

/** Global JSON gövde limiti — 413 mesajı da buradan okunur (metin sabiti YOK). */
export const VARSAYILAN_GOVDE_LIMITI = "1mb";

/** Büyük gövde taşıyan router'ların limiti. */
export const BUYUK_GOVDE_LIMITI = "10mb";

/** Destek ekli uçlarının limiti: 5 dosya × 10 MB, base64 (×4/3) + metin payı. */
export const SUPPORT_BODY_LIMIT = "70mb";

/** Kendi limiti `BUYUK_GOVDE_LIMITI`ten farklı olan büyük-gövde ön ekleri. */
const PREFIX_LIMITS: Readonly<Record<string, string>> = { "/api/destek": SUPPORT_BODY_LIMIT };

function matchesPrefix(url: string, p: string): boolean {
  return url === p || url.startsWith(`${p}/`) || url.startsWith(`${p}?`);
}

/** İstek yolu büyük-gövde router'larından birine mi ait. */
export function buyukGovdeYolu(url: string | undefined): boolean {
  if (!url) return false;
  return BUYUK_GOVDE_YOLLARI.some((p) => matchesPrefix(url, p));
}

/** Yolun ETKİN gövde limiti — 413 mesajı bunu söyler. */
export function bodyLimitFor(url: string | undefined): string {
  if (!url) return VARSAYILAN_GOVDE_LIMITI;
  const p = BUYUK_GOVDE_YOLLARI.find((x) => matchesPrefix(url, x));
  if (!p) return VARSAYILAN_GOVDE_LIMITI;
  return PREFIX_LIMITS[p] ?? BUYUK_GOVDE_LIMITI;
}
