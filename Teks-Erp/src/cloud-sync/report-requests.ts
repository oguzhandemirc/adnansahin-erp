// RAPOR İSTEĞİ (§7, D5): bulut hesap yapmaz — patron isteği bulutta kuyruğa girer, fabrika `al` ile üstlenir,
// raporu KENDİ panel servisiyle (`remote-reports.ts`) hesaplar, sonucu imzalı `sonuc` ile gönderir.
// Kaynak: ana ürün 19aa48a9 `cloud-sync/report-requests.ts`. Adnan farkları: yalnız 6 karne (rapor v2, finans ve
// standart dönem görüntüleri YOK); sonuçtan finans adlı alan ayıklanır; zaman aşımında hesap bitene dek yeni rapor
// başlamaz (iş `cloud-report.job.ts`); tanınmayan/geçersiz istek tel sözleşmesinin hata koduyla RET döner.
import { gzipSync } from "node:zlib";
import { factoryYmd, resolveRangeEnd, resolveRangeStart } from "../constants/time";
import { REPORT_BY_KEY } from "../constants/report-catalog";
import { readReportsClosedKeys } from "../services/system-setting.service";
import { dateRangeSchema, resolveDateRange, type DateRange } from "../services/reports/_shared";
import { cloudPost, type CloudCallContext } from "./cloud-client";
import { findRemoteReport } from "./remote-reports";
import { MAX_COMPRESSED_BYTES, ReportResultRequestSchema, SYNC_PATHS, toWireValue, type ReportResult } from "./wire";

/** Rapor başına hesap tavanı (§7 "60 sn"); aşan istek `ZAMAN_ASIMI` ile kapanır. */
export const REPORT_TIMEOUT_MS = 60_000;

/**
 * Finans alanı adı (fiyat · tutar · bakiye · döviz · ödeme · maliyet …) — bu kurulumda finans verisi buluta gitmez:
 * rapor sonucunda böyle adlı her anahtar (iç içe dahil) gönderilmeden ÖNCE düşürülür.
 */
export const FINANCE_FIELD = /fiyat|tutar|bakiye|maliyet|odeme|doviz|kdv|price|amount|balance|cost|payment|currency|vat$|tax$/i;

const FACTORY_DAY = /^\d{4}-\d{2}-\d{2}$/;

/** Geçerli takvim günü mü — `2026-13-45` gibi taşan gün çevrilmez, şema onu ham haliyle REDDEDER. */
function isFactoryDay(v: unknown): v is string {
  return typeof v === "string" && FACTORY_DAY.test(v) && factoryYmd(resolveRangeStart(v)) === v;
}

export type ParsedParams = { readonly ok: true; readonly range: DateRange | null } | { readonly ok: false };

/**
 * Parametre kabulü: uygulama özel aralığı fabrika GÜNÜ (`YYYY-MM-DD`) yollar — gün sınırı yalnız burada
 * (`constants/time`) ana çevrilir; ISO an aynen geçer; sonra panel ucunun şeması (KATI) ve aralık kuralı
 * (`resolveDateRange`: başlangıç ≤ bitiş, ≤ 366 gün) AYNEN uygulanır. Tanınmayan anahtar ⇒ geçersiz.
 */
export function parseReportParams(kind: "RANGE" | "NONE", raw: Readonly<Record<string, unknown>>): ParsedParams {
  if (kind === "NONE") return Object.keys(raw).length === 0 ? { ok: true, range: null } : { ok: false };
  const o: Record<string, unknown> = { ...raw };
  if (isFactoryDay(o.dateFrom)) o.dateFrom = resolveRangeStart(o.dateFrom).toISOString();
  if (isFactoryDay(o.dateTo)) o.dateTo = resolveRangeEnd(o.dateTo).toISOString();
  const p = dateRangeSchema.safeParse(o);
  if (!p.success) return { ok: false };
  try {
    return { ok: true, range: resolveDateRange(p.data) };
  } catch {
    return { ok: false };
  }
}

/** Finans adlı anahtarları (iç içe) düşürür; düşen yolları `dropped`a yazar. Sayı değiştirmez. */
export function stripFinanceFields(v: unknown, dropped: string[] = [], at = ""): unknown {
  if (Array.isArray(v)) return v.map((x) => stripFinanceFields(x, dropped, `${at}[]`));
  if (v !== null && typeof v === "object" && !(v instanceof Date) && Object.getPrototypeOf(v) === Object.prototype) {
    const out: Record<string, unknown> = {};
    for (const [k, x] of Object.entries(v)) {
      if (FINANCE_FIELD.test(k)) {
        dropped.push(`${at}.${k}`);
        continue;
      }
      out[k] = stripFinanceFields(x, dropped, `${at}.${k}`);
    }
    return out;
  }
  return v;
}

