// =============================================================================
// ÖLÇÜM (bekçi DEĞİL) — patron bulutu RAPOR İSTEĞİ (D5): hesap süresi · sonuç boyutu · panel servisiyle eşitlik · yük
// =============================================================================
// Yalnız yerel `_prova` / `_test` veritabanında koşar (şablon `tekserp_adnan_prova` REDDEDİLİR); hiçbir şey YAZMAZ,
// ağ yok. "Bugün" = yedeğin son sevk gününün sonu (yedek eski, gerçek bugün boş kalır). Her rapor iki aralıkla:
// son 30 gün ve azami 366 gün (en kötü durum). Süre = `computeReportResult` (kapı + parametre + hesap + tel), 3 koşum.
// Boyut = gönderilecek gövdenin ham JSON ve gzip baytı; satır = sonuçtaki dizilerin toplam eleman sayısı.
// Eşitlik: `veri` ↔ aynı aralıkla panel servisi (aynı fonksiyon) kanonik JSON. Yük: panel benzeri sorgu gecikmesi
// boşta vs en yavaş rapor hesaplanırken (medyan / p95).
// Kullanım (Teks-Erp içinden): DATABASE_URL=…/tekserp_<x>_prova npx tsx scripts/olcum_patron_bulut_rapor.ts
// =============================================================================
import prisma from "../src/lib/prisma";
import { factoryDayEnd, factoryYmd, resolveRangeEnd, resolveRangeStart } from "../src/constants/time";
import { REMOTE_REPORTS } from "../src/cloud-sync/remote-reports";
import { boundedReportBody, computeReportResult, REPORT_TIMEOUT_MS } from "../src/cloud-sync/report-requests";
import { installDecimalNumberSerializer } from "../src/utils/json-replacer";
import { resolveDateRange } from "../src/services/reports/_shared";

const url = new URL(process.env.DATABASE_URL ?? "postgresql://x/none");
const dbName = url.pathname.slice(1);
if (!["127.0.0.1", "localhost"].includes(url.hostname) || !/_(prova|test)$/.test(dbName) || dbName === "tekserp_adnan_prova") {
  console.error(`yalnız yerel _prova/_test veritabanında koşar, şablon değil (hedef: ${dbName}@${url.hostname})`);
  process.exit(2);
}

// Panel sürecindeki gibi (app.ts): Decimal → sayı.
installDecimalNumberSerializer();
const DAY = 86_400_000;
const median = (a: number[]): number => [...a].sort((x, y) => x - y)[Math.floor(a.length / 2)] ?? 0;
const p95 = (a: number[]): number => [...a].sort((x, y) => x - y)[Math.min(a.length - 1, Math.floor(a.length * 0.95))] ?? 0;

function canonical(v: unknown): string {
  if (Array.isArray(v)) return `[${v.map(canonical).join(",")}]`;
  if (v !== null && typeof v === "object") return `{${Object.entries(v).filter(([, x]) => x !== undefined).sort(([a], [b]) => a.localeCompare(b)).map(([k, x]) => `${k}:${canonical(x)}`).join(",")}}`;
  return JSON.stringify(v ?? null);
}
function rowCount(v: unknown): number {
  if (Array.isArray(v)) return v.length + v.reduce<number>((s, x) => s + rowCount(x), 0);
  if (v !== null && typeof v === "object") return Object.values(v).reduce<number>((s, x) => s + rowCount(x), 0);
  return 0;
}

async function probe(): Promise<number> {
  const t0 = performance.now();
  await prisma.roll.findMany({ take: 50, orderBy: [{ updatedAt: "desc" }, { id: "desc" }], select: { id: true, barcode: true, status: true, currentQty: true } });
  return performance.now() - t0;
}

async function main(): Promise<void> {
  const [last] = await prisma.$queryRaw<Array<{ at: Date | null }>>`SELECT max("dispatchedAt") AS at FROM shipments WHERE status = 'DISPATCHED'`;
  const now = last?.at ? factoryDayEnd(last.at) : new Date();
  const to = factoryYmd(now);
  const ranges = [
    { ad: "30 gün", params: { dateFrom: factoryYmd(new Date(now.getTime() - 29 * DAY)), dateTo: to } },
    { ad: "366 gün", params: { dateFrom: factoryYmd(new Date(now.getTime() - 365 * DAY)), dateTo: to } },
  ];
  console.log(`DB ${dbName} · "bugün" = ${to} · süre sınırı ${REPORT_TIMEOUT_MS} ms`);
  console.log("\nrapor                      aralık    ms(soğuk/medyan)  ham bayt   gzip bayt  satır  finans-düşen  panel=telefon");
  let slowest = { key: "", params: {}, ms: 0 };
  let bad = 0;
  for (const spec of REMOTE_REPORTS) {
    const sets = spec.runner.kind === "NONE" ? [{ ad: "kesit", params: {} }] : ranges;
    for (const r of sets) {
      const times: number[] = [];
      let last: Awaited<ReturnType<typeof computeReportResult>> | null = null;
      for (let i = 0; i < 3; i++) {
        last = await computeReportResult({ istekId: "00000000-0000-4000-8000-000000000d55", key: spec.key, params: r.params, nowMs: Date.now() });
        times.push(last.elapsedMs);
      }
      if (!last) continue;
      const body = boundedReportBody(last.result);
      const raw = Buffer.byteLength(JSON.stringify(body.body), "utf8");
      let same = "—";
      if (last.result.durum === "HAZIR") {
        const p = r.params;
        const range = "dateFrom" in p ? resolveDateRange({ dateFrom: resolveRangeStart(p.dateFrom).toISOString(), dateTo: resolveRangeEnd(p.dateTo).toISOString() }) : null;
        const panel = spec.runner.kind === "RANGE" && range ? await spec.runner.run(range) : spec.runner.kind === "NONE" ? await spec.runner.run() : null;
        same = canonical(JSON.parse(JSON.stringify(panel) ?? "null")) === canonical(last.result.veri) ? "EŞİT" : "FARKLI";
        if (same !== "EŞİT") bad++;
      } else bad++;
      const med = median(times.slice(1));
      if (med > slowest.ms) slowest = { key: spec.key, params: r.params, ms: med };
      console.log(`${spec.key.padEnd(26)} ${r.ad.padEnd(8)} ${`${Math.round(times[0] ?? 0)}/${Math.round(med)}`.padStart(16)} ${String(raw).padStart(10)} ${String(body.gzipBytes).padStart(10)} ${String(rowCount(last.result.veri)).padStart(6)} ${String(last.droppedFinance.length).padStart(12)}  ${last.result.durum === "HAZIR" ? same : `${last.result.durum}/${last.result.hataKodu}`}`);
    }
  }
  console.log(`\nen yavaş: ${slowest.key} ${Math.round(slowest.ms)} ms (sınır ${REPORT_TIMEOUT_MS} ms) → ${slowest.ms < REPORT_TIMEOUT_MS ? "ALTINDA" : "AŞIYOR"}`);

  console.log("\n── YÜK: panel benzeri sorgu (son 50 top) gecikmesi, ms ──");
  const idle: number[] = [];
  for (let i = 0; i < 40; i++) idle.push(await probe());
  const busy: number[] = [];
  let stop = false;
  const load = (async () => {
    while (!stop) await computeReportResult({ istekId: "00000000-0000-4000-8000-000000000d55", key: slowest.key, params: slowest.params, nowMs: Date.now() });
  })();
  const end = Date.now() + Math.max(3000, slowest.ms * 3);
  while (Date.now() < end) {
    busy.push(await probe());
    await new Promise((res) => setTimeout(res, 50));
  }
  stop = true;
  await load;
  console.log(`  boşta: medyan ${median(idle).toFixed(1)} · p95 ${p95(idle).toFixed(1)}  |  rapor hesaplanırken: medyan ${median(busy).toFixed(1)} · p95 ${p95(busy).toFixed(1)} (n=${busy.length})`);
  console.log(bad === 0 ? "\nSONUÇ: her rapor HAZIR ve panel servisiyle EŞİT" : `\nSONUÇ: ${bad} satır HAZIR/EŞİT değil`);
}

main()
  .catch((e: unknown) => { console.error(e); process.exitCode = 1; })
  .finally(async () => {
    await prisma.$disconnect();
    process.exit();
  });