/** Hesap tamamlanmasını bekleyen söz: zaman aşımında da hesap SÜRER; iş yeni raporu bu bitmeden başlatmaz. */
export interface ComputedReport {
  readonly result: ReportResult;
  readonly settled: Promise<void>;
  /** Ayıklanan finans alanı yolları (log ve bekçi için). */
  readonly droppedFinance: readonly string[];
  readonly elapsedMs: number;
}

const DONE: Promise<void> = Promise.resolve();

/** Raporu hesaplar ve tel sonucunu kurar. ASLA fırlatmaz: her hata sözleşmenin hata koduna düşer. */
export async function computeReportResult(g: {
  readonly istekId: string;
  readonly key: string;
  readonly params: Readonly<Record<string, unknown>>;
  readonly nowMs: number;
  readonly timeoutMs?: number;
}): Promise<ComputedReport> {
  const started = Date.now();
  const base = {
    v: 1 as const,
    istekId: g.istekId,
    raporAnahtari: g.key.slice(0, 80) || "?",
    parametreler: { ...g.params },
    donem: null,
    hesaplandi: new Date(g.nowMs).toISOString(),
    kaynakUfuk: new Date(g.nowMs).toISOString(),
  };
  const fail = (hataKodu: NonNullable<ReportResult["hataKodu"]>, settled: Promise<void> = DONE): ComputedReport => ({
    result: ReportResultRequestSchema.parse({ ...base, durum: "HATA", veri: null, hataKodu }),
    settled,
    droppedFinance: [],
    elapsedMs: Date.now() - started,
  });
  try {
    const spec = findRemoteReport(g.key);
    if (!spec || !REPORT_BY_KEY.get(spec.key)) return fail("RAPOR_BILINMIYOR");
    // Panelde KAPALI rapor buluta da kapalıdır; liste okunamazsa da kapalı (panel kapısı gibi fail-closed).
    const vis = await readReportsClosedKeys();
    if (vis.durum === "olculemedi" || vis.kapali.includes(spec.key)) return fail("RAPOR_KAPALI");
    const parsed = parseReportParams(spec.runner.kind, g.params);
    if (!parsed.ok) return fail("PARAMETRE_GECERSIZ");
    const runner = spec.runner;
    const work: Promise<unknown> = runner.kind === "RANGE" ? runner.run(parsed.range ?? resolveDateRange({})) : runner.run();
    const settled = work.then(() => undefined, () => undefined);
    let timer: NodeJS.Timeout | null = null;
    const timeout = new Promise<"ZAMAN_ASIMI">((resolve) => {
      timer = setTimeout(() => resolve("ZAMAN_ASIMI"), g.timeoutMs ?? REPORT_TIMEOUT_MS);
      timer.unref();
    });
    let out: unknown;
    try {
      out = await Promise.race([work, timeout]);
    } catch {
      return fail("PARAMETRE_GECERSIZ", settled);
    } finally {
      if (timer) clearTimeout(timer);
    }
    if (out === "ZAMAN_ASIMI") return fail("ZAMAN_ASIMI", settled);
    // Panelin `res.json`u ile AYNI serileştirme (tarih ISO, sonlu olmayan sayı null, Decimal sayı): telefon panelin
    // gördüğü değeri görür; ölçüldü — müşteri karnesinde `overdueRatio` Infinity, panelde null.
    const asPanel: unknown = JSON.parse(JSON.stringify(out) ?? "null");
    const dropped: string[] = [];
    const veri = toWireValue(stripFinanceFields(asPanel, dropped));
    return {
      result: ReportResultRequestSchema.parse({ ...base, durum: "HAZIR", veri, hataKodu: null }),
      settled,
      droppedFinance: dropped,
      elapsedMs: Date.now() - started,
    };
  } catch {
    // Tel kodlayıcısı (sonlu olmayan sayı) ya da kapı okuması patladı: tek isteğin RET'i, iş durmaz.
    return fail("PARAMETRE_GECERSIZ");
  }
}

/** Gönderilecek gövde: sıkıştırılmış hâli 4 MB tavanını aşan sonuç veri yerine `SONUC_BUYUK` RET'i taşır. */
export function boundedReportBody(result: ReportResult): { readonly body: ReportResult; readonly gzipBytes: number } {
  const gzipBytes = gzipSync(Buffer.from(JSON.stringify(result), "utf8")).length;
  if (gzipBytes <= MAX_COMPRESSED_BYTES) return { body: result, gzipBytes };
  return { body: ReportResultRequestSchema.parse({ ...result, durum: "HATA", veri: null, hataKodu: "SONUC_BUYUK" }), gzipBytes };
}

export async function sendReportResult(ctx: CloudCallContext, result: ReportResult): Promise<{ readonly ok: boolean; readonly code: string | null }> {
  const r = await cloudPost(ctx, SYNC_PATHS.REPORT_RESULT, boundedReportBody(result).body, { gzip: true });
  return r.ok ? { ok: true, code: null } : { ok: false, code: r.code };
}
